export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category } = req.query;
  const catMap = { outer:'002', top:'001', bottom:'003', shoes:'005', acc:'007', bag:'004' };
  const catCode = catMap[category] || '';

  const SCRAPER_KEY = '6c6ed6d95256b0524d43edc73fc96ba5';

  try {
    const pageUrl = `https://www.musinsa.com/categories/item/${catCode || '0'}/list?sortCode=NEW_DATE&page=1`;
    const url = `https://api.scraperapi.com/?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(pageUrl)}&render=true`;

    const r = await fetch(url);
    const html = await r.text();

    // __NEXT_DATA__ 추출
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) {
      return res.status(200).json({ items: [], debug: 'no_next_data', snippet: html.slice(0, 300) });
    }

    const nd = JSON.parse(match[1]);
    const rawList =
      nd?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.pages?.[0]?.list ||
      nd?.props?.pageProps?.goods ||
      nd?.props?.pageProps?.items ||
      nd?.props?.pageProps?.goodsList ||
      [];

    const items = rawList.map(p => ({
      id: String(p.goodsNo || p.id || Math.random()),
      site: 'musinsa',
      brand: p.brandName || p.brand?.name || '',
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
