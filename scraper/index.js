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

      // 모든 쿼리에서 goods 배열 찾기
      let goods = null;
      for (const q of queries) {
        const d = q?.state?.data;
        if (!d) continue;
        // 가능한 경로들
        const candidates = [
          d?.goods, d?.list, d?.items,
          d?.pages?.[0]?.goods, d?.pages?.[0]?.list,
          d?.data?.goods, d?.data?.list,
        ];
        for (const c of candidates) {
          if (Array.isArray(c) && c.length > 0) { goods = c; break; }
        }
        if (goods) break;
      }

      if (goods && Array.isArray(goods)) {
        return {
          items: goods.slice(0, 40).map(g => ({
            id: String(g.goodsNo || g.no || g.id || Math.random().toString(36).slice(2)),
            site: 'musinsa',
            name: g.goodsName || g.name || '',
            brand: g.brandName || g.brand?.name || '',
            price: g.normalPrice || g.price || g.salePrice || 0,
            imageUrl: g.goodsImgSrc || g.imageUrl || g.thumbnail || null,
            productUrl: `https://www.musinsa.com/app/goods/${g.goodsNo || g.no || g.id}`,
            category: g.categoryName || '',
          })).filter(g => g.name),
          debug: `found goods in dehydratedState queries: ${goods.length} items`,
        };
      }

      // 쿼리 구조 로깅
      const firstQueryData = queries[0]?.state?.data;
      const firstKeys = firstQueryData ? Object.keys(firstQueryData) : [];
      return { items: [], debug: `queries: ${queries.length}, first query data keys: ${firstKeys.join(',')}` };
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

      // DOM 선택자 시도 - 더 넓은 범위
      const links = Array.from(document.querySelectorAll('a[href*="itemNo"], a[href*="/product/"]'));
      const seen = new Set();
      const items = [];
      links.forEach(a => {
        if (seen.has(a.href)) return;
        seen.add(a.href);
        const img = a.querySelector('img') || a.closest('[class]')?.querySelector('img');
        const textEls = a.querySelectorAll('p, span, div');
        const name = Array.from(textEls).find(el => el.innerText?.trim().length > 2)?.innerText?.trim();
        if (name) {
          items.push({
            id: Math.random().toString(36).slice(2),
            site: 'cm29',
            name,
            brand: '',
            price: 0,
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
