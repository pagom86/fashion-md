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

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);

    const products = await page.evaluate((siteName) => {
      const items = [];
      if (siteName === 'musinsa') {
        document.querySelectorAll('[class*="goods_li"], [class*="goodsItem"], li[data-no]').forEach(el => {
          const img = el.querySelector('img');
          const name = el.querySelector('[class*="goodsName"], [class*="goods_name"]');
          const brand = el.querySelector('[class*="brandName"], [class*="brand_name"]');
          const price = el.querySelector('[class*="price"]');
          const link = el.querySelector('a');
          const id = el.getAttribute('data-no') || el.getAttribute('data-id');
          if (name && link) {
            items.push({
              id: id || Math.random().toString(),
              site: 'musinsa',
              name: name.innerText.trim(),
              brand: brand ? brand.innerText.trim() : '',
              price: price ? parseInt(price.innerText.replace(/[^0-9]/g, '')) : 0,
              imageUrl: img ? img.src : null,
              productUrl: link.href,
            });
          }
        });
      } else if (siteName === 'cm29') {
        document.querySelectorAll('[class*="product_item"], [class*="ProductCard"]').forEach(el => {
          const img = el.querySelector('img');
          const name = el.querySelector('[class*="product_name"], [class*="ProductName"]');
          const brand = el.querySelector('[class*="brand"]');
          const price = el.querySelector('[class*="price"]');
          const link = el.querySelector('a');
          if (name && link) {
            items.push({
              id: Math.random().toString(),
              site: 'cm29',
              name: name.innerText.trim(),
              brand: brand ? brand.innerText.trim() : '',
              price: price ? parseInt(price.innerText.replace(/[^0-9]/g, '')) : 0,
              imageUrl: img ? img.src : null,
              productUrl: link.href.startsWith('http') ? link.href : 'https://www.29cm.co.kr' + link.href,
            });
          }
        });
      }
      return items.slice(0, 50);
    }, site);

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
