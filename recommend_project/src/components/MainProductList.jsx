import React, { useState } from 'react';

import { FaFire, FaMedal, FaThumbsUp, FaArrowRight, FaSearch } from "react-icons/fa";

const MAIN_PRODUCTS = Array.from({ length: 15 }).map((_, i) => {
  let type = 'recommend';
  if (i >= 4 && i < 8) type = 'best';
  if (i >= 8) type = 'new';
  
  return {
    id: i + 1,
    brand: ['삼성', 'LG', 'Apple', 'ASUS', 'Lenovo'][i % 5],
    name: `${type.toUpperCase()} 고성능 노트북 ${i + 1}`,
    price: (800000 + i * 50000).toLocaleString(),
    img: `https://picsum.photos/300/300?random=${i + 50}`,
    type: type
  };
});

const MainProductList = () => {
  // const navigate = useNavigate(); // ★ 삭제
  const [keyword, setKeyword] = useState('');

  // ★ 새로고침하며 이동하는 함수
  const goToPage = (path) => {
    window.location.href = path;
  };

  const handleSearch = () => {
    if (keyword.trim()) {
      // 검색어 쿼리스트링 포함해서 이동 (필요하다면)
      // 여기선 일단 목록 페이지로 새로고침 이동
      window.location.href = `/products`; 
    }
  };

  const recommendList = MAIN_PRODUCTS.filter(p => p.type === 'recommend').slice(0, 4);
  const bestList = MAIN_PRODUCTS.filter(p => p.type === 'best').slice(0, 4);
  const newList = MAIN_PRODUCTS.filter(p => p.type === 'new').slice(0, 4);

  const renderProductCard = (product) => (
    <div 
      key={product.id} 
      className="main-product-card" 
      onClick={() => goToPage('/products')} // ★ navigate 대신 goToPage 사용
    >
      <div className="card-img-wrapper">
          <img src={product.img} alt={product.name} />
      </div>
      <div className="card-info">
          <p className="card-brand">{product.brand}</p>
          <h3 className="card-name">{product.name}</h3>
          <p className="card-price">{product.price}원</p>
      </div>
    </div>
  );

  return (
    <section className="main-product-section">
      
      {/* 검색창 영역 */}
      <div className="main-search-container">
          <div className="search-bar-wrapper">
            <FaSearch className="search-icon" />
            <input 
              type="text" 
              className="main-search-input"
              placeholder="찾으시는 IT 제품이 있으신가요?" 
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="main-search-btn" onClick={handleSearch}>
                검색하기
            </button>
          </div>
      </div>

      {/* 1. 전문가 추천 (Recommend) */}
      <div className="section-block">
        <div className="section-header">
            <h2 className="section-title">
                <FaThumbsUp className="icon-blue" /> 전문가 추천 PICK 
            </h2>
            <span className="more-link" onClick={() => goToPage('/products')}>더보기 +</span> {/* ★ 수정 */}
        </div>
        <div className="main-product-grid">
            {recommendList.map(renderProductCard)}
        </div>
      </div>

      {/* 2. 인기 급상승 (Best) */}
      <div className="section-block">
        <div className="section-header">
            <h2 className="section-title">
                <FaFire className="icon-orange" /> 지금 핫한 인기상품 
            </h2>
            <span className="more-link" onClick={() => goToPage('/products')}>더보기 +</span> {/* ★ 수정 */}
        </div>
        <div className="main-product-grid">
            {bestList.map(renderProductCard)}
        </div>
      </div>

      {/* 3. 신제품 (New) */}
      <div className="section-block">
        <div className="section-header">
            <h2 className="section-title">
                <FaMedal className="icon-yellow" /> 따끈따끈 신제품 
            </h2>
            <span className="more-link" onClick={() => goToPage('/products')}>더보기 +</span> {/* ★ 수정 */}
        </div>
        <div className="main-product-grid">
            {newList.map(renderProductCard)}
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="bottom-btn-area">
        <button className="view-all-btn" onClick={() => goToPage('/products')}> {/* ★ 수정 */}
            전체 제품 보러가기 <FaArrowRight />
        </button>
      </div>

    </section>
  );
};

export default MainProductList;
