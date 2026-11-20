const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const PROXY_USER = process.env.PROXY_USER;
const PROXY_PASS = process.env.PROXY_PASS;

const PROXIES = [
  '45.38.107.97:6014',
  '64.137.96.74:6641',
  '198.23.243.226:6361',
  '38.154.185.97:6370',
  '84.247.60.125:6095',
];

async function scrapeProducts(url, site) {
  const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
  console.log(`[${site}] Using proxy: ${proxy}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--proxy-server=http://${proxy}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();
  await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`[${site}] Title: ${pageTitle}`);
    console.log(`[${site}] URL: ${pageUrl}`);

    // 페이지 HTML 일부 확인
    const bodyText = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
    console.log(`[${site}] Body preview: ${bodyText}`);

    const products = await page.evaluate((siteName) => {
      const items = [];

      if (siteName === 'musinsa') {
        // 여러 선택자 시도
        const selectors = [
          'li[data-no]',
          '[class*="goods_li"]',
          '[class*="goodsItem"]',
          '[class*="product-item"]',
          '[class*="GoodsItem"]',
          'ul.goods_list li',
          '.list_goods li',
        ];

        let found = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            console.log('Found with selector:', sel, 'count:', els.length);
            found = els;
            break;
          }
        }

        if (found) {
          found.forEach(el => {
            const img = el.querySelector('img');
            const nameEl = el.querySelector('[class*="goodsName"], [class*="goods_name"], [class*="product_name"], h3, h4, [class*="name"]');
            const brandEl = el.querySelector('[class*="brandName"], [class*="brand_name"], [class*="brand"]');
            const priceEl = el.querySelector('[class*="price"]');
            const linkEl = el.querySelector('a');
            const id = el.getAttribute('data-no') || el.getAttribute('data-id');
            if (nameEl && linkEl) {
              items.push({
                id: id || Math.random().toString(36).slice(2),
                site: 'musinsa',
                name: nameEl.innerText.trim(),
                brand: brandEl ? brandEl.innerText.trim() : '',
                price: priceEl ? parseInt(priceEl.innerText.replace(/[^0-9]/g, '')) : 0,
                imageUrl: img ? (img.src || img.dataset.src) : null,
                productUrl: linkEl.href,
              });
            }
          });
        }

      } else if (siteName === 'cm29') {
        const selectors = [
          '[class*="ProductCard"]',
          '[class*="product_item"]',
          '[class*="product-item"]',
          '[class*="ItemCard"]',
          '[class*="item_card"]',
          'article',
        ];

        let found = null;
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            found = els;
            break;
          }
        }

        if (found) {
          found.forEach(el => {
            const img = el.querySelector('img');
            const nameEl = el.querySelector('[class*="product_name"], [class*="ProductName"], [class*="item_name"], [class*="name"], p, span');
            const brandEl = el.querySelector('[class*="brand"]');
            const priceEl = el.querySelector('[class*="price"]');
            const linkEl = el.querySelector('a');
            if (nameEl && linkEl) {
              items.push({
                id: Math.random().toString(36).slice(2),
                site: 'cm29',
                name: nameEl.innerText.trim(),
                brand: brandEl ? brandEl.innerText.trim() : '',
                price: priceEl ? parseInt(priceEl.innerText.replace(/[^0-9]/g, '')) : 0,
                imageUrl: img ? (img.src || img.dataset.src) : null,
                productUrl: linkEl.href.startsWith('http') ? linkEl.href : 'https://www.29cm.co.kr' + linkEl.href,
              });
            }
          });
        }
      }

      return items.slice(0, 50);
    }, site);

    console.log(`[${site}] Found ${products.length} products`);
    await browser.close();
    return products;
  } catch (e) {
    await browser.close();
    console.error(`Error scraping ${site}:`, e.message);
    return [];
  }
}

async function main() {
  console.log('Starting scraper...');

  const [musinsa, cm29] = await Promise.all([
    scrapeProducts('https://www.musinsa.com/app/items/lists?category_code=&sort=new&page=1', 'musinsa'),
    scrapeProducts('https://www.29cm.co.kr/home/new', 'cm29'),
  ]);

  const all = [...musinsa, ...cm29];
  console.log(`Got ${musinsa.length} from Musinsa, ${cm29.length} from 29CM`);

  if (!fs.existsSync('data')) fs.mkdirSync('data');
  fs.writeFileSync('data/products.json', JSON.stringify({ updatedAt: new Date().toISOString(), items: all }, null, 2));
  console.log('Saved!');
}

main();
