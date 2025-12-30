import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ChatBot from './ChatBot';

const DEFAULT_FILTERS = {
  keyword: '',
  category: [],
  brand: [],
  price: 'all',
  sortOrder: ''   // ✅ ProductsPage에서 참조하니까 넣어두는게 좋음
};

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const signup = params.get('signup');
    const login = params.get('login');
    const provider = params.get('provider');

    if (signup === '1') {
      alert(`${provider === 'google' ? '구글' : provider === 'kakao' ? '카카오' : ''} 가입이 완료되었습니다!`);
      navigate(location.pathname, { replace: true });
    } else if (login === '1') {
      alert(`${provider === 'google' ? '구글' : provider === 'kakao' ? '카카오' : ''} 로그인 성공!`);
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  // ✅ 추천/인기/신제품 들어갈 때 필터 자동 초기화 (쿨러만 뜨는 문제 해결)
  useEffect(() => {
    const curated = ['/products/new', '/products/best', '/products/category'];
    if (curated.includes(location.pathname)) {
      resetFilters();
    }
  }, [location.pathname]);

  // ✅ 사이드바를 보여줄 경로 설정 (analysis도 하위 포함)
  const showSidebar =
    location.pathname.startsWith('/products') || location.pathname.startsWith('/analysis');

  return (
    <div className="layout-container">
      <Header />

      <div className={`page-container ${!showSidebar ? 'no-sidebar' : ''}`}>
        {showSidebar && (
          <Sidebar filters={filters} setFilters={setFilters} />
        )}

        <main className="main-content">
          <Outlet context={{ filters, setFilters, resetFilters }} />
        </main>

        <ChatBot />
      </div>
    </div>
  );
};

export default Layout;
