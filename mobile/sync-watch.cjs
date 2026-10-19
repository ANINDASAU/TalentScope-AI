const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'true', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const t0 = Date.now();
  page.on('console', m => {
    const x = m.text();
    if (x.includes('[SYNC]')) console.log(`+${((Date.now() - t0) / 1000).toFixed(1)}s`, x.slice(0, 120));
  });
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const has = async (t) => (await page.evaluate(() => document.body.innerText)).includes(t);
  const waitForText = async (t, timeout = 25000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await has(t)) return true; await wait(700); }
    return false;
  };
  const clickP = async (l) => {
    await page.evaluate((x) => {
      const els = [...document.querySelectorAll('div[role="button"],div,span')];
      els.reverse().find(e => e.textContent.trim().startsWith(x) && e.offsetParent !== null)?.click();
    }, l);
    await wait(2500);
  };
  const clickExact = async (l) => {
    await page.evaluate((x) => {
      const els = [...document.querySelectorAll('div[role="button"],div,span')];
      els.reverse().find(e => e.textContent.trim() === x && e.offsetParent !== null)?.click();
    }, l);
    await wait(2000);
  };

  await page.goto('http://localhost:8081', { waitUntil: 'networkidle2', timeout: 180000 });
  await waitForText('SignUp / Login');
  await clickP('SignUp / Login'); await wait(2500);
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null);
    const set = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (inputs[0]) set(inputs[0], '+919999000011');
    if (inputs[1]) set(inputs[1], 'secret123');
  });
  await clickP('Login'); await waitForText('Athlete Overview');
  console.log('+login done');
  await clickP('Assess'); await wait(4000);

  console.log('-- going OFFLINE, save one --');
  await page.setOfflineMode(true); await wait(3000);
  await clickExact('RECORD'); await wait(2000);
  await clickExact('STOP'); await wait(4500);
  const q1 = await page.evaluate(() => JSON.parse(localStorage.getItem('talentscope.offline.assessments.v1') || '[]'));
  console.log('-- queue after offline save:', q1.length, 'status:', q1.map(x => x.syncStatus).join(','));

  console.log('-- BACK ONLINE — watching engine --');
  await page.setOfflineMode(false);
  await wait(60000); // watch for a full minute (covers periodic sweep too)
  const q2 = await page.evaluate(() => JSON.parse(localStorage.getItem('talentscope.offline.assessments.v1') || '[]'));
  console.log('-- final queue:', q2.map(x => `${x.syncStatus}${x.serverId ? '+srv' : ''}(rc${x.retryCount})`).join(', '));
  await browser.close();
})().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
