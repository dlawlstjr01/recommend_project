import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { groupSpecsByCategory } from "../utils/specMaps";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

// ✅ 비교 목록 저장 키 (AnalysisPage와 동일해야 함)
const COMPARE_KEY = "compare_products_v1";

function readCompareList() {
  try {
    const raw = localStorage.getItem(COMPARE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeCompareList(list) {
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
  } catch { }
}

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

  // 🔥 추천에서 왔는지 여부
  const fromRecommend = location.state?.from === "recommend";

  // 🔥 추천에서 넘겨준 데이터
  const initialProduct = location.state?.product || null;
  const initialRaw = location.state?.raw || null;

  const [data, setData] = useState(initialProduct);
  const [raw, setRaw] = useState(initialRaw);
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState("");

  // ✅ 비교목록에 담겼는지 UI 상태
  const [inCompare, setInCompare] = useState(false);

  /* 행동 로그 */
  const enterTimeRef = useRef(Date.now());
  const scrollCountRef = useRef(0);
  const [me, setMe] = useState(null);
  const userNoRef = useRef(null);

  /* ---------------- fetch detail ---------------- */

  useEffect(() => {
    let ignore = false;

    async function fetchDetailIfNeeded() {
      if (fromRecommend && raw && raw.BaseImageURL) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(id)}`);
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
  }, [id]);

  // ✅ 비교목록 포함 여부 동기화
  useEffect(() => {
    const list = readCompareList();
    const exists = list.some((x) => String(x?.id ?? x) === String(data?.id));
    setInCompare(exists);
  }, [data?.id]);

  // ✅ [핵심] 비교 분석하기 버튼: 페이지 이동 ❌ / 비교목록에 “담기”만 ✅
  const handleCompareClick = () => {
    if (!data?.id) return;

    const curId = String(data.id);
    const curCategory = data.category || "";

    const list = readCompareList();
    const existsIdx = list.findIndex((x) => String(x?.id ?? x) === curId);

    // 이미 담겼으면 제거(토글)도 가능하게
    if (existsIdx >= 0) {
      const next = [...list];
      next.splice(existsIdx, 1);
      writeCompareList(next);
      setInCompare(false);
      alert("비교 목록에서 제거했어요.");
      return;
    }

    if (list.length >= 5) {
      alert("비교 목록은 최대 5개까지 담을 수 있어요.");
      return;
    }

    const next = [...list, { id: data.id, category: curCategory }];
    writeCompareList(next);
    setInCompare(true);
    alert("비교 목록에 담았어요! (분석 페이지에서 확인 가능)");
  };

  /* ---------------- scroll attempt count ---------------- */

  useEffect(() => {
    const mark = () => {
      scrollCountRef.current += 1;
    };

    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("touchmove", mark, { passive: true });
    window.addEventListener("keydown", (e) => {
      if (
        ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(
          e.key
        )
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

      const stay = Math.round((Date.now() - enterTimeRef.current) / 1000);

      fetch(`${API_BASE}/api/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userNoRef.current,
          product_id: data.id,
          stay_time: stay,
          scroll_depth: scrollCountRef.current,
        }),
        keepalive: true,
      }).catch(() => { });
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
    return groupSpecsByCategory(raw.Spec, data.category);
  }, [raw, data, isLaptop]);

  /* ---------------- render ---------------- */

  if (loading) return <div className="detail-container">로딩중...</div>;
  if (error) return <div className="detail-container">{error}</div>;
  if (!data) return null;

  return (
    <div className="detail-container">
      <Link to="/products" className="back-link">
        ← 목록으로
      </Link>

      {/* top */}
      <div className="detail-top" style={{ position: "relative" }}>
        <div className="detail-image">
          <SmartImg url={mainImage} alt={data.name} />
        </div>

        <div className="detail-summary">
          <span>{data.brand}</span>
          <h1>{data.name}</h1>
          <p>{Number(data.price || 0).toLocaleString()}원</p>
          <p>카테고리: {data.category}</p>
        </div>

        {/* ✅ [ADD] 비교 분석하기 버튼: “담기”만 하고 이동 없음 */}
        <div className="compare-btn-wrap">
          <button
            type="button"
            className={`gotolist ${inCompare ? "is-active" : ""}`}
            onClick={handleCompareClick}
          >
            {inCompare ? "비교목록 제거" : "비교 분석하기"}
          </button>
        </div>


        {/* specs */}
        {isLaptop
          ? laptopSections.map((sec) => (
            <section key={sec.title}>
              <h2>{sec.title}</h2>
              <ul>
                {sec.items.map(([k, v]) => (
                  <li key={k}>
                    <b>{k}</b> : {v}
                  </li>
                ))}
              </ul>
            </section>
          ))
          : Object.entries(groupedSpecs).map(([title, items]) => (
            <section key={title}>
              <h2>{title}</h2>
              <ul>
                {items.map(([k, v]) => (
                  <li key={k}>
                    <b>{k}</b> : {String(v)}
                  </li>
                ))}
              </ul>
            </section>
          ))}

        {/* detail images */}
        {detailImages.length > 0 && (
          <section>
            <h2>상세 설명</h2>
            {detailImages.map((u) => (
              <SmartImg key={u} url={u} />
            ))}
          </section>
        )}
      </div>
    </div>
      );
}
