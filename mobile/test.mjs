import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request =>
    console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText)
  );

  console.log('Navigating...');
  try {
    await page.goto('http://127.0.0.1:8081', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    console.log('Navigation error:', e);
  }
  
  await new Promise(r => setTimeout(r, 4000));
  
  const content = await page.content();
  console.log('Body length:', content.length);
  const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML.length);
  console.log('Root div innerHTML length:', rootHtml);

  await browser.close();
})();
