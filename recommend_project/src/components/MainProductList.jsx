import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRecommendations } from "../services/recommendService";
import { FaFire, FaMedal, FaThumbsUp, FaArrowRight, FaSearch } from "react-icons/fa";

const NODE_API =
  import.meta.env.VITE_NODE_API_BASE || "http://localhost:5000";

/* 이미지 안정화 */
function stableImg(id) {
  const seed = Array.from(String(id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  return `https://picsum.photos/400/400?random=${seed % 1000}`;
}

/* 배열 랜덤 섞기 */
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

  // 개인화 추천
  const [personalRecommendList, setPersonalRecommendList] = useState([]);
  const [loadingRecommend, setLoadingRecommend] = useState(true);

  // 로그인 사용자 정보
  const [me, setMe] = useState(null);

  useEffect(() => {
    fetch(`${NODE_API}/auth/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);

  const userNo = me?.user_no ?? me?.userNo; // ✅ 둘 다 대응

  /* 전체 상품 로드 */
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

  /* 개인화 추천 로드 */
  useEffect(() => {
    const ac = new AbortController();

    if (!userNo) {
      setPersonalRecommendList([]);
      setLoadingRecommend(false);
      return () => ac.abort();
    }

    const loadRecommend = async () => {
      try {
        setLoadingRecommend(true);

        const res = await fetchRecommendations({ signal: ac.signal });
        console.log("🔥 /api/recommend response:", res);

        const items = Array.isArray(res?.items) ? res.items : [];

        // ✅ Flask가 내려주는 형식(id,name,brand,price,category,img,raw)에 맞춤
        const normalized = items
          .filter((p) => p?.id) // id 없는 건 제외
          .map((p) => ({
            id: String(p.id), // ✅ 무조건 문자열 id
            name: p.name ?? "상품명 없음",
            brand: p.brand || "기타",
            price: Number(p.price) || 0,
            category: p.category,
            img: p.img || stableImg(p.id),
            raw: p.raw || null,
            url: p.url || null,
            tags: ["추천"],
          }));

        setPersonalRecommendList(normalized);
      } catch (e) {
        console.error("❌ recommend load error:", e);
        setPersonalRecommendList([]);
      } finally {
        setLoadingRecommend(false);
      }
    };

    loadRecommend();
    return () => ac.abort();
  }, [userNo]);

  const goSearch = () => {
    if (keyword.trim()) {
      window.location.href = `/products?keyword=${encodeURIComponent(keyword)}`;
    }
  };

  const expertPickList = products.slice(0, 4);
  const bestList = products.slice(4, 8);
  const newList = products.slice(8, 12);

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
          url: p.url || null,
          raw: p.raw || null,
        };

        return (
          <Link
            key={p.id}
            to={`/products/${encodeURIComponent(p.id)}`}
            state={{
              product: productForDetail,
              raw: productForDetail.raw,
              from: "recommend",
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

      {/* 개인화 추천 */}
      <Section title="🎯 맞춤 추천 상품" icon={<FaThumbsUp />} link="/products">
        {loadingRecommend ? (
          <div style={{ padding: 20 }}>추천 불러오는 중...</div>
        ) : personalRecommendList.length > 0 ? (
          renderGrid(personalRecommendList)
        ) : (
          <div style={{ padding: 20, opacity: 0.6 }}>
            맞춤 추천 상품이 없습니다
          </div>
        )}
      </Section>

      {/* 기존 섹션 */}
      <Section title="전문가 추천 PICK" icon={<FaThumbsUp />} link="/products">
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
        <span className="more-link" onClick={() => (window.location.href = link)}>
          더보기 +
        </span>
      </div>
      {children}
    </div>
  );
}
