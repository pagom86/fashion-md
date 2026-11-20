export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category } = req.query;

  const catMap = {
    outer: 'OUTER', top: 'TOP', bottom: 'BOTTOM',
    shoes: 'SHOES', acc: 'ACCESSORY', bag: 'BAG',
  };
  const catCode = catMap[category] || '';

  try {
    const url = `https://api.29cm.co.kr/api/product/list?sort=NEWEST&size=24${catCode ? `&category=${catCode}` : ''}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.29cm.co.kr/',
        'Accept': 'application/json',
      },
    });
    const data = await r.json();
    const items = (data?.data?.list || data?.list || []).map(p => ({
      id: String(p.itemNo || p.id),
      site: 'cm29',
      brand: p.frontBrandNameKo || p.brandName || '',
      name: p.itemName || p.name || '',
      price: p.consumerPrice || p.price || 0,
      originalPrice: p.originalPrice || null,
      discount: p.discountRate || null,
      imageUrl: p.imageUrl || p.thumbnail || null,
      productUrl: `https://www.29cm.co.kr/product/detail?item_no=${p.itemNo || p.id}`,
      category: category || 'all',
    }));
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message, items: [] });
  }
}
