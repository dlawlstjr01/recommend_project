import axios from "axios";

/**
 * 추천 상품 가져오기
 * - 쿠키(JWT) 기반
 */
// services/recommendService.js
export async function fetchRecommendations() {
  const res = await fetch("http://localhost:5001/api/recommend", {
    credentials: "include",
  });
  return res.json();
}


