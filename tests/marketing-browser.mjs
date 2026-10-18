// Isolated UI tests. Uses localhost:4100 + tests/fixtures/supabase.mjs on :4400.
// No real Supabase, Google OAuth, Gemini, or production requests are allowed.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PATH.split(delimiter).map(p => resolve(p, '../playwright/index.mjs')).find(existsSync);
if (!modulePath) throw new Error('Run with temporary Playwright: npx --offline --package=playwright -c "node tests/marketing-browser.mjs"');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const base = 'http://localhost:4100';
const errors = []; const external = []; const lpCalls = [];
mkdirSync('test-results', { recursive: true });
async function makeContext(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['localhost', '127.0.0.1'].includes(url.hostname) && ['4100', '4400'].includes(url.port)) return route.continue();
    external.push(url.origin); return route.abort();
  });
  context.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (/hydrated|hydration/i.test(m.text()) && m.type() === 'error') errors.push(m.text()); });
  });
  return context;
}
try {
  const context = await makeContext(); const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('request', r => { if (new URL(r.url()).port === '4400' || r.url().includes('/api/')) lpCalls.push(r.url()); });
  await page.goto(base); await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.m-hero-visual')).opacity === '1');
  await page.screenshot({ caret: 'initial', path: 'test-results/landing-desktop.png' });
  const graph = page.locator('.m-hero-visual');
  await graph.getByRole('button', { name: 'Wikiのつながりを見る', exact: true }).click();
  assert.equal(await graph.getByRole('button', { name: 'Wikiのつながりを見る', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.match(await graph.locator('.m-graph-caption').innerText(), /イベント運営マニュアル/);
  await graph.getByRole('button', { name: 'Issuesのつながりを見る', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal(await graph.locator('.m-node-wiki').evaluate(el => el.classList.contains('is-linked')), true);
  await graph.getByRole('button', { name: 'Handoffのつながりを見る', exact: true }).click();
  assert.match(await graph.locator('.m-graph-caption').innerText(), /次の担当者への引き継ぎ/);
  await page.getByRole('button', { name: 'Before バラバラ' }).click(); assert.equal(await page.locator('.m-compare.is-connected').count(), 0);
  await page.getByRole('button', { name: 'After つながる' }).click(); assert.equal(await page.locator('.m-compare.is-connected').count(), 1);
  await page.getByRole('tab', { name: 'Flow Map' }).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Handoff' }).getAttribute('aria-selected'), 'true');
  assert.match(await page.getByRole('tabpanel').innerText(), /次の人が、迷わない/);
  await page.keyboard.press('Home'); assert.equal(await page.getByRole('tab', { name: 'Issues' }).getAttribute('aria-selected'), 'true');
  for (const name of ['Wikiを関連付ける', 'Flow Mapで見る', '引き継ぎを作る', '内容を確認して受領']) await page.getByRole('button', { name, exact: true }).click();
  assert.match(await page.locator('.m-record-handoff').innerText(), /受領済み/);
  await page.screenshot({ caret: 'initial', path: 'test-results/landing-demo.png', fullPage: true });
  await page.getByRole('button', { name: 'もう一度体験する', exact: true }).click();
  assert.equal(await page.locator('.m-steps [aria-current=step]').innerText(), '01\n課題を見つける');
  assert.deepEqual(lpCalls, [], 'Landing/demo must not request backend APIs');
  await page.locator('.m-hero').getByRole('link', { name: /無料で始める/ }).click(); await page.waitForURL('**/signup');
  await page.getByLabel('表示名', { exact: true }).fill('UIテスト');
  await page.getByLabel('メールアドレス', { exact: true }).fill(`marketing-${Date.now()}@test.invalid`);
  await page.getByLabel('パスワード', { exact: true }).fill('Test-password-123');
  await page.getByRole('button', { name: 'パスワードを表示', exact: true }).click(); assert.equal(await page.locator('#auth-password').getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'パスワードを非表示', exact: true }).click(); assert.equal(await page.locator('#auth-password').getAttribute('type'), 'password');
  await page.getByRole('button', { name: '登録する', exact: true }).click(); await page.getByRole('status').waitFor();
  assert.match(await page.getByRole('status').innerText(), /確認メール/);
  await page.goto(base + '/login?next=%2Fapp%3Ffrom%3Dmarketing');
  await page.screenshot({ caret: 'initial', path: 'test-results/login-desktop.png' });
  // OAuth start is intercepted before leaving the isolated fixture. No provider login is completed.
  let oauth;
  await page.route('**/auth/v1/authorize**', async route => { oauth = new URL(route.request().url()); await route.fulfill({ contentType: 'text/html', body: '<p>Isolated Google OAuth start verified</p>' }); });
  await page.getByRole('button', { name: 'Googleでログイン', exact: true }).click(); await page.waitForURL('**/auth/v1/authorize**');
  assert.equal(oauth.searchParams.get('provider'), 'google');
  const callback = new URL(oauth.searchParams.get('redirect_to')); assert.equal(callback.origin, base); assert.equal(callback.pathname, '/auth/callback'); assert.equal(callback.searchParams.get('next'), '/app?from=marketing');
  await page.goto(base + '/signup?next=%2Fapp%3Ffrom%3Dmarketing');
  await page.getByRole('button', { name: 'Googleで登録', exact: true }).click(); await page.waitForURL('**/auth/v1/authorize**'); assert.equal(new URL(oauth.searchParams.get('redirect_to')).searchParams.get('next'), '/app?from=marketing');
  await page.goto(base + '/login'); await page.getByRole('button', { name: 'パスワードを忘れた方' }).click();
  await page.route('**/auth/v1/otp**', async route => { assert.equal(route.request().postDataJSON().create_user, false); await route.fulfill({ json: {} }); });
  await page.getByLabel('メールアドレス').fill('user1@test.invalid'); await page.getByRole('button', { name: 'リンクを送信' }).click(); await page.getByRole('status').waitFor();
  await page.getByRole('button', { name: 'パスワードでログイン' }).click();
  let releaseRequest; let passwordRequests = 0;
  const pendingRequest = new Promise(resolve => { releaseRequest = resolve; });
  const delayLogin = async route => { passwordRequests++; await pendingRequest; await route.continue(); };
  await page.route('**/auth/v1/token?grant_type=password', delayLogin);
  await page.getByLabel('パスワード', { exact: true }).fill('wrong-password'); await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await page.getByRole('button', { name: '処理中…', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '処理中…', exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('メールアドレス').isDisabled(), true);
  releaseRequest(); await page.getByRole('alert').waitFor(); assert.equal(passwordRequests, 1);
  await page.unroute('**/auth/v1/token?grant_type=password', delayLogin);
  await page.getByLabel('パスワード', { exact: true }).fill('Test-password-123'); await page.getByRole('button', { name: 'ログイン', exact: true }).click(); await page.waitForURL('**/app');
  await context.close();
  const mobile = await makeContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const phone = await mobile.newPage();
  await phone.goto(base); await phone.getByRole('button', { name: 'メニューを開く' }).click(); await phone.keyboard.press('Escape'); assert.equal(await phone.getByRole('button', { name: 'メニューを開く' }).getAttribute('aria-expanded'), 'false');
  await phone.getByRole('button', { name: 'メニューを開く' }).click(); await phone.locator('#marketing-nav').getByRole('link', { name: '機能紹介', exact: true }).click();
  assert.equal(await phone.getByRole('button', { name: 'メニューを開く' }).getAttribute('aria-expanded'), 'false');
  await phone.goto(base);
  await phone.waitForFunction(() => getComputedStyle(document.querySelector('.m-hero-visual')).opacity === '1');
  await phone.screenshot({ caret: 'initial', path: 'test-results/landing-mobile.png', fullPage: true });
  await phone.locator('.m-hero-visual').getByRole('button', { name: 'Wikiのつながりを見る', exact: true }).click();
  for (const path of ['/', '/login', '/signup']) { await phone.goto(base + path); assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Mobile overflow ${path}`); }
  await phone.waitForFunction(() => getComputedStyle(document.querySelector('.a-form-wrap')).opacity === '1');
  await phone.screenshot({ caret: 'initial', path: 'test-results/signup-mobile.png', fullPage: true }); await mobile.close();
  const reduced = await makeContext({ reducedMotion: 'reduce' }); const quiet = await reduced.newPage(); await quiet.goto(base);
  assert.equal(await quiet.locator('.m-edge-pulse').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  await quiet.locator('.m-hero-visual').getByRole('button', { name: 'Handoffのつながりを見る', exact: true }).click();
  await quiet.getByRole('button', { name: 'Wikiを関連付ける', exact: true }).click(); assert.ok(await quiet.locator('.m-record-link').isVisible());
  for (const width of [320, 390, 768, 1024, 1440]) {
    await quiet.setViewportSize({ width, height: 1000 }); await quiet.goto(base);
    assert.ok(await quiet.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `LP overflow at ${width}`);
    const overlap = await quiet.locator('.m-hero-visual .m-graph-canvas').evaluate(el => {
      const boxes = [...el.querySelectorAll('button')].map(n => ({ name: n.getAttribute('aria-label'), box: n.getBoundingClientRect() }));
      return boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1).map(b => `${a.name} / ${b.name}`));
    });
    assert.deepEqual(overlap, [], `Graph nodes overlap at ${width}`);
  }
  await reduced.close(); assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('Marketing browser tests passed: interactive graph, Before/After, keyboard tabs/nodes, 5-step demo, signup/CTA, password visibility, login/errors, intercepted Google/OTP initiation, mobile navigation/overflow, reduced motion. All auth data is isolated.');
} finally { await browser.close(); }
