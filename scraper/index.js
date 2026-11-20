const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

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

async function scrapeMusinsa() {
  const { browser, page } = await openPage();
  try {
    await page.goto('https://www.musinsa.com/app/items/lists?category_code=&sort=new&page=1', {
      waitUntil: 'networkidle2', timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 2000));

    // __NEXT_DATA__ 에서 상품 추출
    const products = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return { items: [], debug: 'no __NEXT_DATA__' };

      const data = JSON.parse(el.textContent);

      // 구조 탐색
      const pageProps = data?.props?.pageProps;
      const state = pageProps?.initialState || pageProps?.dehydratedState;

      // dehydratedState (React Query) 구조 탐색
      const dehydrated = pageProps?.dehydratedState;
      const queries = dehydrated?.queries || [];

      // 상품 배열인지 확인 (goodsNo 또는 productNo 필드 존재 여부)
      function isProductArray(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return false;
        const first = arr[0];
        return !!(first.goodsNo || first.productNo || first.itemNo || first.goods_no ||
                  (first.name && (first.price || first.imageUrl)));
      }

      // 모든 쿼리에서 상품 배열 재귀 탐색
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
          if (Array.isArray(val) && val.length > 2) {
            if (isProductArray(val)) return val;
          } else if (val && typeof val === 'object') {
            const found = findProducts(val, depth + 1);
            if (found) return found;
          }
        }
        return null;
      }

      let goods = null;
      for (const q of queries) {
        const d = q?.state?.data;
        if (!d) continue;
        goods = findProducts(d);
        if (goods) break;
      }

      if (goods && Array.isArray(goods)) {
        const firstKeys = goods[0] ? Object.keys(goods[0]).join(',') : '';
        const items = goods.slice(0, 40).map(g => {
          // 모든 가능한 필드명 시도
          const name = g.goodsName || g.name || g.goods_name || g.title || g.item_name || '';
          const brand = g.brandName || g.brand?.name || g.brand_name || '';
          const price = g.normalPrice || g.price || g.salePrice || g.sale_price || 0;
          const imageUrl = g.goodsImgSrc || g.imageUrl || g.thumbnail || g.image || g.img || null;
          const id = String(g.goodsNo || g.no || g.id || Math.random().toString(36).slice(2));
          const productUrl = `https://www.musinsa.com/app/goods/${g.goodsNo || g.no || g.id}`;
          return { id, site: 'musinsa', name, brand, price, imageUrl, productUrl };
        }).filter(g => g.name);

        return {
          items,
          debug: `found goods[${goods.length}] keys: ${firstKeys}, mapped: ${items.length}`,
        };
      }

      // 쿼리 구조 로깅
      const firstQueryData = queries[0]?.state?.data;
      const firstKeys = firstQueryData ? Object.keys(firstQueryData) : [];
      const nestedKeys = firstQueryData ? JSON.stringify(firstQueryData).substring(0, 300) : '';
      return { items: [], debug: `queries: ${queries.length}, data keys: ${firstKeys.join(',')}, sample: ${nestedKeys}` };
    });

    console.log('[musinsa] debug:', products.debug);
    console.log('[musinsa] items:', products.items.length);

    await browser.close();
    return products.items;
  } catch (e) {
    console.error('[musinsa] error:', e.message);
    await browser.close();
    return [];
  }
}

async function scrape29CM() {
  const { browser, page } = await openPage();
  try {
    await page.goto('https://www.29cm.co.kr/home/new', {
      waitUntil: 'networkidle2', timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 3000));

    const products = await page.evaluate(() => {
      // __NEXT_DATA__ 시도
      const el = document.getElementById('__NEXT_DATA__');
      let nextItems = [];
      if (el) {
        const data = JSON.parse(el.textContent);
        const pageProps = data?.props?.pageProps;
        const items =
          pageProps?.items ||
          pageProps?.productList ||
          pageProps?.initialData?.items ||
          null;
        if (items && Array.isArray(items)) {
          nextItems = items;
        }
      }

      if (nextItems.length > 0) {
        return {
          items: nextItems.slice(0, 40).map(g => ({
            id: String(g.itemNo || g.id || Math.random().toString(36).slice(2)),
            site: 'cm29',
            name: g.itemName || g.name || '',
            brand: g.brandNameKo || g.brandName || g.brand?.nameKo || '',
            price: g.consumerPrice || g.price || 0,
            imageUrl: g.imageUrl || g.thumbnail || null,
            productUrl: `https://www.29cm.co.kr/product/detail?itemNo=${g.itemNo || g.id}`,
            category: g.categoryName || '',
          })).filter(g => g.name),
          debug: `__NEXT_DATA__ items: ${nextItems.length}`,
        };
      }

      // DOM 선택자 - 카드 단위로 추출
      const cards = Array.from(document.querySelectorAll('[class*="ProductCard"], [class*="product_card"], [class*="ItemCard"], [class*="item_card"]'));
      const links = cards.length > 0 ? cards : Array.from(document.querySelectorAll('a[href*="itemNo"]'));
      const seen = new Set();
      const items = [];
      links.forEach(el => {
        const a = el.tagName === 'A' ? el : el.querySelector('a');
        if (!a || seen.has(a.href)) return;
        seen.add(a.href);

        const img = el.querySelector('img');
        // 텍스트 블록에서 브랜드/이름/가격 분리
        const rawText = el.innerText || '';
        const parts = rawText.split('\n').map(s => s.trim()).filter(Boolean);
        // parts: [brand, name, discount%, price, ...]
        const brand = parts[0] || '';
        const name = parts[1] || parts[0] || '';
        const priceStr = parts.find(p => p.match(/^[\d,]+$/));
        const price = priceStr ? parseInt(priceStr.replace(/,/g, '')) : 0;
        const discountStr = parts.find(p => p.match(/^\d+%$/));
        const discount = discountStr ? parseInt(discountStr) : null;

        if (name && name !== brand) {
          items.push({
            id: Math.random().toString(36).slice(2),
            site: 'cm29',
            name,
            brand,
            price,
            discount,
            imageUrl: img?.src || img?.dataset?.src || null,
            productUrl: a.href.startsWith('http') ? a.href : 'https://www.29cm.co.kr' + a.href,
            category: '',
          });
        }
      });

      const nextEl = document.getElementById('__NEXT_DATA__');
      const keys = nextEl ? Object.keys(JSON.parse(nextEl.textContent)?.props?.pageProps || {}) : [];
      return { items: items.slice(0, 40), debug: `DOM links: ${links.length}, nextData pageProps: ${keys.join(',')}` };
    });

    console.log('[cm29] debug:', products.debug);
    console.log('[cm29] items:', products.items.length);

    await browser.close();
    return products.items;
  } catch (e) {
    console.error('[cm29] error:', e.message);
    await browser.close();
    return [];
  }
}

async function main() {
  console.log('Starting scraper...');

  const [musinsa, cm29] = await Promise.all([
    scrapeMusinsa().catch(e => { console.error(e.message); return []; }),
    scrape29CM().catch(e => { console.error(e.message); return []; }),
  ]);

  const all = [...musinsa, ...cm29];
  console.log(`Total: ${musinsa.length} from Musinsa, ${cm29.length} from 29CM`);

  if (!fs.existsSync('data')) fs.mkdirSync('data');
  fs.writeFileSync('data/products.json', JSON.stringify({ updatedAt: new Date().toISOString(), items: all }, null, 2));
  console.log('Saved!');
}

main();
