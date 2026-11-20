const https = require('https');
const fs = require('fs');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.musinsa.com/',
};

function fetchJson(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { ...HEADERS, ...extraHeaders },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`GET ${url} → ${res.statusCode}`);
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: null, raw: data.substring(0, 300) }); }
      });
    }).on('error', reject);
  });
}

async function scrapeMusinsa() {
  // Musinsa 신상품 API
  const url = 'https://www.musinsa.com/api2/dp/v1/plp/goods?sort=LATEST&page=1&size=40&caller=MUSINSA.BRAND_NEWITEM';
  const result = await fetchJson(url, { Referer: 'https://www.musinsa.com/' });

  if (!result.data) {
    console.log('Musinsa raw:', result.raw);
    return [];
  }

  // 응답 구조 확인
  const goods = result.data?.data?.goods || result.data?.goods || result.data?.list || [];
  console.log(`Musinsa API: ${goods.length} items`);

  return goods.slice(0, 40).map(g => ({
    id: String(g.goodsNo || g.id || Math.random().toString(36).slice(2)),
    site: 'musinsa',
    name: g.goodsName || g.name || '',
    brand: g.brandName || g.brand?.name || '',
    price: g.normalPrice || g.price || 0,
    imageUrl: g.imageUrl || g.thumbnail || g.img || null,
    productUrl: `https://www.musinsa.com/app/goods/${g.goodsNo || g.id}`,
    category: g.categoryName || '',
  })).filter(g => g.name);
}

async function scrape29CM() {
  // 29CM 신상품 API
  const url = 'https://api.29cm.co.kr/api/v3/items?sort=new&page=1&limit=40';
  const result = await fetchJson(url, { Referer: 'https://www.29cm.co.kr/', Origin: 'https://www.29cm.co.kr' });

  if (!result.data) {
    console.log('29CM raw:', result.raw);
    // 다른 엔드포인트 시도
    const result2 = await fetchJson('https://www.29cm.co.kr/api/product/new?page=1&limit=40', { Referer: 'https://www.29cm.co.kr/' });
    if (!result2.data) {
      console.log('29CM alt raw:', result2.raw);
      return [];
    }
    return parse29CM(result2.data);
  }

  return parse29CM(result.data);
}

function parse29CM(data) {
  const items = data?.data?.items || data?.items || data?.list || data?.result?.items || [];
  console.log(`29CM API: ${items.length} items`);

  return items.slice(0, 40).map(g => ({
    id: String(g.itemNo || g.id || Math.random().toString(36).slice(2)),
    site: 'cm29',
    name: g.itemName || g.name || '',
    brand: g.brandName || g.brand?.nameKo || g.brand?.name || '',
    price: g.consumerPrice || g.price || 0,
    imageUrl: g.imageUrl || g.thumbnail || null,
    productUrl: `https://www.29cm.co.kr/product/detail?itemNo=${g.itemNo || g.id}`,
    category: g.categoryName || '',
  })).filter(g => g.name);
}

async function main() {
  console.log('Starting scraper...');

  const [musinsa, cm29] = await Promise.all([
    scrapeMusinsa().catch(e => { console.error('Musinsa error:', e.message); return []; }),
    scrape29CM().catch(e => { console.error('29CM error:', e.message); return []; }),
  ]);

  const all = [...musinsa, ...cm29];
  console.log(`Got ${musinsa.length} from Musinsa, ${cm29.length} from 29CM`);

  if (!fs.existsSync('data')) fs.mkdirSync('data');
  fs.writeFileSync('data/products.json', JSON.stringify({ updatedAt: new Date().toISOString(), items: all }, null, 2));
  console.log('Saved!');
}

main();
