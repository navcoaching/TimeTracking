// يرسل التقرير عبر Resend مع JSON مرفقاً، بثلاث محاولات، ويحفظ النتيجة (معرّف الرسالة أو سبب الفشل) في results/email.json.
// فشل البريد لا يمحو التقرير: الملفات محفوظة كـ artifact بغض النظر.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const dir = args.results ?? "results";
const key = process.env.RESEND_API_KEY, from = process.env.REPORT_EMAIL_FROM, to = process.env.REPORT_EMAIL_TO;
const NAME = process.env.PROJECT_NAME ?? "وقتي";
const save = (o) => writeFileSync(`${dir}/email.json`, JSON.stringify({ at: new Date().toISOString(), to, ...o }, null, 1));

if (!existsSync(`${dir}/report.html`)) { save({ status: "failed", reason: "no report.html" }); console.error("email: no report"); process.exit(0); }
if (!key || !from || !to) { save({ status: "skipped", reason: `missing ${!key ? "RESEND_API_KEY" : ""} ${!from ? "REPORT_EMAIL_FROM" : ""} ${!to ? "REPORT_EMAIL_TO" : ""}`.trim() }); console.log("email: skipped (secrets missing)"); process.exit(0); }

const report = JSON.parse(readFileSync(`${dir}/report.json`, "utf8"));
const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const subject = `[${NAME}] Weekly Security & Technical Audit – ${date}${report.status === "failed" ? " — FAILED" : report.status === "success-with-notes" ? " — notes" : ""}`;
const html = readFileSync(`${dir}/report.html`, "utf8");
const attachment = Buffer.from(JSON.stringify(report, null, 1)).toString("base64");

let last = "";
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, attachments: [{ filename: `audit-${date}.json`, content: attachment }] }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.id) { save({ status: "accepted", id: body.id, attempt, subject }); console.log(`email: accepted by Resend, id ${body.id}`); process.exit(0); }
    last = `${r.status} ${JSON.stringify(body).slice(0, 200)}`;
  } catch (e) { last = String(e.message ?? e); }
  console.log(`email: attempt ${attempt} failed: ${last}`);
  await new Promise((res) => setTimeout(res, 5000 * attempt));
}
save({ status: "failed", reason: last, subject });
console.error("email: all attempts failed");
process.exit(0);
