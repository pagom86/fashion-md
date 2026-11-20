export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // 네이버 쇼핑 API 살아있는지 테스트
  const r = await fetch('https://openapi.naver.com/v1/search/shop.json?query=무신사+아우터&display=10&sort=date', {
    headers: {
      'X-Naver-Client-Id': 'test',
      'X-Naver-Client-Secret': 'test',
    }
  });
  
  res.status(200).json({ 
    httpStatus: r.status,
    alive: r.status === 401 || r.status === 400,  // 401/400이면 API 살아있음
  });
}
