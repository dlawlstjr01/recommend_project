import React, { useState, useEffect } from 'react';
import { FaUndo, FaSearch } from "react-icons/fa";

const Sidebar = ({ filters, setFilters }) => {
  const [localKeyword, setLocalKeyword] = useState('');

  useEffect(() => {
    if (filters && filters.keyword !== undefined) {
      setLocalKeyword(filters.keyword);
    }
  }, [filters]);

  const safeFilters = filters || {
    keyword: '',
    category: [],
    brand: [],
    price: 'all',
    sortOrder: 'latest'
  };

  const applySearch = () => {
    if (setFilters) setFilters(prev => ({ ...prev, keyword: localKeyword }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') applySearch();
  };

  const handleCheckboxChange = (type, value) => {
    if (!setFilters) return;
    setFilters(prev => {
      const currentList = prev[type] || [];
      return {
        ...prev,
        [type]: currentList.includes(value) 
          ? currentList.filter(item => item !== value)
          : [...currentList, value]
      };
    });
  };

  const handlePriceChange = (value) => {
    if (setFilters) setFilters(prev => ({ ...prev, price: value }));
  };

  const handleSortChange = (value) => {
    if (setFilters) setFilters(prev => ({ ...prev, sortOrder: value }));
  };

  const resetFilters = () => {
    if (setFilters) {
      setFilters({
        keyword: '',
        category: [],
        brand: [],
        price: 'all',
        sortOrder: 'latest'
      });
      setLocalKeyword('');
    }
  };

  return (
    <aside className="sidebar-container">
      <div className="sidebar-title">
        <h2>필터</h2>
        <button className="reset-btn" onClick={resetFilters}>
          <FaUndo /> 초기화
        </button>
      </div>

      {/* 1. 검색 (항상 최상단) */}
      <div className="sidebar-section">
        <span className="filter-title">검색</span>
        <div className="sidebar-search-box">
          <FaSearch className="search-icon" />
          <input 
              type="text" 
              placeholder="검색어 입력..." 
              value={localKeyword}
              onChange={(e) => setLocalKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
          />
          <button className="search-btn" onClick={applySearch}>검색</button>
        </div>
      </div>

      {/* 2. 카테고리 (가장 큰 범위의 분류) */}
      <div className="sidebar-section">
        <span className="filter-title">카테고리</span>
        <div className="filter-list">
          {['노트북', '데스크탑', '모니터', '태블릿'].map(cat => (
            <label key={cat} className="filter-item">
              <input type="checkbox" className="filter-checkbox" checked={safeFilters.category.includes(cat)} onChange={() => handleCheckboxChange('category', cat)} /> 
              {cat}
            </label>
          ))}
        </div>
      </div>

      {/* 3. 브랜드 (사용자 선호도가 높은 항목) */}
      <div className="sidebar-section">
        <span className="filter-title">브랜드</span>
        <div className="filter-list">
          {['삼성', 'LG', 'Apple', 'ASUS', 'Lenovo'].map(brand => (
            <label key={brand} className="filter-item">
              <input type="checkbox" className="filter-checkbox" checked={safeFilters.brand.includes(brand)} onChange={() => handleCheckboxChange('brand', brand)} /> 
              {brand}
            </label>
          ))}
        </div>
      </div>

      {/* 4. 가격대 (구체적인 제약 조건) */}
      <div className="sidebar-section">
        <span className="filter-title">가격대</span>
        <div className="filter-list">
          <label className="filter-item">
            <input type="radio" name="price" className="filter-checkbox" checked={!safeFilters.price || safeFilters.price === 'all'} onChange={() => handlePriceChange('all')} /> 
            전체
          </label>
          <label className="filter-item">
            <input type="radio" name="price" className="filter-checkbox" checked={safeFilters.price === '50_down'} onChange={() => handlePriceChange('50_down')} /> 
            50만원 이하
          </label>
          <label className="filter-item">
            <input type="radio" name="price" className="filter-checkbox" checked={safeFilters.price === '100_down'} onChange={() => handlePriceChange('100_down')} /> 
            100만원 이하
          </label>
          <label className="filter-item">
            <input type="radio" name="price" className="filter-checkbox" checked={safeFilters.price === '200_down'} onChange={() => handlePriceChange('200_down')} /> 
            200만원 이하
          </label>
          <label className="filter-item">
            <input type="radio" name="price" className="filter-checkbox" checked={safeFilters.price === '300_down'} onChange={() => handlePriceChange('300_down')} /> 
            300만원 이하
          </label>
          <label className="filter-item">
            <input type="radio" name="price" className="filter-checkbox" checked={safeFilters.price === '400_down'} onChange={() => handlePriceChange('400_down')} /> 
            400만원 이하
          </label>
        </div>
      </div>

      {/* 5. 정렬 (결과 뷰 조정이므로 마지막) */}
      <div className="sidebar-section">
        <span className="filter-title">정렬</span>
        <div className="filter-list">
          <label className="filter-item">
            <input type="radio" name="sort" className="filter-checkbox" checked={safeFilters.sortOrder === 'latest'} onChange={() => handleSortChange('latest')} /> 
            최신순 (기본)
          </label>
          <label className="filter-item">
            <input type="radio" name="sort" className="filter-checkbox" checked={safeFilters.sortOrder === 'lowPrice'} onChange={() => handleSortChange('lowPrice')} /> 
            낮은 가격순
          </label>
          <label className="filter-item">
            <input type="radio" name="sort" className="filter-checkbox" checked={safeFilters.sortOrder === 'highPrice'} onChange={() => handleSortChange('highPrice')} /> 
            높은 가격순
          </label>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
