import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaFire,
  FaMedal,
  FaThumbsUp,
  FaArrowRight,
  FaSearch,
} from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

function stableImg(id) {
  const seed = Array.from(String(id)).reduce(
    (s, c) => s + c.charCodeAt(0),
    0
  );
  return `https://picsum.photos/400/400?random=${seed % 1000}`;
}

export default function MainProductList() {
  const [keyword, setKeyword] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

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
        }));

        setProducts(normalized);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchProducts();
    return () => {
      ignore = true;
    };
  }, []);

  const goSearch = () => {
    if (keyword.trim()) {
      window.location.href = `/products?keyword=${encodeURIComponent(keyword)}`;
    }
  };

  // 👉 메인에서는 그냥 앞에서부터 나눔 (tags 의존 ❌)
  const recommendList = products.slice(0, 4);
  const bestList = products.slice(4, 8);
  const newList = products.slice(8, 12);

  const renderGrid = (list) => (
    <div className="product-grid">
      {list.map((p) => (
        <Link
          key={p.id}
          to={`/products/${encodeURIComponent(p.id)}`}
          state={{ product: p }}
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
            <p style={{ fontSize: 12, opacity: 0.7 }}>{p.category}</p>
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

      {/* 전문가 추천 */}
      <Section title="전문가 추천 PICK" icon={<FaThumbsUp />} link="/products">
        {renderGrid(recommendList)}
      </Section>

      {/* 인기 상품 */}
      <Section title="지금 핫한 인기상품" icon={<FaFire />} link="/products">
        {renderGrid(bestList)}
      </Section>

      {/* 신제품 */}
      <Section title="따끈따끈 신제품" icon={<FaMedal />} link="/products">
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

function Section({ title, icon, link, children }) {
  return (
    <div className="section-block">
      <div className="section-header">
        <h2 className="section-title">
          {icon} {title}
        </h2>
        <span
          className="more-link"
          onClick={() => (window.location.href = link)}
        >
          더보기 +
        </span>
      </div>
      {children}
    </div>
  );
}
