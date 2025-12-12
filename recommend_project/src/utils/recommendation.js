// src/utils/recommendation.js

export const getRecommendedProducts = (user, products) => {
  if (!user || !products) return products; // 로그인 안했으면 그냥 원래 순서대로

  // 각 제품에 '추천 점수(score)'를 부여
  const scoredProducts = products.map(product => {
    let score = 0;
    const p = product; // 편의상 별칭

    // 1. 직군(Job)에 따른 가산점
    // - 개발자: RAM, CPU 성능 중요 -> 스펙이 좋은 제품(가격이 좀 있는) 선호 가정
    // - 디자이너/크리에이터: 디스플레이, 고해상도 중요 -> Apple, 고가형 선호
    // - 학생: 가성비 중요 -> 저가형 선호
    if (user.job === 'developer' && (p.category === '노트북' || p.category === '데스크탑')) {
      if (p.rawPrice >= 1500000) score += 20; // 고성능 우대
    }
    if (user.job === 'designer' && p.brand === 'Apple') score += 25; // 애플 선호 가정
    if (user.job === 'student' && p.rawPrice <= 1000000) score += 20; // 가성비 우대
    if (user.job === 'gamer' && p.brand === 'ASUS') score += 20; // 게이밍 브랜드 우대

    // 2. 디자인 취향(Design) 매칭
    // 제품 데이터에 'style'이나 'color' 속성이 있다고 가정하거나, 브랜드/모델명으로 추론
    // (여기서는 가상으로 매칭 로직 구성)
    
    // '게이밍' 선호 시 -> ASUS, RGB 키워드 등
    if (user.designStyle === 'gaming') {
      if (p.brand === 'ASUS' || p.name.includes('Gaming')) score += 30;
    }
    // '미니멀' 선호 시 -> Apple, Samsung, LG
    if (user.designStyle === 'minimal') {
      if (['Apple', 'Samsung', 'LG'].includes(p.brand)) score += 15;
    }
    // '어두운 톤' 선호 시 -> 블랙/그레이 색상 (데이터에 없으면 브랜드 이미지로)
    if (user.designColor === 'dark' && p.name.includes('Black')) score += 10;

    // 3. 선호 브랜드(Brand) 매칭
    if (user.brand && user.brand.includes(p.brand)) {
      score += 15;
    }

    return { ...p, score };
  });

  // 점수가 높은 순으로 정렬
  return scoredProducts.sort((a, b) => b.score - a.score);
};
