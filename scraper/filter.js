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

const FEMALE_KEYWORDS = [
  '여성', '우먼', 'women', 'woman', 'ladies', 'girl',
  '크롭', 'crop', '미니스커트', '스커트', 'skirt',
  '원피스', 'dress', '블라우스', 'blouse',
  '브라탑', 'bralette', '코르셋',
  '애즈온', '마뗑킴', '르브', '이세', '시스터앤',
];

function isFemaleItem(item) {
  const text = `${item.brand} ${item.name} ${item.category || ''}`.toLowerCase();
  return FEMALE_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

async function filterProducts(items) {
  const moodsStr = STYLE_PROFILE.moods.join(', ');
  // 1차: 여성 키워드 하드 필터
  const preFiltered = items.filter(item => {
    if (isFemaleItem(item)) {
      console.log(`[filter] SKIP (female): ${item.brand} - ${item.name}`);
      return false;
    }
    return true;
  });
  console.log(`[filter] Pre-filter: ${preFiltered.length} / ${items.length} remain`);

  const results = [];

  // 2차: Claude AI 스타일 판단 (5개씩)
  for (let i = 0; i < preFiltered.length; i += 5) {
    const batch = items.slice(i, i + 5);
    const promises = preFiltered.slice(i, i + 5).map(async item => {
      try {
        const prompt = `패션 상품 정보:
브랜드: ${item.brand || '알 수 없음'}
상품명: ${item.name}
카테고리: ${item.category || '알 수 없음'}

다음 두 조건을 모두 만족해야 YES:
1. 남성복 또는 남녀공용일 것 (여성 전용 아이템이면 무조건 NO)
2. 아래 스타일 중 하나 이상에 해당할 것: ${moodsStr}

스커트, 원피스, 여성용 블라우스, 여성 속옷, 여성 전용 아이템은 무조건 NO.
YES 또는 NO만 답할 것.`;

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
    if (i + 5 < preFiltered.length) await new Promise(r => setTimeout(r, 500));
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
