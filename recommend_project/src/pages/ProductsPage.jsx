import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, Link, useLocation } from "react-router-dom";
import LoadingOverlay from "../components/LoadingOverlay";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

// ✅ Sidebar랑 동일하게 유지
const BRAND_OPTIONS = ["삼성전자", "LG전자", "로지텍", "ASUS", "Lenovo"];

/** 브랜드 문자열 정규화 */
function normBrand(v) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\-_/.,]/g, "");
}

/** "기타"에서 제외할 브랜드 키워드(변형 포함) */
const EXCLUDE_BRAND_KEYWORDS = [
  ["삼성전자", "삼성", "samsung"],
  ["lg전자", "lg", "엘지"],
  ["로지텍", "logitech"],
  ["asus"],
  ["lenovo", "레노버"],
];

function isExcludedBrand(brand) {
  const b = normBrand(brand);
  if (!b) return false;

  return EXCLUDE_BRAND_KEYWORDS.some((group) =>
    group.some((kw) => b.includes(normBrand(kw)))
  );
}

/**  배열 랜덤 셔플 (Fisher–Yates) */
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**  신제품에서 날짜가 없을 때: 카테고리별로 번갈아 섞기(라운드로빈) */
function interleaveByCategory(list) {
  const groups = new Map();
  for (const p of list) {
    const key = p.category || "etc";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  for (const [k, arr] of groups.entries()) {
    groups.set(k, shuffleArray(arr));
  }

  const keys = Array.from(groups.keys());
  const result = [];
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const k of keys) {
      const arr = groups.get(k);
      if (arr && arr.length) {
        result.push(arr.shift());
        progressed = true;
      }
    }
  }
  return result;
}

function stableImg(id) {
  const seed = Array.from(String(id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  return `https://picsum.photos/400/400?random=${seed % 1000}`;
}

/*  페이지 버튼: 1..n 중 일부만 보여주기 */
function getPageItems(current, total, maxButtons = 7) {
  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items = [];
  const side = Math.floor((maxButtons - 3) / 2);

  const start = Math.max(2, current - side);
  const end = Math.min(total - 1, current + side);

  items.push(1);
  if (start > 2) items.push("…");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("…");
  items.push(total);

  return items;
}

/**  태그 유틸 */
function hasAnyTag(product, keywords) {
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  const lowered = tags.map((t) => String(t).toLowerCase());
  return lowered.some((t) => keywords.some((k) => t.includes(k)));
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parsePrice(v) {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export default function ProductsPage() {
  const context = useOutletContext();
  const filters = context?.filters || {};
  const location = useLocation();

  /**  현재 경로로 모드 결정 */
  const mode = useMemo(() => {
    if (location.pathname === "/products/new") return "recommend"; // 추천
    if (location.pathname === "/products/best") return "best"; // 인기
    if (location.pathname === "/products/category") return "newest"; // 신제품
    return "all"; // 전체
  }, [location.pathname]);

  const pageTitle = useMemo(() => {
    if (mode === "recommend") return "추천 상품";
    if (mode === "best") return "인기 상품";
    if (mode === "newest") return "신제품";
    return "전체 제품 찾기";
  }, [mode]);

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // category key -> label
  const [labelByKey, setLabelByKey] = useState({});

  /* 페이지네이션 상태 */
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  /**  모드가 바뀌면 랜덤/정렬이 다시 적용되도록 트리거 */
  const [orderKey, setOrderKey] = useState(0);
  useEffect(() => {
    setOrderKey((k) => k + 1);
    setPage(1);
  }, [mode]);

  /** 카테고리 라벨 로드 */
  useEffect(() => {
    let ignore = false;

    async function fetchCategoryLabels() {
      try {
        const res = await fetch(`${API_BASE}/api/products/categories`);
        const list = await res.json();
        if (ignore) return;

        const map = {};
        if (Array.isArray(list)) {
          list.forEach((c) => {
            if (c?.key) map[c.key] = c.label || c.key;
          });
        }
        setLabelByKey(map);
      } catch {
        if (!ignore) setLabelByKey({});
      }
    }

    fetchCategoryLabels();
    return () => {
      ignore = true;
    };
  }, []);

  /** 제품 로드 (✅ brandOther / brand 변경 시에도 다시 fetch 해서 로딩이 보이게) */
  useEffect(() => {
    let ignore = false;

    async function fetchProducts() {
      try {
        setError("");
        setLoading(true);

        const selectedKeys = Array.isArray(filters.category) ? filters.category : [];
        const params = new URLSearchParams();

        // 카테고리
        selectedKeys.forEach((k) => params.append("category", k));

        // ✅ 브랜드 (서버가 지원하면 여기서도 걸러짐 / 지원 안 해도 프론트에서 최종 필터링)
        if (filters.brandOther) {
          params.set("excludeBrands", BRAND_OPTIONS.join(","));
        } else if (Array.isArray(filters.brand) && filters.brand.length > 0) {
          params.set("brands", filters.brand.join(","));
        }

        const url =
          params.toString().length > 0
            ? `${API_BASE}/api/products?${params.toString()}`
            : `${API_BASE}/api/products`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const list = await res.json();

        let normalized = (Array.isArray(list) ? list : []).map((p) => ({
          ...p,
          // ✅ 공백/이상값 정리
          brand: String(p.brand ?? "").trim() || "기타",
          img: p.img || stableImg(p.id),
          categoryLabel: labelByKey[p.category] || p.category,
          tags: p.tags || [],
        }));

        // id 중복 제거
        normalized = Array.from(new Map(normalized.map((p) => [p.id, p])).values());

        if (!ignore) setAllProducts(normalized);
      } catch {
        if (!ignore) setError("제품 목록을 불러오지 못했습니다. (서버 확인)");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchProducts();
    return () => {
      ignore = true;
    };
  }, [
    mode,
    JSON.stringify(filters.category || []),
    JSON.stringify(filters.brand || []),
    filters.brandOther,
    filters.sortOrder,
    JSON.stringify(labelByKey),
  ]);

  /**  모드별 “기본 목록” 만들기 */
  const modeBaseList = useMemo(() => {
    const list = [...allProducts];

    const uniq = (arr) => Array.from(new Map(arr.map((p) => [p.id, p])).values());

    const dateScore = (p) =>
      parseDate(p.createdAt) || parseDate(p.releaseDate) || parseDate(p.date);

    const popScore = (p) =>
      safeNumber(p.popularity) ||
      safeNumber(p.sales) ||
      safeNumber(p.views) ||
      safeNumber(p.likeCount) ||
      safeNumber(p.orderCount) ||
      safeNumber(p.reviewCount) ||
      0;

    if (mode === "recommend") {
      const tagged = list.filter((p) => hasAnyTag(p, ["추천", "recommend"]));
      const taggedIds = new Set(tagged.map((p) => p.id));
      const rest = list.filter((p) => !taggedIds.has(p.id));
      return uniq(shuffleArray(tagged).concat(shuffleArray(rest)));
    }

    if (mode === "best") {
      const tagged = list.filter((p) => hasAnyTag(p, ["인기", "베스트", "best", "popular"]));
      const taggedIds = new Set(tagged.map((p) => p.id));
      const rest = list.filter((p) => !taggedIds.has(p.id));

      const sortedRest = [...rest].sort((a, b) => popScore(b) - popScore(a));
      const allZero = sortedRest.every((p) => popScore(p) === 0);

      return uniq(tagged.concat(allZero ? shuffleArray(rest) : sortedRest));
    }

    if (mode === "newest") {
      const tagged = list.filter((p) => hasAnyTag(p, ["신제품", "new", "latest"]));
      const taggedIds = new Set(tagged.map((p) => p.id));
      const rest = list.filter((p) => !taggedIds.has(p.id));

      const anyDate = rest.some((p) => dateScore(p));
      const sortedRest = anyDate
        ? [...rest].sort((a, b) => {
            const ad = dateScore(a);
            const bd = dateScore(b);

            if (ad && bd) return bd.getTime() - ad.getTime();
            if (ad && !bd) return -1;
            if (!ad && bd) return 1;
            return 0;
          })
        : interleaveByCategory(rest);

      return uniq(tagged.concat(sortedRest));
    }

    const selectedKeys = Array.isArray(filters.category) ? filters.category : [];
    if (selectedKeys.length === 0 && !filters.sortOrder) return shuffleArray(list);

    return list;
  }, [allProducts, mode, orderKey, JSON.stringify(filters.category || []), filters.sortOrder]);

  /**  프론트 필터 & 정렬 (✅ 여기서 "기타"를 확실하게 적용) */
  const filteredList = useMemo(() => {
    let results = [...modeBaseList];

    // 키워드
    const keyword = String(filters.keyword || "").toLowerCase().trim();
    if (keyword) {
      results = results.filter(
        (p) =>
          String(p.name || "").toLowerCase().includes(keyword) ||
          String(p.brand || "").toLowerCase().includes(keyword)
      );
    }

    // 카테고리
    const categoryFilter = Array.isArray(filters.category) ? filters.category : [];
    if (categoryFilter.length > 0) {
      const allowed = new Set(categoryFilter);
      results = results.filter((p) => allowed.has(p.category));
    }

    // ✅ 브랜드: 기타(=지정 브랜드 제외)
    if (filters.brandOther) {
      results = results.filter((p) => !isExcludedBrand(p.brand));
    } else if (Array.isArray(filters.brand) && filters.brand.length > 0) {
      // 일반 브랜드 선택도 정규화해서 비교(조금 더 관대하게)
      const selected = filters.brand.map(normBrand);
      results = results.filter((p) => selected.includes(normBrand(p.brand)));
    }

    // 가격
    if (filters.price && filters.price !== "all") {
      results = results.filter((p) => {
        const price = parsePrice(p.price);
        if (price == null) return false;
        switch (filters.price) {
          case "50_down":
            return price <= 500000;
          case "100_down":
            return price <= 1000000;
          case "200_down":
            return price <= 2000000;
          case "300_down":
            return price <= 3000000;
          case "400_down":
            return price <= 4000000;
          default:
            return true;
        }
      });
    }

    // 정렬
    if (filters.sortOrder === "lowPrice") {
      results.sort(
        (a, b) => (parsePrice(a.price) ?? Infinity) - (parsePrice(b.price) ?? Infinity)
      );
    } else if (filters.sortOrder === "highPrice") {
      results.sort(
        (a, b) => (parsePrice(b.price) ?? -Infinity) - (parsePrice(a.price) ?? -Infinity)
      );
    }

    return results;
  }, [modeBaseList, filters, mode]);

  /*  필터가 바뀌면 1페이지로 */
  useEffect(() => {
    setPage(1);
  }, [
    mode,
    filters.keyword,
    filters.price,
    filters.sortOrder,
    filters.brandOther,
    JSON.stringify(filters.category || []),
    JSON.stringify(filters.brand || []),
  ]);

  /*  현재 페이지에 보여줄 목록만 slice */
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pagedList = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredList.slice(start, start + PAGE_SIZE);
  }, [filteredList, safePage]);

  /*  페이지 이동 시 위로 스크롤 */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [safePage]);

  if (error) return <div className="product-list-container">{error}</div>;

  const pageItems = getPageItems(safePage, totalPages, 7);

  return (
    <>
      {loading && (
        <LoadingOverlay
          text={
            filters.category?.length || filters.brandOther || (filters.brand || []).length
              ? "필터 적용 중..."
              : mode === "recommend"
              ? "추천 상품 불러오는 중..."
              : mode === "best"
              ? "인기 상품 불러오는 중..."
              : mode === "newest"
              ? "신제품 불러오는 중..."
              : "전체 제품 불러오는 중..."
          }
        />
      )}

      <div className="product-list-container">
        <div className="list-header-area">
          <h2 className="page-title">
            <span>{pageTitle}</span>
          </h2>
          <span className="product-count">총 {filteredList.length}개 제품</span>
        </div>

        {pagedList.length > 0 ? (
          <>
            <div className="product-grid">
              {pagedList.map((p) => (
                <Link
                  key={p.id}
                  to={`/products/${encodeURIComponent(p.id)}`}
                  state={{ product: p }}
                  className="product-card"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="product-img-wrapper">
                    <img src={p.img} alt={p.name} loading="lazy" />
                    <div className="badge-container">
                      {(p.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className={`product-badge badge-${String(tag).toLowerCase()}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="product-info">
                    <span className="product-brand">{p.brand}</span>
                    <p className="product-name">{p.name}</p>
                    <p className="product-price">
                      {(Number(p.price) || 0).toLocaleString()}원
                    </p>
                    <p style={{ fontSize: 12, opacity: 0.7 }}>{p.categoryLabel}</p>
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
                  이전
                </button>

                {pageItems.map((it, idx) =>
                  it === "…" ? (
                    <span key={`dots-${idx}`} className="page-dots">
                      …
                    </span>
                  ) : (
                    <button
                      key={it}
                      className={`page-num ${it === safePage ? "is-active" : ""}`}
                      onClick={() => setPage(it)}
                    >
                      {it}
                    </button>
                  )
                )}

                <button
                  className="page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                >
                  다음
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>조건에 맞는 제품이 없습니다.</p>
            <p style={{ fontSize: "14px", marginTop: "5px" }}>
              필터를 변경하거나 초기화해보세요.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
