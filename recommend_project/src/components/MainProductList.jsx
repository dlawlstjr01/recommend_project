import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRecommendations } from "../services/recommendService";
import { FaArrowRight, FaSearch } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

/* -------------------------------
   이미지 안정화
-------------------------------- */
function stableImg(id) {
  const seed = Array.from(String(id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  return `https://picsum.photos/400/400?random=${seed % 1000}`;
}

/* -------------------------------
   배열 랜덤 섞기
-------------------------------- */
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function MainProductList() {
  const [keyword, setKeyword] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // ✅ 개인화 추천
  const [personalRecommendList, setPersonalRecommendList] = useState([]);
  const [loadingRecommend, setLoadingRecommend] = useState(true);

  // 🔥 로그인 사용자 정보
  const [me, setMe] = useState(null);

  // ✅ (추가) category key -> label
  const [labelByKey, setLabelByKey] = useState({});

  // ✅ (추가) 카테고리 라벨 로드 (ProductsPage 방식 그대로)
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

  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);

  /* -------------------------------
     전체 상품 로드
  -------------------------------- */
  useEffect(() => {
    let ignore = false;

    async function fetchProducts() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/products`);
        const list = await res.json();
        if (ignore) return;

        const normalized = (Array.isArray(list) ? list : []).map((p) => ({
          ...p,
          brand: p.brand || "기타",
          img: p.img || stableImg(p.id),
          tags: p.tags || [],
          // ✅ (추가) categoryLabel 붙이기
          categoryLabel: labelByKey[p.category] || p.category || "",
        }));

        setProducts(shuffleArray(normalized));
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchProducts();
    return () => {
      ignore = true;
    };
  }, [JSON.stringify(labelByKey)]); // ✅ (추가) 라벨맵 로드 후에도 categoryLabel 반영되게

  /* -------------------------------
     개인화 추천 로드
  -------------------------------- */
  useEffect(() => {
    if (!me?.user_no) {
      setPersonalRecommendList([]);
      setLoadingRecommend(false);
      return;
    }

    const loadRecommend = async () => {
      try {
        const res = await fetchRecommendations();
        console.log("🔥 /api/recommend response:", res);

        const items = Array.isArray(res?.items) ? res.items : [];

        const normalized = items.map((p, idx) => {
          const id = p.item_no ?? p.id ?? idx;
          const category = p.category;

          return {
            id,
            product_id: id,
            name: p.product_name ?? p.name ?? "상품명 없음",
            brand: p.brand || "기타",
            price: Number(p.price) || 0,
            category,
            // ✅ (추가) 추천에도 categoryLabel 붙이기
            categoryLabel: labelByKey[category] || category || "",
            img: p.thumbnail || p.img || stableImg(id),
            tags: ["추천"],
          };
        });

        setPersonalRecommendList(normalized);
      } catch (e) {
        console.error("❌ recommend load error:", e);
        setPersonalRecommendList([]);
      } finally {
        setLoadingRecommend(false);
      }
    };

    loadRecommend();
  }, [me, JSON.stringify(labelByKey)]); // ✅ (추가) 라벨맵 반영

  const goSearch = () => {
    if (keyword.trim()) {
      window.location.href = `/products?keyword=${encodeURIComponent(keyword)}`;
    }
  };

  // 기존 랜덤 섹션
  const expertPickList = products.slice(0, 5);
  const bestList = products.slice(5, 10);
  const newList = products.slice(10, 15);

  const renderGrid = (list) => (
    <div className="product-grid">
      {list.map((p) => (
        <Link
          key={p.id}
          to={`/products/${encodeURIComponent(p.id)}`}
          state={{
            product: p,
            raw: p.raw || p,
            from: "recommend",
          }}
          className="product-card"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="product-img-wrapper">
            <img src={p.img} alt={p.name} />
          </div>

          <div className="product-info">
            <span className="product-brand">{p.brand}</span>
            <p className="product-name">{p.name}</p>
            <p className="product-price">
              {(Number(p.price) || 0).toLocaleString()}원
            </p>

            {/* ✅ 여기 “아래 카테고리”가 이제 뜸 */}
            <p style={{ fontSize: 12, opacity: 0.7 }}>
              {p.categoryLabel || labelByKey[p.category] || p.category || ""}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );

  if (loading) return <div style={{ padding: 40 }}>로딩중...</div>;

  return (
    <section className="main-product-section">
      {/* 검색 */}
      <div className="main-search-container">
        <div className="search-bar-wrapper">
          <FaSearch className="search-icon" />
          <input
            type="text"
            className="main-search-input"
            placeholder="찾으시는 IT 제품이 있으신가요?"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goSearch()}
          />
          <button className="main-search-btn" onClick={goSearch}>
            검색하기
          </button>
        </div>
      </div>

      {/* ✅ 아이콘 제거 + 배너형 타이틀 */}
      <Section title="맞춤 추천 상품" badge="AI PICK" tone="recommend" link="/products">
        {renderGrid(expertPickList)}
      </Section>

      <Section title="지금 핫한 인기상품" badge="HOT" tone="hot" link="/products">
        {renderGrid(bestList)}
      </Section>

      <Section title="따끈따끈 신제품" badge="NEW" tone="new" link="/products">
        {renderGrid(newList)}
      </Section>

      <div className="bottom-btn-area">
        <button
          className="view-all-btn"
          onClick={() => (window.location.href = "/products")}
        >
          전체 제품 보러가기 <FaArrowRight />
        </button>
      </div>
    </section>
  );
}

/* ✅ 섹션 헤더(아이콘 없이도 강조) */
function Section({ title, badge, tone = "recommend", link, children }) {
  return (
    <div className={`section-block section-${tone}`}>
      <div className="section-header">
        <div className="section-title-wrap">
          <span className="section-accent" aria-hidden="true" />

          <h2 className="main-title">{title}</h2>

          {badge ? <span className="section-badge badge-inline">{badge}</span> : null}
        </div>

        <div className="section-actions">
          <Link className="more-link more-raised" to={link}>
            더보기 +
          </Link>
        </div>
      </div>

      {children}
    </div>
  );
}
