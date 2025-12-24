import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { FaSearch } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

function stableImg(id) {
  const seed = Array.from(String(id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  return `https://picsum.photos/400/400?random=${seed % 1000}`;
}

export default function ProductsPage() {
  const context = useOutletContext();
  const filters = context?.filters || {};

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ✅ category key -> label (한글 라벨 표시용)
  const [labelByKey, setLabelByKey] = useState({});

  // 1) 카테고리 라벨 맵 로드 (한 번만)
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

  // 2) 제품 로드: 선택된 카테고리(key 배열)로 서버에 그대로 보냄
  useEffect(() => {
    let ignore = false;

    async function fetchProducts() {
      try {
        setError("");
        setLoading(true);

        const selectedKeys = Array.isArray(filters.category) ? filters.category : [];

        const params = new URLSearchParams();
        selectedKeys.forEach((k) => params.append("category", k));

        // ✅ 카테고리 선택 없으면 전체 불러오기
        const url =
          params.toString().length > 0
            ? `${API_BASE}/api/products?${params.toString()}`
            : `${API_BASE}/api/products`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const list = await res.json();

        const normalized = (Array.isArray(list) ? list : []).map((p) => ({
          ...p,
          brand: p.brand || "기타",
          img: p.img || stableImg(p.id),
          categoryLabel: labelByKey[p.category] || p.category, // ✅ 화면 표시용 라벨
          tags: p.tags || [],
        }));

        // id 중복 제거
        const uniq = Array.from(new Map(normalized.map((p) => [p.id, p])).values());

        if (!ignore) setAllProducts(uniq);
      } catch (e) {
        if (!ignore) setError("제품 목록을 불러오지 못했습니다. (서버 응답/카테고리 API 확인)");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchProducts();
    return () => {
      ignore = true;
    };
    // ✅ labelByKey가 늦게 도착하면 categoryLabel 다시 계산되게 의존성 포함
  }, [JSON.stringify(filters.category || []), JSON.stringify(labelByKey)]);

  // 3) 프론트 필터(키워드/브랜드/가격/정렬) 적용
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

    // ✅ 카테고리: 이제 filters.category는 "cpu" 같은 key 배열
    if (Array.isArray(filters.category) && filters.category.length > 0) {
      const allowed = new Set(filters.category);
      results = results.filter((p) => allowed.has(p.category));
    }

    // 브랜드
    if (Array.isArray(filters.brand) && filters.brand.length > 0) {
      results = results.filter((p) => filters.brand.includes(p.brand));
    }

    // 가격대
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
    if (filters.sortOrder) {
      if (filters.sortOrder === "lowPrice") {
        results.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      } else if (filters.sortOrder === "highPrice") {
        results.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
      } else {
        results.sort((a, b) => String(b.id).localeCompare(String(a.id)));
      }
    }

    return results;
  }, [allProducts, filters]);

  if (loading) return <div className="product-list-container">로딩중...</div>;
  if (error) return <div className="product-list-container">{error}</div>;

  return (
    <div className="product-list-container">
      <div className="list-header-area">
        <h2 className="page-title">
          <FaSearch className="text-blue-500" />
          <span>전체 제품 찾기</span>
        </h2>
        <span className="product-count">총 {filteredList.length}개 제품</span>
      </div>

      {filteredList.length > 0 ? (
        <div className="product-grid">
          {filteredList.map((p) => (
            <Link
              key={p.id}
              to={`/products/${encodeURIComponent(p.id)}`}
              state={{ product: p }}
              className="product-card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="product-img-wrapper">
                <img src={p.img} alt={p.name} />
                <div className="badge-container">
                  {(p.tags || []).map((tag) => (
                    <span key={tag} className={`product-badge badge-${String(tag).toLowerCase()}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="product-info">
                <span className="product-brand">{p.brand}</span>
                <p className="product-name">{p.name}</p>
                <p className="product-price">{(Number(p.price) || 0).toLocaleString()}원</p>
                <p style={{ fontSize: 12, opacity: 0.7 }}>{p.categoryLabel}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>조건에 맞는 제품이 없습니다.</p>
          <p style={{ fontSize: "14px", marginTop: "5px" }}>필터를 변경하거나 초기화해보세요.</p>
        </div>
      )}
    </div>
  );
}
