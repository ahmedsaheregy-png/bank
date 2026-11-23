/**
 * ============================================================================
 * SAWYAN V3.0 — World Countries, Native Locale Sorting & Phone Rules
 * - Multilingual country names (Arabic, English, + dynamic Intl.DisplayNames for any locale)
 * - True language-native alphabetical sorting (Arabic Hijaa'i أ ب ت ث ج ignoring definite الـ,
 *   English A-Z, and Intl.Collator(lang) for every world language)
 * - Multilingual aliases (أمريكا / الولايات المتحدة / USA, بريطانيا / المملكة المتحدة / UK, ...)
 * - Automatic timezone -> country detection for frictionless registration
 * ============================================================================
 */

window.SAWYAN = window.SAWYAN || {};

window.SAWYAN.Countries = [
    { code: "AF", nameEn: "Afghanistan", nameAr: "أفغانستان", flag: "🇦🇫", dialCode: "+93" },
    { code: "AL", nameEn: "Albania", nameAr: "ألبانيا", flag: "🇦🇱", dialCode: "+355" },
    { code: "DZ", nameEn: "Algeria", nameAr: "الجزائر", flag: "🇩🇿", dialCode: "+213", aliases: ["دزاير", "Algérie"] },
    { code: "AD", nameEn: "Andorra", nameAr: "أندورا", flag: "🇦🇩", dialCode: "+376" },
    { code: "AO", nameEn: "Angola", nameAr: "أنغولا", flag: "🇦🇴", dialCode: "+244" },
    { code: "AR", nameEn: "Argentina", nameAr: "الأرجنتين", flag: "🇦🇷", dialCode: "+54" },
    { code: "AM", nameEn: "Armenia", nameAr: "أرمينيا", flag: "🇦🇲", dialCode: "+374" },
    { code: "AU", nameEn: "Australia", nameAr: "أستراليا", flag: "🇦🇺", dialCode: "+61" },
    { code: "AT", nameEn: "Austria", nameAr: "النمسا", flag: "🇦🇹", dialCode: "+43", aliases: ["Österreich"] },
    { code: "AZ", nameEn: "Azerbaijan", nameAr: "أذربيجان", flag: "🇦🇿", dialCode: "+994" },
    { code: "BH", nameEn: "Bahrain", nameAr: "البحرين", flag: "🇧🇭", dialCode: "+973" },
    { code: "BD", nameEn: "Bangladesh", nameAr: "بنغلاديش", flag: "🇧🇩", dialCode: "+880" },
    { code: "BY", nameEn: "Belarus", nameAr: "بيلاروسيا", flag: "🇧🇾", dialCode: "+375", aliases: ["روسيا البيضاء"] },
    { code: "BE", nameEn: "Belgium", nameAr: "بلجيكا", flag: "🇧🇪", dialCode: "+32" },
    { code: "BZ", nameEn: "Belize", nameAr: "بليز", flag: "🇧🇿", dialCode: "+501" },
    { code: "BJ", nameEn: "Benin", nameAr: "بنين", flag: "🇧🇯", dialCode: "+229" },
    { code: "BT", nameEn: "Bhutan", nameAr: "بوتان", flag: "🇧🇹", dialCode: "+975" },
    { code: "BO", nameEn: "Bolivia", nameAr: "بوليفيا", flag: "🇧🇴", dialCode: "+591" },
    { code: "BA", nameEn: "Bosnia and Herzegovina", nameAr: "البوسنة والهرسك", flag: "🇧🇦", dialCode: "+387" },
    { code: "BW", nameEn: "Botswana", nameAr: "بوتسوانا", flag: "🇧🇼", dialCode: "+267" },
    { code: "BR", nameEn: "Brazil", nameAr: "البرازيل", flag: "🇧🇷", dialCode: "+55" },
    { code: "BN", nameEn: "Brunei", nameAr: "بروناي", flag: "🇧🇳", dialCode: "+673" },
    { code: "BG", nameEn: "Bulgaria", nameAr: "بلغاريا", flag: "🇧🇬", dialCode: "+359" },
    { code: "BF", nameEn: "Burkina Faso", nameAr: "بوركينا فاسو", flag: "🇧🇫", dialCode: "+226" },
    { code: "BI", nameEn: "Burundi", nameAr: "بوروندي", flag: "🇧🇮", dialCode: "+257" },
    { code: "KH", nameEn: "Cambodia", nameAr: "كمبوديا", flag: "🇰🇭", dialCode: "+855" },
    { code: "CM", nameEn: "Cameroon", nameAr: "الكاميرون", flag: "🇨🇲", dialCode: "+237" },
    { code: "CA", nameEn: "Canada", nameAr: "كندا", flag: "🇨🇦", dialCode: "+1" },
    { code: "CF", nameEn: "Central African Republic", nameAr: "جمهورية أفريقيا الوسطى", flag: "🇨🇫", dialCode: "+236", aliases: ["أفريقيا الوسطى"] },
    { code: "TD", nameEn: "Chad", nameAr: "تشاد", flag: "🇹🇩", dialCode: "+235" },
    { code: "CL", nameEn: "Chile", nameAr: "تشيلي", flag: "🇨🇱", dialCode: "+56" },
    { code: "CN", nameEn: "China", nameAr: "الصين", flag: "🇨🇳", dialCode: "+86" },
    { code: "CO", nameEn: "Colombia", nameAr: "كولومبيا", flag: "🇨🇴", dialCode: "+57" },
    { code: "KM", nameEn: "Comoros", nameAr: "جزر القمر", flag: "🇰🇲", dialCode: "+269" },
    { code: "CG", nameEn: "Congo", nameAr: "الكونغو", flag: "🇨🇬", dialCode: "+242" },
    { code: "CR", nameEn: "Costa Rica", nameAr: "كوستاريكا", flag: "🇨🇷", dialCode: "+506" },
    { code: "HR", nameEn: "Croatia", nameAr: "كرواتيا", flag: "🇭🇷", dialCode: "+385" },
    { code: "CU", nameEn: "Cuba", nameAr: "كوبا", flag: "🇨🇺", dialCode: "+53" },
    { code: "CY", nameEn: "Cyprus", nameAr: "قبرص", flag: "🇨🇾", dialCode: "+357" },
    { code: "CZ", nameEn: "Czech Republic", nameAr: "التشيك", flag: "🇨🇿", dialCode: "+420", aliases: ["Czechia"] },
    { code: "DK", nameEn: "Denmark", nameAr: "الدنمارك", flag: "🇩🇰", dialCode: "+45" },
    { code: "DJ", nameEn: "Djibouti", nameAr: "جيبوتي", flag: "🇩🇯", dialCode: "+253" },
    { code: "DO", nameEn: "Dominican Republic", nameAr: "جمهورية الدومينيكان", flag: "🇩🇴", dialCode: "+1", aliases: ["الدومينيكان"] },
    { code: "EC", nameEn: "Ecuador", nameAr: "الإكوادور", flag: "🇪🇨", dialCode: "+593" },
    { code: "EG", nameEn: "Egypt", nameAr: "مصر", flag: "🇪🇬", dialCode: "+20", aliases: ["جمهورية مصر العربية", "ام الدنيا", "Misr"] },
    { code: "SV", nameEn: "El Salvador", nameAr: "السلفادور", flag: "🇸🇻", dialCode: "+503" },
    { code: "GQ", nameEn: "Equatorial Guinea", nameAr: "غينيا الاستوائية", flag: "🇬🇶", dialCode: "+240" },
    { code: "ER", nameEn: "Eritrea", nameAr: "إريتريا", flag: "🇪🇷", dialCode: "+291" },
    { code: "EE", nameEn: "Estonia", nameAr: "إستونيا", flag: "🇪🇪", dialCode: "+372" },
    { code: "ET", nameEn: "Ethiopia", nameAr: "إثيوبيا", flag: "🇪🇹", dialCode: "+251", aliases: ["الحبشة"] },
    { code: "FJ", nameEn: "Fiji", nameAr: "فيجي", flag: "🇫🇯", dialCode: "+679" },
    { code: "FI", nameEn: "Finland", nameAr: "فنلندا", flag: "🇫🇮", dialCode: "+358" },
    { code: "FR", nameEn: "France", nameAr: "فرنسا", flag: "🇫🇷", dialCode: "+33" },
    { code: "GA", nameEn: "Gabon", nameAr: "الغابون", flag: "🇬🇦", dialCode: "+241" },
    { code: "GM", nameEn: "Gambia", nameAr: "غامبيا", flag: "🇬🇲", dialCode: "+220" },
    { code: "GE", nameEn: "Georgia", nameAr: "جورجيا", flag: "🇬🇪", dialCode: "+995" },
    { code: "DE", nameEn: "Germany", nameAr: "ألمانيا", flag: "🇩🇪", dialCode: "+49", aliases: ["Deutschland"] },
    { code: "GH", nameEn: "Ghana", nameAr: "غانا", flag: "🇬🇭", dialCode: "+233" },
    { code: "GR", nameEn: "Greece", nameAr: "اليونان", flag: "🇬🇷", dialCode: "+30" },
    { code: "GT", nameEn: "Guatemala", nameAr: "غواتيمالا", flag: "🇬🇹", dialCode: "+502" },
    { code: "GN", nameEn: "Guinea", nameAr: "غينيا", flag: "🇬🇳", dialCode: "+224" },
    { code: "GW", nameEn: "Guinea-Bissau", nameAr: "غينيا بيساو", flag: "🇬🇼", dialCode: "+245" },
    { code: "HT", nameEn: "Haiti", nameAr: "هايتي", flag: "🇭🇹", dialCode: "+509" },
    { code: "HN", nameEn: "Honduras", nameAr: "هندوراس", flag: "🇭🇳", dialCode: "+504" },
    { code: "HK", nameEn: "Hong Kong", nameAr: "هونغ كونغ", flag: "🇭🇰", dialCode: "+852" },
    { code: "HU", nameEn: "Hungary", nameAr: "المجر", flag: "🇭🇺", dialCode: "+36", aliases: ["هنغاريا"] },
    { code: "IS", nameEn: "Iceland", nameAr: "آيسلندا", flag: "🇮🇸", dialCode: "+354" },
    { code: "IN", nameEn: "India", nameAr: "الهند", flag: "🇮🇳", dialCode: "+91" },
    { code: "ID", nameEn: "Indonesia", nameAr: "إندونيسيا", flag: "🇮🇩", dialCode: "+62" },
    { code: "IR", nameEn: "Iran", nameAr: "إيران", flag: "🇮🇷", dialCode: "+98" },
    { code: "IQ", nameEn: "Iraq", nameAr: "العراق", flag: "🇮🇶", dialCode: "+964" },
    { code: "IE", nameEn: "Ireland", nameAr: "أيرلندا", flag: "🇮🇪", dialCode: "+353" },
    { code: "IL", nameEn: "Israel", nameAr: "إسرائيل", flag: "🇮🇱", dialCode: "+972" },
    { code: "IT", nameEn: "Italy", nameAr: "إيطاليا", flag: "🇮🇹", dialCode: "+39", aliases: ["Italia"] },
    { code: "CI", nameEn: "Ivory Coast", nameAr: "ساحل العاج", flag: "🇨🇮", dialCode: "+225", aliases: ["كوت ديفوار", "Côte d'Ivoire"] },
    { code: "JM", nameEn: "Jamaica", nameAr: "جامايكا", flag: "🇯🇲", dialCode: "+1" },
    { code: "JP", nameEn: "Japan", nameAr: "اليابان", flag: "🇯🇵", dialCode: "+81" },
    { code: "JO", nameEn: "Jordan", nameAr: "الأردن", flag: "🇯🇴", dialCode: "+962" },
    { code: "KZ", nameEn: "Kazakhstan", nameAr: "كازاخستان", flag: "🇰🇿", dialCode: "+7" },
    { code: "KE", nameEn: "Kenya", nameAr: "كينيا", flag: "🇰🇪", dialCode: "+254" },
    { code: "KW", nameEn: "Kuwait", nameAr: "الكويت", flag: "🇰🇼", dialCode: "+965" },
    { code: "KG", nameEn: "Kyrgyzstan", nameAr: "قيرغيزستان", flag: "🇰🇬", dialCode: "+996" },
    { code: "LA", nameEn: "Laos", nameAr: "لاوس", flag: "🇱🇦", dialCode: "+856" },
    { code: "LV", nameEn: "Latvia", nameAr: "لاتفيا", flag: "🇱🇻", dialCode: "+371" },
    { code: "LB", nameEn: "Lebanon", nameAr: "لبنان", flag: "🇱🇧", dialCode: "+961" },
    { code: "LS", nameEn: "Lesotho", nameAr: "ليسوتو", flag: "🇱🇸", dialCode: "+266" },
    { code: "LR", nameEn: "Liberia", nameAr: "ليبيريا", flag: "🇱🇷", dialCode: "+231" },
    { code: "LY", nameEn: "Libya", nameAr: "ليبيا", flag: "🇱🇾", dialCode: "+218" },
    { code: "LI", nameEn: "Liechtenstein", nameAr: "ليختنشتاين", flag: "🇱🇮", dialCode: "+423" },
    { code: "LT", nameEn: "Lithuania", nameAr: "ليتوانيا", flag: "🇱🇹", dialCode: "+370" },
    { code: "LU", nameEn: "Luxembourg", nameAr: "لوكسمبورغ", flag: "🇱🇺", dialCode: "+352" },
    { code: "MK", nameEn: "North Macedonia", nameAr: "مقدونيا", flag: "🇲🇰", dialCode: "+389", aliases: ["Macedonia", "مقدونيا الشمالية"] },
    { code: "MG", nameEn: "Madagascar", nameAr: "مدغشقر", flag: "🇲🇬", dialCode: "+261" },
    { code: "MW", nameEn: "Malawi", nameAr: "مالاوي", flag: "🇲🇼", dialCode: "+265" },
    { code: "MY", nameEn: "Malaysia", nameAr: "ماليزيا", flag: "🇲🇾", dialCode: "+60" },
    { code: "MV", nameEn: "Maldives", nameAr: "المالديف", flag: "🇲🇻", dialCode: "+960", aliases: ["جزر المالديف"] },
    { code: "ML", nameEn: "Mali", nameAr: "مالي", flag: "🇲🇱", dialCode: "+223" },
    { code: "MT", nameEn: "Malta", nameAr: "مالطا", flag: "🇲🇹", dialCode: "+356" },
    { code: "MR", nameEn: "Mauritania", nameAr: "موريتانيا", flag: "🇲🇷", dialCode: "+222" },
    { code: "MU", nameEn: "Mauritius", nameAr: "موريشيوس", flag: "🇲🇺", dialCode: "+230" },
    { code: "MX", nameEn: "Mexico", nameAr: "المكسيك", flag: "🇲🇽", dialCode: "+52" },
    { code: "MD", nameEn: "Moldova", nameAr: "مولدوفا", flag: "🇲🇩", dialCode: "+373" },
    { code: "MC", nameEn: "Monaco", nameAr: "موناكو", flag: "🇲🇨", dialCode: "+377" },
    { code: "MN", nameEn: "Mongolia", nameAr: "منغوليا", flag: "🇲🇳", dialCode: "+976" },
    { code: "ME", nameEn: "Montenegro", nameAr: "الجبل الأسود", flag: "🇲🇪", dialCode: "+382", aliases: ["مونتينيغرو"] },
    { code: "MA", nameEn: "Morocco", nameAr: "المغرب", flag: "🇲🇦", dialCode: "+212", aliases: ["Maroc"] },
    { code: "MZ", nameEn: "Mozambique", nameAr: "موزمبيق", flag: "🇲🇿", dialCode: "+258" },
    { code: "MM", nameEn: "Myanmar", nameAr: "ميانمار", flag: "🇲🇲", dialCode: "+95", aliases: ["بورما", "Burma"] },
    { code: "NA", nameEn: "Namibia", nameAr: "ناميبيا", flag: "🇳🇦", dialCode: "+264" },
    { code: "NP", nameEn: "Nepal", nameAr: "نيبال", flag: "🇳🇵", dialCode: "+977" },
    { code: "NL", nameEn: "Netherlands", nameAr: "هولندا", flag: "🇳🇱", dialCode: "+31", aliases: ["Holland"] },
    { code: "NZ", nameEn: "New Zealand", nameAr: "نيوزيلندا", flag: "🇳🇿", dialCode: "+64" },
    { code: "NI", nameEn: "Nicaragua", nameAr: "نيكاراغوا", flag: "🇳🇮", dialCode: "+505" },
    { code: "NE", nameEn: "Niger", nameAr: "النيجر", flag: "🇳🇪", dialCode: "+227" },
    { code: "NG", nameEn: "Nigeria", nameAr: "نيجيريا", flag: "🇳🇬", dialCode: "+234" },
    { code: "KP", nameEn: "North Korea", nameAr: "كوريا الشمالية", flag: "🇰🇵", dialCode: "+850" },
    { code: "NO", nameEn: "Norway", nameAr: "النرويج", flag: "🇳🇴", dialCode: "+47" },
    { code: "OM", nameEn: "Oman", nameAr: "عُمان", flag: "🇴🇲", dialCode: "+968", aliases: ["سلطنة عمان", "عمان"] },
    { code: "PK", nameEn: "Pakistan", nameAr: "باكستان", flag: "🇵🇰", dialCode: "+92" },
    { code: "PS", nameEn: "Palestine", nameAr: "فلسطين", flag: "🇵🇸", dialCode: "+970" },
    { code: "PA", nameEn: "Panama", nameAr: "بنما", flag: "🇵🇦", dialCode: "+507" },
    { code: "PG", nameEn: "Papua New Guinea", nameAr: "بابوا غينيا الجديدة", flag: "🇵🇬", dialCode: "+675" },
    { code: "PY", nameEn: "Paraguay", nameAr: "باراغواي", flag: "🇵🇾", dialCode: "+595" },
    { code: "PE", nameEn: "Peru", nameAr: "بيرو", flag: "🇵🇪", dialCode: "+51" },
    { code: "PH", nameEn: "Philippines", nameAr: "الفلبين", flag: "🇵🇭", dialCode: "+63" },
    { code: "PL", nameEn: "Poland", nameAr: "بولندا", flag: "🇵🇱", dialCode: "+48" },
    { code: "PT", nameEn: "Portugal", nameAr: "البرتغال", flag: "🇵🇹", dialCode: "+351" },
    { code: "QA", nameEn: "Qatar", nameAr: "قطر", flag: "🇶🇦", dialCode: "+974" },
    { code: "RO", nameEn: "Romania", nameAr: "رومانيا", flag: "🇷🇴", dialCode: "+40" },
    { code: "RU", nameEn: "Russia", nameAr: "روسيا", flag: "🇷🇺", dialCode: "+7" },
    { code: "RW", nameEn: "Rwanda", nameAr: "رواندا", flag: "🇷🇼", dialCode: "+250" },
    { code: "SA", nameEn: "Saudi Arabia", nameAr: "السعودية", flag: "🇸🇦", dialCode: "+966", aliases: ["المملكة العربية السعودية", "KSA"] },
    { code: "SN", nameEn: "Senegal", nameAr: "السنغال", flag: "🇸🇳", dialCode: "+221" },
    { code: "RS", nameEn: "Serbia", nameAr: "صربيا", flag: "🇷🇸", dialCode: "+381" },
    { code: "SL", nameEn: "Sierra Leone", nameAr: "سيراليون", flag: "🇸🇱", dialCode: "+232" },
    { code: "SG", nameEn: "Singapore", nameAr: "سنغافورة", flag: "🇸🇬", dialCode: "+65" },
    { code: "SK", nameEn: "Slovakia", nameAr: "سلوفاكيا", flag: "🇸🇰", dialCode: "+421" },
    { code: "SI", nameEn: "Slovenia", nameAr: "سلوفينيا", flag: "🇸🇮", dialCode: "+386" },
    { code: "SO", nameEn: "Somalia", nameAr: "الصومال", flag: "🇸🇴", dialCode: "+252" },
    { code: "ZA", nameEn: "South Africa", nameAr: "جنوب أفريقيا", flag: "🇿🇦", dialCode: "+27" },
    { code: "KR", nameEn: "South Korea", nameAr: "كوريا الجنوبية", flag: "🇰🇷", dialCode: "+82", aliases: ["Korea"] },
    { code: "SS", nameEn: "South Sudan", nameAr: "جنوب السودان", flag: "🇸🇸", dialCode: "+211" },
    { code: "ES", nameEn: "Spain", nameAr: "إسبانيا", flag: "🇪🇸", dialCode: "+34", aliases: ["España"] },
    { code: "LK", nameEn: "Sri Lanka", nameAr: "سريلانكا", flag: "🇱🇰", dialCode: "+94" },
    { code: "SD", nameEn: "Sudan", nameAr: "السودان", flag: "🇸🇩", dialCode: "+249" },
    { code: "SE", nameEn: "Sweden", nameAr: "السويد", flag: "🇸🇪", dialCode: "+46" },
    { code: "CH", nameEn: "Switzerland", nameAr: "سويسرا", flag: "🇨🇭", dialCode: "+41" },
    { code: "SY", nameEn: "Syria", nameAr: "سوريا", flag: "🇸🇾", dialCode: "+963", aliases: ["سورية"] },
    { code: "TW", nameEn: "Taiwan", nameAr: "تايوان", flag: "🇹🇼", dialCode: "+886" },
    { code: "TJ", nameEn: "Tajikistan", nameAr: "طاجيكستان", flag: "🇹🇯", dialCode: "+992" },
    { code: "TZ", nameEn: "Tanzania", nameAr: "تنزانيا", flag: "🇹🇿", dialCode: "+255" },
    { code: "TH", nameEn: "Thailand", nameAr: "تايلاند", flag: "🇹🇭", dialCode: "+66" },
    { code: "TG", nameEn: "Togo", nameAr: "توغو", flag: "🇹🇬", dialCode: "+228" },
    { code: "TN", nameEn: "Tunisia", nameAr: "تونس", flag: "🇹🇳", dialCode: "+216", aliases: ["Tunisie"] },
    { code: "TR", nameEn: "Turkey", nameAr: "تركيا", flag: "🇹🇷", dialCode: "+90", aliases: ["Türkiye", "Turkiye", "الجمهورية التركية"] },
    { code: "TM", nameEn: "Turkmenistan", nameAr: "تركمانستان", flag: "🇹🇲", dialCode: "+993" },
    { code: "UG", nameEn: "Uganda", nameAr: "أوغندا", flag: "🇺🇬", dialCode: "+256" },
    { code: "UA", nameEn: "Ukraine", nameAr: "أوكرانيا", flag: "🇺🇦", dialCode: "+380" },
    { code: "AE", nameEn: "United Arab Emirates", nameAr: "الإمارات", flag: "🇦🇪", dialCode: "+971", aliases: ["الإمارات العربية المتحدة", "UAE", "دبي", "Dubai"] },
    { code: "GB", nameEn: "United Kingdom", nameAr: "المملكة المتحدة", flag: "🇬🇧", dialCode: "+44", aliases: ["بريطانيا", "إنجلترا", "انجلترا", "UK", "Britain", "England"] },
    { code: "US", nameEn: "United States", nameAr: "أمريكا", flag: "🇺🇸", dialCode: "+1", aliases: ["الولايات المتحدة", "الولايات المتحدة الأمريكية", "USA", "America"] },
    { code: "UY", nameEn: "Uruguay", nameAr: "أوروغواي", flag: "🇺🇾", dialCode: "+598" },
    { code: "UZ", nameEn: "Uzbekistan", nameAr: "أوزبكستان", flag: "🇺🇿", dialCode: "+998" },
    { code: "VE", nameEn: "Venezuela", nameAr: "فنزويلا", flag: "🇻🇪", dialCode: "+58" },
    { code: "VN", nameEn: "Vietnam", nameAr: "فيتنام", flag: "🇻🇳", dialCode: "+84" },
    { code: "YE", nameEn: "Yemen", nameAr: "اليمن", flag: "🇾🇪", dialCode: "+967" },
    { code: "ZM", nameEn: "Zambia", nameAr: "زامبيا", flag: "🇿🇲", dialCode: "+260" },
    { code: "ZW", nameEn: "Zimbabwe", nameAr: "زيمبابوي", flag: "🇿🇼", dialCode: "+263" }
];

// ============================================================================
// Native Locale Alphabetical Sorting & Multilingual Normalization Engine
// ============================================================================
(function (global) {
    const _collatorCache = {};
    const _regionDisplayCache = {};

    function getDocLang() {
        try {
            const raw = (document && document.documentElement && document.documentElement.lang) || 'ar';
            return String(raw).toLowerCase().split(/[-_]/)[0] || 'ar';
        } catch (_e) {
            return 'ar';
        }
    }

    function normalizeDigits(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/[\u0660-\u0669]/g, ch => String(ch.charCodeAt(0) - 0x0660))
            .replace(/[\u06F0-\u06F9]/g, ch => String(ch.charCodeAt(0) - 0x06F0));
    }

    function stripArabicDiacritics(str) {
        return String(str || '')
            .replace(/[\u064B-\u065F\u0670\u0640]/g, '');
    }

    /**
     * يزيل أداة التعريف العربية «ال» عند الترتيب الهجائي (أ ب ت ث ج ...)
     * مع الحفاظ على الكلمات التي تبدأ بهمزة مثل «ألمانيا / ألبانيا»
     */
    function stripArabicDefiniteArticle(str) {
        const clean = stripArabicDiacritics(String(str || '').trim());
        return clean.replace(/^ال(?=[\u0621-\u064A]{2,})/, '');
    }

    function normalizeArabic(str) {
        return stripArabicDiacritics(normalizeDigits(String(str || '')))
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/ؤ/g, 'و')
            .replace(/ئ/g, 'ي')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function normalizeLatin(str) {
        let s = normalizeDigits(String(str || ''));
        try {
            s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        } catch (_e) {}
        return s.replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function normalizeForSearch(str, lang) {
        const l = String(lang || '').toLowerCase();
        if (l === 'ar' || /[\u0600-\u06FF]/.test(String(str || ''))) {
            return normalizeArabic(str);
        }
        return normalizeLatin(str);
    }

    function detectQueryLang(query, fallbackLang) {
        const q = String(query || '').trim();
        if (!q) return fallbackLang || getDocLang();
        if (/[\u0600-\u06FF]/.test(q)) return 'ar';
        if (/[A-Za-z\u00C0-\u024F]/.test(q)) return 'en';
        return fallbackLang || getDocLang();
    }

    function getCollator(lang) {
        const l = String(lang || getDocLang() || 'ar').toLowerCase();
        if (!_collatorCache[l]) {
            try {
                _collatorCache[l] = new Intl.Collator(l, { sensitivity: 'base', numeric: true });
            } catch (_e) {
                _collatorCache[l] = { compare: (a, b) => String(a).localeCompare(String(b)) };
            }
        }
        return _collatorCache[l];
    }

    // خريطة الترتيب الهجائي العربي القياسي الصارم (أ ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي)
    const AR_ALPHA_ORDER = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
    const AR_CHAR_RANK = {};
    for (let i = 0; i < AR_ALPHA_ORDER.length; i++) {
        AR_CHAR_RANK[AR_ALPHA_ORDER[i]] = i + 1;
    }

    function arabicSortKey(raw) {
        const stripped = stripArabicDefiniteArticle(raw);
        return normalizeArabic(stripped);
    }

    function compareArabicStrict(aRaw, bRaw) {
        const a = arabicSortKey(aRaw);
        const b = arabicSortKey(bRaw);
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const ca = a[i];
            const cb = b[i];
            if (ca === cb) continue;
            const ra = AR_CHAR_RANK[ca];
            const rb = AR_CHAR_RANK[cb];
            if (ra !== undefined && rb !== undefined) return ra - rb;
            if (ra !== undefined) return -1;
            if (rb !== undefined) return 1;
            return ca < cb ? -1 : 1;
        }
        if (a.length !== b.length) return a.length - b.length;
        return getCollator('ar').compare(String(aRaw || ''), String(bRaw || ''));
    }

    function compareStrings(a, b, lang) {
        const l = String(lang || getDocLang() || 'ar').toLowerCase().split(/[-_]/)[0];
        const sa = String(a || '').trim();
        const sb = String(b || '').trim();
        if (l === 'ar') {
            return compareArabicStrict(sa, sb);
        }
        return getCollator(l).compare(sa, sb);
    }

    function getLetterGroup(str, lang) {
        const l = String(lang || getDocLang() || 'ar').toLowerCase().split(/[-_]/)[0];
        const s = String(str || '').trim();
        if (!s) return '#';
        if (l === 'ar') {
            const key = arabicSortKey(s);
            const first = key[0] || '';
            if (first === 'ا') return 'أ';
            if (AR_CHAR_RANK[first] !== undefined) return first;
            return '#';
        }
        const clean = normalizeLatin(s).toUpperCase();
        const ch = clean[0] || '#';
        return /[A-Z]/.test(ch) ? ch : (s[0] ? s[0].toUpperCase() : '#');
    }

    function getLocalizedCountryName(countryObj, lang) {
        if (!countryObj) return '';
        const l = String(lang || getDocLang() || 'ar').toLowerCase().split(/[-_]/)[0];
        if (l === 'ar') return countryObj.nameAr || countryObj.name_ar || countryObj.nameEn || countryObj.code || '';
        if (l === 'en') return countryObj.nameEn || countryObj.name_en || countryObj.nameAr || countryObj.code || '';
        const code = String(countryObj.code || countryObj.country_code || '').toUpperCase();
        if (code && typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
            try {
                if (!_regionDisplayCache[l]) {
                    _regionDisplayCache[l] = new Intl.DisplayNames([l], { type: 'region' });
                }
                const localized = _regionDisplayCache[l].of(code);
                if (localized && localized !== code) return localized;
            } catch (_e) {}
        }
        return countryObj.nameEn || countryObj.name_en || countryObj.nameAr || code;
    }

    function sortItems(items, textFn, lang) {
        const l = String(lang || getDocLang() || 'ar').toLowerCase().split(/[-_]/)[0];
        const getter = typeof textFn === 'function' ? textFn : (x => String(x || ''));
        return (Array.isArray(items) ? items.slice() : []).sort((a, b) => compareStrings(getter(a), getter(b), l));
    }

    const TZ_TO_COUNTRY = {
        'Africa/Cairo': 'EG',
        'Asia/Riyadh': 'SA',
        'Europe/Istanbul': 'TR',
        'Asia/Istanbul': 'TR',
        'Asia/Dubai': 'AE',
        'Asia/Kuwait': 'KW',
        'Asia/Qatar': 'QA',
        'Asia/Bahrain': 'BH',
        'Asia/Muscat': 'OM',
        'Asia/Amman': 'JO',
        'Asia/Beirut': 'LB',
        'Asia/Gaza': 'PS',
        'Asia/Hebron': 'PS',
        'Asia/Baghdad': 'IQ',
        'Asia/Damascus': 'SY',
        'Asia/Aden': 'YE',
        'Africa/Khartoum': 'SD',
        'Africa/Tripoli': 'LY',
        'Africa/Tunis': 'TN',
        'Africa/Algiers': 'DZ',
        'Africa/Casablanca': 'MA',
        'Africa/Nouakchott': 'MR',
        'Africa/Mogadishu': 'SO',
        'Africa/Djibouti': 'DJ',
        'Europe/London': 'GB',
        'Europe/Berlin': 'DE',
        'Europe/Paris': 'FR',
        'Europe/Rome': 'IT',
        'Europe/Madrid': 'ES',
        'Europe/Amsterdam': 'NL',
        'Europe/Brussels': 'BE',
        'Europe/Zurich': 'CH',
        'Europe/Vienna': 'AT',
        'Europe/Stockholm': 'SE',
        'Europe/Oslo': 'NO',
        'Europe/Copenhagen': 'DK',
        'Europe/Warsaw': 'PL',
        'Europe/Lisbon': 'PT',
        'Europe/Athens': 'GR',
        'Europe/Moscow': 'RU',
        'Europe/Kiev': 'UA',
        'Europe/Kyiv': 'UA',
        'Europe/Bucharest': 'RO',
        'Europe/Budapest': 'HU',
        'Europe/Prague': 'CZ',
        'Europe/Dublin': 'IE',
        'America/New_York': 'US',
        'America/Chicago': 'US',
        'America/Denver': 'US',
        'America/Los_Angeles': 'US',
        'America/Phoenix': 'US',
        'America/Detroit': 'US',
        'America/Toronto': 'CA',
        'America/Vancouver': 'CA',
        'America/Montreal': 'CA',
        'America/Sao_Paulo': 'BR',
        'America/Mexico_City': 'MX',
        'America/Argentina/Buenos_Aires': 'AR',
        'America/Bogota': 'CO',
        'Asia/Kolkata': 'IN',
        'Asia/Calcutta': 'IN',
        'Asia/Karachi': 'PK',
        'Asia/Dhaka': 'BD',
        'Asia/Jakarta': 'ID',
        'Asia/Kuala_Lumpur': 'MY',
        'Asia/Singapore': 'SG',
        'Asia/Shanghai': 'CN',
        'Asia/Tokyo': 'JP',
        'Asia/Seoul': 'KR',
        'Asia/Manila': 'PH',
        'Asia/Bangkok': 'TH',
        'Asia/Ho_Chi_Minh': 'VN',
        'Asia/Hong_Kong': 'HK',
        'Asia/Taipei': 'TW',
        'Asia/Baku': 'AZ',
        'Asia/Tbilisi': 'GE',
        'Asia/Almaty': 'KZ',
        'Asia/Tashkent': 'UZ',
        'Australia/Sydney': 'AU',
        'Australia/Melbourne': 'AU',
        'Pacific/Auckland': 'NZ',
        'Africa/Johannesburg': 'ZA',
        'Africa/Lagos': 'NG',
        'Africa/Nairobi': 'KE',
        'Africa/Addis_Ababa': 'ET',
        'Africa/Accra': 'GH'
    };

    function detectCountryFromTimezone() {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz && TZ_TO_COUNTRY[tz]) return TZ_TO_COUNTRY[tz];
        } catch (_e) {}
        return null;
    }

    global.SAWYAN.LocaleSort = {
        getDocLang,
        normalizeDigits,
        stripArabicDiacritics,
        stripArabicDefiniteArticle,
        normalizeArabic,
        normalizeLatin,
        normalizeForSearch,
        detectQueryLang,
        compareStrings,
        compareArabicStrict,
        getLetterGroup,
        getLocalizedCountryName,
        sortItems,
        detectCountryFromTimezone
    };
})(window);

// دالة للحصول على قائمة الدول مرتبة أبجدياً حسب اللغة المطلوبة (افتراضياً لغة الصفحة: أ ب ت ث ج للعربية، A B C D للإنجليزية)
window.SAWYAN.getCountriesSorted = function (lang) {
    const ls = window.SAWYAN.LocaleSort;
    const targetLang = lang || (ls ? ls.getDocLang() : 'ar');
    if (!ls) return [...window.SAWYAN.Countries];
    return ls.sortItems(
        window.SAWYAN.Countries,
        c => ls.getLocalizedCountryName(c, targetLang),
        targetLang
    );
};

// دالة للحصول على قائمة الدول مرتبة أبجدياً بالإنجليزية
window.SAWYAN.getCountriesSortedByEnglish = function () {
    return window.SAWYAN.getCountriesSorted('en');
};

// دالة للحصول على قائمة الدول مرتبة أبجدياً بالعربية (أ ب ت ث ج ...)
window.SAWYAN.getCountriesSortedByArabic = function () {
    return window.SAWYAN.getCountriesSorted('ar');
};

// دالة للحصول على دولة بواسطة الكود
window.SAWYAN.getCountryByCode = function (code) {
    const cc = String(code || '').trim().toUpperCase();
    return window.SAWYAN.Countries.find(c => c.code === cc);
};

// دالة للحصول على دولة بواسطة مفتاح الهاتف (للكشف التلقائي عند لصق رقم دولي)
window.SAWYAN.findCountriesByDialDigits = function (digits) {
    const clean = String(digits || '').replace(/\D+/g, '');
    if (!clean) return [];
    const matches = [];
    for (let len = 4; len >= 1; len--) {
        const prefix = clean.slice(0, len);
        const found = window.SAWYAN.Countries.filter(c => c.dialCode.replace(/\D+/g, '') === prefix);
        if (found.length) {
            return found;
        }
    }
    return matches;
};

// دالة للحصول على مفتاح الهاتف بواسطة كود الدولة
window.SAWYAN.getDialCodeByCountry = function (code) {
    const country = window.SAWYAN.Countries.find(c => c.code === String(code || '').toUpperCase());
    return country ? country.dialCode : '';
};

// قواعد الأرقام القياسية الدولية (ITU-T E.164) لعدد الأرقام بعد كود الدولة ولكل دول العالم
window.SAWYAN.PhoneRules = {
    EG: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: ['1'], example: '1012345678' },
    SA: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: ['5'], example: '501234567' },
    TR: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: ['5'], example: '5321234567' },
    AE: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: ['5'], example: '501234567' },
    KW: { minNsn: 8, maxNsn: 8, stripZero: true, mobileStart: null, example: '51234567' },
    QA: { minNsn: 8, maxNsn: 8, stripZero: true, mobileStart: null, example: '33123456' },
    BH: { minNsn: 8, maxNsn: 8, stripZero: true, mobileStart: null, example: '36123456' },
    OM: { minNsn: 8, maxNsn: 8, stripZero: true, mobileStart: null, example: '91234567' },
    JO: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '791234567' },
    LB: { minNsn: 7, maxNsn: 8, stripZero: true, mobileStart: null, example: '71123456' },
    PS: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '599123456' },
    IQ: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '7701234567' },
    SY: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '931234567' },
    YE: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '771234567' },
    SD: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '912345678' },
    LY: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '912345678' },
    TN: { minNsn: 8, maxNsn: 8, stripZero: true, mobileStart: null, example: '20123456' },
    DZ: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '551234567' },
    MA: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '612345678' },
    MR: { minNsn: 8, maxNsn: 8, stripZero: true, mobileStart: null, example: '22123456' },
    SO: { minNsn: 7, maxNsn: 9, stripZero: true, mobileStart: null, example: '615123456' },
    DJ: { minNsn: 8, maxNsn: 8, stripZero: true, mobileStart: null, example: '77123456' },
    KM: { minNsn: 7, maxNsn: 7, stripZero: true, mobileStart: null, example: '3212345' },
    US: { minNsn: 10, maxNsn: 10, stripZero: false, mobileStart: null, example: '4155550199' },
    CA: { minNsn: 10, maxNsn: 10, stripZero: false, mobileStart: null, example: '4165550199' },
    DO: { minNsn: 10, maxNsn: 10, stripZero: false, mobileStart: null, example: '8095550199' },
    JM: { minNsn: 10, maxNsn: 10, stripZero: false, mobileStart: null, example: '8765550199' },
    GB: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '7700900123' },
    DE: { minNsn: 10, maxNsn: 11, stripZero: true, mobileStart: null, example: '15123456789' },
    FR: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '612345678' },
    IT: { minNsn: 9, maxNsn: 10, stripZero: false, mobileStart: null, example: '3123456789' },
    ES: { minNsn: 9, maxNsn: 9, stripZero: false, mobileStart: null, example: '612345678' },
    NL: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '612345678' },
    BE: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '470123456' },
    CH: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '791234567' },
    AT: { minNsn: 7, maxNsn: 10, stripZero: true, mobileStart: null, example: '6641234567' },
    SE: { minNsn: 7, maxNsn: 10, stripZero: true, mobileStart: null, example: '701234567' },
    NO: { minNsn: 8, maxNsn: 8, stripZero: false, mobileStart: null, example: '41234567' },
    DK: { minNsn: 8, maxNsn: 8, stripZero: false, mobileStart: null, example: '20123456' },
    PL: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '512345678' },
    PT: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '912345678' },
    GR: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '6912345678' },
    RU: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '9161234567' },
    KZ: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '7011234567' },
    UA: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '501234567' },
    RO: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '712345678' },
    IN: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '9812345678' },
    PK: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '3001234567' },
    BD: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '1712345678' },
    ID: { minNsn: 10, maxNsn: 11, stripZero: true, mobileStart: null, example: '81234567890' },
    MY: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '1234567890' },
    SG: { minNsn: 8, maxNsn: 8, stripZero: false, mobileStart: null, example: '81234567' },
    CN: { minNsn: 10, maxNsn: 11, stripZero: true, mobileStart: null, example: '13812345678' },
    JP: { minNsn: 10, maxNsn: 11, stripZero: true, mobileStart: null, example: '9012345678' },
    KR: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '1012345678' },
    AU: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '412345678' },
    NZ: { minNsn: 8, maxNsn: 10, stripZero: true, mobileStart: null, example: '211234567' },
    BR: { minNsn: 10, maxNsn: 11, stripZero: true, mobileStart: null, example: '11987654321' },
    MX: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '5512345678' },
    AR: { minNsn: 10, maxNsn: 11, stripZero: true, mobileStart: null, example: '1112345678' },
    CO: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '3001234567' },
    PH: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '9171234567' },
    ZA: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '821234567' },
    NG: { minNsn: 10, maxNsn: 10, stripZero: true, mobileStart: null, example: '8021234567' },
    KE: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '712345678' },
    ET: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '911234567' },
    GH: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '241234567' },
    AZ: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '501234567' },
    GE: { minNsn: 9, maxNsn: 9, stripZero: true, mobileStart: null, example: '555123456' },
    HK: { minNsn: 8, maxNsn: 8, stripZero: true, mobileStart: null, example: '51234567' }
};

window.SAWYAN.getPhoneRule = function (countryCode) {
    const cc = String(countryCode || 'EG').trim().toUpperCase();
    const c = window.SAWYAN.getCountryByCode(cc);
    const dial = c ? c.dialCode : '+20';
    const base = window.SAWYAN.PhoneRules[cc] || {
        minNsn: 7,
        maxNsn: 15,
        stripZero: true,
        mobileStart: null,
        example: '12345678'
    };
    return {
        countryCode: cc,
        dialCode: dial,
        dialDigits: dial.replace(/\D+/g, ''),
        flag: c ? c.flag : '🌍',
        nameAr: c ? c.nameAr : cc,
        nameEn: c ? c.nameEn : cc,
        minNsn: base.minNsn,
        maxNsn: base.maxNsn,
        stripZero: base.stripZero !== false,
        mobileStart: Array.isArray(base.mobileStart) ? base.mobileStart : null,
        example: base.example || '12345678'
    };
};
