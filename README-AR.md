# TAFRIVO — GitHub Pages / Supabase

## الحالة بتاريخ 12 نوفمبر 2026
- مشروع Supabase: `TAFRIVO-production` (`trrwwmuixuvdhiotsnij`) في `eu-central-1` — Frankfurt.
- حساب المدير: تم تفعيل `super_admin` في قاعدة البيانات؛ لم ننشر المستودع أو نختبر دخول الموقع المنشور بعد.
- **لا تضع** Secret API key أو service_role أو كلمة مرور قاعدة البيانات في المستودع. `config.js` فيه Publishable key فقط، وهذا طبيعي لتطبيق المتصفح.
- لا تزال خدمة البريد الافتراضية في Supabase محدودة، وإعداد SMTP مطلوب قبل فتح التسجيل للعامة.

## النشر على GitHub Pages
1. افتح https://github.com/new وأنشئ مستودعًا منفصلًا مثل `TAFRIVO` على حساب GitHub الذي ستستضيف عليه (لا تستعمل مستودع MISHRADAR).
2. استخرج ملف ZIP وارفع **محتوياته** إلى **جذر** مستودع TAFRIVO عبر **Add file → Upload files**. تأكد وجود `index.html` في الجذر وليس داخل مجلد إضافي.
3. من المستودع → Settings → Pages → Build and deployment → Source: `Deploy from a branch` → Branch: `main` → Folder: `/(root)` → Save.
4. ستجد رابطًا من صيغة `https://USERNAME.github.io/TAFRIVO/` (استعمل رابطك الفعلي، هذا مثال فقط).
5. افتح https://supabase.com/dashboard/project/trrwwmuixuvdhiotsnij/auth/url-configuration
   - **Site URL**: الرابط الفعلي لـ GitHub Pages بنفس الشرطة المائلة النهائية.
   - **Redirect URLs**: أضف الرابط الفعلي نفسه.
   - لا تستخدم `localhost` كرابط موقع في الإنتاج.
6. سجّل دخولك على الموقع بالإيميل وكلمة المرور اللذين أنشأتهما في Supabase. ادخل على `#app` من الواجهة. لازم تظهر **لوحة المدير**.
7. قبل السماح للمطاعم بالتسجيل: اضبط SMTP في Supabase → Authentication → SMTP Settings، وجرب البريد، وسجل مطعمًا اختباريًا من حساب مختلف ووافق عليه، ثم أنشئ قسمًا وأكلة وجرّب نشر المنيو ورمز QR.
8. راجع https://supabase.com/dashboard/project/trrwwmuixuvdhiotsnij/auth/providers و https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection لتقوية إعدادات كلمات المرور (ظهرت ملاحظة أمنية تخص حماية كلمات المرور المسرّبة).

## صلاحيات النظام
- الزائر: يرى المنيو المنشور لمطعم موافق عليه.
- المطعم الجديد: يظل Pending إلى أن يوافق Super Admin.
- المطعم الموافق عليه: يقدر يعدّل مطعمه وقائمته فقط.
- Super Admin: يرى المطاعم ويتخذ قرارات الموافقة/الرفض/التوقيف.
- الحماية الأساسية تتم عبر RLS في Supabase، وليس بمجرد إخفاء الأزرار.

## ملاحظات
- ملفات الموقع static، ولا تحتاج إلى Node أو build لتعمل على GitHub Pages.
- رابط المنيو مبني على `#menu/restaurant-slug` لذا يعمل مع GitHub Pages دون خادم خاص.
- زر واتساب يُحضّر رسالة الطلب، ولا يوجد نظام دفع حقيقي أو تكامل مع المطبخ في النسخة الحالية.
- لا تفتح التسجيل للجمهور قبل اختبار SMTP، الإعدادات، الأمان، وسياسة الخصوصية.
