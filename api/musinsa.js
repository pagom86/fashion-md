export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category } = req.query;
  const catMap = { outer:'002', top:'001', bottom:'003', shoes:'005', acc:'007', bag:'004' };
  const catCode = catMap[category] || '';

  try {
    const target = `https://www.musinsa.com/api2/dp/v1/plp/goods?gf=A&sortCode=NEW_DATE&page=1&size=24${catCode ? `&category=${catCode}` : ''}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`;

    const r = await fetch(proxyUrl);
    const wrapper = await r.json();
    const text = wrapper.contents;

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

    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message, items: [] });
  }
}
