import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const dir = join(__dirname, 'temporary screenshots');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3];

const existing = existsSync(dir)
  ? readdirSync(dir).filter(f => /^screenshot-\d+/.test(f))
  : [];
let max = 0;
for (const f of existing) {
  const m = f.match(/^screenshot-(\d+)/);
  if (m) max = Math.max(max, parseInt(m[1]));
}
const n = max + 1;
const filename = label ? `screenshot-${n}-${label}.png` : `screenshot-${n}.png`;
const out = join(dir, filename);

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
// Default to mobile unless specified otherwise
const isMobile = !label || label === 'mobile-before' || label === 'mobile-after' || label.includes('mobile');
const viewport = isMobile ? { width: 375, height: 667 } : { width: 1440, height: 900 };
await page.setViewport(viewport);
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`Screenshot saved: ${out}`);
