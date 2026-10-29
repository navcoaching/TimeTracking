// فحوص قراءة فقط على التطبيق المنشور (طلب واحد في كل مرة): الرد، الترويسات، التحويل لـ HTTPS، ملفات PWA، XSS منعكس، تسرب الأخطاء، شهادة TLS.
//   node scripts/audit/live-check.mjs --base https://businesstracking.netlify.app --out results/live.json
import { writeFileSync } from "node:fs";
import tls from "node:tls";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const base = String(args.base ?? process.env.SITE_URL ?? "").replace(/\/$/, "");
if (!base) { console.error("live-check: --base is required"); process.exit(1); }
const out = args.out ?? "results/live.json";
const host = new URL(base).host;
const findings = [];
const checks = [];
const ok = (id, passed, title, detail = "", severity = "medium") => { checks.push({ id, passed, title, detail }); if (!passed) findings.push({ id, title, severity, detail, tool: "live-check", component: base }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path, init = {}) {
  await sleep(250);
  const t0 = Date.now();
  try {
    const r = await fetch(path.startsWith("http") ? path : `${base}${path}`, { redirect: "manual", headers: { "user-agent": "weekly-audit/1 (+read-only)" }, signal: AbortSignal.timeout(20000), ...init });
    return { r, ms: Date.now() - t0, text: async () => (await r.text()).slice(0, 400000) };
  } catch (e) { return { r: null, ms: Date.now() - t0, error: String(e.message ?? e), text: async () => "" }; }
}

// 1) الصفحة والترويسات
const home = await get("/");
const h = (k) => home.r?.headers.get(k) ?? "";
ok("home-200", home.r?.status === 200, "التطبيق يرد 200", `status ${home.r?.status ?? home.error}`, "critical");
ok("hsts", /max-age=\d{7,}/.test(h("strict-transport-security")), "HSTS", h("strict-transport-security") || "مفقود", "high");
ok("csp", h("content-security-policy").includes("default-src"), "Content-Security-Policy", h("content-security-policy").slice(0, 80) || "مفقود", "medium");
ok("frame", /frame-ancestors/.test(h("content-security-policy")) || !!h("x-frame-options"), "frame-ancestors / X-Frame-Options", "", "medium");
ok("nosniff", h("x-content-type-options") === "nosniff", "X-Content-Type-Options", h("x-content-type-options") || "مفقود", "low");
ok("referrer", /strict-origin|no-referrer/.test(h("referrer-policy")), "Referrer-Policy", h("referrer-policy") || "مفقود", "low");
ok("home-speed", (home.ms ?? 99999) < 4000, "زمن الاستجابة < 4 ث", `${home.ms} ms`, "low");

// 2) HTTP → HTTPS
const http = await get(base.replace("https://", "http://") + "/");
ok("http-301", !!http.r && [301, 308].includes(http.r.status) && (http.r.headers.get("location") ?? "").startsWith("https://"), "HTTP → HTTPS", `${http.r?.status ?? http.error}`, "high");

// 3) التطبيق يشتغل بدون اتصال: البيان وعامل الخدمة
const html = await home.text();
const manifest = (html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/) ?? [])[1];
if (manifest) { const m = await get(manifest.startsWith("/") ? manifest : `/${manifest}`); ok("manifest", m.r?.status === 200, "ملف بيان التطبيق (manifest) متاح", `${manifest} → ${m.r?.status}`, "low"); }
const sw = await get("/sw.js");
ok("service-worker", sw.r?.status === 200, "عامل الخدمة متاح (العمل بدون اتصال)", `/sw.js → ${sw.r?.status}`, "low");

// 4) XSS منعكس وتسرب الأخطاء
const payload = "<svg/onload=alert(1)>";
for (const p of [`/?q=${encodeURIComponent(payload)}`, `/${encodeURIComponent(payload)}`]) {
  const body = await (await get(p)).text();
  ok(`xss:${p.slice(0, 6)}`, !body.includes(payload), `لا XSS منعكس (${p.slice(0, 12)})`, "", "high");
  ok(`leak:${p.slice(0, 6)}`, !/at \w+ \(|node_modules\/|Error: /.test(body), `لا تسرب أخطاء (${p.slice(0, 12)})`, "", "medium");
}

// 5) شهادة TLS
await new Promise((resolve) => {
  const s = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
    const c = s.getPeerCertificate();
    const daysLeft = Math.floor((new Date(c.valid_to) - Date.now()) / 864e5);
    ok("tls-valid", s.authorized, "شهادة TLS صالحة", s.authorizationError ? String(s.authorizationError) : `issuer ${c.issuer?.O ?? "?"}`, "critical");
    ok("tls-days", daysLeft > 14, "الشهادة تنتهي بعد أكثر من 14 يوماً", `${daysLeft} يوماً`, "high");
    s.end(); resolve();
  });
  s.on("error", (e) => { ok("tls-valid", false, "شهادة TLS صالحة", String(e.message), "critical"); resolve(); });
  s.on("timeout", () => { ok("tls-valid", false, "اتصال TLS", "timeout", "critical"); s.destroy(); resolve(); });
});

const summary = { base, checkedAt: new Date().toISOString(), passed: checks.filter((c) => c.passed).length, total: checks.length, checks, findings };
writeFileSync(out, JSON.stringify(summary, null, 1));
console.log(`live-check: ${summary.passed}/${summary.total} passed, ${findings.length} findings`);
for (const f of findings) console.log(`  ✗ [${f.severity}] ${f.title} ${f.detail ?? ""}`);
