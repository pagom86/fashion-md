export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const r = await fetch('https://www.wconcept.co.kr/Product/ListAjax?category=001&sort=new&page=1&pageSize=20', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.wconcept.co.kr',
    }
  });
  
  res.status(200).json({ 
    httpStatus: r.status,
    snippet: (await r.text()).slice(0, 500)
  });
}
