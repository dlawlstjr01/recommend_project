import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useParams, Link } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

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
  if (typeof s !== "string") return false;
  if (!isHttpUrl(s)) return false;
  if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(s)) return true;
  if (/(img|image|photo|thumb|thumbnail|jpeg|jpg|png|webp)/i.test(s)) return true;
  return false;
}

/**
 * SmartImg:
 * 1) 원본 url로 바로 로드
 * 2) 실패하면 /api/image 프록시로 1번 재시도
 */
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

function displayVal(v) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "boolean") return yn(v);
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const initialProduct = location.state?.product || null;

  const [data, setData] = useState(initialProduct);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function fetchDetail() {
      try {
        setError("");
        setLoading(true);

        const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("fetch failed");
        const detail = await res.json();

        if (!ignore) {
          setData(detail);
          setRaw(detail.raw || null);
        }
      } catch (e) {
        if (!ignore) {
          setError("상세 정보를 불러오지 못했습니다.");
          setData(null);
          setRaw(null);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchDetail();
    return () => {
      ignore = true;
    };
  }, [id]);

  // ✅ 대표 이미지: BaseImageURL 우선 → data.img → placeholder
  const mainImage = useMemo(() => {
    const base = raw?.BaseImageURL || raw?.baseImageURL;
    if (isImageUrl(base)) return base;

    if (typeof data?.img === "string" && isImageUrl(data.img)) return data.img;
    if (typeof initialProduct?.img === "string" && isImageUrl(initialProduct.img)) return initialProduct.img;

    return stableImg(data?.id || id);
  }, [raw, data, initialProduct, id]);

  // ✅ 상세설명 이미지(쿠팡처럼 아래로 길게)
  const detailImages = useMemo(() => {
    const arr =
      Array.isArray(raw?.DetailImages) ? raw.DetailImages :
      Array.isArray(raw?.detailImages) ? raw.detailImages :
      [];

    return arr.filter((u) => isImageUrl(u));
  }, [raw]);

  // ✅ 스펙 섹션 (이미지 키는 빼서 라벨 안 보이게)
  const specSections = useMemo(() => {
    if (!raw) return [];

    const isLaptop = !!(raw.model_name || raw.core_spec || raw.price_krw);

    if (isLaptop) {
      const sections = [];

      sections.push({
        title: "기본 정보",
        items: [
          ["모델명", raw.model_name],
          ["제품코드(pcode)", raw.pcode],
        ].filter(([, v]) => v != null),
      });

      const cs = raw.core_spec || {};
      sections.push({
        title: "핵심 스펙",
        items: [
          ["CPU", cs.cpu_model],
          ["CPU 클럭", cs.cpu_clock_ghz != null ? `${cs.cpu_clock_ghz}GHz` : null],
          ["RAM", cs.ram_gb != null ? `${cs.ram_gb}GB` : null],
          ["RAM 업그레이드", cs.ram_upgradable != null ? yn(cs.ram_upgradable) : null],
          ["저장장치", cs.storage_gb != null ? `${cs.storage_gb}GB` : null],
          ["GPU", cs.gpu_chipset],
          ["VRAM", cs.vram_gb != null ? `${cs.vram_gb}GB` : null],
          ["NPU TOPS", cs.npu_tops != null ? String(cs.npu_tops) : null],
        ].filter(([, v]) => v != null),
      });

      const d = raw.display || {};
      sections.push({
        title: "디스플레이",
        items: [
          ["크기", d.inch != null ? `${d.inch}인치` : null],
          ["주사율", d.refresh_rate_hz != null ? `${d.refresh_rate_hz}Hz` : null],
          ["밝기", d.brightness_nit != null ? `${d.brightness_nit}nit` : null],
          ["광시야각", d.wide_view != null ? yn(d.wide_view) : null],
        ].filter(([, v]) => v != null),
      });

      return sections.filter((s) => s.items.length > 0);
    }

    // 다른 카테고리 fallback
    const banKeys = new Set(["BaseImageURL", "DetailImages", "baseImageURL", "detailImages"]);
    const entries = Object.entries(raw).filter(([k, v]) => {
      if (banKeys.has(k)) return false;
      if (typeof v === "boolean" && v === false) return false;
      if (k.startsWith("Name_") || k.startsWith("ReleaseDate_") || k.startsWith("Type_")) return v === true;
      return true;
    });

    return [
      {
        title: "제품 스펙",
        items: entries.slice(0, 80).map(([k, v]) => [k, displayVal(v)]),
      },
    ];
  }, [raw]);

  if (loading) return <div className="detail-container">로딩중...</div>;
  if (error) return <div className="detail-container">{error}</div>;
  if (!data) return null;

  return (
    <div className="detail-container">
      <Link to="/products" className="back-link">← 목록으로</Link>

      {/* ✅ 상단: 쿠팡처럼 대표 이미지 + 요약 */}
      <div className="detail-top" style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        <div
          style={{
            width: 520,
            height: 520,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <SmartImg
            url={mainImage}
            alt={data.name}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        <div className="detail-summary">
          <span className="detail-brand">{data.brand || "브랜드 정보 없음"}</span>
          <h1 className="detail-name">{data.name}</h1>
          <p className="detail-price">{Number(data.price || 0).toLocaleString()}원</p>
          <p style={{ opacity: 0.7 }}>카테고리: {data.category}</p>

          {data.url && (
            <p style={{ marginTop: 10 }}>
              <a href={data.url} target="_blank" rel="noreferrer">제품 페이지 열기</a>
            </p>
          )}
        </div>
      </div>

      {/* ✅ 스펙 */}
      {specSections.length > 0 && (
        specSections.map((sec) => (
          <section className="detail-section" key={sec.title}>
            <h2>{sec.title}</h2>
            <ul className="spec-list">
              {sec.items.map(([k, v], idx) => (
                <li key={`${k}-${idx}`}>
                  <b>{k}</b> : {v}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* ✅ 핵심: 상세설명 이미지(DetailImages) 아래로 길게" */}
      {detailImages.length > 0 && (
        <section className="detail-section" style={{ marginTop: 24 }}>
          <h2>상세 설명</h2>

          <div
            style={{
              width: "100%",
              maxWidth: 860,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {detailImages.map((u) => (
              <div
                key={u}
                style={{
                  border: "1px solid rgba(0,0,0,0.10)",
                  borderRadius: 12,
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <SmartImg
                  url={u}
                  alt="detail"
                  style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
