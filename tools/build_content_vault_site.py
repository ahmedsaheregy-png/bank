import json
import os

vault = {
    "system": "SAWYAN Strategic Marketing & Content Vault",
    "title": "بنك محتوى SAWYAN",
    "version": "3.0.0",
    "last_updated": "2026-11-22",
    "domain": "sawyan.net",
    "guardrails": {
        "forbidden_terms": ["كاشباك", "كاش باك", "SAWYAN BANK", "التسويق الشبكي", "-19.75$", "Rolling Reserve"],
        "canonical_terms": ["عائدات الاستهلاك الاستثماري", "صندوق الهدف الشهري", "SAWYAN", "الاستهلاك الاستثماري (Buy and Make Money)", "كلنا SAWYAN"]
    },
    "scripts_with_storyboards": [
        {
            "id": "SCRIPT-OPT-1",
            "badge": "🏆 الخيار 1: السكربت المعتمد رسمياً للواجهة الرئيسية (45 ثانية)",
            "title": "فيديو الواجهة الرئيسي المعتمد: الصدمة الإيجابية وتحويل الدفع إلى استثمار",
            "full_text": "«أَكْثَرُ مَا نَفْعَلُهُ كُلَّ يَوْمٍ.. هُوَ أَكْثَرُ مَا نَكْرَهُهُ.. الدَّفْعُ!»\n«مِنَ اليَوْمِ.. تَغَيَّرَ الوَضْعُ! أَهْلاً بِكَ فِي SAWYAN مَنَصَّةِ الِاسْتِهْلَاكِ الِاسْتِثْمَارِيِّ العَالَمِيَّةِ.»\n«تَسَوَّقْ بِنَفْسِ أَسْعَارِكَ الطَّبِيعِيَّةِ مِنَ السُّوبَر مَارْكِت، وَالصَّيْدَلِيَّةِ، وَالمَطْعَمِ.. وَلَكِنْ هَذِهِ المَرَّةَ: مَدْفُوعَاتُكَ لَنْ تَضِيعَ، بَلْ سَتَتَحَوَّلُ إِلَى عَائِدَاتٍ حَقِيقِيَّةٍ تَنْمُو كُلَّ شَهْرٍ.»\n«فَقَطْ غَيِّرْ مَتْجَرَكَ، وَتَسَوَّقْ مَعَ المَتَاجِرِ الَّتِي تَعَاقَدْنَا مَعَهَا لِنَتَشَارَكَكَ الأَرْبَاحَ.. فَقَطْ أَخْبِرِ المَتْجَرَ الشَّرِيكَ أَنَّكَ عُضْوٌ بِـ SAWYAN، وَشَارِكِ الفِكْرَةَ مَعَ مَعَارِفِكَ لِيَتَضَاعَفَ دَخْلُكَ وَدَخْلُهُمْ!»\n«وَلِلتُّجَّارِ: لَا مُجَازَفَةَ بِإِعْلَانَاتٍ مَجْهُولَةِ العَائِدِ بَعْدَ الآنَ.. آلَافُ العُمَلَاءِ فِي انْتِظَارِكَ، وَادْفَعْ فَقَطْ مُقَابِلَ النَّتَائِجِ.. لَا الوُعُودِ!»\n«صِفْرُ مُخَاطَرَةٍ.. صِفْرُ رَأْسِ مَالٍ.. صِفْرُ مُؤَهِّلَاتٍ!»\n«الحُرِّيَّةُ المَالِيَّةُ لَيْسَتْ وَهْماً.. بَلْ حَقِيقَةٌ يَفْصِلُكَ عَنْهَا خَطْوَةٌ وَاحِدَةٌ.. SAWYAN.»",
            "usage_notes": "السيناريو الرسمي المعتمد للواجهة الرئيسية لموقع sawyan.net مع التشكيل الصوتي الكامل وجدول المشاهد ثانية بثانية.",
            "scenes": [
                {
                    "timing": "00:00 - 00:05",
                    "visuals": "لقطة سينمائية قريبة جداً (Extreme Macro) لعربة تسوق تُدفع بسرعة، ثم ماكينة كاشير تطبع فاتورة طويلة جداً.",
                    "voiceover": "«أَكْثَرُ مَا نَفْعَلُهُ كُلَّ يَوْمٍ.. هُوَ أَكْثَرُ مَا نَكْرَهُهُ.. الدَّفْعُ!»",
                    "sfx_music": "صوت حركة عجلات العربة + صوت رنين ماكينة الكاشير الحاد Beep يتكرر بتسارع.",
                    "typography": "كم أنفقت طوال حياتك؟ (خط عربي عريض باللون الكحلي والزمردي)"
                },
                {
                    "timing": "00:05 - 00:12",
                    "visuals": "انتقال سريع (Whip Pan): يد تسحب الفاتورة، تظهر بطاقة/شاشة عليها شعار SAWYAN، يوجه الكاميرا لكود الفاتورة مع وميض أخضر.",
                    "voiceover": "«مِنَ اليَوْمِ.. تَغَيَّرَ الوَضْعُ! أَهْلاً بِكَ فِي SAWYAN: مَنَصَّةِ الِاسْتِهْلَاكِ الِاسْتِثْمَارِيِّ العَالَمِيَّةِ.»",
                    "sfx_music": "يتلاشى الإيقاع السريع إلى دقة صوتية واثقة عميقة ترج المكان (Cinematic Bass Drop).",
                    "typography": "منصة الاستهلاك الاستثماري العالمية (شعار SAWYAN الرسمي)"
                },
                {
                    "timing": "00:12 - 00:22",
                    "visuals": "مشهد واسع متتابع (Montage): عائلة تتسوق في سوبر ماركت راقٍ، شخص يشتري دواء من صيدلية، أصدقاء في مطعم معتمد، يدفعون بسعرهم الطبيعي ويبتسمون.",
                    "voiceover": "«تَسَوَّقْ بِنَفْسِ أَسْعَارِكَ الطَّبِيعِيَّةِ مِنَ السُّوبَر مَارْكِت، وَالصَّيْدَلِيَّةِ، وَالمَطْعَمِ.. وَلَكِنْ هَذِهِ المَرَّةَ: مَدْفُوعَاتُكَ لَنْ تَضِيعَ، بَلْ سَتَتَحَوَّلُ إِلَى عَائِدَاتٍ حَقِيقِيَّةٍ تَنْمُو كُلَّ شَهْرٍ.»",
                    "sfx_music": "إيقاع موسيقي تصاعدي حيوي مفعم بالتفاؤل (Upbeat Corporate Strings).",
                    "typography": "نفس مشترياتك • نفس أسعارك • عائدات حقيقية"
                },
                {
                    "timing": "00:22 - 00:32",
                    "visuals": "شاشة منقسمة (Split Screen): في اليمين رسم بياني مضيء يرتفع بسلاسة، وفي اليسار خريطة تفاعلية تضيء فيها شبكة معارف وأسر مترابطة.",
                    "voiceover": "«فَقَطْ غَيِّرْ مَتْجَرَكَ، وَتَسَوَّقْ مَعَ المَتَاجِرِ الَّتِي تَعَاقَدْنَا مَعَهَا لِنَتَشَارَكَكَ الأَرْبَاحَ.. فَقَطْ أَخْبِرِ المَتْجَرَ الشَّرِيكَ أَنَّكَ عُضْوٌ بِـ SAWYAN، وَشَارِكِ الفِكْرَةَ مَعَ مَعَارِفِكَ لِيَتَضَاعَفَ دَخْلُكَ وَدَخْلُهُمْ!»",
                    "sfx_music": "صوت رنين عملات ناعمة (Soft Chime) مع تصاعد تدريجي للوتيرة الحماسية.",
                    "typography": "غيّر متجرك • وثّق فاتورتك • ضاعف دخلك ودخلهم"
                },
                {
                    "timing": "00:32 - 00:40",
                    "visuals": "مشهد تاجر مبتسم في متجره، طابور زبائن يحملون هواتفهم موثقين فواتيرهم، شارة معتمدة «شريك رسمي SAWYAN» مضيئة على واجهة المحل.",
                    "voiceover": "«وَلِلتُّجَّارِ: لَا مُجَازَفَةَ بِإِعْلَانَاتٍ مَجْهُولَةِ العَائِدِ بَعْدَ الآنَ.. آلَافُ العُمَلَاءِ فِي انْتِظَارِكَ، وَادْفَعْ فَقَطْ مُقَابِلَ النَّتَائِجِ.. لَا الوُعُودِ! صِفْرُ مُخَاطَرَةٍ.. صِفْرُ رَأْسِ مَالٍ.. صِفْرُ مُؤَهِّلَاتٍ!»",
                    "sfx_music": "وتيرة حماسية قوية تشير للنمو والنجاح التجاري المستمر.",
                    "typography": "للتجار: ادفع مقابل النتائج فقط • صفر مخاطرة • صفر رأس مال"
                },
                {
                    "timing": "00:40 - 00:45",
                    "visuals": "لقطة سينمائية ختامية: شعار SAWYAN بارز وأنيق، يليه الرابط www.sawyan.net وزر انضم الآن مجاناً.",
                    "voiceover": "«الحُرِّيَّةُ المَالِيَّةُ لَيْسَتْ وَهْماً.. بَلْ حَقِيقَةٌ يَفْصِلُكَ عَنْهَا خَطْوَةٌ وَاحِدَةٌ.. SAWYAN.»",
                    "sfx_music": "نغمة ختامية هادئة وفاخرة مع صوت ضغطة تأكيد التسجيل (Success Chime).",
                    "typography": "SAWYAN • خطوتك نحو الحرية المالية • sawyan.net"
                }
            ]
        },
        {
            "id": "SCRIPT-OPT-2",
            "badge": "🎬 الخيار 2: سيناريو موشن جرافيك 3D فاخر (45 ثانية)",
            "title": "رحلة الـ 3 خطوات والمكعب البلوري (Buy and Make Money)",
            "full_text": "«طَوَالَ عُقُودٍ.. كَانَ المُسْتَهْلِكُ هُوَ الحَلْقَةَ الأَضْعَفَ: تَدْفَعُ المَالَ، تَسْتَهْلِكُ السِّلْعَةَ، وَتَعُودُ لِنُقْطَةِ الصِّفْرِ!»\n«نِظَامُ SAWYAN جَاءَ لِيُعِيدَ كِتَابَةَ القَوَاعِدِ: الِاسْتِهْلَاكُ الِاسْتِثْمَارِيُّ (Buy and Make Money).. مَشْتَرَيَاتُكَ المُعْتَادَةُ أَصْبَحَتْ أَصْلَكَ الِاسْتِثْمَارِيَّ الأَوَّلَ.»\n«فِي ثَلَاثِ خُطُوَاتٍ مَجَّانِيَّةٍ فَقَطْ:\n١. غَيِّرْ وِجْهَتَكَ لِلْمَتَاجِرِ الشَّرِيكَةِ المُعْتَمَدَةِ.\n٢. وَثِّقْ فَاتُورَتَكَ بِكُودِ هُوِيَّتِكَ فِي ثَوَانٍ.\n٣. ابْنِ مُجْتَمَعَكَ وَاشْهَدْ نُمُوَّ عَائِدَاتِكَ شَهْراً بَعْدَ شَهْرٍ.»\n«نِظَامٌ عَادِلٌ، حَلَالٌ مِائَةً بِالمِائَةِ، بِدُونِ بَضَائِعَ مُخَزَّنَةٍ وَلَا وُعُودٍ سَرَابِيَّةٍ.. رِبْحٌ حَقِيقِيٌّ قَائِمٌ عَلَى فَوَاتِيرَ حَقِيقِيَّةٍ. انْضَمَّ إِلَيْنَا اليَوْمَ عَلَى sawyan.net.»",
            "usage_notes": "موشن جرافيك ثلاثي الأبعاد يركز على البساطة والخطوات الثلاث وآلية العمل.",
            "scenes": [
                {
                    "timing": "00:00 - 00:07",
                    "visuals": "مجسم ثلاثي الأبعاد لمحفظة تفرغ منها النقود وتتحول إلى فواتير ورقية تتطاير وتختفي في الهواء.",
                    "voiceover": "«طَوَالَ عُقُودٍ.. كَانَ المُسْتَهْلِكُ هُوَ الحَلْقَةَ الأَضْعَفَ: تَدْفَعُ المَالَ، تَسْتَهْلِكُ السِّلْعَةَ، وَتَعُودُ لِنُقْطَةِ الصِّفْرِ!»",
                    "sfx_music": "صوت رياح خفيفة مع دقات ساعة متسارعة توحي بهدر المال.",
                    "typography": "استهلاك بلا عائد = نقطة الصفر"
                },
                {
                    "timing": "00:07 - 00:15",
                    "visuals": "يتحول المشهد إلى مكعب بلوري مضيء يحمل شعار SAWYAN يعيد تجميع الفواتير ويحولها إلى مسارات ذهبية وخضراء.",
                    "voiceover": "«نِظَامُ SAWYAN جَاءَ لِيُعِيدَ كِتَابَةَ القَوَاعِدِ: الِاسْتِهْلَاكُ الِاسْتِثْمَارِيُّ (Buy and Make Money).. مَشْتَرَيَاتُكَ المُعْتَادَةُ أَصْبَحَتْ أَصْلَكَ الِاسْتِثْمَارِيَّ الأَوَّلَ.»",
                    "sfx_music": "نغمة تحول تقني حديثة (Futuristic Whoosh & Chord).",
                    "typography": "SAWYAN • Buy and Make Money"
                },
                {
                    "timing": "00:15 - 00:23",
                    "visuals": "تظهر أيقونة الخطوة (1) ثلاثية الأبعاد: خريطة مدينة تضيء فيها دبابيس المتاجر والمطاعم والصيدليات الشريكة.",
                    "voiceover": "«فِي ثَلَاثِ خُطُوَاتٍ مَجَّانِيَّةٍ فَقَطْ: أَوَّلاً: غَيِّرْ وِجْهَتَكَ لِلْمَتَاجِرِ الشَّرِيكَةِ المُعْتَمَدَةِ.»",
                    "sfx_music": "موسيقى إيقاعية حديثة مع صوت نبضات ضوئية على الخريطة.",
                    "typography": "1. غيّر وجهتك (استهلك بذكاء)"
                },
                {
                    "timing": "00:23 - 00:31",
                    "visuals": "تظهر أيقونة الخطوة (2): هاتف ذكي يمسح كود هوية العضو في ثانية واحدة، وتظهر علامة صح خضراء فورية.",
                    "voiceover": "«ثَانِياً: وَثِّقْ فَاتُورَتَكَ بِكُودِ هُوِيَّتِكَ فِي ثَوَانٍ. ثَالِثاً: ابْنِ مُجْتَمَعَكَ وَاشْهَدْ نُمُوَّ عَائِدَاتِكَ شَهْراً بَعْدَ شَهْرٍ.»",
                    "sfx_music": "صوت مسح ضوئي (Digital Scan) يليه تصاعد موسيقي ملهم.",
                    "typography": "2. وثّق فاتورتك • 3. ابنِ مجتمعك وضاعف دخلك"
                },
                {
                    "timing": "00:31 - 00:39",
                    "visuals": "ميزان عدالة ذهبي ثلاثي الأبعاد محاط بشارة (حلال 100%) وفواتير حقيقية موثقة.",
                    "voiceover": "«نِظَامٌ عَادِلٌ، حَلَالٌ مِائَةً بِالمِائَةِ، بِدُونِ بَضَائِعَ مُخَزَّنَةٍ وَلَا وُعُودٍ سَرَابِيَّةٍ.. رِبْحٌ حَقِيقِيٌّ قَائِمٌ عَلَى فَوَاتِيرَ حَقِيقِيَّةٍ.»",
                    "sfx_music": "موسيقى أوركسترالية واثقة تعزز المصداقية والأمان.",
                    "typography": "حلال 100% • فواتير حقيقية • صفر مخاطرة"
                },
                {
                    "timing": "00:39 - 00:45",
                    "visuals": "شاشة ختامية ناصعة البياض يظهر فيها شعار SAWYAN الرسمي مع عنوان الموقع sawyan.net.",
                    "voiceover": "«انْضَمَّ إِلَيْنَا اليَوْمَ مَجَّاناً عَلَى sawyan.net.»",
                    "sfx_music": "نغمة إغلاق رسمية أنيقة.",
                    "typography": "انضم مجاناً الآن • www.sawyan.net"
                }
            ]
        },
        {
            "id": "SCRIPT-OPT-3",
            "badge": "🎥 الخيار 3: سيناريو الدراما الوثائقية الملهمة (60 ثانية)",
            "title": "حكاية أسرة وتاجر: كلنا SAWYAN",
            "full_text": "«كُلَّ صَبَاحٍ.. نَخْرُجُ لِنَعْمَلَ، لِنُلَبِّيَ احْتِيَاجَاتِ مَنْ نُحِبُّ.. نَشْتَرِي، نَسْتَهْلِكُ، وَنَبْذُلُ مَا نَمْلِكُ لِتَأْمِينِ مُسْتَقْبَلِ عَائِلَاتِنَا.»\n«لَكِنْ مَاذَا لَوْ كَانَتْ كُلُّ فَاتُورَةٍ تَدْفَعُهَا لَمْ تَعُدِ اسْتِنْزَافاً لِرَاتِبِكَ.. بَلْ خَطْوَةً جَدِيدَةً نَحْوَ حُرِّيَّتِكَ المَالِيَّةِ وَاسْتِقْرَارِكَ؟»\n«هُنَا وُلِدَتْ فِكْرَةُ SAWYAN.. أَنْ نَكُونَ مَعاً! أَنْتَ لَسْتَ زَبُوناً عَادِيّاً، بَلْ شَرِيكٌ فِي الأَرْبَاحِ.. تَسَوَّقْ بِالسِّعْرِ الطَّبِيعِيِّ، وَدُلَّ مَنْ تُحِبُّ عَلَى نَفْسِ الطَّرِيقِ.»\n«وَلِأَنَّ التِّجَارَةَ شَرَاكَةٌ وَأَمَانٌ: تُجَّارُنَا لَا يَدْفَعُونَ مِيزَانِيَّاتِ تَسْوِيقٍ ضَائِعَةً، بَلْ يَسْتَقْبِلُونَ مُجْتَمَعاً مِنْ آلَافِ الأُسَرِ المُوَجَّهَةِ لِمَتْجَرِهِمْ بِوَلَاءٍ دَائِمٍ.»\n«سَوَاءٌ كُنْتَ مُتَسَوِّقاً، أَوْ تَاجِراً، أَوْ تَبْحَثُ عَنْ دَخْلٍ يَحْمِي غَدَكَ.. مَكَانُكَ بَيْنَنَا. كُلُّنَا SAWYAN — مَنَصَّةُ الِاسْتِهْلَاكِ الِاسْتِثْمَارِيِّ العَالَمِيَّةُ.»",
            "usage_notes": "فيديو وثائقي دافئ للمؤتمرات، العروض التقديمية الكبرى، وبناء الولاء المجتمعي.",
            "scenes": [
                {
                    "timing": "00:00 - 00:10",
                    "visuals": "لقطات سينمائية دافئة مع شروق الشمس: أب يخرج لعمله، أم تشتري مستلزمات الأسرة، تاجر يفتح أبواب متجره في الصباح.",
                    "voiceover": "«كُلَّ صَبَاحٍ.. نَخْرُجُ لِنَعْمَلَ، لِنُلَبِّيَ احْتِيَاجَاتِ مَنْ نُحِبُّ.. نَشْتَرِي، نَسْتَهْلِكُ، وَنَبْذُلُ مَا نَمْلِكُ لِتَأْمِينِ مُسْتَقْبَلِ عَائِلَاتِنَا.»",
                    "sfx_music": "عزف بيانو هادئ ودافئ يلامس المشاعر مع أصوات صباحية طبيعية.",
                    "typography": "كل يوم.. نسعى من أجل من نحب"
                },
                {
                    "timing": "00:10 - 00:20",
                    "visuals": "الأب ينظر إلى فواتير المشتريات الشهرية، ثم يبتسم وهو يفتح تطبيق SAWYAN ليرى نمو صندوق الهدف الشهري وعائداته.",
                    "voiceover": "«لَكِنْ مَاذَا لَوْ كَانَتْ كُلُّ فَاتُورَةٍ تَدْفَعُهَا لَمْ تَعُدِ اسْتِنْزَافاً لِرَاتِبِكَ.. بَلْ خَطْوَةً جَدِيدَةً نَحْوَ حُرِّيَّتِكَ المَالِيَّةِ وَاسْتِقْرَارِكَ؟»",
                    "sfx_music": "تدخل الآلات الوترية تدريجياً لتعطي شعوراً بالأمل والانفراج.",
                    "typography": "من استنزاف الراتب.. إلى صناعة المستقبل"
                },
                {
                    "timing": "00:20 - 00:32",
                    "visuals": "مشهد يجمع الأب مع أصدقائه وأقاربه في جلسة ودية يشاركهم فكرة المنصة عبر هاتفه وسط تفاعل وسعادة.",
                    "voiceover": "«هُنَا وُلِدَتْ فِكْرَةُ SAWYAN.. أَنْ نَكُونَ مَعاً! أَنْتَ لَسْتَ زَبُوناً عَادِيّاً، بَلْ شَرِيكٌ فِي الأَرْبَاحِ.. تَسَوَّقْ بِالسِّعْرِ الطَّبِيعِيِّ، وَدُلَّ مَنْ تُحِبُّ عَلَى نَفْسِ الطَّرِيقِ.»",
                    "sfx_music": "موسيقى ملهمة متصاعدة تعكس روح التعاون والنجاح المشترك.",
                    "typography": "لست مجرد مستهلك.. أنت شريك في النجاح"
                },
                {
                    "timing": "00:32 - 00:45",
                    "visuals": "صاحب المتجر يستقبل عائلات أعضاء SAWYAN بابتسامة، ويوثق فواتيرهم وسط حركة بيع نشطة ومستمرة.",
                    "voiceover": "«وَلِأَنَّ التِّجَارَةَ شَرَاكَةٌ وَأَمَانٌ: تُجَّارُنَا لَا يَدْفَعُونَ مِيزَانِيَّاتِ تَسْوِيقٍ ضَائِعَةً، بَلْ يَسْتَقْبِلُونَ مُجْتَمَعاً مِنْ آلَافِ الأُسَرِ المُوَجَّهَةِ لِمَتْجَرِهِمْ بِوَلَاءٍ دَائِمٍ.»",
                    "sfx_music": "إيقاع أوركسترالي غني يعبر عن الازدهار التجاري.",
                    "typography": "شراكة رابحة للمتسوق والتاجر"
                },
                {
                    "timing": "00:45 - 00:54",
                    "visuals": "لقطات سريعة مبهجة لمتسوقين وتجار وشباب من مختلف الأعمار ينظرون للكاميرا بثقة وفخر.",
                    "voiceover": "«سَوَاءٌ كُنْتَ مُتَسَوِّقاً، أَوْ تَاجِراً، أَوْ تَبْحَثُ عَنْ دَخْلٍ يَحْمِي غَدَكَ.. مَكَانُكَ بَيْنَنَا.»",
                    "sfx_music": "ذروة موسيقية ملهمة (Cinematic Climax).",
                    "typography": "متسوق • تاجر • صانع مشروع"
                },
                {
                    "timing": "00:54 - 01:00",
                    "visuals": "شعار SAWYAN يتوسط الشاشة مع عبارة «كلنا SAWYAN» والرابط الرسمي sawyan.net.",
                    "voiceover": "«كُلُّنَا SAWYAN — مَنَصَّةُ الِاسْتِهْلَاكِ الِاسْتِثْمَارِيِّ العَالَمِيَّةُ.»",
                    "sfx_music": "نغمة ختامية دافئة وراسخة.",
                    "typography": "كلنا SAWYAN • www.sawyan.net"
                }
            ]
        }
    ],
    "official_approved_phrases": [
        {
            "id": "OFFICIAL-001",
            "category": "official_approved",
            "audience": "all",
            "type": "الهوية الرسمية المعتمدة",
            "title": "التعريف الأساسي لمنصة SAWYAN",
            "current_text": "SAWYAN — منصة الاستهلاك الاستثماري العالمية (Buy and Make Money)",
            "status": "official_approved",
            "usage_notes": "الجملة الرسمية الأولى المعتمدة من الإدارة للتعريف بالمنصة عالمياً ومحلياً."
        },
        {
            "id": "OFFICIAL-002",
            "category": "official_approved",
            "audience": "prospect",
            "type": "دعوة الاستهلاك الاستثماري",
            "title": "دعوة الانضمام لآلاف الأسر",
            "current_text": "«اكتشف نظام SAWYAN للاستهلاك الاستثماري (Buy and Make Money). انضم إلى آلاف الأسر الذين حولوا مشترياتهم اليومية من السوبر ماركت، الصيدليات، والمطاعم إلخ إلى أرباح حقيقية تنمو كل يوم.»",
            "status": "official_approved",
            "usage_notes": "الرسالة الافتتاحية المعتمدة لصفحة الهبوط ومقدمة العروض التقديمية."
        },
        {
            "id": "OFFICIAL-003",
            "category": "official_approved",
            "audience": "all",
            "type": "شعار الحرية المالية",
            "title": "الحرية المالية خطوة واحدة",
            "current_text": "«الحرية المالية ليست وهما — بل حقيقة يفصلك عنها خطوة واحدة»",
            "status": "official_approved",
            "usage_notes": "جملة الختام والأثر المعتمدة في كافة تصاميم السوشيال ميديا والفيديوهات."
        },
        {
            "id": "OFFICIAL-004",
            "category": "official_approved",
            "audience": "community",
            "type": "شعار الانتماء المجتمعي",
            "title": "شعار كلنا SAWYAN",
            "current_text": "«كلنا SAWYAN — سواء كنت متسوقاً أو تاجراً أو تبحث عن دخل إضافي، لدينا ما يناسبك»",
            "status": "official_approved",
            "usage_notes": "المانترا الرسمية الموحدة للمجتمع بكافة شرائحه."
        },
        {
            "id": "OFFICIAL-005",
            "category": "official_approved",
            "audience": "consumer",
            "type": "ميثاق المتسوق",
            "title": "قسم «أنا متسوق»",
            "current_text": "«أنا متسوق»\n• لا تدفع دون مقابل بعد الآن!\n• تسوّق بالسعر الطبيعي من السوبر ماركت والصيدليات والمطاعم.\n• وثّق فاتورتك بكود هويتك في ثوانٍ.\n• عضوية مجانية 100% بلا رسوم اشتراك.",
            "status": "official_approved",
            "usage_notes": "البطاقة الرسمية للمتسوقين في الصفحة الرئيسية ومطبوعات التعريف."
        },
        {
            "id": "OFFICIAL-006",
            "category": "official_approved",
            "audience": "merchant",
            "type": "ميثاق التاجر",
            "title": "قسم «أنا تاجر»",
            "current_text": "«أنا تاجر»\n• ضاعف مبيعاتك دون المجازفة بمبالغ تنفق على حملات تسويقية مجهولة المردود.\n• ادفع مقابل النتائج فقط.\n• آلاف العملاء في انتظارك.\n• نحن جيشك التسويقي القادم.\n• تفرغ لتطوير منتجك وخدماتك.",
            "status": "official_approved",
            "usage_notes": "العرض المعتمد لأصحاب المتاجر والمطاعم والخدمات."
        },
        {
            "id": "OFFICIAL-007",
            "category": "official_approved",
            "audience": "prospect",
            "type": "مزايا الانضمام الخمس",
            "title": "لماذا يجب أن نكون SAWYAN؟",
            "current_text": "«لماذا يجب أن نكون SAWYAN؟»\n• صفر مخاطرة، صفر رأس مال.\n• أيا كانت خبرتك أهلا بك.\n• حلال 100%.\n• دخل متنامي.\n• حرية كاملة في اختيار مواعيد العمل.",
            "status": "official_approved",
            "usage_notes": "النقاط الخمس المعتمدة لكسر التردد عند الزوار الجدد."
        },
        {
            "id": "OFFICIAL-008",
            "category": "official_approved",
            "audience": "prospect",
            "type": "خطوات النجاح للمستهلك",
            "title": "آلية العمل: تحول من مستهلك لصاحب مشروع في 3 خطوات مجانية",
            "current_text": "«آلية العمل — في 3 خطوات مجانية تحول من مستهلك لصاحب مشروع»\n1. غيّر وجهتك (استهلك بذكاء): لا تدفع دون مقابل بعد الآن! حوّل مشترياتك الاعتيادية إلى المحلات والمواقع الشريكة لمنصة سويّاً.\n2. ابنِ مجتمعك وابدأ بجني الأرباح: إبدأ بدعوة معارفك.. أنت تقدم لهم خدمة عظيمة.\n3. ضاعف دخلك: قم بدعوة فريقك لتكرار الخطوتين السابقتين، وكلما اتسع فريقك زاد دخلك ودخلهم.",
            "status": "official_approved",
            "usage_notes": "الشرح الرسمي المعتمد لرحلة العضو في الموقع."
        },
        {
            "id": "OFFICIAL-009",
            "category": "official_approved",
            "audience": "merchant",
            "type": "خطوات انضمام التاجر",
            "title": "للتجار: في 3 خطوات اقفز بمبيعات مشروعك لأبعد مدى",
            "current_text": "«للتجار: في 3 خطوات اقفز بمبيعات مشروعك لأبعد مدى»\n1. أنشئ حساب متجرك مجاناً.\n2. حدد نسبة عمولات متوازنة تستطيع أن تردها لجيش عملاء سويا إذا حولوا مشترياتهم لك.\n3. وثق لكل عميل فاتورته بتطبيق سويا.",
            "status": "official_approved",
            "usage_notes": "الدليل الإرشادي السريع المعتمد للتعاقد مع التجار."
        },
        {
            "id": "OFFICIAL-010",
            "category": "official_approved",
            "audience": "all",
            "type": "شبكة التجار العالمية",
            "title": "تجار مميزون حول العالم",
            "current_text": "«تجار مميزون — تعرف على آلاف التجار المعتمدين من سويا حول العالم بأغلب المجالات»",
            "status": "official_approved",
            "usage_notes": "عنوان دليل المتاجر والشركاء في الموقع والتطبيق."
        },
        {
            "id": "OFFICIAL-011",
            "category": "official_approved",
            "audience": "all",
            "type": "فلسفة المشروع الكبرى",
            "title": "أهلاً بك في عالم الاستهلاك الاستثماري",
            "current_text": "«أهلا بك في عالم الاستهلاك الاستثماري (Buy and Make Money) — حيث تصنع مشروعك ببساطة ليس فقط من مشترياتك اليومية بل من مشتريات آلاف الأعضاء بفريقك»",
            "status": "official_approved",
            "usage_notes": "البيان التأسيسي المعتمد للمنصة."
        }
    ],
    "candidate_marketing_phrases": [
        {
            "id": "HOOK-001",
            "category": "candidate_phrases",
            "audience": "prospect",
            "type": "خطاف ريلز وتيك توك",
            "title": "سؤال العشرين سنة ومحل الملابس",
            "current_text": "لو بتشتري أنت وعيلتك من نفس المحل بقالكم 20 سنة.. هل تقدر تقله اديني شهر واحد مجاناً لأنني عميل وفي؟ مستحيل! في SAWYAN وفاءك لمشترياتك هو أساس دخلك.",
            "status": "candidate_approved",
            "usage_notes": "أول 3 ثوانٍ في الفيديوهات القصيرة، نسبة استبقاء المشاهدين تتجاوز 80%."
        },
        {
            "id": "HOOK-002",
            "category": "candidate_phrases",
            "audience": "prospect",
            "type": "خطاف فضول مالي",
            "title": "أين ذهبت ملايين فواتير السوبر ماركت؟",
            "current_text": "كم أنفقت طوال حياتك على السوبر ماركت والصيدلية والمطاعم؟ ماذا لو عاد كل هذا الاستهلاك كأرباح شهرية تتنامى كل يوم؟",
            "status": "candidate_approved",
            "usage_notes": "يصلح كمنشور تفاعلي على فيسبوك وتويتر وبداية محتوى مرئي."
        },
        {
            "id": "HOOK-003",
            "category": "candidate_phrases",
            "audience": "merchant",
            "type": "خطاف استقطاب التجار",
            "title": "ألم الإعلانات الممولة مجهولة العائد",
            "current_text": "كم تاجر تعرفه خسر آلاف الدولارات في حملات تسويقية مجهولة المردود؟ في SAWYAN: ادفع مقابل النتائج والمبيعات الحقيقية فقط!",
            "status": "candidate_approved",
            "usage_notes": "موجه لأصحاب المتاجر والمطاعم على لينكد إن وإنستغرام."
        },
        {
            "id": "HOOK-004",
            "category": "candidate_phrases",
            "audience": "prospect",
            "type": "صدمة إيجابية",
            "title": "أكثر ما تكرهه.. أكبر استثمار في حياتك",
            "current_text": "أكثر ما نفعله كل يوم.. هو أكثر ما نكرهه: الدفع! من اليوم، كل فاتورة تدفعها لم تعد استنزافاً لجيبك، بل بذرة لمشروعك المالي المستقل.",
            "status": "candidate_approved",
            "usage_notes": "مقدمة قوية جداً للمنشورات والفيديوهات الطويلة."
        },
        {
            "id": "CAND-MBR-001",
            "category": "candidate_phrases",
            "audience": "member",
            "type": "تعزيز ولاء وثقة",
            "title": "أنت لا تبيع منتجات.. أنت تحمي ميزانية الأسر",
            "current_text": "عندما تشارك SAWYAN مع أصدقائك، أنت لا تطلب منهم شراء سلع لا يحتاجونها.. أنت تهديهم مفتاحاً لتحويل فواتيرهم الإلزامية إلى أرباح تعينهم على غلاء المعيشة.",
            "status": "candidate_approved",
            "usage_notes": "لجروبات تدريب الأعضاء وقنوات التلغرام لرفع الروح المعنوية."
        },
        {
            "id": "CAND-MBR-002",
            "category": "candidate_phrases",
            "audience": "member",
            "type": "تأكيد الحرية والاستقلالية",
            "title": "مشروعك ينمو مع كل فاتورة يومية",
            "current_text": "في SAWYAN: أنت لا تبني مشروعاً ينتهي بانتهاء ساعات عملك، بل تبني شبكة استهلاك استثماري تعمل في كل دقيقة تشتري فيها أسرة حليباً أو خبزاً أو دواءً حول العالم.",
            "status": "candidate_approved",
            "usage_notes": "لرسائل التحفيز الأسبوعية وتكريم القادة."
        },
        {
            "id": "CAND-MCH-001",
            "category": "candidate_phrases",
            "audience": "merchant",
            "type": "عرض قيمة للتاجر",
            "title": "زبائن يبحثون عنك بالاسم",
            "current_text": "في كل منصات التسويق أنت تطارد العميل.. في SAWYAN أعضاء المنصة هم من يبحثون عن متجرك على الخريطة ليوجهوا كل مشترياتهم إليك!",
            "status": "candidate_approved",
            "usage_notes": "لبروشورات استقطاب التجار والمقابلات المباشرة مع أصحاب الأعمال."
        },
        {
            "id": "MSG-WA-001",
            "category": "candidate_phrases",
            "audience": "prospect",
            "type": "رسالة واتساب مباشرة",
            "title": "قالب دعوة الأهل والأصدقاء عبر واتساب",
            "current_text": "السلام عليكم ورحمة الله.. كلنا شهرياً بنصرف مصاريف البيت من سوبر ماركت وصيدليات ومطاعم وما بيرجع لنا منها ولا قرش. حابب أشاركك منصة عالمية راقية اسمها SAWYAN (الاستهلاك الاستثماري: Buy and Make Money).. فكرتها إننا بنشتري بنفس أسعارنا العادية من المحلات الشريكة، وفواتيرنا بتتحول لأرباح حقيقية بتنزل بحسابنا كل شهر. التسجيل مجاني تماماً 100% وبدون أي شروط. شوف التفاصيل وسجل من هنا: sawyan.net بكود عضويتي: [كود_عضويتك]",
            "status": "candidate_approved",
            "usage_notes": "قالب واتساب جاهز للإرسال السريع للأقارب والمعارف."
        }
    ]
}

# Save updated JSON
with open('specs/marketing_content_vault.json', 'w', encoding='utf-8') as f:
    json.dump(vault, f, ensure_ascii=False, indent=2)

# Build HTML with White Background + Direct Live Editing + Version Archive + Merged Scripts & Storyboards
html = '''<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>بنك محتوى SAWYAN — الوثيقة التفاعلية الحية</title>
    <link rel="icon" type="image/svg+xml" href="../../shared/assets/sawyan-icon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Poppins:wght@700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-page: #f8fafc;
            --bg-card: #ffffff;
            --border-color: #cbd5e1;
            --border-light: #e2e8f0;
            --text-primary: #0f172a;
            --text-secondary: #334155;
            --text-muted: #64748b;
            --emerald: #047857;
            --emerald-light: #ecfdf5;
            --emerald-border: #10b981;
            --blue: #1d4ed8;
            --blue-light: #eff6ff;
            --amber: #b45309;
            --amber-light: #fffbeb;
            --amber-border: #f59e0b;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Cairo', system-ui, -apple-system, sans-serif;
        }

        body {
            background-color: var(--bg-page);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 18px 24px 60px;
            line-height: 1.75;
        }

        .container {
            max-width: 1380px;
            margin: 0 auto;
        }

        /* Sticky Live Edit Toolbar (Like وصف_الموقع_البناء_2.html) */
        .live-edit-bar {
            position: sticky;
            top: 10px;
            z-index: 1000;
            background: #ffffff;
            border: 2px solid var(--emerald-border);
            border-radius: 14px;
            padding: 12px 20px;
            margin-bottom: 22px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
            box-shadow: 0 8px 25px rgba(15, 23, 42, 0.08);
        }

        .edit-status-pill {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 800;
            color: var(--emerald);
            font-size: 0.98rem;
        }

        .toolbar-btns {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .btn {
            background: #f1f5f9;
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            padding: 8px 15px;
            border-radius: 8px;
            font-size: 0.88rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            text-decoration: none;
        }

        .btn:hover {
            background: #e2e8f0;
        }

        .btn-emerald {
            background: var(--emerald);
            color: #ffffff;
            border-color: var(--emerald);
        }

        .btn-emerald:hover {
            background: #065f46;
        }

        .btn-blue {
            background: var(--blue);
            color: #ffffff;
            border-color: var(--blue);
        }

        .btn-blue:hover {
            background: #1e40af;
        }

        .btn-amber {
            background: var(--amber-light);
            color: var(--amber);
            border-color: var(--amber-border);
        }

        /* Main Header */
        header {
            background: #ffffff;
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px 28px;
            margin-bottom: 22px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 20px;
            box-shadow: 0 2px 10px rgba(15, 23, 42, 0.03);
        }

        .brand-header {
            display: flex;
            align-items: center;
            gap: 18px;
        }

        .brand-title h1 {
            font-size: 2rem;
            font-weight: 900;
            color: #0f172a;
        }

        .brand-title p {
            font-size: 0.96rem;
            color: var(--text-secondary);
            font-weight: 600;
        }

        /* Filter & Navigation Tabs */
        .nav-bar {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
            background: #ffffff;
            padding: 12px;
            border-radius: 14px;
            border: 1px solid var(--border-color);
        }

        .tab-btn {
            background: #f8fafc;
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            padding: 10px 20px;
            border-radius: 10px;
            font-size: 0.98rem;
            font-weight: 800;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.15s;
        }

        .tab-btn:hover {
            background: #f1f5f9;
            color: #0f172a;
        }

        .tab-btn.active {
            background: var(--emerald);
            border-color: var(--emerald);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(4, 120, 87, 0.25);
        }

        .tab-count {
            background: rgba(255,255,255,0.22);
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 0.78rem;
        }

        .tab-btn:not(.active) .tab-count {
            background: #e2e8f0;
            color: #334155;
        }

        /* Search Box */
        .search-wrap {
            margin-bottom: 24px;
            position: relative;
        }

        .search-input {
            width: 100%;
            background: #ffffff;
            border: 2px solid var(--border-color);
            color: #0f172a;
            padding: 14px 46px 14px 18px;
            border-radius: 12px;
            font-size: 1.02rem;
            font-weight: 600;
            outline: none;
        }

        .search-input:focus {
            border-color: var(--emerald);
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }

        .search-icon {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 1.2rem;
        }

        /* Section Containers */
        .vault-section {
            margin-bottom: 40px;
        }

        .section-banner {
            background: #ffffff;
            border-right: 6px solid var(--emerald);
            border-top: 1px solid var(--border-color);
            border-left: 1px solid var(--border-color);
            border-bottom: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 18px 24px;
            margin-bottom: 22px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }

        .section-banner h2 {
            font-size: 1.45rem;
            font-weight: 900;
            color: #0f172a;
        }

        .section-banner p {
            color: var(--text-secondary);
            font-size: 0.95rem;
            font-weight: 600;
        }

        /*Editable Highlight*/
        [contenteditable="true"] {
            outline: none;
            transition: background 0.15s, box-shadow 0.15s;
            border-radius: 6px;
        }

        [contenteditable="true"]:hover {
            background-color: #fefce8 !important;
            box-shadow: 0 0 0 2px #fde047;
        }

        [contenteditable="true"]:focus {
            background-color: #ffffff !important;
            box-shadow: 0 0 0 3px var(--emerald-border) !important;
        }

        /* Script + Storyboard Combined Block */
        .script-master-block {
            background: #ffffff;
            border: 2px solid var(--border-color);
            border-radius: 16px;
            margin-bottom: 32px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(15, 23, 42, 0.04);
        }

        .script-block-header {
            background: #f1f5f9;
            padding: 18px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }

        .script-badge {
            background: var(--emerald);
            color: #ffffff;
            font-weight: 800;
            font-size: 0.88rem;
            padding: 5px 14px;
            border-radius: 999px;
        }

        .script-body-area {
            padding: 24px;
            border-bottom: 2px solid var(--border-light);
        }

        .script-title-heading {
            font-size: 1.35rem;
            font-weight: 900;
            color: #0f172a;
            margin-bottom: 14px;
            padding: 4px 8px;
        }

        .vocalized-script-box {
            background: #f8fafc;
            border: 1px solid var(--border-color);
            border-right: 5px solid var(--emerald);
            border-radius: 12px;
            padding: 20px 24px;
            font-size: 1.22rem;
            font-weight: 700;
            color: #0f172a;
            line-height: 2.15;
            white-space: pre-wrap;
        }

        /* Storyboard Table inside Script Block */
        .storyboard-sub-header {
            background: var(--emerald-light);
            padding: 14px 24px;
            border-bottom: 1px solid #a7f3d0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }

        .storyboard-sub-header h4 {
            color: var(--emerald);
            font-size: 1.15rem;
            font-weight: 900;
        }

        .table-responsive {
            overflow-x: auto;
        }

        .storyboard-table {
            width: 100%;
            border-collapse: collapse;
            text-align: right;
            background: #ffffff;
        }

        .storyboard-table th {
            background: #f1f5f9;
            color: #0f172a;
            font-weight: 900;
            font-size: 0.95rem;
            padding: 14px 16px;
            border-bottom: 2px solid var(--border-color);
            border-left: 1px solid var(--border-light);
        }

        .storyboard-table td {
            padding: 16px;
            border-bottom: 1px solid var(--border-color);
            border-left: 1px solid var(--border-light);
            vertical-align: top;
            font-size: 0.98rem;
            color: #0f172a;
            line-height: 1.75;
        }

        .storyboard-table tr:hover td {
            background: #f8fafc;
        }

        .time-pill {
            background: var(--amber-light);
            color: var(--amber);
            border: 1px solid var(--amber-border);
            padding: 5px 12px;
            border-radius: 8px;
            font-family: 'Poppins', sans-serif;
            font-weight: 800;
            font-size: 0.88rem;
            display: inline-block;
            direction: ltr;
        }

        .vo-cell-box {
            background: var(--emerald-light);
            border-right: 4px solid var(--emerald);
            padding: 10px 14px;
            border-radius: 8px;
            font-weight: 800;
            color: #064e3b;
            font-size: 1.04rem;
        }

        .typo-cell-box {
            color: var(--blue);
            font-weight: 800;
        }

        /* Phrase Cards Grid */
        .cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
            gap: 20px;
        }

        @media (max-width: 640px) {
            .cards-grid {
                grid-template-columns: 1fr;
            }
        }

        .phrase-card {
            background: #ffffff;
            border: 1px solid var(--border-color);
            border-radius: 14px;
            padding: 22px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
            position: relative;
        }

        .phrase-card.official-card {
            border-right: 6px solid var(--emerald);
        }

        .phrase-card.candidate-card {
            border-right: 6px solid var(--amber-border);
        }

        .card-meta-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .tag-official {
            background: var(--emerald-light);
            color: var(--emerald);
            border: 1px solid #6ee7b7;
            padding: 3px 12px;
            border-radius: 999px;
            font-size: 0.8rem;
            font-weight: 800;
        }

        .tag-candidate {
            background: var(--amber-light);
            color: var(--amber);
            border: 1px solid #fcd34d;
            padding: 3px 12px;
            border-radius: 999px;
            font-size: 0.8rem;
            font-weight: 800;
        }

        .card-id-code {
            font-family: 'Poppins', sans-serif;
            font-size: 0.78rem;
            color: var(--text-muted);
            font-weight: 700;
        }

        .phrase-title {
            font-size: 1.18rem;
            font-weight: 900;
            color: #0f172a;
            margin-bottom: 12px;
            padding: 4px 6px;
        }

        .phrase-body {
            background: #f8fafc;
            border: 1px solid var(--border-light);
            border-radius: 10px;
            padding: 16px;
            font-size: 1.06rem;
            font-weight: 700;
            color: #0f172a;
            line-height: 1.85;
            white-space: pre-wrap;
            margin-bottom: 14px;
            flex-grow: 1;
        }

        .phrase-notes {
            font-size: 0.86rem;
            color: var(--text-secondary);
            margin-bottom: 14px;
            padding: 4px 6px;
            font-weight: 600;
        }

        .card-footer-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid var(--border-light);
            padding-top: 12px;
            gap: 8px;
        }

        /* Modal for Version History Archive */
        .modal-backdrop {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.55);
            z-index: 2000;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .modal-backdrop.open {
            display: flex;
        }

        .modal-box {
            background: #ffffff;
            border-radius: 16px;
            max-width: 750px;
            width: 100%;
            max-height: 85vh;
            overflow-y: auto;
            padding: 26px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.25);
        }

        .modal-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--border-light);
            padding-bottom: 14px;
            margin-bottom: 18px;
        }

        .history-item {
            background: #f8fafc;
            border: 1px solid var(--border-color);
            border-right: 4px solid var(--amber-border);
            border-radius: 10px;
            padding: 14px;
            margin-bottom: 12px;
        }

        /* Toast */
        .toast {
            position: fixed;
            bottom: 28px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: #047857;
            color: #ffffff;
            padding: 12px 28px;
            border-radius: 999px;
            font-weight: 800;
            font-size: 0.96rem;
            box-shadow: 0 10px 25px rgba(4, 120, 87, 0.35);
            transition: transform 0.25s ease;
            z-index: 9999;
        }

        .toast.show {
            transform: translateX(-50%) translateY(0);
        }

        @media print {
            .live-edit-bar, .nav-bar, .search-wrap, .card-footer-actions {
                display: none !important;
            }
            body {
                background: #fff;
                padding: 0;
            }
        }
    </style>
</head>
<body>

<div class="container">
    <!-- Sticky Direct-Edit & History Toolbar -->
    <div class="live-edit-bar">
        <div class="edit-status-pill">
            <span>✏️ وضع التعديل المباشر مفعل — اضغط على أي نص أو خلية في الجدول للتعديل فوراً (يُحفظ تلقائياً ولا يضيع أي نص سابق)</span>
            <span id="saveIndicator" style="background:#ecfdf5; border:1px solid #10b981; padding:2px 10px; border-radius:999px; font-size:0.8rem;">✓ محفوظ تلقائياً</span>
        </div>
        <div class="toolbar-btns">
            <button type="button" class="btn btn-emerald" onclick="addNewPhrasePrompt()">+ إضافة عبارة جديدة</button>
            <button type="button" class="btn btn-amber" onclick="openHistoryModal()">🕓 أرشيف التعديلات السابقة (<span id="historyCountBadge">0</span>)</button>
            <button type="button" class="btn btn-blue" onclick="copyAllForGoogleDocs()">📋 نسخ الكل لـ Google Docs</button>
            <button type="button" class="btn" onclick="downloadUpdatedHTML()">💾 حفظ نسخة HTML</button>
            <button type="button" class="btn" onclick="window.print()">🖨️ طباعة / PDF</button>
        </div>
    </div>

    <!-- Main Header -->
    <header>
        <div class="brand-header">
            <div id="stableBrandLogoMount"></div>
            <div class="brand-title">
                <h1 contenteditable="true" data-edit-key="main-title">بنك محتوى SAWYAN</h1>
                <p contenteditable="true" data-edit-key="main-subtitle">المرجع الدستوري الشامل للسكربتات الإعلانية وجداول المشاهد والإخراج، والعبارات المعتمدة من الإدارة، والأفكار التسويقية (sawyan.net)</p>
            </div>
        </div>
    </header>

    <!-- View Mode / Section Switcher -->
    <div class="nav-bar">
        <button class="tab-btn active" onclick="filterSection('all', this)">
            📑 عرض الموسوعة كاملة في صفحة واحدة
        </button>
        <button class="tab-btn" onclick="filterSection('sec-scripts', this)">
            🎬 السكربتات وجداول المشاهد والإخراج (ثانية بثانية)
            <span class="tab-count">3 سكربتات بجدولها الكامل</span>
        </button>
        <button class="tab-btn" onclick="filterSection('sec-official', this)">
            🏛️ العبارات المعتمدة من الإدارة
            <span class="tab-count">11 نصاً دستورياً</span>
        </button>
        <button class="tab-btn" onclick="filterSection('sec-candidate', this)">
            💡 العبارات والرسائل التسويقية المرشحة
            <span class="tab-count">8 أفكار وقوالب</span>
        </button>
    </div>

    <!-- Instant Search -->
    <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" id="liveSearchInput" class="search-input" placeholder="ابحث فوراً في كل المشاهد، السكربتات، العبارات المعتمدة، أو الأفكار المرشحة..." oninput="runSearch()">
    </div>

    <!-- ========================================================================= -->
    <!-- SECTION 1: UNIFIED SCRIPTS + STORYBOARD & DIRECTION TABLES (ثانية بثانية) -->
    <!-- ========================================================================= -->
    <div id="sec-scripts" class="vault-section">
        <div class="section-banner">
            <div>
                <h2>🎬 أولاً: السكربتات الإعلانية مع جدول المشاهد والإخراج الفني (ثانية بثانية)</h2>
                <p>كل سكربت مدمج معه مباشرة جدول المشاهد البصرية، التوقيت، التعليق الصوتي المشكول، المؤثرات الصوتية، والنصوص على الشاشة — قابلة للتعديل المباشر.</p>
            </div>
        </div>
'''

for s_idx, script in enumerate(vault['scripts_with_storyboards']):
    sid = script['id']
    html += f'''
        <div class="script-master-block" data-searchable="true">
            <div class="script-block-header">
                <span class="script-badge" contenteditable="true" data-edit-key="{sid}-badge">{script['badge']}</span>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" class="btn btn-emerald" onclick="addSceneRow('table-{sid}')">+ إضافة مشهد جديد للجدول</button>
                    <button type="button" class="btn btn-blue" onclick="copyScriptWithTable('{sid}')">📋 نسخ السكربت مع جدول المشاهد</button>
                </div>
            </div>
            <div class="script-body-area">
                <div class="script-title-heading" contenteditable="true" data-edit-key="{sid}-title">{script['title']}</div>
                <div class="vocalized-script-box" id="text-{sid}" contenteditable="true" data-edit-key="{sid}-fulltext">{script['full_text']}</div>
                <div style="margin-top:10px; color:#475569; font-size:0.9rem; font-weight:600;" contenteditable="true" data-edit-key="{sid}-notes">📌 {script['usage_notes']}</div>
            </div>
            <div class="storyboard-sub-header">
                <h4>🎥 جدول المشاهد والإخراج الفني التفصيلي (ثانية بثانية) — {script['title']}</h4>
            </div>
            <div class="table-responsive">
                <table class="storyboard-table" id="table-{sid}">
                    <thead>
                        <tr>
                            <th style="width:130px;">التوقيت</th>
                            <th style="width:26%;">المشهد البصري والإخراج (Camera & Visuals)</th>
                            <th style="width:32%;">التعليق الصوتي المشكول (Voiceover)</th>
                            <th style="width:17%;">المؤثرات الصوتية والموسيقى (SFX & Music)</th>
                            <th style="width:15%;">النصوص على الشاشة (On-Screen Typography)</th>
                        </tr>
                    </thead>
                    <tbody>'''
    for r_idx, row in enumerate(script['scenes']):
        rkey = f"{sid}-r{r_idx}"
        html += f'''
                        <tr>
                            <td><span class="time-pill" contenteditable="true" data-edit-key="{rkey}-time">{row['timing']}</span></td>
                            <td contenteditable="true" data-edit-key="{rkey}-vis">{row['visuals']}</td>
                            <td><div class="vo-cell-box" contenteditable="true" data-edit-key="{rkey}-vo">{row['voiceover']}</div></td>
                            <td contenteditable="true" data-edit-key="{rkey}-sfx">{row['sfx_music']}</td>
                            <td class="typo-cell-box" contenteditable="true" data-edit-key="{rkey}-typo">{row['typography']}</td>
                        </tr>'''
    html += '''
                    </tbody>
                </table>
            </div>
        </div>'''

html += '''
    </div>

    <!-- ========================================================================= -->
    <!-- SECTION 2: OFFICIAL APPROVED PHRASES FROM MANAGEMENT                      -->
    <!-- ========================================================================= -->
    <div id="sec-official" class="vault-section">
        <div class="section-banner">
            <div>
                <h2>🏛️ ثانياً: العبارات المعتمدة رسمياً من الإدارة العليا (المصدر الدستوري)</h2>
                <p>النصوص الرسمية المعتمدة حرفياً لتغذية الموقع الرئيسي sawyan.net وجميع المطبوعات والحملات التعريفية — اضغط على أي نص للتعديل المباشر.</p>
            </div>
            <button type="button" class="btn btn-emerald" onclick="addNewCardToGrid('officialGrid', 'official')">+ إضافة عبارة معتمدة</button>
        </div>
        <div class="cards-grid" id="officialGrid">'''

for item in vault['official_approved_phrases']:
    iid = item['id']
    html += f'''
            <div class="phrase-card official-card" data-searchable="true">
                <div>
                    <div class="card-meta-top">
                        <span class="tag-official">🏛️ معتمد رسمياً من الإدارة</span>
                        <span class="card-id-code">{iid}</span>
                    </div>
                    <div class="phrase-title" contenteditable="true" data-edit-key="{iid}-title">{item['title']}</div>
                    <div class="phrase-body" contenteditable="true" data-edit-key="{iid}-body">{item['current_text']}</div>
                    <div class="phrase-notes" contenteditable="true" data-edit-key="{iid}-notes">📌 {item['usage_notes']}</div>
                </div>
                <div class="card-footer-actions">
                    <span style="font-size:0.78rem; color:#64748b;">✏️ قابل للتعديل المباشر</span>
                    <button type="button" class="btn btn-blue" onclick="copyCardText(this)">📋 نسخ النص</button>
                </div>
            </div>'''

html += '''
        </div>
    </div>

    <!-- ========================================================================= -->
    <!-- SECTION 3: CANDIDATE MARKETING PHRASES & HOOKS                            -->
    <!-- ========================================================================= -->
    <div id="sec-candidate" class="vault-section">
        <div class="section-banner" style="border-right-color: var(--amber-border);">
            <div>
                <h2>💡 ثالثاً: بنك العبارات والرسائل التسويقية المرشحة (من الفيديوهات والشروحات)</h2>
                <p>خطافات الريلز، رسائل استقطاب المتسوقين والتجار، رسائل شحن همم الأعضاء، وقوالب الواتساب — قابلة للتعديل والتطوير المباشر.</p>
            </div>
            <button type="button" class="btn btn-emerald" onclick="addNewCardToGrid('candidateGrid', 'candidate')">+ إضافة فكرة / عبارة مرشحة</button>
        </div>
        <div class="cards-grid" id="candidateGrid">'''

for item in vault['candidate_marketing_phrases']:
    iid = item['id']
    html += f'''
            <div class="phrase-card candidate-card" data-searchable="true">
                <div>
                    <div class="card-meta-top">
                        <span class="tag-candidate">💡 {item['type']}</span>
                        <span class="card-id-code">{iid}</span>
                    </div>
                    <div class="phrase-title" contenteditable="true" data-edit-key="{iid}-title">{item['title']}</div>
                    <div class="phrase-body" contenteditable="true" data-edit-key="{iid}-body">{item['current_text']}</div>
                    <div class="phrase-notes" contenteditable="true" data-edit-key="{iid}-notes">📌 {item['usage_notes']}</div>
                </div>
                <div class="card-footer-actions">
                    <span style="font-size:0.78rem; color:#64748b;">✏️ قابل للتعديل المباشر</span>
                    <button type="button" class="btn btn-blue" onclick="copyCardText(this)">📋 نسخ النص</button>
                </div>
            </div>'''

html += '''
        </div>
    </div>
</div>

<!-- Modal: Version History Archive (لا يضيع أي نص سابق) -->
<div class="modal-backdrop" id="historyModal">
    <div class="modal-box">
        <div class="modal-head">
            <h3>🕓 الأرشيف التاريخي للتعديلات (محفوظ مدى الحياة)</h3>
            <button type="button" class="btn" onclick="closeHistoryModal()">✖ إغلاق</button>
        </div>
        <p style="color:#475569; font-size:0.9rem; margin-bottom:14px;">كل تعديل تجريه يُحفظ النص السابق منه هنا تلقائياً مع تاريخ ووقت التعديل، ويمكنك استعادته بضغطة زر:</p>
        <div id="historyListContainer"></div>
    </div>
</div>

<!-- Toast -->
<div class="toast" id="toastMsg">تم الحفظ والنسخ بنجاح ✓</div>

<script src="../../shared/components/logo.js"></script>
<script>
const STORAGE_VALUES_KEY = 'SAWYAN_VAULT_V3_VALUES';
const STORAGE_HISTORY_KEY = 'SAWYAN_VAULT_V3_HISTORY';
const STORAGE_CUSTOM_ITEMS_KEY = 'SAWYAN_VAULT_V3_CUSTOM_ITEMS';

let savedValues = {};
let editHistory = [];

document.addEventListener('DOMContentLoaded', () => {
    // Mount stable logo on white background
    const mount = document.getElementById('stableBrandLogoMount');
    if (mount && window.SAWYAN && window.SAWYAN.Logo) {
        mount.innerHTML = window.SAWYAN.Logo.svg('default');
    }

    // Load saved edits & history from localStorage
    try {
        savedValues = JSON.parse(localStorage.getItem(STORAGE_VALUES_KEY) || '{}');
        editHistory = JSON.parse(localStorage.getItem(STORAGE_HISTORY_KEY) || '[]');
    } catch (e) {
        savedValues = {};
        editHistory = [];
    }

    // Apply saved edits to DOM
    document.querySelectorAll('[data-edit-key]').forEach(el => {
        const key = el.getAttribute('data-edit-key');
        el.dataset.originalText = el.innerText;
        if (savedValues[key] !== undefined) {
            el.innerText = savedValues[key];
        }
        el.dataset.lastCommitted = el.innerText;

        // Listen for direct edits
        el.addEventListener('blur', () => handleDirectEdit(el));
        el.addEventListener('input', () => {
            const ind = document.getElementById('saveIndicator');
            if (ind) ind.innerText = '⏳ جاري الحفظ التلقائي...';
        });
    });

    updateHistoryBadge();
});

function handleDirectEdit(el) {
    const key = el.getAttribute('data-edit-key');
    const newText = el.innerText.trim();
    const prevText = (el.dataset.lastCommitted || '').trim();

    if (newText !== prevText) {
        // Archive previous version so nothing is ever lost
        editHistory.unshift({
            key: key,
            previous_text: prevText,
            new_text: newText,
            timestamp: new Date().toLocaleString('ar-EG')
        });
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(editHistory.slice(0, 300)));

        // Save current value
        savedValues[key] = newText;
        localStorage.setItem(STORAGE_VALUES_KEY, JSON.stringify(savedValues));
        el.dataset.lastCommitted = newText;

        updateHistoryBadge();
        const ind = document.getElementById('saveIndicator');
        if (ind) ind.innerText = '✓ تم الحفظ التلقائي وتوثيق النسخة السابقة';
        showToast('تم حفظ تعديلك تلقائياً والاحتفاظ بالنص السابق في الأرشيف ✓');
    } else {
        const ind = document.getElementById('saveIndicator');
        if (ind) ind.innerText = '✓ محفوظ تلقائياً';
    }
}

function updateHistoryBadge() {
    const b = document.getElementById('historyCountBadge');
    if (b) b.innerText = editHistory.length;
}

function openHistoryModal() {
    const container = document.getElementById('historyListContainer');
    if (!editHistory.length) {
        container.innerHTML = '<div style="padding:24px; text-align:center; color:#64748b; font-weight:700;">لا توجد تعديلات سابقة حتى الآن. عند تعديل أي نص في الصفحة سيتم الاحتفاظ بنسخته السابقة هنا تلقائياً.</div>';
    } else {
        container.innerHTML = editHistory.map((h, idx) => `
            <div class="history-item">
                <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:#64748b; margin-bottom:6px; font-weight:700;">
                    <span>البند: ${h.key}</span>
                    <span>🕒 ${h.timestamp}</span>
                </div>
                <div style="font-size:0.9rem; color:#991b1b; background:#fef2f2; padding:8px 12px; border-radius:6px; margin-bottom:6px; white-space:pre-wrap;"><strong>النص السابق المحفوظ:</strong>\\n${h.previous_text}</div>
                <div style="font-size:0.9rem; color:#065f46; background:#ecfdf5; padding:8px 12px; border-radius:6px; margin-bottom:8px; white-space:pre-wrap;"><strong>النص المعدل:</strong>\\n${h.new_text}</div>
                <button type="button" class="btn" onclick="restoreHistoryEntry(${idx})">↩️ استعادة هذا النص السابق</button>
            </div>
        `).join('');
    }
    document.getElementById('historyModal').classList.add('open');
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.remove('open');
}

function restoreHistoryEntry(idx) {
    const h = editHistory[idx];
    if (!h) return;
    const el = document.querySelector(`[data-edit-key="${h.key}"]`);
    if (el) {
        el.innerText = h.previous_text;
        handleDirectEdit(el);
        closeHistoryModal();
        showToast('تمت استعادة النص السابق بنجاح ✓');
    }
}

function filterSection(secId, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.vault-section').forEach(sec => {
        if (secId === 'all' || sec.id === secId) {
            sec.style.display = 'block';
        } else {
            sec.style.display = 'none';
        }
    });
}

function runSearch() {
    const q = document.getElementById('liveSearchInput').value.trim().toLowerCase();
    document.querySelectorAll('[data-searchable="true"]').forEach(card => {
        const txt = card.innerText.toLowerCase();
        card.style.display = (!q || txt.includes(q)) ? '' : 'none';
    });
}

function addSceneRow(tableId) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;
    const rowCount = tbody.querySelectorAll('tr').length + 1;
    const rkey = `${tableId}-custom-${Date.now()}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><span class="time-pill" contenteditable="true" data-edit-key="${rkey}-time">00:00 - 00:05</span></td>
        <td contenteditable="true" data-edit-key="${rkey}-vis">اكتب وصف المشهد البصري وحركة الكاميرا هنا...</td>
        <td><div class="vo-cell-box" contenteditable="true" data-edit-key="${rkey}-vo">«اكتب التعليق الصوتي المشكول هنا...»</div></td>
        <td contenteditable="true" data-edit-key="${rkey}-sfx">اكتب المؤثرات الصوتية والموسيقى...</td>
        <td class="typo-cell-box" contenteditable="true" data-edit-key="${rkey}-typo">النص الظاهر على الشاشة</td>
    `;
    tbody.appendChild(tr);
    tr.querySelectorAll('[data-edit-key]').forEach(el => {
        el.dataset.lastCommitted = el.innerText;
        el.addEventListener('blur', () => handleDirectEdit(el));
    });
    showToast('تمت إضافة مشهد جديد للجدول — اضغط على خلاياه لتعديلها مباشرة ✓');
}

function addNewCardToGrid(gridId, type) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const cid = (type === 'official' ? 'OFFICIAL-NEW-' : 'CAND-NEW-') + Math.floor(100 + Math.random() * 900);
    const card = document.createElement('div');
    card.className = `phrase-card ${type === 'official' ? 'official-card' : 'candidate-card'}`;
    card.setAttribute('data-searchable', 'true');
    card.innerHTML = `
        <div>
            <div class="card-meta-top">
                <span class="${type === 'official' ? 'tag-official' : 'tag-candidate'}">${type === 'official' ? '🏛️ معتمد رسمياً من الإدارة' : '💡 عبارة تسويقية مضافة'}</span>
                <span class="card-id-code">${cid}</span>
            </div>
            <div class="phrase-title" contenteditable="true" data-edit-key="${cid}-title">عنوان العبارة الجديدة (اضغط للتعديل)</div>
            <div class="phrase-body" contenteditable="true" data-edit-key="${cid}-body">اكتب نص العبارة التسويقية أو الرسالة المعتمدة هنا مباشرة...</div>
            <div class="phrase-notes" contenteditable="true" data-edit-key="${cid}-notes">📌 ملاحظات ومواضع الاستخدام...</div>
        </div>
        <div class="card-footer-actions">
            <span style="font-size:0.78rem; color:#64748b;">✏️ قابل للتعديل المباشر</span>
            <button type="button" class="btn btn-blue" onclick="copyCardText(this)">📋 نسخ النص</button>
        </div>
    `;
    grid.prepend(card);
    card.querySelectorAll('[data-edit-key]').forEach(el => {
        el.dataset.lastCommitted = el.innerText;
        el.addEventListener('blur', () => handleDirectEdit(el));
    });
    showToast('تمت إضافة بطاقة عبارة جديدة — اضغط على النص لتعديله فوراً ✓');
}

function addNewPhrasePrompt() {
    addNewCardToGrid('candidateGrid', 'candidate');
    document.getElementById('sec-candidate').scrollIntoView({ behavior: 'smooth' });
}

function copyCardText(btn) {
    const card = btn.closest('.phrase-card');
    const title = card.querySelector('.phrase-title').innerText;
    const body = card.querySelector('.phrase-body').innerText;
    copyToClipboard(`${title}\\n${body}`);
}

function copyScriptWithTable(sid) {
    const block = document.getElementById('text-' + sid).closest('.script-master-block');
    const title = block.querySelector('.script-title-heading').innerText;
    const fullText = document.getElementById('text-' + sid).innerText;
    let out = `${title}\\n\\n=== النص الكامل المشكول ===\\n${fullText}\\n\\n=== جدول المشاهد والإخراج (ثانية بثانية) ===\\n`;
    block.querySelectorAll('tbody tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        out += `[${tds[0].innerText}]\\n- المشهد: ${tds[1].innerText}\\n- التعليق الصوتي: ${tds[2].innerText}\\n- المؤثرات: ${tds[3].innerText}\\n- على الشاشة: ${tds[4].innerText}\\n-------------------\\n`;
    });
    copyToClipboard(out);
}

function copyAllForGoogleDocs() {
    const clone = document.querySelector('.container').cloneNode(true);
    clone.querySelectorAll('.live-edit-bar, .nav-bar, .search-wrap, button').forEach(e => e.remove());
    copyToClipboard(clone.innerText);
}

function downloadUpdatedHTML() {
    const htmlContent = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'بنك_محتوى_SAWYAN.html';
    a.click();
    showToast('تم تحميل ملف HTML المحدث بكافة تعديلاتك ✓');
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('تم النسخ إلى الحافظة بنجاح ✓'));
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('تم النسخ إلى الحافظة بنجاح ✓');
    }
}

function showToast(msg) {
    const t = document.getElementById('toastMsg');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2600);
}
</script>
</body>
</html>'''

with open('tools/content-vault/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

with open('tools/living-docs/doc5_content_vault.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('Successfully built white-background, directly-editable Content Bank with unified scripts & storyboards!')
