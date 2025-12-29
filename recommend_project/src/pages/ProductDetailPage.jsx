import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { groupSpecsByCategory } from "../utils/specMaps";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

/* ================= helpers ================= */

function stableImg(id) {
  const seed = Array.from(String(id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  return `https://picsum.photos/800/800?random=${seed % 1000}`;
}

function yn(v) {
  if (v === true) return "지원";
  if (v === false) return "미지원";
  return "-";
}

function formatSpecValue(v) {
  if (v === true || v === false) return yn(v);
  if (v == null) return "-";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

function isImageUrl(s) {
  if (!isHttpUrl(s)) return false;
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(s);
}

/* ================= SmartImg ================= */

function SmartImg({ url, alt, style, className }) {
  const [src, setSrc] = useState(url);
  const triedProxy = useRef(false);

  useEffect(() => {
    setSrc(url);
    triedProxy.current = false;
  }, [url]);

  if (!url) return null;

  return (
    <img
      src={src}
      alt={alt || "image"}
      className={className}
      style={style}
      loading="lazy"
      onError={() => {
        if (!triedProxy.current) {
          triedProxy.current = true;
          setSrc(`${API_BASE}/api/image?url=${encodeURIComponent(url)}`);
        }
      }}
    />
  );
}

/* ================= Page ================= */

export default function ProductDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // 🔥 추천에서 왔는지 여부
  const fromRecommend = location.state?.from === "recommend";

  // 🔥 추천에서 넘겨준 데이터
  const initialProduct = location.state?.product || null;
  const initialRaw = location.state?.raw || null;

  const [data, setData] = useState(initialProduct);
  const [raw, setRaw] = useState(initialRaw);
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState("");

  /* 행동 로그 */
  const enterTimeRef = useRef(Date.now());
  const scrollCountRef = useRef(0);
  const [me, setMe] = useState(null);
  const userNoRef = useRef(null);

  /* ---------------- fetch detail ---------------- */

  useEffect(() => {
    let ignore = false;

    async function fetchDetailIfNeeded() {
      // ✅ 추천에서 넘어왔고 raw에 BaseImageURL이 있으면 굳이 재요청 안함(원래 로직 유지)
      if (fromRecommend && raw && raw.BaseImageURL) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const res = await fetch(
          `${API_BASE}/api/products/${encodeURIComponent(id)}`
        );
        if (!res.ok) throw new Error("fetch failed");

        const detail = await res.json();

        if (!ignore) {
          setData(detail);
          setRaw(detail.raw || null);
        }
      } catch {
        if (!ignore) setError("상세 정보를 불러오지 못했습니다.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchDetailIfNeeded();
    return () => {
      ignore = true;
    };
    // 원래 코드처럼 id만 dependency 유지(원본 최대 유지)
  }, [id]);

  /* ---------------- scroll attempt count ---------------- */

  useEffect(() => {
    const mark = () => {
      scrollCountRef.current += 1;
    };

    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("touchmove", mark, { passive: true });
    window.addEventListener("keydown", (e) => {
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
          " ",
        ].includes(e.key)
      ) {
        mark();
      }
    });

    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchmove", mark);
    };
  }, []);

  useEffect(() => {
    if (me?.user_no) {
      userNoRef.current = me.user_no;
    }
  }, [me]);

  useEffect(() => {
    fetch("http://localhost:5000/auth/me", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        setMe(data);
      })
      .catch(() => setMe(null));
  }, []);

  /* ---------------- send log ---------------- */
  useEffect(() => {
    return () => {
      if (!data?.id || !userNoRef.current) return;

      const stay = Math.round(
        (Date.now() - enterTimeRef.current) / 1000
      );

      fetch(`${API_BASE}/api/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userNoRef.current, // user_no 정상 전달
          product_id: data.id,
          stay_time: stay,
          scroll_depth: scrollCountRef.current,
        }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [data?.id]);

  /* ---------------- images ---------------- */

  const mainImage = useMemo(() => {
    const base = raw?.BaseImageURL || raw?.baseImageURL;
    if (isImageUrl(base)) return base;
    if (isImageUrl(data?.img)) return data.img;
    return stableImg(data?.id || id);
  }, [raw, data, id]);

  const detailImages = useMemo(() => {
    const arr = raw?.DetailImages || raw?.detailImages || [];
    return Array.isArray(arr) ? arr.filter(isImageUrl) : [];
  }, [raw]);

  /* ---------------- spec logic ---------------- */

  const isLaptop = !!(raw?.model_name || raw?.core_spec);

  const laptopSections = useMemo(() => {
    if (!isLaptop) return [];

    const cs = raw.core_spec || {};
    const d = raw.display || {};

    return [
      {
        title: "기본 정보",
        items: [
          ["모델명", raw.model_name],
          ["제품코드", raw.pcode],
        ],
      },
      {
        title: "핵심 스펙",
        items: [
          ["CPU", cs.cpu_model],
          ["RAM", cs.ram_gb && `${cs.ram_gb}GB`],
          ["GPU", cs.gpu_chipset],
          ["VRAM", cs.vram_gb && `${cs.vram_gb}GB`],
        ],
      },
      {
        title: "디스플레이",
        items: [
          ["크기", d.inch && `${d.inch}인치`],
          ["주사율", d.refresh_rate_hz && `${d.refresh_rate_hz}Hz`],
          ["밝기", d.brightness_nit && `${d.brightness_nit}nit`],
        ],
      },
    ].map((s) => ({
      ...s,
      items: s.items.filter(([, v]) => v != null),
    }));
  }, [raw, isLaptop]);

  const groupedSpecs = useMemo(() => {
    if (isLaptop || !raw?.Spec) return {};
    return groupSpecsByCategory(raw.Spec, data?.category);
  }, [raw, data, isLaptop]);

  // ✅ "상품 정보" 섹션에 가격/카테고리 포함(요청사항)
  const baseInfoSection = useMemo(() => {
    return {
      title: "상품 정보",
      items: [
        ["브랜드", data?.brand],
        ["가격", data?.price != null ? `${Number(data.price || 0).toLocaleString()}원` : "-"],
        ["카테고리", data?.category],
        ["상품번호", data?.id],
      ].filter(([, v]) => v != null && v !== ""),
    };
  }, [data]);

  // ✅ 오른쪽에 보여줄 섹션 리스트(노트북/비노트북 공통)
  const displaySections = useMemo(() => {
    if (isLaptop) {
      // 노트북: 기존 "기본 정보" 섹션에 baseInfo 합치기(중복 방지)
      const patched = laptopSections.map((sec) => {
        if (sec.title !== "기본 정보") return sec;

        const existing = new Set(sec.items.map(([k]) => k));
        return {
          ...sec,
          items: [
            ...baseInfoSection.items.filter(([k]) => !existing.has(k)),
            ...sec.items,
          ],
        };
      });

      const hasBasic = patched.some((s) => s.title === "기본 정보");
      return hasBasic ? patched : [baseInfoSection, ...patched];
    }

    // 비노트북: baseInfo + groupedSpecs
    const others = Object.entries(groupedSpecs).map(([title, items]) => ({
      title,
      items: items.filter(([, v]) => v != null && v !== ""),
    }));

    return [baseInfoSection, ...others].filter((s) => s.items?.length);
  }, [isLaptop, laptopSections, groupedSpecs, baseInfoSection]);

  /* ---------------- UI actions ---------------- */

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/products");
  };

  /* ---------------- render ---------------- */

  if (loading) return <div className="detail-container">로딩중...</div>;
  if (error) return <div className="detail-container">{error}</div>;
  if (!data) return null;

 return (
  <div className="detail-container">
    {/* ✅ 돌아가기 버튼 */}
    <button type="button" className="back-btn" onClick={handleBack}>
      <span className="back-btn__icon">←</span>
      <span>목록으로</span>
    </button>

    {/* ✅ 좌(이미지 + 스펙 + 상세설명) + 우(요약만) */}
    <div className="detail-layout">
      {/* LEFT */}
      <main className="detail-main">
        <div className="detail-image-card">
          <SmartImg url={mainImage} alt={data.name} className="detail-main-img" />
        </div>

        {/* ✅ 스펙 패널을 "이미지 아래"로 이동 */}
        <div className="spec-panel spec-panel--under-image">
          {displaySections.map((sec, idx) => (
            <details key={sec.title} className="spec-acc" open={idx === 0}>
              <summary className="spec-acc__summary">{sec.title}</summary>

              <table className="spec-table">
                <tbody>
                  {sec.items.map(([k, v]) => (
                    <tr key={`${sec.title}-${k}`}>
                      <th scope="row">{k}</th>
                      <td>{formatSpecValue(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </div>

        {/* ✅ 상세설명(상세 이미지)은 스펙 밑으로 */}
        {detailImages.length > 0 && (
          <section className="detail-desc">
            <h2>상세 설명</h2>
            <div className="detail-images">
              {detailImages.map((u) => (
                <SmartImg key={u} url={u} className="detail-images__img" />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* RIGHT */}
      <aside className="detail-aside">
        {/* ✅ 오른쪽은 요약 카드만 */}
        <div className="summary-card summary-card--big">
          <div className="summary-brand">{data.brand}</div>
          <div className="summary-title">{data.name}</div>
          <div className="summary-price">
            {Number(data.price || 0).toLocaleString()}원
          </div>

          <div className="summary-meta">
            <span>카테고리</span>
            <b>{data.category}</b>
          </div>
        </div>
      </aside>
    </div>
  </div>
);

}
