const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 }
  });
  const page = await context.newPage();

  // コンソールエラーをキャプチャ
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('PAGE CONSOLE ERROR:', msg.text());
  });
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

  const filePath = 'file://' + path.resolve('/home/mokoshi/carte/bp-app.html');
  await page.goto(filePath, { waitUntil: 'networkidle' });

  // IDを入力
  await page.fill('#inp-patient-id', '001');

  // 「開始」ボタンをクリック
  await page.click('#btn-id-enter');

  // 新規患者モーダルが表示されるのを待つ
  await page.waitForSelector('#modal-new-patient', { state: 'visible' });
  console.log('モーダルが表示されました');

  // モーダルの内容を確認
  const modalTitle = await page.textContent('#modal-pid');
  console.log('PID:', modalTitle);

  // 名前を入力
  await page.fill('#modal-name', 'テスト太郎');
  await page.selectOption('#modal-gender', '男');
  await page.fill('#modal-birth', '1980-01-01');
  await page.fill('#modal-memo', 'テスト患者');

  // 登録ボタンをクリック
  console.log('登録ボタンクリック前');
  await page.click('#modal-ok');
  console.log('登録ボタンクリック後');

  // モーダルが閉じるか確認
  await page.waitForSelector('#modal-new-patient', { state: 'hidden' });
  console.log('モーダルが閉じました');

  // 画面遷移を待つ
  await page.waitForFunction(() => {
    const el = document.getElementById('screen-patient');
    return el && el.style.display !== 'none';
  }, { timeout: 10000 });

  console.log('患者画面が表示されました');

  // キャプチャ
  await page.screenshot({ path: '/tmp/bp-app-after-start.png', fullPage: true });
  console.log('キャプチャ保存完了');

  await browser.close();
})().catch(e => { console.error('エラー:', e); process.exit(1); });