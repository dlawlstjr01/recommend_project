import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

function getScroller() {
  // 특정 스크롤 컨테이너가 있으면 그걸 우선 사용(권장)
  const byId = document.getElementById("app-scroll");
  if (byId) return byId;

  // document 자체가 스크롤이면 이걸 사용
  const doc = document.scrollingElement || document.documentElement;
  if (doc && doc.scrollHeight > doc.clientHeight) return doc;

  // fallback: 스크롤 가능한 요소 탐색(안전망)
  const all = Array.from(document.querySelectorAll("body *"));
  for (const el of all) {
    const st = window.getComputedStyle(el);
    const oy = st.overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
  }

  return doc;
}

export default function ScrollToTopGlobal() {
  const location = useLocation();

  useEffect(() => {
    // 뒤로가기 시 브라우저 스크롤 복원 끄기
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useLayoutEffect(() => {
    const scroller = getScroller();
    scroller?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.key]); // 라우트 변경(PUSH/POP)마다

  return null;
}
