import json
import os

with open('specs/marketing_content_vault.json', 'r', encoding='utf-8') as f:
    vault = json.load(f)

# Ensure output directory exists
os.makedirs('tools/content-vault', exist_ok=True)

html = '''<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>بنك محتوى SAWYAN — المنصة الشاملة للمحتوى والتسويق والإخراج</title>
    <link rel="icon" type="image/svg+xml" href="../../shared/assets/sawyan-icon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Poppins:wght@700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-dark: #0b1120;
            --card-bg: #111c30;
            --card-border: #1e293b;
            --emerald: #10b981;
            --emerald-dark: #047857;
            --gold: #f59e0b;
            --gold-light: #fef3c7;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --table-row-hover: #162238;
            --accent-blue: #1d5c8f;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Cairo', system-ui, -apple-system, sans-serif;
        }

        body {
            background-color: var(--bg-dark);
            color: var(--text-main);
            min-height: 100vh;
            padding: 20px;
            line-height: 1.6;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        /* Top Header */
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 20px;
            padding: 20px 24px;
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 16px;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .brand-header {
            display: flex;
            align-items: center;
            gap: 18px;
        }

        .brand-logo-wrap {
            display: inline-flex;
            align-items: center;
            background: #ffffff;
            padding: 6px 14px;
            border-radius: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .brand-title h1 {
            font-size: 1.85rem;
            font-weight: 900;
            background: linear-gradient(to left, #ffffff, #6ee7b7);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .brand-title p {
            font-size: 0.9rem;
            color: var(--text-muted);
            margin-top: 4px;
        }

        .header-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .btn {
            background: #1e293b;
            color: #f8fafc;
            border: 1px solid #334155;
            padding: 9px 18px;
            border-radius: 8px;
            font-size: 0.92rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            text-decoration: none;
        }

        .btn:hover {
            background: #334155;
            border-color: #475569;
            transform: translateY(-1px);
        }

        .btn-emerald {
            background: linear-gradient(135deg, #047857, #10b981);
            border: none;
            color: #fff;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .btn-gold {
            background: linear-gradient(135deg, #b45309, #f59e0b);
            border: none;
            color: #fff;
            box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
        }

        /* Navigation Tabs Bar */
        .tabs-nav {
            display: flex;
            gap: 10px;
            margin-bottom: 24px;
            overflow-x: auto;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--card-border);
        }

        .tab-btn {
            background: #111c30;
            border: 1px solid var(--card-border);
            color: var(--text-muted);
            padding: 12px 20px;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 800;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
            transition: all 0.2s;
        }

        .tab-btn:hover {
            background: #1e293b;
            color: #fff;
        }

        .tab-btn.active {
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.05));
            border-color: var(--emerald);
            color: var(--emerald);
            box-shadow: 0 0 16px rgba(16, 185, 129, 0.2);
        }

        .tab-badge {
            background: rgba(255, 255, 255, 0.1);
            font-size: 0.75rem;
            padding: 2px 8px;
            border-radius: 999px;
            color: inherit;
        }

        /* Search Bar */
        .search-bar-wrap {
            display: flex;
            gap: 14px;
            margin-bottom: 24px;
            flex-wrap: wrap;
        }

        .search-box {
            flex: 1;
            min-width: 280px;
            position: relative;
        }

        .search-input {
            width: 100%;
            background: #111c30;
            border: 1px solid var(--card-border);
            color: #fff;
            padding: 13px 44px 13px 16px;
            border-radius: 10px;
            font-size: 0.98rem;
            outline: none;
            transition: border 0.2s;
        }

        .search-input:focus {
            border-color: var(--emerald);
        }

        .search-icon {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
            font-size: 1.1rem;
        }

        /* Sections */
        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        /* Table of Scenes & Direction */
        .storyboard-card {
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 8px 30px rgba(0,0,0,0.3);
            margin-bottom: 30px;
        }

        .storyboard-header {
            background: #162033;
            padding: 18px 24px;
            border-bottom: 1px solid #1e293b;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }

        .storyboard-header h2 {
            font-size: 1.35rem;
            font-weight: 800;
            color: #6ee7b7;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .storyboard-table-wrap {
            overflow-x: auto;
        }

        .storyboard-table {
            width: 100%;
            border-collapse: collapse;
            text-align: right;
            font-size: 0.94rem;
        }

        .storyboard-table th {
            background: #111c30;
            color: #94a3b8;
            font-weight: 800;
            padding: 14px 18px;
            border-bottom: 2px solid #1e293b;
            white-space: nowrap;
        }

        .storyboard-table td {
            padding: 18px 18px;
            border-bottom: 1px solid #1e293b;
            vertical-align: top;
            line-height: 1.7;
        }

        .storyboard-table tr:hover {
            background: var(--table-row-hover);
        }

        .time-badge {
            background: #1e293b;
            color: #f59e0b;
            border: 1px solid #d97706;
            padding: 6px 12px;
            border-radius: 8px;
            font-family: 'Poppins', sans-serif;
            font-weight: 800;
            font-size: 0.88rem;
            display: inline-block;
            white-space: nowrap;
            direction: ltr;
        }

        .voiceover-text {
            color: #f8fafc;
            font-size: 1.05rem;
            font-weight: 700;
            line-height: 1.8;
            background: rgba(16, 185, 129, 0.08);
            padding: 10px 14px;
            border-radius: 8px;
            border-right: 3px solid var(--emerald);
        }

        .visual-cell {
            color: #cbd5e1;
        }

        .sfx-cell {
            color: #fde68a;
            font-size: 0.9rem;
        }

        .typography-cell {
            color: #38bdf8;
            font-weight: 700;
            font-size: 0.92rem;
        }

        /* Cards Grid */
        .cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
            gap: 22px;
            margin-bottom: 30px;
        }

        @media (max-width: 600px) {
            .cards-grid {
                grid-template-columns: 1fr;
            }
        }

        .content-card {
            background: #111c30;
            border: 1px solid #1e293b;
            border-radius: 14px;
            padding: 22px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: all 0.2s ease;
            position: relative;
        }

        .content-card:hover {
            border-color: #334155;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }

        .content-card.official-badge-card {
            border-color: rgba(16, 185, 129, 0.4);
            background: linear-gradient(180deg, #132238, #111c30);
        }

        .content-card.official-badge-card::before {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 4px;
            height: 100%;
            background: var(--emerald);
            border-radius: 0 14px 14px 0;
        }

        .card-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 14px;
            gap: 10px;
        }

        .pill-badge {
            font-size: 0.78rem;
            font-weight: 800;
            padding: 3px 10px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }

        .pill-official {
            background: rgba(16, 185, 129, 0.18);
            color: #34d399;
            border: 1px solid #10b981;
        }

        .pill-candidate {
            background: rgba(245, 158, 11, 0.18);
            color: #fbbf24;
            border: 1px solid #f59e0b;
        }

        .pill-script {
            background: rgba(56, 189, 248, 0.18);
            color: #38bdf8;
            border: 1px solid #0284c7;
        }

        .card-code {
            font-family: 'Poppins', sans-serif;
            font-size: 0.75rem;
            color: #64748b;
            font-weight: 700;
        }

        .card-title {
            font-size: 1.12rem;
            font-weight: 800;
            color: #ffffff;
            margin-bottom: 12px;
        }

        .card-text {
            font-size: 1rem;
            line-height: 1.8;
            color: #e2e8f0;
            background: #0b1222;
            padding: 14px 16px;
            border-radius: 10px;
            border: 1px solid #1e293b;
            margin-bottom: 14px;
            white-space: pre-wrap;
            flex-grow: 1;
        }

        .card-notes {
            font-size: 0.82rem;
            color: #94a3b8;
            margin-bottom: 14px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .card-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
            border-top: 1px solid #1e293b;
            padding-top: 12px;
        }

        .btn-copy {
            background: #1e293b;
            color: #38bdf8;
            border: 1px solid #334155;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .btn-copy:hover {
            background: #0284c7;
            color: #fff;
            border-color: #0284c7;
        }

        /* Toast notification */
        .toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: #10b981;
            color: #fff;
            padding: 12px 28px;
            border-radius: 999px;
            font-weight: 800;
            font-size: 0.95rem;
            box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
            transition: transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            z-index: 9999;
            pointer-events: none;
        }

        .toast.show {
            transform: translateX(-50%) translateY(0);
        }

        /* Script View Card */
        .script-hero-box {
            background: linear-gradient(180deg, #1e293b, #0f172a);
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 26px;
            margin-bottom: 24px;
        }

        .script-hero-box h3 {
            font-size: 1.3rem;
            color: #fde68a;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .vocalized-script-text {
            font-size: 1.25rem;
            line-height: 2.2;
            color: #ffffff;
            background: #090e1a;
            padding: 24px;
            border-radius: 12px;
            border-right: 5px solid #10b981;
            white-space: pre-wrap;
            letter-spacing: 0.5px;
        }
    </style>
</head>
<body>

<div class="container">
    <!-- Top Header -->
    <header>
        <div class="brand-header">
            <div class="brand-logo-wrap">
                <!-- Calibrated SAWYAN Logo matching user approved dimensions -->
                <svg viewBox="0 0 460 140" style="height: 44px; display: block; overflow: visible;">
                    <!-- S A W -->
                    <text x="10" y="105" font-family="'Poppins', sans-serif" font-weight="900" font-size="94" fill="#1d5c8f" letter-spacing="1">SAW</text>
                    <!-- Y -->
                    <text x="246" y="105" font-family="'Poppins', sans-serif" font-weight="900" font-size="94" fill="#1d5c8f">Y</text>
                    <!-- Shaddah & Fathah placed over the right arm of Y -->
                    <!-- Fathah slanted bar -->
                    <path d="M298 22 L332 12" stroke="#000000" stroke-width="7" stroke-linecap="round"/>
                    <!-- Shaddah 3 prongs -->
                    <path d="M296 46 C300 36, 308 36, 312 46 C316 36, 324 36, 328 46 C332 36, 340 36, 344 46" stroke="#000000" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- A N -->
                    <text x="312" y="105" font-family="'Poppins', sans-serif" font-weight="900" font-size="94" fill="#1d5c8f" letter-spacing="1">AN</text>
                </svg>
            </div>
            <div class="brand-title">
                <h1>بنك محتوى SAWYAN</h1>
                <p>المرجع الدستوري الشامل للمحتوى التسويقي، النصوص المعتمدة، وسيناريوهات الفيديو والإخراج الفني (sawyan.net)</p>
            </div>
        </div>
        <div class="header-actions">
            <button type="button" class="btn btn-emerald" onclick="copyAllContent()">📋 نسخ كافة النصوص</button>
            <button type="button" class="btn btn-gold" onclick="downloadJSON()">📥 تصدير JSON</button>
            <a href="../../docs/بنك_المحتوى_والتسويق_الاستراتيجي.md" class="btn" target="_blank">📄 الملف التوثيقي الكامل</a>
        </div>
    </header>

    <!-- Navigation Tabs -->
    <div class="tabs-nav">
        <button class="tab-btn active" onclick="switchTab('storyboard')">
            🎬 جدول المشاهد والإخراج (ثانية بثانية)
            <span class="tab-badge">6 مشاهد</span>
        </button>
        <button class="tab-btn" onclick="switchTab('official')">
            🏛️ العبارات المعتمدة من الإدارة
            <span class="tab-badge">11 عبارة رسمية</span>
        </button>
        <button class="tab-btn" onclick="switchTab('candidate')">
            💡 العبارات والرسائل المرشحة
            <span class="tab-badge">8 أفكار تسويقية</span>
        </button>
        <button class="tab-btn" onclick="switchTab('scripts')">
            📜 السكربتات الإعلانية الثلاثة
            <span class="tab-badge">3 سيناريوهات مشكولة</span>
        </button>
    </div>

    <!-- Search Bar -->
    <div class="search-bar-wrap">
        <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="liveSearchInput" class="search-input" placeholder="ابحث في العبارات المعتمدة، المشاهد، التوقيت، أو الكلمات المفتاحية (مثلاً: سوبر ماركت، تاجر، 00:12)..." oninput="filterContent()">
        </div>
    </div>

    <!-- TAB 1: STORYBOARD (جدول المشاهد والإخراج ثانية بثانية) -->
    <div id="tab-storyboard" class="tab-content active">
        <div class="storyboard-card">
            <div class="storyboard-header">
                <h2>🎬 جدول المشاهد والإخراج الفني الكامل — فيديو الواجهة الرئيسي (45 ثانية)</h2>
                <button type="button" class="btn-copy" onclick="copyTableContent()">📋 نسخ جدول المشاهد</button>
            </div>
            <div class="storyboard-table-wrap">
                <table class="storyboard-table" id="storyboardTable">
                    <thead>
                        <tr>
                            <th style="width: 130px;">التوقيت</th>
                            <th style="width: 25%;">المشهد البصري (Camera & Visuals)</th>
                            <th style="width: 32%;">التعليق الصوتي (Voiceover - نبرة واثقة هادئة)</th>
                            <th style="width: 20%;">المؤثرات الصوتية والموسيقى (SFX & Music)</th>
                            <th style="width: 15%;">النصوص على الشاشة</th>
                        </tr>
                    </thead>
                    <tbody>'''

for row in vault['video_storyboard']:
    html += f'''
                        <tr>
                            <td><span class="time-badge">{row['timing']}</span></td>
                            <td class="visual-cell">{row['visuals']}</td>
                            <td><div class="voiceover-text">{row['voiceover']}</div></td>
                            <td class="sfx-cell">{row['sfx_music']}</td>
                            <td class="typography-cell">{row['typography']}</td>
                        </tr>'''

html += '''
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- TAB 2: OFFICIAL APPROVED PHRASES (العبارات المعتمدة رسمياً من الإدارة) -->
    <div id="tab-official" class="tab-content">
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 14px 20px; margin-bottom: 24px; color: #34d399; font-weight: 700;">
            🏛️ <strong>المصدر الدستوري المعتمد:</strong> هذه العبارات هي النصوص الرسمية المعتمدة حرفياً من الإدارة العليا لتغذية كافة منصات الميديا، المطبوعات، وموقع sawyan.net.
        </div>
        <div class="cards-grid" id="officialGrid">'''

for item in vault['official_approved_phrases']:
    safe_text = item['current_text'].replace('"', '&quot;').replace('\n', '<br>')
    raw_js_text = item['current_text'].replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
    html += f'''
            <div class="content-card official-badge-card" data-search="{item['title']} {item['current_text']}">
                <div>
                    <div class="card-top">
                        <span class="pill-badge pill-official">🏛️ معتمد رسمياً من الإدارة</span>
                        <span class="card-code">{item['id']}</span>
                    </div>
                    <div class="card-title">{item['title']}</div>
                    <div class="card-text">{safe_text}</div>
                    <div class="card-notes">📌 <em>{item['usage_notes']}</em></div>
                </div>
                <div class="card-actions">
                    <button type="button" class="btn-copy" onclick="copyText(`{raw_js_text}`)">📋 نسخ النص</button>
                </div>
            </div>'''

html += '''
        </div>
    </div>

    <!-- TAB 3: CANDIDATE MARKETING PHRASES (العبارات والرسائل التسويقية المرشحة) -->
    <div id="tab-candidate" class="tab-content">
        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 14px 20px; margin-bottom: 24px; color: #fbbf24; font-weight: 700;">
            💡 <strong>بنك الأفكار التسويقية الاستراتيجية:</strong> عبارات وخطافات تسويقية مستخرجة ومصاغة بعناية من الشروحات المرئية لتناسب الريلز، البوستات، والرسائل المباشرة.
        </div>
        <div class="cards-grid" id="candidateGrid">'''

for item in vault['candidate_marketing_phrases']:
    safe_text = item['current_text'].replace('"', '&quot;').replace('\n', '<br>')
    raw_js_text = item['current_text'].replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
    html += f'''
            <div class="content-card" data-search="{item['title']} {item['current_text']}">
                <div>
                    <div class="card-top">
                        <span class="pill-badge pill-candidate">💡 فكرة تسويقية مرشحة</span>
                        <span class="card-code">{item['id']}</span>
                    </div>
                    <div class="card-title">{item['title']}</div>
                    <div class="card-text">{safe_text}</div>
                    <div class="card-notes">📌 <em>{item['usage_notes']}</em></div>
                </div>
                <div class="card-actions">
                    <button type="button" class="btn-copy" onclick="copyText(`{raw_js_text}`)">📋 نسخ النص</button>
                </div>
            </div>'''

html += '''
        </div>
    </div>

    <!-- TAB 4: FULL SCRIPTS (السكربتات الإعلانية الثلاثة المشكولة) -->
    <div id="tab-scripts" class="tab-content">'''

for script in vault['scripts_full']:
    badge_class = 'pill-official' if 'المعتمد' in script['title'] else 'pill-script'
    safe_text = script['current_text'].replace('"', '&quot;').replace('\n', '<br>')
    raw_js_text = script['current_text'].replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
    html += f'''
        <div class="script-hero-box" data-search="{script['title']} {script['current_text']}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <span class="pill-badge {badge_class}">{script['type']}</span>
                <button type="button" class="btn-copy" onclick="copyText(`{raw_js_text}`)">📋 نسخ السكربت كاملاً</button>
            </div>
            <div class="vocalized-script-text">{safe_text}</div>
            <div style="color:#94a3b8; font-size:0.9rem; margin-top:12px;">📌 {script['usage_notes']}</div>
        </div>'''

html += '''
    </div>
</div>

<!-- Toast -->
<div class="toast" id="toastMsg">تم النسخ إلى الحافظة بنجاح ✓</div>

<script>
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const btns = Array.from(document.querySelectorAll('.tab-btn'));
    const activeBtn = btns.find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');

    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) targetTab.classList.add('active');
}

function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('تم نسخ النص بنجاح ✓');
        }).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('تم نسخ النص بنجاح ✓');
}

function showToast(msg) {
    const t = document.getElementById('toastMsg');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => {
        t.classList.remove('show');
    }, 2500);
}

function filterContent() {
    const q = document.getElementById('liveSearchInput').value.trim().toLowerCase();
    
    // Filter cards
    document.querySelectorAll('[data-search]').forEach(el => {
        const text = el.getAttribute('data-search').toLowerCase();
        if (!q || text.includes(q)) {
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });

    // Filter table rows
    const rows = document.querySelectorAll('#storyboardTable tbody tr');
    rows.forEach(r => {
        const rText = r.innerText.toLowerCase();
        if (!q || rText.includes(q)) {
            r.style.display = '';
        } else {
            r.style.display = 'none';
        }
    });
}

function copyTableContent() {
    let out = 'جدول المشاهد والإخراج (ثانية بثانية) — SAWYAN\\n\\n';
    document.querySelectorAll('#storyboardTable tbody tr').forEach(r => {
        const cols = r.querySelectorAll('td');
        out += `التوقيت: ${cols[0].innerText}\\nالمشهد: ${cols[1].innerText}\\nالتعليق الصوتي: ${cols[2].innerText}\\nالمؤثرات: ${cols[3].innerText}\\nالنصوص: ${cols[4].innerText}\\n------------------------\\n`;
    });
    copyText(out);
}

function copyAllContent() {
    let out = 'بنك محتوى SAWYAN — الملف الشامل\\n\\n';
    out += '=== العبارات المعتمدة من الإدارة ===\\n';
    document.querySelectorAll('#officialGrid .content-card').forEach(c => {
        out += c.querySelector('.card-title').innerText + ':\\n' + c.querySelector('.card-text').innerText + '\\n\\n';
    });
    out += '\\n=== العبارات المرشحة ===\\n';
    document.querySelectorAll('#candidateGrid .content-card').forEach(c => {
        out += c.querySelector('.card-title').innerText + ':\\n' + c.querySelector('.card-text').innerText + '\\n\\n';
    });
    copyText(out);
}

function downloadJSON() {
    const a = document.createElement('a');
    a.href = '../../specs/marketing_content_vault.json';
    a.download = 'marketing_content_vault.json';
    a.click();
}
</script>
</body>
</html>'''

with open('tools/content-vault/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('tools/content-vault/index.html generated successfully!')
