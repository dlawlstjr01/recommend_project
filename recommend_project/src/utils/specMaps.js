// src/utils/specMaps.js

export const SPEC_GROUP_MAP = {
  laptop: {
    "기본 정보": ["모델", "제조사", "출시"],
    "핵심 성능": ["CPU", "GPU", "RAM", "저장"],
    "디스플레이": ["화면", "해상도", "주사율", "패널"],
    "전력/배터리": ["배터리", "소비전력"],
    "크기/무게": ["무게", "두께", "크기"],
  },

  monitor: {
    "디스플레이": ["화면", "해상도", "주사율", "패널", "HDR"],
    "연결 단자": ["HDMI", "DP", "USB"],
    "설치/구조": ["베사", "스탠드", "틸트"],
    "전력": ["소비전력"],
  },

  cpu: {
    "기본 사양": ["코어", "스레드", "클럭", "공정"],
    "호환성": ["소켓", "칩셋"],
    "전력": ["TDP"],
  },

  gpu: {
    "그래픽 성능": ["칩셋", "코어", "부스트"],
    "메모리": ["VRAM", "메모리"],
    "출력 단자": ["HDMI", "DP"],
    "전력": ["소비전력"],
  },

  ssd: {
    "저장장치": ["용량", "인터페이스", "폼팩터"],
    "성능": ["읽기", "쓰기"],
    "내구성": ["TBW"],
  },

  aio_cooler: {
    "쿨링 정보": ["라디에이터", "팬", "RPM"],
    "호환성": ["소켓"],
    "소음": ["소음"],
  },

  keyboard: {
    "입력 방식": ["스위치", "접점"],
    "연결": ["유선", "무선", "블루투스"],
    "기능": ["백라이트", "매크로"],
  },

  mouse: {
    "센서": ["DPI", "센서"],
    "연결": ["유선", "무선"],
    "크기/무게": ["무게"],
  },
};

/**
 * Spec 자동 분류 함수
 */
export function groupSpecsByCategory(spec, category) {
  const map = SPEC_GROUP_MAP[category];

  // 매핑 없으면 전부 하나로
  if (!map || !spec) {
    return {
      "제품 스펙": Object.entries(spec || {}),
    };
  }

  const result = {};
  const usedKeys = new Set();

  Object.entries(map).forEach(([section, keywords]) => {
    const items = Object.entries(spec).filter(([key]) =>
      keywords.some((kw) => key.includes(kw))
    );

    if (items.length > 0) {
      result[section] = items;
      items.forEach(([k]) => usedKeys.add(k));
    }
  });

  // 분류되지 않은 나머지
  const rest = Object.entries(spec).filter(
    ([k]) => !usedKeys.has(k)
  );
  if (rest.length > 0) {
    result["기타"] = rest;
  }

  return result;
}
