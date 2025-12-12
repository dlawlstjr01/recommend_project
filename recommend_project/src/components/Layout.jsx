import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ChatBot from './ChatBot';

const Layout = () => {

  const navigate = useNavigate();

  const location = useLocation();
  const [filters, setFilters] = useState({
    keyword: '',
    category: [],
    brand: [],
    price: 'all'
  });

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



  // 사이드바를 보여줄 경로 설정
  const showSidebar = location.pathname.startsWith('/products') || location.pathname === '/analysis';

  return (
    <div className="layout-container">
      <Header />
      
      {/* 
         ★ 핵심 수정 포인트: 
         1. page-container 클래스 사용 (main.css에 정의됨)
         2. 사이드바가 없을 때를 대비해 조건부 클래스 추가 (no-sidebar)
      */}
      <div className={`page-container ${!showSidebar ? 'no-sidebar' : ''}`}>
        
        {/* 사이드바 영역 */}
        {showSidebar && (
            <Sidebar filters={filters} setFilters={setFilters} />
        )}
        
        <main className="main-content">
          <Outlet context={{ filters, setFilters }} />
        </main>

         <ChatBot/>
      </div>
    </div>
  );
};

export default Layout;
