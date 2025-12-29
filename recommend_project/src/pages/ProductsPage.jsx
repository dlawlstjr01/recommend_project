import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { FaSearch } from "react-icons/fa";
import LoadingOverlay from "../components/LoadingOverlay";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

/** 🔀 배열 랜덤 셔플 (Fisher–Yates) */
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function stableImg(id) {
  const seed = Array.from(String(id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  return `https://picsum.photos/400/400?random=${seed % 1000}`;
}

/* ✅ 페이지 버튼: 1..n 중 일부만 보여주기 */
function getPageItems(current, total, maxButtons = 7) {
  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items = [];
  const side = Math.floor((maxButtons - 3) / 2); // 가운데 기준 좌우 개수

  const start = Math.max(2, current - side);
  const end = Math.min(total - 1, current + side);

  items.push(1);

  if (start > 2) items.push("…");

  for (let p = start; p <= end; p++) items.push(p);

  if (end < total - 1) items.push("…");

  items.push(total);

  return items;
}

export default function ProductsPage() {
  const context = useOutletContext();
  const filters = context?.filters || {};

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  //  category key -> label
  const [labelByKey, setLabelByKey] = useState({});

  /*  페이지네이션 상태 */
  const PAGE_SIZE = 25; // 페이지당 24개 (원하면 20/30/48로 바꿔도 됨)
  const [page, setPage] = useState(1);

  /**  카테고리 라벨 로드 */
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

  /** 2️⃣ 제품 로드 (전체 조회 시 랜덤 섞기) */
  useEffect(() => {
    let ignore = false;

    async function fetchProducts() {
      try {
        setError("");
        setLoading(true);

        const selectedKeys = Array.isArray(filters.category) ? filters.category : [];

        const params = new URLSearchParams();
        selectedKeys.forEach((k) => params.append("category", k));

        const url =
          params.toString().length > 0
            ? `${API_BASE}/api/products?${params.toString()}`
            : `${API_BASE}/api/products`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const list = await res.json();

        let normalized = (Array.isArray(list) ? list : []).map((p) => ({
          ...p,
          brand: p.brand || "기타",
          img: p.img || stableImg(p.id),
          categoryLabel: labelByKey[p.category] || p.category,
          tags: p.tags || [],
        }));

        // id 중복 제거
        normalized = Array.from(new Map(normalized.map((p) => [p.id, p])).values());

        /** ✅ 핵심 로직: 전체 랜덤 노출 */
        if (selectedKeys.length === 0 && !filters.sortOrder) {
          normalized = shuffleArray(normalized);
        }

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
    JSON.stringify(filters.category || []),
    filters.sortOrder,
    JSON.stringify(labelByKey),
  ]);

  /** 3️⃣ 프론트 필터 & 정렬 */
  const filteredList = useMemo(() => {
    let results = [...allProducts];

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
    if (Array.isArray(filters.category) && filters.category.length > 0) {
      const allowed = new Set(filters.category);
      results = results.filter((p) => allowed.has(p.category));
    }

    // 브랜드
    if (Array.isArray(filters.brand) && filters.brand.length > 0) {
      results = results.filter((p) => filters.brand.includes(p.brand));
    }

    // 가격
    if (filters.price && filters.price !== "all") {
      results = results.filter((p) => {
        const price = Number(p.price) || 0;
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
      results.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (filters.sortOrder === "highPrice") {
      results.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    }

    return results;
  }, [allProducts, filters]);

  /* ✅ 필터가 바뀌면 1페이지로 */
  useEffect(() => {
    setPage(1);
  }, [
    filters.keyword,
    filters.price,
    filters.sortOrder,
    JSON.stringify(filters.category || []),
    JSON.stringify(filters.brand || []),
  ]);

  /* ✅ 현재 페이지에 보여줄 목록만 slice */
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pagedList = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredList.slice(start, start + PAGE_SIZE);
  }, [filteredList, safePage]);

  /* ✅ 페이지 이동 시 위로 스크롤(선택) */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [safePage]);

  if (error) return <div className="product-list-container">{error}</div>;

  const pageItems = getPageItems(safePage, totalPages, 7);

  return (
    <>
      {loading && (
        <LoadingOverlay
          text={filters.category?.length ? "필터 적용 중..." : "전체 제품 불러오는 중..."}
        />
      )}

      <div className="product-list-container">
        <div className="list-header-area">
          <h2 className="page-title">
            <FaSearch className="text-blue-500" />
            <span>전체 제품 찾기</span>
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

            {/* ✅ 페이지네이션 UI */}
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
                    <span key={`dots-${idx}`} className="page-dots">…</span>
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
