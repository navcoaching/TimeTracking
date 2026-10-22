// Renders public/icons/icon.svg to PNG icons (192, 512) with Playwright + Chromium.
// Usage: node scripts/gen-icons.mjs   (requires `playwright` resolvable: npm i -D playwright, or a global install)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || '/usr/lib/node_modules/playwright'));
}

const svg = readFileSync(resolve('public/icons/icon.svg'), 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg.replace('width="512" height="512"', 'width="100%" height="100%"')}</div></body></html>`);
  const out = resolve(`public/icons/icon-${size}.png`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', out);
  await page.close();
}
await browser.close();
