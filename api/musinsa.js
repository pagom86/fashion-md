export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category } = req.query;
  const catMap = { outer:'002', top:'001', bottom:'003', shoes:'005', acc:'007', bag:'004' };
  const catCode = catMap[category] || '';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.musinsa.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  };

  try {
    const url = `https://www.musinsa.com/api2/dp/v1/plp/goods?gf=A&sortCode=NEW_DATE&page=1&size=24${catCode ? `&category=${catCode}` : ''}`;
    const r = await fetch(url, { headers });
    const text = await r.text();

    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const data = JSON.parse(text);
      const list = data?.data?.list || data?.list || [];
      const items = list.map(p => ({
        id: String(p.goodsNo || p.id),
        site: 'musinsa',
        brand: p.brandName || '',
        name: p.goodsName || p.name || '',
        price: p.price || 0,
        originalPrice: p.normalPrice || null,
        discount: p.discountRate || null,
        imageUrl: p.thumbnail ? (p.thumbnail.startsWith('//') ? 'https:' + p.thumbnail : p.thumbnail) : null,
        productUrl: `https://www.musinsa.com/app/goods/${p.goodsNo || p.id}`,
      }));
      return res.status(200).json({ items });
    }

    // HTML fallback: __NEXT_DATA__ 추출
    const match = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (match) {
      const nd = JSON.parse(match[1]);
      const list = nd?.props?.pageProps?.goods || nd?.props?.pageProps?.items || [];
      const items = list.map(p => ({
        id: String(p.goodsNo || p.id || Math.random()),
        site: 'musinsa',
        brand: p.brandName || '',
        name: p.goodsName || p.name || '',
        price: p.price || 0,
        originalPrice: p.normalPrice || null,
        discount: p.discountRate || null,
        imageUrl: p.thumbnail ? (p.thumbnail.startsWith('//') ? 'https:' + p.thumbnail : p.thumbnail) : null,
        productUrl: `https://www.musinsa.com/app/goods/${p.goodsNo || p.id}`,
      }));
      return res.status(200).json({ items });
    }

    res.status(200).json({ items: [], debug: 'parse_failed' });
  } catch (e) {
    res.status(500).json({ error: e.message, items: [] });
  }
}
