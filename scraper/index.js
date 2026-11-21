const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// 무신사 남성 카테고리 코드 (취향 기준)
const MUSINSA_CATEGORIES = [
  { code: '001', name: '아우터' },
  { code: '002', name: '니트/스웨터' },
  { code: '003', name: '셔츠' },
  { code: '004', name: '티셔츠' },
  { code: '005', name: '맨투맨/후드' },
  { code: '006', name: '바지' },
  { code: '007', name: '청바지' },
  { code: '010', name: '신발' },
  { code: '011', name: '가방' },
  { code: '014', name: '액세서리' },
];

// 29CM 남성 카테고리 URL
const CM29_CATEGORIES = [
  { url: 'https://www.29cm.co.kr/category/list?category_large_code=268100&category_medium_code=268101&sort=RECENT', name: '아우터' },
  { url: 'https://www.29cm.co.kr/category/list?category_large_code=268100&category_medium_code=268103&sort=RECENT', name: '니트/스웨터' },
  { url: 'https://www.29cm.co.kr/category/list?category_large_code=268100&category_medium_code=268104&sort=RECENT', name: '셔츠' },
  { url: 'https://www.29cm.co.kr/category/list?category_large_code=268100&category_medium_code=268102&sort=RECENT', name: '티셔츠' },
  { url: 'https://www.29cm.co.kr/category/list?category_large_code=268100&category_medium_code=268106&sort=RECENT', name: '바지' },
];

async function openPage() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  return { browser, page };
}

async function scrapeMusinsaCategory(cat) {
  const { browser, page } = await openPage();
  try {
    const url = `https://www.musinsa.com/app/items/lists?category_code=${cat.code}&gender=M&sort=new&page=1`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const products = await page.evaluate((catName) => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return [];

      const data = JSON.parse(el.textContent);
      const queries = data?.props?.pageProps?.dehydratedState?.queries || [];

      function isProductArray(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return false;
        const first = arr[0];
        return !!(first.goodsNo || first.productNo || (first.name && first.price));
      }

      function findProducts(obj, depth = 0) {
        if (depth > 5 || !obj || typeof obj !== 'object') return null;
        if (isProductArray(obj)) return obj;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findProducts(item, depth + 1);
            if (found) return found;
          }
          return null;
        }
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (Array.isArray(val) && val.length > 2 && isProductArray(val)) return val;
          if (val && typeof val === 'object') {
            const found = findProducts(val, depth + 1);
            if (found) return found;
          }
        }
        return null;
      }

      let goods = null;
      for (const q of queries) {
        goods = findProducts(q?.state?.data);
        if (goods) break;
      }

      if (!goods) return [];
      return goods.slice(0, 20).map(g => ({
        id: String(g.goodsNo || g.no || g.id || Math.random().toString(36).slice(2)),
        site: 'musinsa',
        name: g.goodsName || g.name || '',
        brand: g.brandName || g.brand?.name || '',
        price: g.normalPrice || g.price || g.salePrice || 0,
        imageUrl: g.goodsImgSrc || g.imageUrl || g.thumbnail || null,
        productUrl: `https://www.musinsa.com/app/goods/${g.goodsNo || g.no || g.id}`,
        category: catName,
      })).filter(g => g.name);
    }, cat.name);

    console.log(`[musinsa] ${cat.name}: ${products.length}개`);
    await browser.close();
    return products;
  } catch (e) {
    console.error(`[musinsa] ${cat.name} error:`, e.message);
    await browser.close();
    return [];
  }
}

async function scrape29CMCategory(cat) {
  const { browser, page } = await openPage();
  try {
    await page.goto(cat.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const products = await page.evaluate((catName) => {
      // __NEXT_DATA__ 시도
      const el = document.getElementById('__NEXT_DATA__');
      if (el) {
        const data = JSON.parse(el.textContent);
        const pageProps = data?.props?.pageProps;
        const items = pageProps?.items || pageProps?.productList || pageProps?.initialData?.items;
        if (items && Array.isArray(items) && items.length > 0) {
          return items.slice(0, 20).map(g => ({
            id: String(g.itemNo || g.id || Math.random().toString(36).slice(2)),
            site: 'cm29',
            name: g.itemName || g.name || '',
            brand: g.brandNameKo || g.brandName || '',
            price: g.consumerPrice || g.price || 0,
            imageUrl: g.imageUrl || g.thumbnail || null,
            productUrl: `https://www.29cm.co.kr/product/detail?itemNo=${g.itemNo || g.id}`,
            category: catName,
          })).filter(g => g.name);
        }
      }

      // DOM 파싱
      const cards = Array.from(document.querySelectorAll('[class*="ProductCard"], [class*="product_card"], a[href*="itemNo"]'));
      const seen = new Set();
      const items = [];
      cards.forEach(el => {
        const a = el.tagName === 'A' ? el : el.querySelector('a');
        if (!a || seen.has(a.href)) return;
        seen.add(a.href);
        const img = el.querySelector('img');
        const parts = (el.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
        const brand = parts[0] || '';
        const name = parts[1] || parts[0] || '';
        const priceStr = parts.find(p => /^[\d,]+$/.test(p));
        const price = priceStr ? parseInt(priceStr.replace(/,/g, '')) : 0;
        const discountStr = parts.find(p => /^\d+%$/.test(p));
        if (name && name !== brand) {
          items.push({
            id: Math.random().toString(36).slice(2),
            site: 'cm29',
            name, brand, price,
            discount: discountStr ? parseInt(discountStr) : null,
            imageUrl: img?.src || null,
            productUrl: a.href.startsWith('http') ? a.href : 'https://www.29cm.co.kr' + a.href,
            category: catName,
          });
        }
      });
      return items.slice(0, 20);
    }, cat.name);

    console.log(`[29cm] ${cat.name}: ${products.length}개`);
    await browser.close();
    return products;
  } catch (e) {
    console.error(`[29cm] ${cat.name} error:`, e.message);
    await browser.close();
    return [];
  }
}

async function main() {
  console.log('Starting scraper...');

  // 순차적으로 긁기 (동시 너무 많으면 차단됨)
  const musinsaItems = [];
  for (const cat of MUSINSA_CATEGORIES) {
    const items = await scrapeMusinsaCategory(cat).catch(() => []);
    musinsaItems.push(...items);
    await new Promise(r => setTimeout(r, 1000));
  }

  const cm29Items = [];
  for (const cat of CM29_CATEGORIES) {
    const items = await scrape29CMCategory(cat).catch(() => []);
    cm29Items.push(...items);
    await new Promise(r => setTimeout(r, 1000));
  }

  const allRaw = [...musinsaItems, ...cm29Items];

  // 중복 제거 (같은 id의 상품은 첫 번째만 유지)
  const seen = new Set();
  const all = allRaw.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  console.log(`Total: ${musinsaItems.length} from Musinsa, ${cm29Items.length} from 29CM = ${allRaw.length}개 (dedup: ${all.length}개)`);

  if (!fs.existsSync('data')) fs.mkdirSync('data');
  fs.writeFileSync('data/products.json', JSON.stringify({ updatedAt: new Date().toISOString(), items: all }, null, 2));
  console.log('Saved!');
}

main();
