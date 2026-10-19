const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:5000/api';
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'true', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push('[PAGEERROR] ' + e.message.slice(0, 150)));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const text = () => page.evaluate(() => document.body.innerText);
  const has = async (t) => (await text()).includes(t);
  const clickP = async (label) => {
    await page.evaluate((l) => {
      const els = [...document.querySelectorAll('div[role="button"],div,span')];
      els.reverse().find(e => e.textContent.trim().startsWith(l) && e.offsetParent !== null)?.click();
    }, label);
    await wait(2500);
  };

  console.log('[1] Coach login → Demo Athlete overview history');
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle2', timeout: 180000 });
  await wait(14000);
  await clickP('SignUp / Login'); await wait(2500);
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null);
    const set = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (inputs[0]) set(inputs[0], '+910000000101');
    if (inputs[1]) set(inputs[1], 'coach123');
  });
  await clickP('Login'); await wait(8000);
  await clickP('View Athletes'); await wait(4000);
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('div[role="button"],div')];
    const el = els.reverse().find(e => e.textContent.includes('Demo Athlete') && e.offsetParent !== null && e.textContent.length < 1200);
    if (el) el.click();
  });
  await wait(7000);
  const t = await text();
  const histIdx = t.indexOf('Assessment History');
  const histSection = t.slice(histIdx);
  console.log('  hint shown:', histSection.includes('Tap an assessment'));
  console.log('  entries show sport+test+date:', (histSection.match(/Athletics • [a-z_ ]+ •/gi) || []).length >= 3);
  console.log('  metrics line (m/s / kW/kg):', histSection.includes('m/s') || histSection.includes('kW/kg'));
  console.log('  injury risk pills:', (histSection.match(/LOW|MODERATE|HIGH/g) || []).length >= 3);
  console.log('  status chips incl FAILED + PROCESSING:', histSection.includes('FAILED'), histSection.includes('PROCESSING'));
  console.log('  non-completed rows explain state:', histSection.includes('Processing — results pending') && histSection.includes('Analysis failed — no results recorded'));

  console.log('[2] Drill-down on completed assessment');
  // Click first row containing TS-903-CMJ (completed)
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter(d =>
      d.textContent.includes('TS-903-CMJ') && d.textContent.includes('COMPLETED') &&
      !d.textContent.includes('Assessment History') && d.offsetParent !== null);
    const deepest = rows.sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (deepest) deepest.click();
  });
  await wait(7000);
  const t2 = await text();
  console.log('  opened AnalysisResults for TS-903-CMJ:', t2.includes('#TS-903-CMJ'));
  console.log('  full details rendered:', t2.includes('OVERALL PERFORMANCE') && t2.includes('DETAILED BIOMETRICS'));
  console.log('  score 92:', /\b92\b/.test(t2));

  console.log('[3] Unauthorized drill-down blocked at API');
  const l = await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+910000000102', password: 'coach123' }) })).json();
  // find one of demo's assessment ids via vance's overview
  const lv = await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+910000000101', password: 'coach123' }) })).json();
  const ov = await (await fetch(`${BASE}/coaches/me/athletes/6a8a7d50a7e5ff7b76826544/overview`, { headers: { Authorization: `Bearer ${lv.token}` } })).json();
  const someId = ov.data.history[0]._id;
  const elenaTry = await fetch(`${BASE}/assessments/${someId}`, { headers: { Authorization: `Bearer ${elena.token}` } });
  console.log(`  Elena GET /assessments/${someId.slice(-6)}… →`, elenaTry.status === 403 ? '403 BLOCKED' : elenaTry.status);
  const elenaHist = await fetch(`${BASE}/coaches/me/athletes/${demoIdOrPlaceholder()}/assessments`, { headers: { Authorization: `Bearer ${elena.token}` } }).catch(r => r);
  function demoIdOrPlaceholder() { return '6a8a7d50a7e5ff7b76826544'; }
  console.log('  Elena coach-history route →', elenaHist.status === 403 ? '403 BLOCKED' : elenaHist.status);

  console.log('[ERRORS]', errors.length ? errors.slice(0, 6).join(' | ') : 'none');
  await browser.close();
})().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
