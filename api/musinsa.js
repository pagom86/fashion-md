export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category } = req.query;

  const catMap = {
    outer: '002', top: '001', bottom: '003',
    shoes: '005', acc: '007', bag: '004',
  };
  const catCode = catMap[category] || '';
  const catParam = catCode ? `&category=${catCode}` : '';

  try {
    const url = `https://www.musinsa.com/api2/dp/v1/plp/goods?gf=A&sortCode=NEW_DATE&page=1&size=24${catParam}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.musinsa.com/',
        'Accept': 'application/json',
      },
    });
    const data = await r.json();
    const items = (data?.data?.list || []).map(p => ({
      id: String(p.goodsNo),
      site: 'musinsa',
      brand: p.brandName || '',
      name: p.goodsName || '',
      price: p.price || 0,
      originalPrice: p.normalPrice || null,
      discount: p.discountRate || null,
      imageUrl: p.thumbnail ? (p.thumbnail.startsWith('//') ? 'https:' + p.thumbnail : p.thumbnail) : null,
      productUrl: `https://www.musinsa.com/app/goods/${p.goodsNo}`,
      category: category || 'all',
    }));
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message, items: [] });
  }
}
