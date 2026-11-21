const fs = require('fs');
const https = require('https');

const STYLE_PROFILE = {
  gender: '남성',
  moods: ['미니멀', '빈티지', '캐주얼', '스포티', 'Y2K', '고프코어', '아메카지', '시티보이', '프레피', '워크웨어', '하라주쿠/일본 스트릿', '시부야/시크 캐주얼', '스케이터'],
  fits: ['오버핏', '루즈핏', '레귤러핏'],
  categories: ['아우터', '니트/스웨터', '셔츠/블라우스', '티셔츠/롱슬리브', '맨투맨/후드', '바지/슬랙스', '청바지', '신발', '가방', '액세서리'],
};

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.content?.[0]?.text?.trim() || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function filterProducts(items) {
  const moodsStr = STYLE_PROFILE.moods.join(', ');
  const results = [];

  // 배치로 처리 (5개씩)
  for (let i = 0; i < items.length; i += 5) {
    const batch = items.slice(i, i + 5);
    const promises = batch.map(async item => {
      try {
        const prompt = `패션 상품 정보:
브랜드: ${item.brand || '알 수 없음'}
상품명: ${item.name}
카테고리: ${item.category || '알 수 없음'}

이 상품이 다음 스타일 중 하나 이상에 해당하면 "YES", 아니면 "NO"만 답해:
${moodsStr}

남성복 또는 남녀공용이어야 함. YES 또는 NO만 답할 것.`;

        const answer = await callClaude(prompt);
        const pass = answer.toUpperCase().includes('YES');
        if (pass) console.log(`[filter] PASS: ${item.brand} - ${item.name}`);
        return pass ? item : null;
      } catch (e) {
        console.error(`[filter] error for ${item.name}:`, e.message);
        return item; // 에러시 통과
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(Boolean));

    // API 레이트 리밋 방지
    if (i + 5 < items.length) await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[filter] No API key, skipping filter');
    return;
  }

  const raw = JSON.parse(fs.readFileSync('data/products.json', 'utf-8'));
  console.log(`[filter] Filtering ${raw.items.length} items...`);

  const filtered = await filterProducts(raw.items);
  console.log(`[filter] ${filtered.length} / ${raw.items.length} items passed`);

  fs.writeFileSync('data/products.json', JSON.stringify({
    updatedAt: raw.updatedAt,
    items: filtered,
  }, null, 2));
}

main();
