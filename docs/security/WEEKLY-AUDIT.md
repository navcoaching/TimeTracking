# الفحص الأمني الأسبوعي («وقتي»)

- **متى:** كل سبت 05:00 بتوقيت الرياض، أو يدويًا من Actions ← Weekly Security Audit ← Run workflow.
- **قراءة فقط:** لا يعدّل الكود ولا ينشر.
- **ماذا يفحص:** ثغرات الاعتماديات (npm audit + OSV)، أسرار في تاريخ Git (Gitleaks)، typecheck والاختبارات والبناء، والتطبيق المنشور (الرد، ترويسات الأمان، HTTPS، ملفات العمل بدون اتصال، XSS منعكس، تسرب أخطاء، شهادة TLS)، وفحص OWASP ZAP السلبي.
- **النتائج:** artifact باسم `audit-results` (90 يومًا) فيه `report.html` و`report.json`. البريد يُرسل فقط إذا أُضيفت الأسرار `RESEND_API_KEY` و`REPORT_EMAIL_FROM` و`REPORT_EMAIL_TO`.

## أول نتيجة متوقعة
التطبيق يُرفع يدويًا بدون `netlify.toml`، فما عليه ترويسات أمان: Content-Security-Policy وX-Frame-Options وX-Content-Type-Options وReferrer-Policy. الفحص سيُظهرها كملاحظات حتى يُربط النشر بالمستودع ويُضاف ملف إعدادات.
