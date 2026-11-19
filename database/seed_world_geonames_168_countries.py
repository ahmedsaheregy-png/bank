#!/usr/bin/env python3
"""
SAWYAN — Idempotent World Cities & Clean Arabic Districts Seeder
Populates BOTH `sawyan.geonames_locations` and `sawyan_demo.geonames_locations`
across all 168+ registered countries without modifying primary rows.

Usage:
  python seed_world_geonames_168_countries.py               # upsert missing rows
  python seed_world_geonames_168_countries.py --clean-bulk  # remove unreferenced bulk noise first, then re-seed cleanly
"""
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
import zipfile

PROJECT_REF = "dssspiossqgroefmvnql"
API_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
PRIORITY_COUNTRY_ZIPS = [
    "EG", "TR", "SA", "AE", "JO", "KW", "QA", "BH", "OM",
    "MA", "TN", "DZ", "IQ", "LB", "PS", "SD", "LY", "YE",
]
ARAB_CCS = {
    "EG", "SA", "AE", "JO", "KW", "QA", "BH", "OM",
    "MA", "TN", "DZ", "IQ", "LB", "PS", "SD", "LY", "YE",
}
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
PERSIAN_URDU_RE = re.compile(r"[\u067E\u0686\u0698\u06AF\u06A9\u06CC\u06C1\u06D2\u06BE\u06BA\u06C0\u0679\u0688\u0691\u06BA\u06D3]")


def is_clean_arabic(text):
    return bool(text and ARABIC_RE.search(text) and not PERSIAN_URDU_RE.search(text))


def normalize_ar(s):
    if not s:
        return ""
    s = re.sub(r"[\u064B-\u065F\u0670]", "", str(s))
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ة", "ه")
    s = re.sub(r"^(حي|قسم|مركز|مدينه)\s+", "", s.strip())
    return re.sub(r"\s+", " ", s).strip().lower()


def run_sql(sql, token):
    req = urllib.request.Request(
        API_URL,
        data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SAWYAN-GeoSeeder/2.0",
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
    req = urllib.request.Request(url, headers={"User-Agent": "SAWYAN-GeoSeeder/2.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def pick_arabic_name(alternates_csv, fallback_name):
    if not alternates_csv:
        return fallback_name, ""
    parts = [p.strip() for p in alternates_csv.split(",") if p.strip()]
    ar_parts = [p for p in parts if is_clean_arabic(p)]
    if not ar_parts:
        return fallback_name, ""
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
            seen_norm = set()
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
                        if fcode == "PPL" and pop < 10000:
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

                        # Skip non-Arabic transliterations and noisy housing blocks in Arab countries
                        if cc in ARAB_CCS and is_dist and not is_clean_arabic(disp_name):
                            continue
                        if is_clean_arabic(disp_name):
                            nkey = (adm1_name.lower(), normalize_ar(disp_name))
                            if nkey in seen_norm:
                                continue
                            seen_norm.add(nkey)

                        tag = "__GEO_BULK__ __GEO_DISTRICT__" if is_dist else "__GEO_BULK__"
                        search_vec = f"{disp_name} {asciiname} {adm1_name} {ar_alts}"[:480]
                        prio = 0 if fcode in ("PPLX", "PPLA2", "ADM2") else 1
                        candidates.append((
                            prio,
                            -pop,
                            (gid, cc, adm1_name or None, disp_name[:180], asciiname, tag, float(lat), float(lng), search_vec),
                        ))
            candidates.sort(key=lambda x: (x[0], x[1]))
            max_rows = 300 if cc in ("EG", "TR", "SA", "AE") else 180
            taken = 0
            for _, _, row in candidates[:max_rows]:
                extra[row[0]] = row
                taken += 1
            print(f"    +{taken} clean places/districts for {cc} from {cc}.zip")
        except Exception as e:
            print(f"    [WARN] Skipped {cc}.zip: {e}")
    return extra


def build_curated_arabic_districts():
    """100% clean, verified Arabic district names with English/Turkish search aliases."""
    curated = []
    next_id = 9500001
    seen_curated = set()

    def add_group(cc, admin1, items, lat, lng, extra_search=""):
        nonlocal next_id
        for item in items:
            if isinstance(item, tuple):
                nm, en_alias = item
            else:
                nm, en_alias = item, ""
            nkey = (cc, admin1.lower(), normalize_ar(nm))
            if nkey in seen_curated:
                continue
            seen_curated.add(nkey)
            sv = f"{nm} {en_alias} {admin1} {extra_search}".strip()
            curated.append((
                next_id,
                cc,
                admin1,
                nm,
                (en_alias or nm)[:180],
                "__GEO_BULK__ __GEO_DISTRICT__ __CURATED_AR__",
                lat,
                lng,
                sv[:480],
            ))
            next_id += 1

    # --- EGYPT (All 27 Governorates) ---
    add_group("EG", "Cairo", [
        ("مدينة نصر", "Nasr City"), ("التجمع الخامس", "Fifth Settlement New Cairo"), ("التجمع الأول", "First Settlement New Cairo"),
        ("التجمع الثالث", "Third Settlement New Cairo"), ("الرحاب", "Rehab City"), ("مدينتي", "Madinaty"), ("الشروق", "El Shorouk"),
        ("بدر", "Badr City"), ("العاصمة الإدارية الجديدة", "New Administrative Capital"), ("المعادي", "Maadi"),
        ("زهراء المعادي", "Zahraa El Maadi"), ("دجلة المعادي", "Degla Maadi"), ("مصر الجديدة", "Heliopolis Masr El Gedida"),
        ("النزهة", "El Nozha"), ("النزهة الجديدة", "Nozha Gedida"), ("شيراتون المطار", "Sheraton Heliopolis"),
        ("أرض الجولف", "Ard El Golf"), ("العباسية", "Abbassia"), ("الوايلي", "El Waili"), ("حدائق القبة", "Hadayek El Kobba"),
        ("الزيتون", "Zeitoun"), ("حلمية الزيتون", "Helmeya"), ("المطرية", "Matariya"), ("عين شمس", "Ain Shams"),
        ("المرج", "El Marg"), ("مدينة السلام", "El Salam City"), ("جسر السويس", "Gesr El Suez"), ("شبرا", "Shubra"),
        ("روض الفرج", "Rod El Farag"), ("الساحل", "El Sahel"), ("الشرابية", "Sharabiya"), ("الزاوية الحمراء", "Zawya El Hamra"),
        ("الزمالك", "Zamalek"), ("جاردن سيتي", "Garden City"), ("وسط البلد", "Downtown Cairo"), ("عابدين", "Abdeen"),
        ("الموسكي", "Mouski"), ("باب الشعرية", "Bab El Sheria"), ("الجمالية", "Gamaliya"), ("الدرب الأحمر", "Darb El Ahmar"),
        ("السيدة زينب", "Sayeda Zeinab"), ("المنيل", "Manial"), ("مصر القديمة", "Old Cairo Misr El Qadima"),
        ("الفسطاط", "Fustat"), ("الخليفة", "Khalifa"), ("المقطم", "Mokattam"), ("الهضبة الوسطى", "Middle Plateau"),
        ("البساتين", "Basatin"), ("دار السلام", "Dar El Salam"), ("طرة", "Tora"), ("المعصرة", "Maasara"),
        ("حلوان", "Helwan"), ("حدائق حلوان", "Hadayek Helwan"), ("15 مايو", "15th of May City"), ("التبين", "Tebbin"),
    ], 30.0444, 31.2357, "القاهرة Cairo")

    add_group("EG", "Giza", [
        ("الدقي", "Dokki"), ("المهندسين", "Mohandessin"), ("العجوزة", "Agouza"), ("إمبابة", "Imbaba"),
        ("الوراق", "Warraq"), ("أوسيم", "Osim"), ("بولاق الدكرور", "Bulaq El Dakror"), ("فيصل", "Faisal"),
        ("الهرم", "Haram Pyramids"), ("حدائق الأهرام", "Hadayek El Ahram"), ("العمرانية", "Omraneya"), ("الطالبية", "Talbiya"),
        ("الجيزة", "Giza"), ("المنيب", "Moneeb"), ("ساقية مكي", "Sakyet Meky"), ("6 أكتوبر", "6th of October"),
        ("الشيخ زايد", "Sheikh Zayed"), ("حدائق أكتوبر", "Hadayek October"), ("أكتوبر الجديدة", "New October"),
        ("كرداسة", "Kerdasa"), ("أبو النمرس", "Abu El Nomros"), ("الحوامدية", "Hawamdiya"),
        ("البدرشين", "Badrashein"), ("العياط", "Ayat"), ("الصف", "Saff"), ("أطفيح", "Atfih"),
        ("منشأة القناطر", "Manshaet El Qanater"), ("الواحات البحرية", "Bahariya Oasis"),
    ], 30.0131, 31.2089, "الجيزة Giza")

    add_group("EG", "Alexandria", [
        ("سموحة", "Smouha"), ("سيدي جابر", "Sidi Gaber"), ("سيدي بشر", "Sidi Bishr"), ("ميامي", "Miami"),
        ("المنتزه", "Montaza"), ("المندرة", "Mandara"), ("المعمورة", "Maamoura"), ("أبو قير", "Abu Qir"),
        ("العصافرة", "Asafra"), ("جليم", "Gleem"), ("سان ستيفانو", "San Stefano"), ("لوران", "Louran"),
        ("زيزينيا", "Zizinia"), ("رشدي", "Roushdy"), ("كفر عبده", "Kafr Abdo"), ("ستانلي", "Stanley"),
        ("سبورتنج", "Sporting"), ("الإبراهيمية", "Ibrahimiya"), ("كامب شيزار", "Camp Caesar"), ("الشاطبي", "Chatby"),
        ("محطة الرمل", "Raml Station"), ("المنشية", "Mansheya"), ("بحري والأنفوشي", "Bahary Anfoushi"),
        ("محرم بك", "Moharam Bek"), ("كرموز", "Karmouz"), ("الورديان", "Wardian"),
        ("العجمي والبيطاش والهانوفيل", "Agami Bitash Hanoville"), ("الدخيلة", "Dekheila"),
        ("العامرية", "Amreya"), ("برج العرب الجديدة", "New Borg El Arab"),
    ], 31.2001, 29.9187, "الإسكندرية Alexandria")

    eg_gov_districts = [
        ("Qalyubia", 30.4660, 31.1848, "القليوبية Qalyubia", ["بنها", "شبرا الخيمة", "العبور", "القناطر الخيرية", "قليوب", "الخانكة", "طوخ", "شبين القناطر", "كفر شكر", "الخصوص", "قها"]),
        ("Dakahlia", 31.0409, 31.3785, "الدقهلية المنصورة Mansoura Dakahlia", ["حي الجامعة", "المشاية السفلية", "توريل", "قناة السويس", "جديلة", "طلخا", "ميت غمر", "السنبلاوين", "دكرنس", "بلقاس", "شربين", "المنزلة", "أجا", "نبروه"]),
        ("Sharqia", 30.5852, 31.5020, "الشرقية الزقازيق Zagazig Sharqia", ["الزقازيق", "العاشر من رمضان", "بلبيس", "منيا القمح", "فاقوس", "أبو حماد", "ههيا", "الحسينية", "ديرب نجم", "كفر صقر", "أبو كبير", "القنايات"]),
        ("Gharbia", 30.7865, 31.0004, "الغربية طنطا Tanta Gharbia", ["طنطا أول", "طنطا ثان", "المحلة الكبرى", "كفر الزيات", "زفتى", "السنطة", "بسيون", "قطور", "سمنود"]),
        ("Monufia", 30.5503, 31.0106, "المنوفية شبين الكوم Monufia", ["شبين الكوم", "مدينة السادات", "منوف", "أشمون", "الباجور", "قويسنا", "تلا", "بركة السبع", "الشهداء", "سرس الليان"]),
        ("Beheira", 31.0341, 30.4682, "البحيرة دمنهور Beheira", ["دمنهور", "كفر الدوار", "إيتاي البارود", "أبو حمص", "كوم حمادة", "رشيد", "إدكو", "أبو المطامير", "حوش عيسى", "الدلنجات", "وادي النطرون", "بدر البحيرة"]),
        ("Kafr El Sheikh", 31.1107, 30.9388, "كفر الشيخ Kafr El Sheikh", ["كفر الشيخ", "دسوق", "فوه", "مطوبس", "سيدي سالم", "بيلا", "الحامول", "بلطيم", "الرياض", "قلين"]),
        ("Damietta", 31.4175, 31.8144, "دمياط Damietta", ["دمياط", "دمياط الجديدة", "رأس البر", "فارسكور", "الزرقا", "كفر سعد", "السرو", "عزبة البرج"]),
        ("Port Said", 31.2653, 32.3019, "بورسعيد Port Said", ["حي الشرق", "حي العرب", "حي المناخ", "حي الضواحي", "حي الزهور", "حي الجنوب", "بورفؤاد"]),
        ("Ismailia", 30.5965, 32.2715, "الإسماعيلية Ismailia", ["حي أول الإسماعيلية", "حي ثان الإسماعيلية", "حي ثالث الإسماعيلية", "فايد", "التل الكبير", "القنطرة شرق", "القنطرة غرب", "أبو صوير", "القصاصين"]),
        ("Suez", 29.9668, 32.5498, "السويس Suez", ["حي السويس", "حي الأربعين", "حي فيصل السويس", "حي عتاقة", "حي الجناين", "العين السخنة"]),
        ("Faiyum", 29.3084, 30.8428, "الفيوم Faiyum", ["الفيوم الجديدة", "بندر الفيوم", "إطسا", "سنورس", "طامية", "أبشواي", "يوسف الصديق"]),
        ("Beni Suef", 29.0661, 31.0994, "بني سويف Beni Suef", ["بني سويف", "بني سويف الجديدة", "الواسطى", "ناصر", "إهناسيا", "ببا", "سمسطا", "الفشن"]),
        ("Minya", 28.0871, 30.7618, "المنيا Minya", ["المنيا", "المنيا الجديدة", "ملوي", "سمالوط", "بني مزار", "مغاغة", "أبو قرقاص", "العدوة", "مطاي", "دير مواس"]),
        ("Assiut", 27.1783, 31.1859, "أسيوط Assiut", ["أسيوط أول", "أسيوط ثان", "أسيوط الجديدة", "ديروط", "القوصية", "منفلوط", "أبنوب", "الفتح", "أبو تيج", "صدفا", "الغنايم", "ساحل سليم"]),
        ("Sohag", 26.5569, 31.6948, "سوهاج Sohag", ["حي شرق سوهاج", "حي غرب سوهاج", "سوهاج الجديدة", "أخميم", "جرجا", "طهطا", "طما", "المراغة", "جهينة", "البلينا", "دار السلام سوهاج"]),
        ("Qena", 26.1551, 32.7160, "قنا Qena", ["مدينة قنا", "قنا الجديدة", "نجع حمادي", "دشنا", "قوص", "نقادة", "فرشوط", "أبو تشت", "الوقف"]),
        ("Luxor", 25.6872, 32.6396, "الأقصر Luxor", ["الأقصر وسط", "الأقصر الجديدة", "الكرنك", "البياضية", "القرنة", "أرمنت", "إسنا", "الطود", "الزينية"]),
        ("Aswan", 24.0889, 32.8998, "أسوان Aswan", ["مدينة أسوان", "أسوان الجديدة", "العقاد", "الكرور", "المحمودية", "كيما", "الصداقة الجديدة", "السد العالي", "كوم أمبو", "إدفو", "دراو", "نصر النوبة", "أبو سمبل"]),
        ("Red Sea", 27.2579, 33.8116, "البحر الأحمر الغردقة Hurghada Red Sea", ["السقالة (الغردقة)", "الدهار (الغردقة)", "الممشى السياحي", "الكوثر", "الأحياء", "الجونة", "سهل حشيش", "سفاجا", "القصير", "مرسى علم", "رأس غارب"]),
        ("Matrouh", 31.3543, 27.2373, "مطروح Matrouh", ["مرسى مطروح", "العلمين الجديدة", "سيدي عبد الرحمن", "مارينا والساحل الشمالي", "الحمام", "الضبعة", "سيوة", "النجيلة", "السلوم"]),
        ("South Sinai", 27.9158, 34.3299, "جنوب سيناء شرم الشيخ Sharm El Sheikh", ["خليج نعمة", "السوق القديم", "الهضبة", "نبق", "الرويسات", "دهب", "نويبع", "طابا", "سانت كاترين", "طور سيناء", "رأس سدر"]),
        ("North Sinai", 31.1316, 33.7984, "شمال سيناء العريش North Sinai Arish", ["العريش", "المساعيد", "بئر العبد", "الشيخ زويد", "رفح", "الحسنة", "نخل"]),
        ("New Valley", 25.4390, 30.5586, "الوادي الجديد الخارجة New Valley Kharga", ["الخارجة", "الداخلة (موط)", "الفرافرة", "باريس", "بلاط"]),
    ]
    for adm1, lat, lng, kw, dists in eg_gov_districts:
        add_group("EG", adm1, dists, lat, lng, kw)

    # --- TURKEY (All 39 official Istanbul districts + major cities in pure Arabic + Turkish search aliases) ---
    add_group("TR", "Istanbul", [
        ("الفاتح", "Fatih"), ("باشاك شهير", "Basaksehir Başakşehir"), ("إسنيورت", "Esenyurt"), ("بيليك دوزو", "Beylikduzu Beylikdüzü"),
        ("أفجيلار", "Avcilar Avcılar"), ("كوتشوك شكمجة", "Kucukcekmece Küçükçekmece"), ("باهتشيلي إيفلر", "Bahcelievler Bahçelievler"),
        ("باغجلار", "Bagcilar Bağcılar"), ("باكيركوي", "Bakirkoy Bakırköy"), ("زيتون بورنو", "Zeytinburnu"), ("بيرم باشا", "Bayrampasa Bayrampaşa"),
        ("أيوب سلطان", "Eyupsultan Eyüp"), ("غازي عثمان باشا", "Gaziosmanpasa Gaziosmanpaşa"), ("سلطان غازي", "Sultangazi"),
        ("أرناؤوط كوي", "Arnavutkoy Arnavutköy"), ("شيشلي", "Sisli Şişli"), ("كاغد خانة", "Kagithane Kağıthane"), ("بشكتاش", "Besiktas Beşiktaş"),
        ("ساريير", "Sariyer Sarıyer"), ("بي أوغلو", "Beyoglu Beyoğlu Taksim"), ("إسنلر", "Esenler"), ("غونغورين", "Gungoren Güngören Merter"),
        ("بويوك شكمجة", "Buyukcekmece Büyükçekmece"), ("تشاتالجا", "Catalca Çatalca"), ("سيليفري", "Silivri"),
        ("كاديكوي", "Kadikoy Kadıköy"), ("أوسكودار", "Uskudar Üsküdar"), ("عمرانية", "Umraniye Ümraniye"), ("أتاشهير", "Atasehir Ataşehir"),
        ("مالتبه", "Maltepe"), ("كارتال", "Kartal"), ("بنديك", "Pendik"), ("توزلا", "Tuzla"), ("سلطان بيلي", "Sultanbeyli"),
        ("سنجق تبه", "Sancaktepe"), ("تشكمكوي", "Cekmekoy Çekmeköy"), ("بيكوز", "Beykoz"), ("شيلا", "Sile Şile"), ("جزر الأميرات", "Adalar Princes Islands"),
    ], 41.0082, 28.9784, "إسطنبول Istanbul")

    tr_cities = [
        ("Ankara", 39.9334, 32.8597, "أنقرة Ankara", [("تشانكايا", "Cankaya"), ("كيشي أورين", "Kecioren"), ("يني محلة", "Yenimahalle"), ("ماماك", "Mamak"), ("ألتينداغ", "Altindag"), ("إتيميسغوت", "Etimesgut"), ("سينجان", "Sincan"), ("غولباشي", "Golbasi"), ("بورسكلار", "Pursaklar")]),
        ("Bursa", 40.1885, 29.0610, "بورصة Bursa", [("عثمان غازي", "Osmangazi"), ("نيلوفر", "Nilufer"), ("يلدريم", "Yildirim"), ("إينغول", "Inegol"), ("جيمليك", "Gemlik"), ("مودانيا", "Mudanya"), ("غورسو", "Gursu"), ("كستل", "Kestel")]),
        ("Izmir", 38.4237, 27.1428, "إزمير Izmir", [("كوناك", "Konak"), ("بورنوفا", "Bornova"), ("كارشياكا", "Karsiyaka"), ("بوجا", "Buca"), ("بايراكلي", "Bayrakli"), ("تشيشمي", "Cesme"), ("أورلا", "Urla"), ("مينيمين", "Menemen")]),
        ("Antalya", 36.8969, 30.7133, "أنطاليا Antalya", [("مراد باشا", "Muratpasa"), ("كيبيز", "Kepez"), ("كونيالتي", "Konyaalti"), ("أكسو", "Aksu"), ("ألانيا", "Alanya"), ("مانافجات", "Manavgat"), ("كيمير", "Kemer"), ("كاش", "Kas")]),
        ("Mersin", 36.8000, 34.6333, "مرسين Mersin", [("يني شهير", "Yenisehir"), ("ميزيتلي", "Mezitli"), ("توروسلار", "Toroslar"), ("أكدينيز", "Akdeniz"), ("طرسوس", "Tarsus"), ("إرديملي", "Erdemli")]),
        ("Gaziantep", 37.0662, 37.3833, "غازي عنتاب Gaziantep", [("شاهين بيه", "Sahinbey"), ("شهيد كامل", "Sehitkamil"), ("أوغوزإيلي", "Oguzeli"), ("نيزيب", "Nizip")]),
        ("Konya", 37.8746, 32.4932, "قونيا Konya", [("سلجوقلو", "Selcuklu"), ("ميرام", "Meram"), ("كاراتاي", "Karatay")]),
    ]
    for adm1, lat, lng, kw, dists in tr_cities:
        add_group("TR", adm1, dists, lat, lng, kw)

    # --- SAUDI ARABIA ---
    sa_cities = [
        ("Riyadh", 24.7136, 46.6753, "الرياض Riyadh", [("العليا", "Olaya"), ("الملز", "Malaz"), ("النرجس", "Narjis"), ("الياسمين", "Yasmin"), ("الصحافة", "Sahafa"), ("الملقا", "Malqa"), ("حطين", "Hittin"), ("النخيل", "Nakheel"), ("قرطبة", "Qurtubah"), ("الربوة", "Rabwah"), ("الروضة", "Rawdah"), ("السليمانية", "Sulaimaniyah"), ("البديعة", "Badiah"), ("العزيزية", "Aziziyah"), ("الشفا", "Shifa"), ("ظهرة لبن", "Dhahrat Laban"), ("النسيم", "Naseem"), ("السويدي", "Suwaidi")]),
        ("Makkah / Jeddah", 21.4858, 39.1925, "جدة Jeddah Makkah", [("الروضة", "Rawdah"), ("الحمراء", "Hamra"), ("الشاطئ", "Shati Corniche"), ("أبحر الشمالية", "Obhur North"), ("أبحر الجنوبية", "Obhur South"), ("السلامة", "Salamah"), ("الزهراء", "Zahra"), ("الصفا", "Safa"), ("المروة", "Marwah"), ("الفيصلية", "Faisaliyah"), ("النعيم", "Naeem"), ("المرجان", "Murjan"), ("البساتين", "Basateen"), ("الحمدانية", "Hamdaniyah"), ("البلد", "Al Balad")]),
        ("Makkah", 21.3891, 39.8579, "مكة المكرمة Makkah", [("العزيزية", "Aziziyah"), ("الشوقية", "Shawqiyah"), ("العوالي", "Awali"), ("النسيم", "Naseem"), ("الشرائع", "Sharaea"), ("الرصيفة", "Rusayfah"), ("الكعكية", "Kakiyah"), ("النوارية", "Nawariyah"), ("بطحاء قريش", "Batha Quraish"), ("الحرم", "Haram")]),
        ("Madinah", 24.5247, 39.5692, "المدينة المنورة Madinah", [("العزيزية", "Aziziyah"), ("سلطانة", "Sultana"), ("قربان", "Qurban"), ("شوران", "Shuran"), ("العوالي", "Awali"), ("الملك فهد", "King Fahd"), ("الخالدية", "Khalidiyah"), ("الحمراء", "Hamra"), ("المطار", "Airport")]),
        ("Eastern / Dammam", 26.4207, 50.0888, "الدمام الخبر الظهران Eastern Dammam Khobar", [("الشاطئ الغربي", "Shati West"), ("الشاطئ الشرقي", "Shati East"), ("الفيصلية", "Faisaliyah"), ("الفردوس", "Firdaws"), ("الزهور", "Zuhur"), ("حي الجامعيين", "Jamaiyin"), ("الخبر الشمالية", "Khobar North"), ("العقربية", "Aqrabiyah"), ("العزيزية الخبر", "Aziziyah Khobar"), ("الدوحة الظهران", "Doha Dhahran"), ("الجبيل البلد", "Jubail"), ("الجبيل الصناعية", "Jubail Industrial")]),
        ("Asir", 18.2164, 42.5053, "أبها خميس مشيط Asir Abha", ["وسط أبها", "المحالة", "الموظفين", "المنسك", "خميس مشيط وسط", "حسام"]),
        ("Qassim", 26.3260, 43.9750, "القصيم بريدة عنيزة Qassim", ["الصفراء بريدة", "الإسكان", "النهضة", "الأفق", "وسط عنيزة", "الأشرفية"]),
        ("Tabuk", 28.3835, 36.5662, "تبوك Tabuk", ["المروج", "المصيف", "العليا", "الورود", "السليمانية"]),
    ]
    for adm1, lat, lng, kw, dists in sa_cities:
        add_group("SA", adm1, dists, lat, lng, kw)

    # --- UAE ---
    ae_cities = [
        ("Dubai", 25.2048, 55.2708, "دبي Dubai", [("ديرة", "Deira"), ("بر دبي", "Bur Dubai"), ("المرسى (دبي مارينا)", "Dubai Marina"), ("وسط دبي (داون تاون)", "Downtown Dubai"), ("البرشاء", "Al Barsha"), ("جميرا", "Jumeirah"), ("الخليج التجاري", "Business Bay"), ("أبراج بحيرات جميرا", "JLT Jumeirah Lakes Towers"), ("المدينة العالمية", "International City"), ("الخوانيج", "Al Khawaneej"), ("مردف", "Mirdif"), ("النهدة دبي", "Al Nahda"), ("القصيص", "Al Qusais")]),
        ("Abu Dhabi", 24.4539, 54.3773, "أبوظبي العين Abu Dhabi", [("الخالدية", "Khalidiyah"), ("الكورنيش", "Corniche"), ("جزيرة الريم", "Al Reem Island"), ("جزيرة ياس", "Yas Island"), ("المرور", "Al Muroor"), ("مدينة خليفة", "Khalifa City"), ("مدينة محمد بن زايد", "MBZ City"), ("المصفح", "Mussafah"), ("شاطئ الراحة", "Al Raha Beach"), ("وسط العين", "Al Ain"), ("الجيمي العين", "Al Jimi")]),
        ("Sharjah", 25.3463, 55.4209, "الشارقة عجمان Sharjah", ["المجاز", "القاسمية", "التعاون", "النهدة الشارقة", "الخان", "مويلح", "المدينة الجامعية", "الراشدية عجمان", "النعيمية عجمان"]),
    ]
    for adm1, lat, lng, kw, dists in ae_cities:
        add_group("AE", adm1, dists, lat, lng, kw)

    # --- JORDAN, KUWAIT, QATAR, BAHRAIN, OMAN, MOROCCO ---
    more_arab = [
        ("JO", "Amman Governorate", 31.9454, 35.9284, "عمان Jordan Amman", [("عبدون", "Abdoun"), ("تلاع العلي", "Tla Al Ali"), ("الشميساني", "Shmeisani"), ("خلدا", "Khalda"), ("الجبيهة", "Jubeiha"), ("الصويفية", "Sweifieh"), ("دير غبار", "Deir Ghbar"), ("طبربور", "Tabarbour"), ("ماركا", "Marka"), ("مرج الحمام", "Marj Al Hamam")]),
        ("JO", "Irbid", 32.5568, 35.8469, "إربد Irbid", ["وسط إربد", "الحي الشرقي", "الحي الجنوبي", "إيدون", "الحصن"]),
        ("KW", "Al Asimah", 29.3759, 47.9774, "الكويت العاصمة Kuwait", [("مدينة الكويت", "Kuwait City"), ("السالمية", "Salmiya"), ("حولي", "Hawalli"), ("الجابرية", "Jabriya"), ("الشعب", "Shaab"), ("بيان", "Bayan"), ("مشرف", "Mishref"), ("الفروانية", "Farwaniya"), ("خيطان", "Khaitan"), ("الأحمدي", "Ahmadi"), ("الجهراء", "Jahra")]),
        ("QA", "Baladīyat ad Dawḩah", 25.2854, 51.5310, "الدوحة قطر Doha Qatar", [("السد", "Al Sadd"), ("الدفنة (الخليج الغربي)", "West Bay Dafna"), ("اللؤلؤة قطر", "The Pearl"), ("لوسيل", "Lusail"), ("الريان", "Al Rayyan"), ("الوكرة", "Al Wakrah"), ("الغرافة", "Al Gharrafa"), ("الخور", "Al Khor")]),
        ("BH", "Capital", 26.2285, 50.5860, "البحرين المنامة Bahrain Manama", [("المنامة", "Manama"), ("السيف", "Seef"), ("الجفير", "Juffair"), ("المحرق", "Muharraq"), ("الرفاع", "Riffa"), ("مدينة عيسى", "Isa Town"), ("مدينة حمد", "Hamad Town")]),
        ("OM", "Muscat", 23.5880, 58.3829, "مسقط عمان Oman Muscat", [("القرم", "Al Qurum"), ("روي", "Ruwi"), ("الخوير", "Al Khuwair"), ("بوشر", "Bawshar"), ("السيب", "Seeb"), ("العذيبة", "Azaiba"), ("المعبيلة", "Mabelah"), ("صلالة", "Salalah"), ("صحار", "Sohar")]),
        ("MA", "Casablanca-Settat", 33.5731, -7.5898, "الدار البيضاء Casablanca", [("المعاريف", "Maarif"), ("أنفا", "Anfa"), ("عين دياب", "Ain Diab"), ("سيدي معروف", "Sidi Maarouf"), ("البرنوصي", "Bernoussi"), ("حي حسني", "Hay Hassani"), ("مولاي رشيد", "Moulay Rachid")]),
        ("MA", "Rabat-Salé-Kénitra", 34.0209, -6.8416, "الرباط سلا Rabat", [("أكدال", "Agdal"), ("حسان", "Hassan"), ("السويسي", "Souissi"), ("حي الرياض", "Hay Riad"), ("يعقوب المنصور", "Yacoub El Mansour"), ("سلا", "Sale")]),
    ]
    for cc, adm1, lat, lng, kw, dists in more_arab:
        add_group(cc, adm1, dists, lat, lng, kw)

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
        + "\nON CONFLICT (geoname_id) DO UPDATE SET "
        + "admin1_name = EXCLUDED.admin1_name, city_name = EXCLUDED.city_name, asciiname = EXCLUDED.asciiname, "
        + "alternate_names = EXCLUDED.alternate_names, search_vector = EXCLUDED.search_vector "
        + f"WHERE COALESCE({schema}.geonames_locations.alternate_names, '') LIKE '%__GEO_BULK__%';"
    )
    run_sql(sql, token)


def clean_bulk_rows(schema, token):
    print(f" -> Cleaning unreferenced bulk GeoNames rows in {schema}...")
    sql = f"""
    DELETE FROM {schema}.geonames_locations g
     WHERE COALESCE(g.alternate_names, '') LIKE '%__GEO_BULK__%'
       AND NOT EXISTS (SELECT 1 FROM {schema}.members m WHERE m.city_geoname_id = g.geoname_id)
       AND NOT EXISTS (SELECT 1 FROM {schema}.merchant_branches b WHERE b.city_geoname_id = g.geoname_id);
    """
    run_sql(sql, token)


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN env var is required.", file=sys.stderr)
        sys.exit(1)

    clean_mode = "--clean-bulk" in sys.argv
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
    print(f"Prepared {len(rows_list)} clean GeoNames locations covering {len(ccs_covered)} countries (curated Arabic districts: {len(curated)}).")

    batch_size = 900
    for schema in ("sawyan", "sawyan_demo"):
        if clean_mode:
            clean_bulk_rows(schema, token)
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
