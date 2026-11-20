const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function scrapePage(url, site) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const title = await page.title();
    console.log(`[${site}] title: ${title}`);

    // __NEXT_DATA__ 추출 시도
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (el) return JSON.parse(el.textContent);
      return null;
    });

    if (nextData) {
      console.log(`[${site}] Found __NEXT_DATA__`);
    }

    // DOM에서 상품 추출
    const products = await page.evaluate((siteName) => {
      const items = [];

      if (siteName === 'musinsa') {
        // 무신사 신상품 셀렉터들
        const candidates = [
          ...document.querySelectorAll('li[data-no]'),
          ...document.querySelectorAll('[class*="goods_li"]'),
          ...document.querySelectorAll('[class*="GoodsItem"]'),
          ...document.querySelectorAll('[class*="product-item"]'),
        ];

        const seen = new Set();
        candidates.forEach(el => {
          const link = el.querySelector('a[href*="/goods/"], a[href*="/app/goods/"]');
          const img = el.querySelector('img');
          const nameEl = el.querySelector('[class*="goods_name"], [class*="goodsName"], [class*="name"]');
          if (!link || seen.has(link.href)) return;
          seen.add(link.href);
          items.push({
            id: el.getAttribute('data-no') || Math.random().toString(36).slice(2),
            site: 'musinsa',
            name: nameEl ? nameEl.innerText.trim() : el.innerText.split('\n')[0].trim(),
            brand: '',
            price: 0,
            imageUrl: img ? (img.src || img.dataset.src || img.dataset.lazySrc) : null,
            productUrl: link.href.startsWith('http') ? link.href : 'https://www.musinsa.com' + link.href,
          });
        });

      } else if (siteName === 'cm29') {
        const candidates = [
          ...document.querySelectorAll('[class*="ProductCard"]'),
          ...document.querySelectorAll('[class*="product_card"]'),
          ...document.querySelectorAll('[class*="ItemCard"]'),
          ...document.querySelectorAll('a[href*="/product/detail"]'),
        ];

        const seen = new Set();
        candidates.forEach(el => {
          const link = el.tagName === 'A' ? el : el.querySelector('a[href*="/product"]');
          const img = el.querySelector('img');
          const nameEl = el.querySelector('[class*="name"], [class*="Name"], p');
          if (!link || seen.has(link.href)) return;
          seen.add(link.href);
          items.push({
            id: Math.random().toString(36).slice(2),
            site: 'cm29',
            name: nameEl ? nameEl.innerText.trim() : '',
            brand: '',
            price: 0,
            imageUrl: img ? (img.src || img.dataset.src) : null,
            productUrl: link.href.startsWith('http') ? link.href : 'https://www.29cm.co.kr' + link.href,
          });
        });
      }

      return items.filter(i => i.name).slice(0, 40);
    }, site);

    console.log(`[${site}] Found ${products.length} products`);
    await browser.close();
    return products;

  } catch (e) {
    console.error(`[${site}] Error:`, e.message);
    await browser.close();
    return [];
  }
}

async function main() {
  console.log('Starting scraper...');

  const [musinsa, cm29] = await Promise.all([
    scrapePage('https://www.musinsa.com/app/items/lists?category_code=&sort=new&page=1', 'musinsa'),
    scrapePage('https://www.29cm.co.kr/home/new', 'cm29'),
  ]);

  const all = [...musinsa, ...cm29];
  console.log(`Total: ${musinsa.length} from Musinsa, ${cm29.length} from 29CM`);

  if (!fs.existsSync('data')) fs.mkdirSync('data');
  fs.writeFileSync('data/products.json', JSON.stringify({ updatedAt: new Date().toISOString(), items: all }, null, 2));
  console.log('Saved!');
}

main();
