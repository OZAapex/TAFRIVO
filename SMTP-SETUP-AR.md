# SMTP الخاص بـTAFRIVO — دليل إتمام الربط الآمن
هذه الملفات جاهزة للاستخدام، لكنها **لا تفعّل SMTP وحدها**. يجب إدخال بيانات الخدمة من لوحة Supabase بإذن صاحب الحساب.

## المزود الذي اخترناه: Brevo

1. افتح https://app.brevo.com/ وأنشئ حسابًا باسم TAFRIVO (أو استخدم حسابًا تجاريًا تملكه).
2. أضف عنوان مرسلًا تملكه، ووثّقه داخل Brevo. يفضّل نطاقًا خاصًا تملكه، مع إعداد SPF/DKIM حسب إرشادات مزوّد النطاق. لا تفترض أن نطاق github.io تابع لك أو أنك تستطيع إرسال البريد منه.
3. في Brevo افتح **SMTP & API → SMTP**، واحصل على `SMTP login` و`SMTP key` الخاصين بالحساب (لا تستخدم API key). لا تحفظ المفاتيح في GitHub أو ترسلها في الدردشة.
4. افتح Supabase → مشروع **TAFRIVO-production**:
   https://supabase.com/dashboard/project/trrwwmuixuvdhiotsnij/auth/smtp
   فعّل **Custom SMTP** واملأ:

| الحقل | القيمة |
| --- | --- |
| Sender name | TAFRIVO |
| Sender email | عنوانك الموثّق في Brevo؛ ليس عنوانًا افتراضيًا |
| Host | `smtp-relay.brevo.com` |
| Port | `587` (STARTTLS) |
| Username | قيمة SMTP login من حساب Brevo |
| Password | SMTP key من Brevo |

5. من Supabase → Authentication → URL Configuration:
   https://supabase.com/dashboard/project/trrwwmuixuvdhiotsnij/auth/url-configuration
   اضبط Site URL على `https://ozaapex.github.io/TAFRIVO/` وأضف نفس الرابط لقائمة Redirect URLs.
6. من Supabase → Authentication → Email Templates:
   https://supabase.com/dashboard/project/trrwwmuixuvdhiotsnij/auth/templates
   - **Confirm signup:** العنوان `TAFRIVO | تأكيد البريد الإلكتروني`؛ الصق محتوى `emails/confirm-signup.html`.
   - **Reset password:** العنوان `TAFRIVO | استعادة كلمة المرور`؛ الصق محتوى `emails/reset-password.html`.
   - لا تعدّل `{{ .ConfirmationURL }}`؛ فهي متغير Supabase الذي يحتوي رابط التأكيد/الاستعادة.
7. في Auth Providers تأكّد أن Email provider مفعّل، و **Confirm email** مفعّل.
8. جرّب بإيميل حقيقي غير حساب المدير:
   - إنشاء الحساب، وصول التأكيد، فتح رابط التأكيد، ثم تسجيل الدخول.
   - طلب «نسيت كلمة المرور»، واستلام الرابط، وتغيير كلمة المرور، ثم الدخول بالجديدة.
   - تقديم طلب مطعم، مراجعة المدير له، ثم إضافة منيو ونشره.
9. **بعد النجاح فقط** افتح من لوحة Super Admin زر «فتح التسجيل المباشر»؛ بقية التطبيق والتسجيل بدون حساب يعملان حتى ذلك الوقت.
10. راقب حدود الإرسال في Supabase وBrevo، وفعل الحماية من الروبوتات لواجهات Auth إذا لزم.

**مهم:** لا تستخدم Gmail أو بريد المدير كعنوان مرسل إلا إذا وافق مزود SMTP ونجحت عملية التحقق. لا تضع كلمة مرور الحساب الشخصي في خانة SMTP.
**الدفع:** يظل معطّلًا دائمًا إلى حين طلب مستقل بتفعيله.

المراجع:
- Supabase: https://supabase.com/docs/guides/auth/auth-smtp
- Brevo: https://developers.brevo.com/docs/supabase-smtp-integration
