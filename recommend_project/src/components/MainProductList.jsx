import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRecommendations } from "../services/recommendService";
import {
  FaFire,
  FaMedal,
  FaThumbsUp,
  FaArrowRight,
  FaSearch,
} from "react-icons/fa";

const NODE_API = "http://localhost:5000";

/* -------------------------------
   이미지 안정화
-------------------------------- */
function stableImg(id) {
  const seed = Array.from(String(id)).reduce(
    (s, c) => s + c.charCodeAt(0),
    0
  );
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

useEffect(() => {
  fetch("http://localhost:5000/auth/me", {
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
        const res = await fetch(`${NODE_API}/api/products`);
        const list = await res.json();
        if (ignore) return;

        const normalized = (Array.isArray(list) ? list : []).map((p) => ({
          ...p,
          brand: p.brand || "기타",
          img: p.img || stableImg(p.id),
          tags: p.tags || [],
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
  }, []);

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

      return {
        id,                       // key + 라우팅용
        product_id: id,
        name: p.product_name ?? p.name ?? "상품명 없음",
        brand: p.brand || "기타",
        price: Number(p.price) || 0,
        category: p.category,
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
}, [me]);


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
    {list.map((p) => {
      const productForDetail = {
        id: p.id,
        category: p.category,
        name: p.name,
        price: p.price,
        brand: p.brand,
        img: p.img,
        url: p.url || null,   // 없으면 null
        raw: p.raw || p,      
      };

      return (
        <Link
          key={p.id}
          to={`/products/${encodeURIComponent(p.id)}`}
            state={{
            product: p,
            raw: p.raw || p,
            from: "recommend"
          }}
          className="product-card"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="product-img-wrapper">
            <img src={p.img} alt={p.name} />
          </div>

          <div className="product-info">
            <span className="product-brand">{p.brand || "기타"}</span>
            <p className="product-name">{p.name}</p>
            <p className="product-price">
              {(Number(p.price) || 0).toLocaleString()}원
            </p>
          </div>
        </Link>
      );
    })}
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

      {/* 기존 섹션 */}
      <Section title="맞춤 추천 상품" icon={<FaThumbsUp />} link="/products">
        {renderGrid(expertPickList)}
      </Section>

      <Section title="지금 핫한 인기상품" icon={<FaFire />} link="/products">
        {renderGrid(bestList)}
      </Section>

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
