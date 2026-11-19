#!/usr/bin/env python3
"""
SAWYAN — Idempotent World Cities & Districts Seeder (GeoNames + Curated Arabic Districts)
Populates BOTH `sawyan.geonames_locations` and `sawyan_demo.geonames_locations`
across all 168+ registered countries without modifying existing primary rows.
"""
import io
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile

PROJECT_REF = "dssspiossqgroefmvnql"
API_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
PRIORITY_COUNTRY_ZIPS = [
    "EG", "TR", "SA", "AE", "JO", "KW", "QA", "BH", "OM",
    "MA", "TN", "DZ", "IQ", "LB", "PS", "SD", "LY", "YE",
]
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


def run_sql(sql, token):
    req = urllib.request.Request(
        API_URL,
        data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SAWYAN-GeoSeeder/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body[:500]}")


def sql_str(val):
    if val is None:
        return "NULL"
    s = str(val).replace("\x00", "").replace("'", "''")
    return f"'{s}'"


def download_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "SAWYAN-GeoSeeder/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def pick_arabic_name(alternates_csv, fallback_name):
    if not alternates_csv:
        return fallback_name, ""
    parts = [p.strip() for p in alternates_csv.split(",") if p.strip()]
    ar_parts = [p for p in parts if ARABIC_RE.search(p)]
    if not ar_parts:
        return fallback_name, ""
    # Prefer shorter clean Arabic names without extra punctuation
    ar_parts.sort(key=lambda x: (len(x), x))
    return ar_parts[0], " ".join(ar_parts[:5])


def load_admin1_map():
    print(" -> Downloading GeoNames admin1CodesASCII.txt...")
    raw = download_bytes("https://download.geonames.org/export/dump/admin1CodesASCII.txt").decode("utf-8", errors="replace")
    amap = {}
    for line in raw.splitlines():
        cols = line.split("\t")
        if len(cols) >= 3:
            amap[cols[0].strip()] = cols[2].strip() or cols[1].strip()
    return amap


def extract_cities15000(valid_ccs, admin1_map):
    print(" -> Downloading GeoNames cities15000.zip...")
    zbytes = download_bytes("https://download.geonames.org/export/dump/cities15000.zip")
    rows = {}
    with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
        with zf.open("cities15000.txt") as f:
            for raw_line in io.TextIOWrapper(f, encoding="utf-8", errors="replace"):
                cols = raw_line.rstrip("\r\n").split("\t")
                if len(cols) < 15:
                    continue
                gid = int(cols[0])
                name = cols[1].strip()
                asciiname = (cols[2].strip() or name)[:180]
                alts = cols[3].strip()
                lat = cols[4].strip() or "0"
                lng = cols[5].strip() or "0"
                cc = cols[8].strip().upper()
                adm1_code = cols[10].strip()
                try:
                    pop = int(cols[14] or 0)
                except ValueError:
                    pop = 0
                if cc not in valid_ccs:
                    continue
                adm1_name = admin1_map.get(f"{cc}.{adm1_code}", adm1_code)[:180]
                disp_name, ar_alts = pick_arabic_name(alts, name)
                search_vec = f"{disp_name} {asciiname} {adm1_name} {ar_alts}"[:480]
                rows[gid] = (
                    gid,
                    cc,
                    adm1_name or None,
                    disp_name[:180],
                    asciiname,
                    "__GEO_BULK__",
                    float(lat),
                    float(lng),
                    search_vec,
                    pop,
                )
    # Cap giant countries in cities15000 so each remains fast yet rich (keep top 160 by population)
    by_cc = {}
    for row in rows.values():
        by_cc.setdefault(row[1], []).append(row)
    capped = {}
    for cc, lst in by_cc.items():
        lst.sort(key=lambda r: r[9], reverse=True)
        for r in lst[:160]:
            capped[r[0]] = r[:9]
    print(f"    Extracted {len(capped)} world cities from cities15000 across {len(by_cc)} countries.")
    return capped


def extract_priority_country_districts(valid_ccs, admin1_map, existing_gids):
    extra = {}
    for cc in PRIORITY_COUNTRY_ZIPS:
        if cc not in valid_ccs:
            continue
        url = f"https://download.geonames.org/export/dump/{cc}.zip"
        try:
            zbytes = download_bytes(url)
            candidates = []
            with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
                txt_name = f"{cc}.txt"
                with zf.open(txt_name) as f:
                    for raw_line in io.TextIOWrapper(f, encoding="utf-8", errors="replace"):
                        cols = raw_line.rstrip("\r\n").split("\t")
                        if len(cols) < 15:
                            continue
                        fclass = cols[6].strip()
                        fcode = cols[7].strip()
                        if fclass != "P" and fcode != "ADM2":
                            continue
                        if fcode not in ("PPLX", "PPLA", "PPLA2", "PPLA3", "ADM2", "PPLC", "PPL"):
                            continue
                        try:
                            pop = int(cols[14] or 0)
                        except ValueError:
                            pop = 0
                        if fcode == "PPL" and pop < 8000:
                            continue
                        gid = int(cols[0])
                        if gid in existing_gids or gid in extra:
                            continue
                        name = cols[1].strip()
                        asciiname = (cols[2].strip() or name)[:180]
                        alts = cols[3].strip()
                        lat = cols[4].strip() or "0"
                        lng = cols[5].strip() or "0"
                        adm1_code = cols[10].strip()
                        adm1_name = admin1_map.get(f"{cc}.{adm1_code}", adm1_code)[:180]
                        disp_name, ar_alts = pick_arabic_name(alts, name)
                        is_dist = fcode in ("PPLX", "PPLA3", "ADM2", "PPL")
                        tag = "__GEO_BULK__ __GEO_DISTRICT__" if is_dist else "__GEO_BULK__"
                        search_vec = f"{disp_name} {asciiname} {adm1_name} {ar_alts}"[:480]
                        prio = 0 if fcode in ("PPLX", "PPLA2", "ADM2") else 1
                        candidates.append((
                            prio,
                            -pop,
                            (gid, cc, adm1_name or None, disp_name[:180], asciiname, tag, float(lat), float(lng), search_vec),
                        ))
            candidates.sort(key=lambda x: (x[0], x[1]))
            max_rows = 450 if cc in ("EG", "TR", "SA", "AE") else 220
            taken = 0
            for _, _, row in candidates[:max_rows]:
                extra[row[0]] = row
                taken += 1
            print(f"    +{taken} places/districts for {cc} from {cc}.zip")
        except Exception as e:
            print(f"    [WARN] Skipped {cc}.zip: {e}")
    return extra


def build_curated_arabic_districts():
    """High-precision Arabic district coverage matched directly to SAWYAN primary governorates."""
    curated = []
    next_id = 9500001

    def add_group(cc, admin1, names, lat, lng, extra_search=""):
        nonlocal next_id
        for nm in names:
            sv = f"{nm} {admin1} {extra_search}".strip()
            curated.append((
                next_id,
                cc,
                admin1,
                nm,
                nm,
                "__GEO_BULK__ __GEO_DISTRICT__ __CURATED_AR__",
                lat,
                lng,
                sv,
            ))
            next_id += 1

    # --- EGYPT (All Governorates matching sawyan.geonames_locations admin1_name) ---
    add_group("EG", "Cairo", [
        "مدينة نصر", "التجمع الخامس", "التجمع الأول", "التجمع الثالث", "الرحاب", "مدينتي", "الشروق", "بدر",
        "العاصمة الإدارية الجديدة", "المعادي", "زهراء المعادي", "دجلة المعادي", "مصر الجديدة", "النزهة",
        "النزهة الجديدة", "شيراتون المطار", "العباسية", "الوايلي", "حدائق القبة", "الزيتون", "حلمية الزيتون",
        "المطرية", "عين شمس", "المرج", "مدينة السلام", "جسر السويس", "شبرا", "روض الفرج", "الساحل",
        "الشرابية", "الزاوية الحمراء", "الزمالك", "جاردن سيتي", "وسط البلد", "عابدين", "الموسكي", "باب الشعرية",
        "الجمالية", "الدرب الأحمر", "السيدة زينب", "المنيل", "مصر القديمة", "الفسطاط", "الخليفة", "المقطم",
        "الهضبة الوسطى", "البساتين", "دار السلام", "طرة", "المعصرة", "حلوان", "حدائق حلوان", "15 مايو", "التبين",
    ], 30.0444, 31.2357, "القاهرة Cairo")

    add_group("EG", "Giza", [
        "الدقي", "المهندسين", "العجوزة", "إمبابة", "الوراق", "أوسيم", "بولاق الدكرور", "فيصل", "الهرم",
        "حدائق الأهرام", "العمرانية", "الطالبية", "الجيزة", "المنيب", "ساقية مكي", "6 أكتوبر", "الشيخ زايد",
        "حدائق أكتوبر", "أكتوبر الجديدة", "كرداسة", "أبو النمرس", "الحوامدية", "البدرشين", "العياط",
        "الصف", "أطفيح", "منشأة القناطر", "الواحات البحرية",
    ], 30.0131, 31.2089, "الجيزة Giza")

    add_group("EG", "Alexandria", [
        "سموحة", "سيدي جابر", "سيدي بشر", "ميامي", "المنتزه", "المندرة", "المعمورة", "أبو قير", "العصافرة",
        "جليم", "سان ستيفانو", "لوران", "زيزينيا", "رشدي", "كفر عبده", "ستانلي", "سبورتنج", "الإبراهيمية",
        "كامب شيزار", "الشاطبي", "محطة الرمل", "المنشية", "بحري والأنفوشي", "محرم بك", "كرموز", "الورديان",
        "العجمي والبيطاش والهانوفيل", "الدخيلة", "العامرية", "برج العرب الجديدة",
    ], 31.2001, 29.9187, "الإسكندرية Alexandria")

    eg_gov_districts = [
        ("Qalyubia", 30.4660, 31.1848, "القليوبية", ["بنها", "شبرا الخيمة", "العبور", "القناطر الخيرية", "قليوب", "الخانكة", "طوخ", "شبين القناطر", "كفر شكر", "الخصوص", "قها"]),
        ("Dakahlia", 31.0409, 31.3785, "الدقهلية المنصورة", ["حي الجامعة", "المشاية السفلية", "توريل", "قناة السويس", "جديلة", "طلخا", "ميت غمر", "السنبلاوين", "دكرنس", "بلقاس", "شربين", "المنزلة", "أجا", "نبروه"]),
        ("Sharqia", 30.5852, 31.5020, "الشرقية الزقازيق", ["الزقازيق", "العاشر من رمضان", "بلبيس", "منيا القمح", "فاقوس", "أبو حماد", "ههيا", "الحسينية", "ديرب نجم", "كفر صقر", "أبو كبير", "القنايات"]),
        ("Gharbia", 30.7865, 31.0004, "الغربية طنطا", ["طنطا أول", "طنطا ثان", "المحلة الكبرى", "كفر الزيات", "زفتى", "السنطة", "بسيون", "قطور", "سمنود"]),
        ("Monufia", 30.5503, 31.0106, "المنوفية شبين", ["شبين الكوم", "مدينة السادات", "منوف", "أشمون", "الباجور", "قويسنا", "تلا", "بركة السبع", "الشهداء", "سرس الليان"]),
        ("Beheira", 31.0341, 30.4682, "البحيرة دمنهور", ["دمنهور", "كفر الدوار", "إيتاي البارود", "أبو حمص", "كوم حمادة", "دسوق / رشيد", "إدكو", "أبو المطامير", "حوش عيسى", "الدلنجات", "وادي النطرون", "بدر"]),
        ("Kafr El Sheikh", 31.1107, 30.9388, "كفر الشيخ", ["كفر الشيخ", "دسوق", "فوه", "مطوبس", "سيدي سالم", "بيلا", "الحامول", "بلطيم", "الرياض", "قلين"]),
        ("Damietta", 31.4175, 31.8144, "دمياط", ["دمياط", "دمياط الجديدة", "رأس البر", "فارسكور", "الزرقا", "كفر سعد", "السرو", "عزبة البرج"]),
        ("Port Said", 31.2653, 32.3019, "بورسعيد", ["حي الشرق", "حي العرب", "حي المناخ", "حي الضواحي", "حي الزهور", "حي الجنوب", "بورفؤاد"]),
        ("Ismailia", 30.5965, 32.2715, "الإسماعيلية", ["حي أول الإسماعيلية", "حي ثان", "حي ثالث", "فايد", "التل الكبير", "القنطرة شرق", "القنطرة غرب", "أبو صوير", "القصاصين"]),
        ("Suez", 29.9668, 32.5498, "السويس", ["حي السويس", "حي الأربعين", "حي فيصل", "حي عتاقة", "حي الجناين", "العين السخنة"]),
        ("Faiyum", 29.3084, 30.8428, "الفيوم", ["الفيوم الجديدة", "بندر الفيوم", "إطسا", "سنورس", "طامية", "أبشواي", "يوسف الصديق"]),
        ("Beni Suef", 29.0661, 31.0994, "بني سويف", ["بني سويف", "بني سويف الجديدة", "الواسطى", "ناصر", "إهناسيا", "ببا", "سمسطا", "الفشن"]),
        ("Minya", 28.0871, 30.7618, "المنيا", ["المنيا", "المنيا الجديدة", "ملوي", "سمالوط", "بني مزار", "مغاغة", "أبو قرقاص", "العدوة", "مطاي", "دير مواس"]),
        ("Assiut", 27.1783, 31.1859, "أسيوط", ["أسيوط أول", "أسيوط ثان", "أسيوط الجديدة", "ديروط", "القوصية", "منفلوط", "أبنوب", "الفتح", "أبو تيج", "صدفا", "الغنايم", "ساحل سليم"]),
        ("Sohag", 26.5569, 31.6948, "سوهاج", ["حي شرق سوهاج", "حي غرب سوهاج", "سوهاج الجديدة", "أخميم", "جرجا", "طهطا", "طما", "المراغة", "جهينة", "البلينا", "دار السلام"]),
        ("Qena", 26.1551, 32.7160, "قنا", ["مدينة قنا", "قنا الجديدة", "نجع حمادي", "دشنا", "قوص", "نقادة", "فرشوط", "أبو تشت", "الوقف"]),
        ("Luxor", 25.6872, 32.6396, "الأقصر", ["الأقصر وسط", "الأقصر الجديدة", "الكرنك", "البياضية", "القرنة", "أرمنت", "إسنا", "الطود", "الزينية"]),
        ("Aswan", 24.0889, 32.8998, "أسوان", ["مدينة أسوان", "أسوان الجديدة", "العقاد", "الكرور", "المحمودية", "كيما", "الصداقة الجديدة", "السد العالي", "كوم أمبو", "إدفو", "دراو", "نصر النوبة", "أبو سمبل"]),
        ("Red Sea", 27.2579, 33.8116, "البحر الأحمر الغردقة", ["السقالة (الغردقة)", "الدهار (الغردقة)", "الممشى السياحي", "الكوثر", "الأحياء", "الجونة", "سهل حشيش", "سفاجا", "القصير", "مرسى علم", "رأس غارب"]),
        ("Matrouh", 31.3543, 27.2373, "مطروح", ["مرسى مطروح", "العلمين الجديدة", "سيدي عبد الرحمن", "مارينا والساحل الشمالي", "الحمام", "الضبعة", "سيوة", "النجيلة", "السلوم"]),
        ("South Sinai", 27.9158, 34.3299, "جنوب سيناء شرم الشيخ", ["خليج نعمة", "السوق القديم", "الهضبة", "نبق", "الرويسات", "دهب", "نويبع", "طابا", "سانت كاترين", "طور سيناء", "رأس سدر"]),
    ]
    for adm1, lat, lng, kw, dists in eg_gov_districts:
        add_group("EG", adm1, dists, lat, lng, kw)

    # --- TURKEY (All 39 official Istanbul districts + major cities) ---
    add_group("TR", "Istanbul", [
        "الفاتح", "باشاك شهير", "إسنيورت", "بيليك دوزو", "أفجيلار", "كوتشوك شكمجة", "باهتشيلي إيفلر", "باغجلار",
        "باكيركوي", "زيتون بورنو", "بيرم باشا", "أيوب سلطان", "غازي عثمان باشا", "سلطان غازي", "أرناؤوط كوي",
        "شيشلي", "كاغد خانة", "بشكتاش", "ساريير", "بي أوغلو", "إسنلر", "غونغورين", "بويوك شكمجة", "تشاتالجا",
        "سيليفري", "كاديكوي", "أوسكودار", "عمرانية", "أتاشهير", "مالتبه", "كارتال", "بنديك", "توزلا",
        "سلطان بيلي", "سنجق تبه", "تشكمكوي", "بيكوز", "شيلا", "جزر الأميرات",
    ], 41.0082, 28.9784, "إسطنبول Istanbul")

    tr_cities = [
        ("Ankara", 39.9334, 32.8597, "أنقرة Ankara", ["تشانكايا", "كيشي أورين", "يني محلة", "ماماك", "ألتينداغ", "إتيميسغوت", "سينجان", "غولباشي", "بورسكلار"]),
        ("Bursa", 40.1885, 29.0610, "بورصة Bursa", ["عثمان غازي", "نيلوفر", "يلدريم", "إينغول", "جيمليك", "مودانيا", "غورسو", "كستل"]),
        ("Izmir", 38.4237, 27.1428, "إزمير Izmir", ["كوناك", "بورنوفا", "كارشياكا", "بوجا", "بايراكلي", "تشيشمي", "أورلا", "مينيمين"]),
        ("Antalya", 36.8969, 30.7133, "أنطاليا Antalya", ["مراد باشا", "كيبيز", "كونيالتي", "أكسو", "ألانيا", "مانافجات", "كيمير", "كاش"]),
        ("Mersin", 36.8000, 34.6333, "مرسين Mersin", ["يني شهير", "ميزيتلي", "توروسلار", "أكدينيز", "طرسوس", "إرديملي"]),
        ("Gaziantep", 37.0662, 37.3833, "غازي عنتاب Gaziantep", ["شاهين بيه", "شهيد كامل", "أوغوزإيلي", "نيزيب"]),
        ("Konya", 37.8746, 32.4932, "قونيا Konya", ["سلجوقلو", "ميرام", "كاراتاي"]),
    ]
    for adm1, lat, lng, kw, dists in tr_cities:
        add_group("TR", adm1, dists, lat, lng, kw)

    # --- SAUDI ARABIA ---
    sa_cities = [
        ("Riyadh", 24.7136, 46.6753, "الرياض Riyadh", ["العليا", "الملز", "النرجس", "الياسمين", "الصحافة", "الملقا", "حطين", "النخيل", "قرطبة", "الربوة", "الروضة", "السليمانية", "البديعة", "العزيزية", "الشفا", "ظهرة لبن"]),
        ("Makkah / Jeddah", 21.4858, 39.1925, "جدة Jeddah Makkah", ["الروضة", "الحمراء", "الشاطئ", "أبحر الشمالية", "أبحر الجنوبية", "السلامة", "الزهراء", "الصفا", "المروة", "الفيصلية", "النعيم", "المرجان", "البساتين", "الحمدانية", "البلد"]),
        ("Makkah", 21.3891, 39.8579, "مكة المكرمة Makkah", ["العزيزية", "الشوقية", "العوالي", "النسيم", "الشرائع", "الرصيفة", "الكعكية", "النوارية", "بطحاء قريش", "الحرم"]),
        ("Madinah", 24.5247, 39.5692, "المدينة المنورة Madinah", ["العزيزية", "سلطانة", "قربان", "شوران", "العوالي", "الملك فهد", "الخالدية", "الحمراء", "المطار"]),
        ("Eastern / Dammam", 26.4207, 50.0888, "الدمام الخبر الظهران Eastern Dammam", ["الشاطئ الغربي", "الشاطئ الشرقي", "الفيصلية", "الفردوس", "الزهور", "حي الجامعيين", "الخبر الشمالية", "العقربية", "العزيزية الخبر", "الدوحة الظهران", "الجبيل البلد", "الجبيل الصناعية"]),
        ("Asir", 18.2164, 42.5053, "أبها خميس مشيط Asir Abha", ["وسط أبها", "المحالة", "الموظفين", "المنسك", "خميس مشيط وسط", "حسام"]),
        ("Qassim", 26.3260, 43.9750, "القصيم بريدة عنيزة Qassim", ["الصفراء بريدة", "الإسكان", "النهضة", "الأفق", "وسط عنيزة", "الأشرفية"]),
        ("Tabuk", 28.3835, 36.5662, "تبوك Tabuk", ["المروج", "المصيف", "العليا", "الورود", "السليمانية"]),
    ]
    for adm1, lat, lng, kw, dists in sa_cities:
        add_group("SA", adm1, dists, lat, lng, kw)

    # --- UAE ---
    ae_cities = [
        ("Dubai", 25.2048, 55.2708, "دبي Dubai", ["ديرة", "بر دبي", "المرسى (دبي مارينا)", "وسط دبي (داون تاون)", "البرشاء", "جميرا", "الخليج التجاري", "جميرا ليك تاورز JLT", "المدينة العالمية", "الخوانيج", "مردف", "النهدة دبي", "القصيص"]),
        ("Abu Dhabi", 24.4539, 54.3773, "أبوظبي العين Abu Dhabi", ["الخالدية", "الكورنيش", "جزيرة الريم", "جزيرة ياس", "المرور", "مدينة خليفة", "مدينة محمد بن زايد", "المصفح", "شاطئ الراحة", "وسط العين", "الجيمي العين"]),
        ("Sharjah", 25.3463, 55.4209, "الشارقة عجمان Sharjah", ["المجاز", "القاسمية", "التعاون", "النهدة الشارقة", "الخان", "مويلح", "المدينة الجامعية", "الراشدية عجمان", "النعيمية عجمان"]),
    ]
    for adm1, lat, lng, kw, dists in ae_cities:
        add_group("AE", adm1, dists, lat, lng, kw)

    return {r[0]: r for r in curated}


def upsert_batch(schema, rows, token):
    if not rows:
        return
    vals = []
    for gid, cc, adm1, cname, aname, alt, lat, lng, svec in rows:
        vals.append(
            f"({int(gid)}, {sql_str(cc)}, {sql_str(adm1)}, {sql_str(cname)}, {sql_str(aname)}, "
            f"{sql_str(alt)}, {round(float(lat), 6)}, {round(float(lng), 6)}, {sql_str(svec)})"
        )
    sql = (
        f"INSERT INTO {schema}.geonames_locations "
        f"(geoname_id, country_code, admin1_name, city_name, asciiname, alternate_names, latitude, longitude, search_vector) VALUES\n"
        + ",\n".join(vals)
        + "\nON CONFLICT (geoname_id) DO NOTHING;"
    )
    run_sql(sql, token)


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN env var is required.", file=sys.stderr)
        sys.exit(1)

    crows = run_sql("SELECT country_code FROM sawyan.countries ORDER BY country_code;", token)
    valid_ccs = {r["country_code"].strip().upper() for r in crows}
    print(f"Found {len(valid_ccs)} countries in sawyan.countries.")

    admin1_map = load_admin1_map()
    all_rows = {}
    all_rows.update(extract_cities15000(valid_ccs, admin1_map))
    all_rows.update(extract_priority_country_districts(valid_ccs, admin1_map, set(all_rows.keys())))
    curated = build_curated_arabic_districts()
    all_rows.update(curated)

    rows_list = list(all_rows.values())
    ccs_covered = {r[1] for r in rows_list}
    print(f"Prepared {len(rows_list)} total GeoNames locations covering {len(ccs_covered)} countries (curated Arabic districts: {len(curated)}).")

    batch_size = 900
    for schema in ("sawyan", "sawyan_demo"):
        print(f" -> Seeding {schema}.geonames_locations in batches of {batch_size}...")
        for i in range(0, len(rows_list), batch_size):
            batch = rows_list[i : i + batch_size]
            upsert_batch(schema, batch, token)
            print(f"    {schema}: upserted {min(i + batch_size, len(rows_list))}/{len(rows_list)}")

    summary = run_sql("""
        SELECT
            (SELECT count(*) FROM sawyan.geonames_locations) AS prod_total,
            (SELECT count(DISTINCT country_code) FROM sawyan.geonames_locations) AS prod_countries,
            (SELECT count(*) FROM sawyan_demo.geonames_locations) AS demo_total,
            (SELECT count(DISTINCT country_code) FROM sawyan_demo.geonames_locations) AS demo_countries;
    """, token)[0]
    print("SEED COMPLETE:", json.dumps(summary))


if __name__ == "__main__":
    main()
