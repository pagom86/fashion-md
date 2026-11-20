export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category } = req.query;
  const catMap = { outer:'002', top:'001', bottom:'003', shoes:'005', acc:'007', bag:'004' };
  const catCode = catMap[category] || '';

  const SCRAPER_KEY = '6c6ed6d95256b0524d43edc73fc96ba5';

  try {
    const pageUrl = `https://www.musinsa.com/app/items/lists?category_code=${catCode}&sort=new&page=1&display_cnt=90`;
    const url = `https://api.scraperapi.com/?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(pageUrl)}`;

    const r = await fetch(url);
    const html = await r.text();

    const items = [];
    const re = /<li[^>]+class="[^"]*listItem[^"]*"[^>]*data-no="(\d+)"[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?class="[^"]*brand[^"]*"[^>]*>([^<]+)<[\s\S]*?class="[^"]*goodsName[^"]*"[^>]*>([^<]+)<[\s\S]*?class="[^"]*price[^"]*"[^>]*>([\d,]+)/g;

    let m;
    while ((m = re.exec(html)) !== null) {
      const imgUrl = m[2].startsWith('//') ? 'https:' + m[2] : m[2];
      items.push({
        id: m[1],
        site: 'musinsa',
        brand: m[3].trim(),
        name: m[4].trim(),
        price: parseInt(m[5].replace(/,/g, ''), 10),
        originalPrice: null,
        discount: null,
        imageUrl: imgUrl,
        productUrl: `https://www.musinsa.com/app/goods/${m[1]}`,
      });
    }

    if (items.length === 0) {
      return res.status(200).json({ items: [], debug: 'no_items_parsed', snippet: html.slice(0, 800) });
    }

    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message, items: [] });
  }
}
