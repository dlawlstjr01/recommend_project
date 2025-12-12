const fs = require('fs');
const path = require('path');

// 👇 키 설정 (공백 없이 정확히!)
const API_ID  = '692f814ec2302605ddb0b602'; 
const API_KEY = 'd803aaf3-f8c9-483b-9013-90d08695cba9';

const BASE_URL = 'https://api.techspecs.io/v5/products/search';
const DETAIL_URL = 'https://api.techspecs.io/v5/product'; 

// ★ 수정됨: 스마트폰/워치 제거하고 PC/게이밍 관련만 남김
const CATEGORIES = [
    'monitor',      // 모니터
    'console',      // 게임 콘솔 (PS5, Switch 등)
    'desktop',      // 데스크탑 PC
    'keyboard',     // 키보드
    'mouse',        // 마우스
    'laptop',       // 노트북 (게이밍 노트북 포함)
    'gpu',          // 그래픽카드
    'headphone'     // 게이밍 헤드셋 (혹시 몰라 추가, 싫으면 빼세요)
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchAllCategories() {
  console.log(`\n🔑 키 확인: [${API_KEY}]`);
  console.log('🚀 [PC/게이밍 전용] 데이터 수집 시작...');
  
  const allUnifiedData = [];
  const LIMIT_PER_CATEGORY = 5; // 카테고리당 5개씩 (적당히 조절하세요)

  for (const category of CATEGORIES) {
    console.log(`\n🎮 [Category: ${category}] 검색 중...`);
    
    try {
      // 1. 검색 (fetch 사용)
      const searchUrl = `${BASE_URL}?query=${category}&page=1&limit=${LIMIT_PER_CATEGORY}`;
      
      const res = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'x-api-id': API_ID
        }
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, body: ${errText}`);
      }

      const data = await res.json();
      const items = data.data?.items || data.data?.results || data.items || data.results || [];
      
      console.log(`   -> ${items.length}개 발견. 상세 조회 시작...`);

      // 2. 상세 조회
      for (const item of items) {
        const pId = item.id || item._id;
        let fullData = item;

        try {
          const detailRes = await fetch(`${DETAIL_URL}/${pId}`, {
            method: 'GET',
            headers: {
              'accept': 'application/json',
              'x-api-key': API_KEY,
              'x-api-id': API_ID
            }
          });
          
          if (detailRes.ok) {
            const detailJson = await detailRes.json();
            fullData = detailJson.data || detailJson;
          }
        } catch (e) {}

        // 이미지 찾기
        let imageUrl = '';
        if (fullData.image) {
            if (typeof fullData.image === 'string') imageUrl = fullData.image;
            else if (fullData.image.front) imageUrl = fullData.image.front;
            else if (fullData.image.back) imageUrl = fullData.image.back;
        }
        if (!imageUrl && Array.isArray(fullData.images) && fullData.images.length > 0) imageUrl = fullData.images[0];
        if (!imageUrl) imageUrl = 'https://placehold.co/300x400?text=No+Image';

        // 데이터 정리
        const cleanItem = {
            id: fullData.id,
            name: fullData.name || `${fullData.brand} ${fullData.model}`,
            brand: fullData.brand,
            category: category,
            price: fullData.price || '가격 정보 없음',
            thumbnail: imageUrl,
            specs: {
                cpu: fullData.hardware?.cpu || fullData.cpu || fullData.processor || null,
                gpu: fullData.hardware?.gpu || fullData.gpu || fullData.graphics || null,
                ram: fullData.hardware?.ram || fullData.ram || fullData.memory || null,
                storage: fullData.hardware?.storage || fullData.internal_storage || null,
                display_size: fullData.display?.size || fullData.display || null,
                resolution: fullData.display?.resolution || fullData.resolution || null,
                refresh_rate: fullData.display?.refresh_rate || fullData.refresh_rate || null,
                panel_type: fullData.display?.type || fullData.panel_type || null,
                weight: fullData.design?.weight || fullData.weight || null
            },
            raw: fullData 
        };

        allUnifiedData.push(cleanItem);
        process.stdout.write('.');
        await sleep(300);
      }

    } catch (e) {
      console.error(`   ❌ [${category}] 실패: ${e.message}`);
    }
  }

  // 저장
  const outPath = path.join(__dirname, 'all-products.json');
  fs.writeFileSync(outPath, JSON.stringify(allUnifiedData, null, 2), 'utf-8');
  console.log(`\n\n🎉 수집 완료!`);
  console.log(`💾 총 ${allUnifiedData.length}개 저장됨: ${outPath}`);
}

fetchAllCategories();
