const RECO_API_BASE =
  import.meta.env.VITE_RECO_API_BASE || "http://localhost:5001";

/**
 * Flask 추천 API 호출
 * - 쿠키 기반 JWT(accessToken) 사용 -> credentials: "include" 필수
 */
export async function fetchRecommendations({ signal } = {}) {
  const res = await fetch(`${RECO_API_BASE}/api/recommend`, {
    method: "GET",
    credentials: "include",
    signal,
  });

  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // JSON이 아니면 그대로 에러로 던져서 서버 에러 페이지/HTML 등을 확인 가능하게
    throw new Error(
      `Recommend API returned non-JSON (status ${res.status}): ${text.slice(0, 300)}`
    );
  }

  if (!res.ok) {
    throw new Error(data?.error || `recommend failed: ${res.status}`);
  }

  return data; // { type, items }
}
