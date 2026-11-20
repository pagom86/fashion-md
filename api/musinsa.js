export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category } = req.query;
  const catMap = { outer:'002', top:'001', bottom:'003', shoes:'005', acc:'007', bag:'004' };
  const catCode = catMap[category] || '';

  const SCRAPER_KEY = '6c6ed6d95256b0524d43edc73fc96ba5';

  try {
    const target = `https://searchapi.musinsa.com/api/search?keyword=&sort=NEWEST&page=1&size=24${catCode ? `&category=${catCode}` : ''}&gf=A`;
    const url = `https://api.scraperapi.com/?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(target)}`;

    const r = await fetch(url);
    const text = await r.text();

    // JSON인지 HTML인지 확인
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      return res.status(200).json({ items: [], debug: 'not_json', snippet: text.slice(0, 400) });
    }

    const data = JSON.parse(text);
    const list = data?.data?.list || data?.list || data?.result?.list || data?.goods || [];

    const items = list.map(p => ({
      id: String(p.goodsNo || p.id),
      site: 'musinsa',
      brand: p.brandName || p.brand || '',
      name: p.goodsName || p.name || '',
      price: p.price || 0,
      originalPrice: p.normalPrice || p.originalPrice || null,
      discount: p.discountRate || null,
      imageUrl: p.thumbnail ? (p.thumbnail.startsWith('//') ? 'https:' + p.thumbnail : p.thumbnail) : null,
      productUrl: `https://www.musinsa.com/app/goods/${p.goodsNo || p.id}`,
    }));

    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message, items: [] });
  }
}
