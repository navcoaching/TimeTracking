// يجمع نتائج كل الأدوات في results/ إلى report.json + report.html (بلا أسرار أو بيانات شخصية).
//   node scripts/audit/report.mjs --results results --base https://businesstracking.netlify.app
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const dir = args.results ?? "results";
const base = args.base ?? process.env.SITE_URL ?? "";
const NAME = process.env.PROJECT_NAME ?? "وقتي";
const read = (f, fallback = null) => { try { return existsSync(`${dir}/${f}`) ? JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) : fallback; } catch { return fallback; } };
const text = (f) => (existsSync(`${dir}/${f}`) ? readFileSync(`${dir}/${f}`, "utf8") : "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SEV = ["critical", "high", "medium", "low", "informational"];
const norm = (s) => { s = String(s ?? "").toLowerCase(); return s === "moderate" ? "medium" : s === "info" ? "informational" : SEV.includes(s) ? s : "medium"; };

const meta = read("meta.json", {});
const commit = (() => { try { return execSync("git rev-parse HEAD").toString().trim(); } catch { return "unknown"; } })();
const findings = [];

// typecheck / build
const tc = process.env.TYPECHECK_OUTCOME ?? "unknown", bd = process.env.BUILD_OUTCOME ?? "unknown", ts = process.env.TEST_OUTCOME ?? "unknown";
if (ts === "failure") findings.push({ id: "tests", title: "فشل الاختبارات", severity: "high", tool: "vitest", component: "src/", detail: text("test.log").split("\n").filter((l) => /FAIL|✗|×/.test(l)).slice(0, 5).join("\n"), status: "open", action: "راجع سجل الاختبارات" });
if (tc === "failure") findings.push({ id: "typecheck", title: "فشل فحص الأنواع (typecheck)", severity: "high", tool: "tsc", component: "src/", detail: text("typecheck.log").split("\n").filter((l) => /error/.test(l)).slice(0, 5).join("\n"), status: "open", action: "راجع الأخطاء في سجل التشغيل" });
if (bd === "failure") findings.push({ id: "build", title: "فشل بناء الإنتاج", severity: "critical", tool: "vite build", component: "app", detail: text("build.log").split("\n").slice(-8).join("\n"), status: "open", action: "راجع سجل البناء" });

// npm audit
const audit = read("npm-audit.json", {});
for (const [name, v] of Object.entries(audit.vulnerabilities ?? {})) {
  const via = (v.via ?? []).find((x) => typeof x === "object");
  findings.push({ id: `npm:${name}`, title: `${name}: ${via?.title ?? "ثغرة في اعتمادية"}`, severity: norm(v.severity), tool: "npm audit", component: `${name}@${v.range}`, impact: via?.cwe?.join(", ") ?? "", ref: via?.url ?? "", fixAvailable: !!v.fixAvailable, status: v.fixAvailable ? "fixable" : "open", action: v.fixAvailable ? "npm audit fix ثم مراجعة طلب الدمج" : "لا إصلاح متاح بعد؛ متابعة Dependabot" });
}
// OSV
const osv = read("osv.json", {});
for (const r of osv.results ?? []) for (const p of r.packages ?? []) for (const vuln of p.vulnerabilities ?? []) {
  const sev = vuln.database_specific?.severity ?? vuln.severity?.[0]?.score ?? "medium";
  findings.push({ id: `osv:${vuln.id}`, title: `${p.package?.name}: ${vuln.summary ?? vuln.id}`, severity: norm(/CRITICAL/i.test(sev) ? "critical" : /HIGH/i.test(sev) ? "high" : /LOW/i.test(sev) ? "low" : "medium"), tool: "OSV-Scanner", component: `${p.package?.name}@${p.package?.version}`, ref: `https://osv.dev/vulnerability/${vuln.id}`, cve: (vuln.aliases ?? []).find((a) => a.startsWith("CVE-")) ?? "", status: "open", action: "تحديث الحزمة لإصدار مُصلح" });
}
// gitleaks
const leaks = read("gitleaks.json", []);
for (const l of Array.isArray(leaks) ? leaks : []) findings.push({ id: `leak:${l.Fingerprint ?? l.File}`, title: `سر محتمل في Git: ${l.RuleID}`, severity: "critical", tool: "gitleaks", component: `${l.File}:${l.StartLine} (${(l.Commit ?? "").slice(0, 7)})`, detail: "القيمة محجوبة", status: "open", action: "دوّر السر فوراً ثم نظّف التاريخ" });
// live
const live = read("live.json", { findings: [], checks: [] });
for (const f of live.findings ?? []) findings.push({ ...f, status: "open", action: f.action ?? "راجع الإعداد المذكور" });
// ZAP
const zap = read("zap.json", {});
for (const site of zap.site ?? []) for (const a of site.alerts ?? []) {
  const risk = ["informational", "low", "medium", "high"][Number(a.riskcode)] ?? "informational";
  if (risk === "informational") continue;
  findings.push({ id: `zap:${a.pluginid}`, title: a.name ?? a.alert, severity: risk, tool: "OWASP ZAP (baseline)", component: (a.instances ?? []).slice(0, 2).map((i) => i.uri?.replace(base, "")).join(", "), impact: String(a.desc ?? "").replace(/<[^>]+>/g, "").slice(0, 240), ref: a.reference?.split("\n")[0] ?? "", cwe: a.cweid, status: "open", action: String(a.solution ?? "").replace(/<[^>]+>/g, "").slice(0, 240) });
}
// autofix
const fix = read("autofix.json", { attempted: false });
if (fix.dependencies?.length) for (const f of findings) if (f.tool === "npm audit" && fix.verified && fix.merged) f.status = "fixed";

const counts = Object.fromEntries(SEV.map((s) => [s, findings.filter((f) => f.severity === s).length]));
const fixed = findings.filter((f) => f.status === "fixed").length;
const open = findings.length - fixed;
const prev = read("previous.json");
const toolsFailed = [tc, bd, ts].includes("failure");
const emailSkipped = false;
const status = findings.some((f) => f.severity === "critical" && f.status !== "fixed") || toolsFailed ? "failed" : open > 0 || !existsSync(`${dir}/zap.json`) ? "success-with-notes" : "success";
const infra = {
  checks: `${live.passed ?? 0}/${live.total ?? 0} فحصاً حياً`, typecheck: tc, build: bd,
  tls: (live.checks ?? []).filter((c) => c.id.startsWith("tls")).map((c) => `${c.title}: ${c.passed ? "✓" : "✗"} ${c.detail}`).join(" · ") || "لم يُفحص",
  domain: (live.checks ?? []).filter((c) => ["http-301", "www-redirect"].includes(c.id)).map((c) => `${c.title}: ${c.passed ? "✓" : "✗"}`).join(" · "),
  deploy: "فحص قراءة فقط: لا يعدّل الكود ولا ينشر",
  backup: "البيانات على أجهزة المستخدمين (IndexedDB)؛ النسخ الاحتياطي بالتصدير من الإعدادات",
  versions: { osv: text("osv-version.txt").trim().split("\n")[0], gitleaks: text("gitleaks-version.txt").trim(), zap: (text("zap.log").match(/ZAP version[^\n]*/i) ?? [""])[0] },
};
const report = { generatedAt: new Date().toISOString(), startedAt: meta.startedAt, runUrl: meta.runUrl, event: meta.event, commit, base, status, counts, total: findings.length, fixed, open, previous: prev ? { total: prev.total, open: prev.open, generatedAt: prev.generatedAt, counts: prev.counts } : null, findings, autofix: fix, infra };
writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 1));

const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const badge = { critical: "#b91c1c", high: "#c2410c", medium: "#a16207", low: "#1d4ed8", informational: "#4b5563" };
const row = (f) => `<tr><td><b>${esc(f.title)}</b><br><small>${esc(f.tool)} · ${esc(f.component ?? "")}${f.cve ? " · " + esc(f.cve) : ""}</small>${f.detail ? `<br><small style="color:#555">${esc(f.detail).slice(0, 300)}</small>` : ""}${f.impact ? `<br><small>الأثر: ${esc(f.impact)}</small>` : ""}</td><td><span style="background:${badge[f.severity]};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px">${f.severity}</span></td><td>${esc(f.status)}</td><td><small>${esc(f.action ?? "")}${f.ref ? `<br><a href="${esc(f.ref)}">مرجع</a>` : ""}</small></td></tr>`;
const deps = (fix.dependencies ?? []).map((d) => `<li><code>${esc(d.pkg)}</code>: ${esc(d.from)} → ${esc(d.to)}</li>`).join("");
const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(NAME)} Weekly Audit ${date}</title></head>
<body style="font-family:Segoe UI,Tahoma,Arial,sans-serif;max-width:860px;margin:auto;padding:20px;color:#111;line-height:1.6">
<h1 style="font-size:22px">[${esc(NAME)}] Weekly Security &amp; Technical Audit – ${date}</h1>
<p><b>الحالة:</b> <span style="background:${status === "success" ? "#15803d" : status === "failed" ? "#b91c1c" : "#a16207"};color:#fff;padding:2px 10px;border-radius:10px">${status === "success" ? "ناجحة" : status === "failed" ? "فاشلة" : "ناجحة مع ملاحظات"}</span>
&nbsp; <b>الموقع:</b> ${esc(base)} &nbsp; <b>الإصدار:</b> <code>${commit.slice(0, 7)}</code> &nbsp; <b>بدأ:</b> ${esc(meta.startedAt ?? "")} (UTC) &nbsp; <b>المصدر:</b> ${esc(meta.event ?? "")}</p>
<h2 style="font-size:17px">الملخص التنفيذي</h2>
<table border="1" cellpadding="6" style="border-collapse:collapse"><tr>${SEV.map((s) => `<th style="background:${badge[s]};color:#fff">${s}</th>`).join("")}<th>المجموع</th><th>أُصلح وتحقق</th><th>متبقٍ</th></tr>
<tr>${SEV.map((s) => `<td align="center">${counts[s]}</td>`).join("")}<td align="center">${findings.length}</td><td align="center">${fixed}</td><td align="center">${open}</td></tr></table>
<p><b>مقارنة بالفحص السابق:</b> ${prev ? `${prev.total} مشكلة (${prev.open} متبقية) في ${esc(String(prev.generatedAt).slice(0, 10))} ← الآن ${findings.length} (${open} متبقية)` : "لا فحص سابق متاح للمقارنة"}</p>
<h2 style="font-size:17px">تفاصيل المشاكل (${findings.length})</h2>
${findings.length ? `<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>المشكلة</th><th>الخطورة</th><th>الحالة</th><th>الإجراء</th></tr>${findings.sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity)).map(row).join("")}</table>` : "<p>لا مشاكل مكتشفة.</p>"}
<h2 style="font-size:17px">سجل التغييرات</h2>
<ul><li>الفحص والبناء على الإصدار الحالي: typecheck ${esc(tc)} · build ${esc(bd)} · tests ${esc(ts)}</li>
<li>النشر والتراجع: ${esc(infra.deploy)}</li>
<li>سجل التشغيل: <a href="${esc(meta.runUrl ?? "")}">${esc(meta.runUrl ?? "")}</a></li></ul>
<h2 style="font-size:17px">المشاكل غير المحلولة</h2>
${open ? `<ul>${findings.filter((f) => f.status !== "fixed").map((f) => `<li><b>${esc(f.title)}</b> (${f.severity}) — ${esc(f.action ?? "يحتاج مراجعة")}${["critical", "high"].includes(f.severity) ? " — <b>يتطلب تدخلاً بشرياً</b>" : ""}</li>`).join("")}</ul>` : "<p>لا شيء.</p>"}
<h2 style="font-size:17px">حالة البنية التحتية</h2>
<ul><li>الفحوص الحية: ${esc(infra.checks)}</li><li>النطاق: ${esc(infra.domain)}</li><li>TLS: ${esc(infra.tls)}</li><li>النشر: ${esc(infra.deploy)}</li><li>النسخ الاحتياطي: ${esc(infra.backup)}</li>
<li>الأدوات: npm audit · ${esc(infra.versions.osv || "OSV-Scanner (لم يعمل)")} · ${esc(infra.versions.gitleaks || "gitleaks (لم يعمل)")} · ${esc(infra.versions.zap || "ZAP (لم يعمل)")}</li></ul>
<p style="color:#666;font-size:12px">تقرير آلي من GitHub Actions. لا يحوي أسراراً ولا بيانات شخصية. JSON مرفق.</p></body></html>`;
writeFileSync(`${dir}/report.html`, html);
console.log(`report: ${status} | ${findings.length} findings (${JSON.stringify(counts)}) | fixed ${fixed} | open ${open}`);
