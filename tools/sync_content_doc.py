import json

with open('specs/marketing_content_vault.json', 'r', encoding='utf-8') as f:
    vault = json.load(f)

md = '''# بنك محتوى SAWYAN — المرجع الدستوري للمحتوى والتسويق الاستراتيجي

> **الإصدار:** 2.0.0 | **تاريخ الاعتماد:** 2026-11-22 | **النطاق الرسمي:** `sawyan.net`  
> **الهدف:** تجميع وحفظ كافة العبارات المعتمدة من الإدارة، وجدول المشاهد والإخراج الفني (ثانية بثانية)، والعبارات التسويقية المرشحة، والسكربتات الإعلانية المشكولة صوتياً بالكامل في مرجع حي قابل للتطوير مدى الحياة.

---

## 🔒 1. محددات الهوية والضوابط الدستورية الصارمة
* **المصطلحات المحظورة نهائياً:** يُحظر تماماً استخدام `كاشباك`، `كاش باك`، `SAWYAN BANK`، `التسويق الشبكي`، `-19.75$`، `Rolling Reserve`.
* **المصطلحات المعتمدة حصراً:** `عائدات الاستهلاك الاستثماري`، `صندوق الهدف الشهري`، `SAWYAN`، `الاستهلاك الاستثماري (Buy and Make Money)`، `كلنا SAWYAN`.

---

## 🎬 2. جدول المشاهد والإخراج الفني (ثانية بثانية) — فيديو الواجهة الرئيسي (45 ثانية)

| التوقيت | المشهد البصري (Camera & Visuals) | التعليق الصوتي (Voiceover - نبرة واثقة هادئة) | المؤثرات الصوتية والموسيقى (SFX & Music) | النصوص على الشاشة (On-Screen Typography) |
| :--- | :--- | :--- | :--- | :--- |
'''

for r in vault['video_storyboard']:
    md += f"| `{r['timing']}` | {r['visuals']} | **{r['voiceover']}** | {r['sfx_music']} | {r['typography']} |\n"

md += '''
---

## 🏛️ 3. العبارات المعتمدة رسمياً من الإدارة العليا

'''

for item in vault['official_approved_phrases']:
    safe_lines = item['current_text'].replace('\n', '\n> ')
    md += f"### [{item['id']}] {item['title']} ({item['type']})\n"
    md += f"> **النص المعتمد:**\n> {safe_lines}\n\n"
    md += f"* **ملاحظات الاستخدام:** {item['usage_notes']}\n\n---\n\n"

md += '''
## 💡 4. العبارات والرسائل التسويقية المرشحة (بنك الأفكار من الفيديوهات والشروحات)

'''

for item in vault['candidate_marketing_phrases']:
    safe_lines = item['current_text'].replace('\n', '\n> ')
    md += f"### [{item['id']}] {item['title']} ({item['type']})\n"
    md += f"> **النص:**\n> {safe_lines}\n\n"
    md += f"* **ملاحظات الاستخدام:** {item['usage_notes']}\n\n---\n\n"

md += '''
## 📜 5. السكربتات الإعلانية الثلاثة المشكولة صوتياً بالكامل

'''

for script in vault['scripts_full']:
    safe_lines = script['current_text'].replace('\n', '\n> ')
    md += f"### {script['title']} — {script['type']}\n"
    md += f"> **السكربت المشكول:**\n> {safe_lines}\n\n"
    md += f"* **ملاحظات الاستخدام:** {script['usage_notes']}\n\n---\n\n"

with open('docs/بنك_المحتوى_والتسويق_الاستراتيجي.md', 'w', encoding='utf-8') as f:
    f.write(md)

print('Updated docs/بنك_المحتوى_والتسويق_الاستراتيجي.md successfully!')
