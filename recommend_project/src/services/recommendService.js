const RECO_API_BASE =
  import.meta.env.VITE_RECO_API_BASE || "http://127.0.0.1:5001";

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

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Recommend API returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data?.error || `recommend failed: ${res.status}`);
  }

  return data; // { type, items }
}
