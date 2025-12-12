import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FaSearch } from "react-icons/fa";

const ALL_PRODUCTS = Array.from({ length: 30 }).map((_, i) => ({
  id: i + 1,
  name: `고성능 노트북/데스크탑 모델 ${i + 1}`,
  brand: ['삼성', 'LG', 'Apple', 'ASUS', 'Lenovo'][i % 5],
  category: ['노트북', '데스크탑', '모니터', '태블릿'][i % 4],
  price: (Math.floor(Math.random() * 36) + 5) * 100000, 
  tags: i % 5 === 0 ? ['추천'] : i % 3 === 0 ? ['NEW', 'BEST'] : [],
  img: `https://picsum.photos/400/400?random=${i + 100}`
}));

const ProductsPage = () => {
  const context = useOutletContext();
  const filters = context?.filters || {}; 

  const [filteredList, setFilteredList] = useState([]);

  useEffect(() => {
    let results = [...ALL_PRODUCTS];

    // 1. 키워드
    const keyword = (filters.keyword || '').toLowerCase();
    if (keyword) {
      results = results.filter(p => 
        p.name.toLowerCase().includes(keyword) || 
        p.brand.toLowerCase().includes(keyword)
      );
    }
    
    // 2. 카테고리
    if (filters.category && filters.category.length > 0) {
      results = results.filter(p => filters.category.includes(p.category));
    }
    
    // 3. 브랜드
    if (filters.brand && filters.brand.length > 0) {
      results = results.filter(p => filters.brand.includes(p.brand));
    }
    
    // 4. 가격대 (옵션 추가됨)
    if (filters.price && filters.price !== 'all') {
      results = results.filter(p => {
        const price = Number(p.price);
        switch (filters.price) {
          case '50_down': return price <= 500000;
          case '100_down': return price <= 1000000;
          case '200_down': return price <= 2000000;
          case '300_down': return price <= 3000000; // ★ 추가
          case '400_down': return price <= 4000000; // ★ 추가
          default: return true;
        }
      });
    }

    // ★ 5. 정렬 (sortOrder)
    if (filters.sortOrder) {
      if (filters.sortOrder === 'lowPrice') {
        results.sort((a, b) => a.price - b.price); // 오름차순
      } else if (filters.sortOrder === 'highPrice') {
        results.sort((a, b) => b.price - a.price); // 내림차순
      } else {
        // 'latest' 등 기본값일 경우 id 역순(최신순) 등으로 정렬
        results.sort((a, b) => b.id - a.id);
      }
    }

    setFilteredList(results);

  }, [filters]); 

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
          {filteredList.map(p => (
            <div key={p.id} className="product-card">
              <div className="product-img-wrapper">
                <img src={p.img} alt={p.name} />
                <div className="badge-container">
                  {p.tags.map(tag => (
                    <span key={tag} className={`product-badge badge-${tag.toLowerCase()}`}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="product-info">
                <span className="product-brand">{p.brand}</span>
                <p className="product-name">{p.name}</p>
                <p className="product-price">{p.price.toLocaleString()}원</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>조건에 맞는 제품이 없습니다.</p>
          <p style={{ fontSize: '14px', marginTop: '5px' }}>필터를 변경하거나 초기화해보세요.</p>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
