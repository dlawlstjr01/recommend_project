import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRecommendations } from "../services/recommendService";
import { FaArrowRight, FaSearch } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

function stableImg(id) {
  const seed = Array.from(String(id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  return `https://picsum.photos/400/400?random=${seed % 1000}`;
}

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

  const [personalRecommendList, setPersonalRecommendList] = useState([]);
  const [loadingRecommend, setLoadingRecommend] = useState(true);

  const [me, setMe] = useState(null);
  const [labelByKey, setLabelByKey] = useState({});

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
    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);

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
  }, [JSON.stringify(labelByKey)]);

  // ✅ 개인화 추천 로드
  useEffect(() => {
    const userNo = me?.user_no ?? me?.userNo ?? null; // ✅ 둘 다 지원

    if (!userNo) {
      setPersonalRecommendList([]);
      setLoadingRecommend(false);
      return;
    }

    const loadRecommend = async () => {
      setLoadingRecommend(true);
      try {
        const res = await fetchRecommendations();
        console.log("🔥 /api/recommend response:", res);

        const items = Array.isArray(res?.items) ? res.items : [];

        const normalized = items.map((p, idx) => {
          const id = p.id ?? idx; // ✅ main.py는 id 내려줌
          const category = p.category;

          return {
            id,
            product_id: p.id, // (원하면 p.url 같은 것도 붙일 수 있음)
            name: p.name ?? "상품명 없음",
            brand: p.brand || "기타",
            price: Number(p.price) || 0,
            category,
            categoryLabel: labelByKey[category] || category || "",
            img: p.img || stableImg(id),
            tags: ["추천"],
            url: p.url,
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
  }, [me, JSON.stringify(labelByKey)]);

  const goSearch = () => {
    if (keyword.trim()) {
      window.location.href = `/products?keyword=${encodeURIComponent(keyword)}`;
    }
  };

  const expertPickList = products.slice(0, 5);
  const bestList = products.slice(5, 10);
  const newList = products.slice(10, 15);

  const renderGrid = (list) => (
    <div className="product-grid">
      {list.map((p) => (
        <Link
          key={p.id}
          to={`/products/${encodeURIComponent(p.id)}`}
          state={{ product: p, raw: p.raw || p, from: "recommend" }}
          className="product-card"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="product-img-wrapper">
            <img src={p.img} alt={p.name} />
          </div>

          <div className="product-info">
            <span className="product-brand">{p.brand}</span>
            <p className="product-name">{p.name}</p>
            <p className="product-price">{(Number(p.price) || 0).toLocaleString()}원</p>
            <p style={{ fontSize: 12, opacity: 0.7 }}>
              {p.categoryLabel || labelByKey[p.category] || p.category || ""}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );

  if (loading) return <div style={{ padding: 40 }}>로딩중...</div>;

  // ✅ 맞춤 추천 섹션에 보여줄 리스트
  const recommendTop5 =
    personalRecommendList.length > 0 ? personalRecommendList.slice(0, 5) : expertPickList;

  return (
    <section className="main-product-section">
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

      <Section title="맞춤 추천 상품" badge="AI PICK" tone="recommend" link="/products">
        {loadingRecommend ? (
          <div style={{ padding: 16 }}>추천 불러오는 중...</div>
        ) : (
          renderGrid(recommendTop5) // ✅ 여기 핵심!
        )}
      </Section>

      <Section title="지금 핫한 인기상품" badge="HOT" tone="hot" link="/products">
        {renderGrid(bestList)}
      </Section>

      <Section title="따끈따끈 신제품" badge="NEW" tone="new" link="/products">
        {renderGrid(newList)}
      </Section>

      <div className="bottom-btn-area">
        <button className="view-all-btn" onClick={() => (window.location.href = "/products")}>
          전체 제품 보러가기 <FaArrowRight />
        </button>
      </div>
    </section>
  );
}

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
