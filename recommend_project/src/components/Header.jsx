import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import logoImg from "../assets/Logo.png";

import { FiMenu, FiX, FiUser, FiLogOut, FiBox, FiBarChart2, FiHeadphones } from "react-icons/fi"; 

const menuItems = [
  { 
    id: 'products', 
    label: '제품찾기', 
    path: '/products', 
    icon: <FiBox />, 
    children: [
      { label: '추천 상품', path: '/products/new' },
      { label: '인기 상품', path: '/products/best' },
      { label: '신제품', path: '/products/category' }
    ] 
  },
  { 
    id: 'analysis', 
    label: '분석 및 시각화', 
    path: '/analysis',
    icon: <FiBarChart2 />, 
    children: [
      { label: '스펙 비교 분석', path: '/analysis/specs' },
      { label: '가격 비교 차트', path: '/analysis/price' },
      { label: '성능 벤치마크', path: '/analysis/benchmark' }
    ] 
  },
  { 
    id: 'support', 
    label: '고객센터', 
    path: '/support', 
    icon: <FiHeadphones />,
    children: [
      { label: '공지사항', path: '/support/notice' },
      { label: 'FAQ', path: '/support/faq' },
      { label: '1:1 문의', path: '/support/qna' }
    ] 
  }
];

const Header = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false); // ★ 전체 메가메뉴 열림 상태
  const navigate = useNavigate();

const handleLogout = async (e) => {
  e.preventDefault();

  await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });

  setIsLoggedIn(false);
  navigate('/');
  setIsMenuOpen(false);
};


const location = useLocation();

useEffect(() => {
  const checkLogin = async () => {
    try {
      const res = await fetch('/auth/me', {
        credentials: 'include', // ⭐ 쿠키 포함
        cache: 'no-store',
      });

      setIsLoggedIn(res.status === 200);
    } catch (err) {
      setIsLoggedIn(false);
    }
  };

  checkLogin();
}, [location.pathname,  location.search]);



  return (
    <header className="cHeader">
      {/* 
         ★ 네비게이션 영역 전체에 onMouseLeave를 걸어서 
         메뉴 영역 어디든 벗어나면 닫히게 설정 
      */}
      <nav className="cHeader-Nav" onMouseLeave={() => setIsMegaMenuOpen(false)}>
        {/* 좌측: 로고 */}
        <div className="cHeader-Logo">
          <Link to="/" className="cHeader-LogoLink">
            <img src={logoImg} alt="Logo" className="cHeader-LogoImg" />
          </Link>
        </div>

        {/* 중앙: 메인 메뉴 (데스크탑) */}
        <div className="cHeader-Menu">
          {menuItems.map((item) => (
            <div 
              key={item.id} 
              className="cHeader-MenuItem-Wrapper"
              onMouseEnter={() => setIsMegaMenuOpen(true)} // ★ 어떤 메뉴든 마우스 올리면 전체 열림
            >
              <Link to={item.path} className="cHeader-Link" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem', display: 'flex' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </div>
          ))}
        </div>

        {/* ★ 전체 통합 메가 메뉴 (위치는 absolute로 고정) */}
        <div 
            className={`mega-menu ${isMegaMenuOpen ? 'open' : ''}`}
            onMouseEnter={() => setIsMegaMenuOpen(true)} // 메뉴판 위에 있어도 유지
            onMouseLeave={() => setIsMegaMenuOpen(false)} // 메뉴판 떠나면 닫힘
            style={{
              height: isMegaMenuOpen ? '320px' : '0', // 넉넉하게 높이 잡음
              opacity: isMegaMenuOpen ? '1' : '0',
              visibility: isMegaMenuOpen ? 'visible' : 'hidden',
              borderTop: isMegaMenuOpen ? '1px solid #f0f0f0' : 'none'
            }}
        >
            <div className="mega-menu-container" style={{ justifyContent: 'center', gap: '100px' }}>
                {/* 모든 메뉴 아이템을 한 번에 다 보여줌 */}
               {menuItems.map((item) => (
                  <div key={item.id} className="mega-menu-column">
                      <Link
                      to={item.path}
                      className="mega-menu-title"
                      onClick={() => setIsMegaMenuOpen(false)}  // 클릭 시 닫힘
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    > {item.icon} {item.label}
                     </Link>
                      <div className="mega-menu-list">
                          {item.children.map((sub) => (
                              <Link 
                                key={sub.path} 
                                to={sub.path} 
                                className="mega-menu-item"
                                onClick={() => setIsMegaMenuOpen(false)} // 클릭 시 닫힘
                              >
                                  {sub.label}
                              </Link>
                             ))}
                          </div>
                      </div>
                    ))}
                </div>
            </div>

        {/* 우측: 유틸리티 */}
        <div className="cHeader-Util">
          {!isLoggedIn ? (
            <Link to="/login" className="cHeader-UtilLink" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
               <FiUser /> <span>로그인</span>
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <Link to="/mypage" className="cHeader-UtilLink" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FiUser /> <span>마이페이지</span>
              </Link>
              <a href="/" onClick={handleLogout} className="cHeader-UtilLink" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <FiLogOut /> <span>로그아웃</span>
              </a>
            </div>
          )}
        </div>

        {/* 모바일 메뉴 버튼 */}
        <div className="cHeader-UtilMobile">
          <button onClick={() => setIsMenuOpen(true)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>
            <FiMenu />
          </button>
        </div>

        {/* 모바일 메뉴 드로어 */}
        <div className={`mobile-menu-overlay ${isMenuOpen ? 'open' : ''}`} onClick={() => setIsMenuOpen(false)}></div>
        <div className={`mobile-menu-drawer ${isMenuOpen ? 'open' : ''}`}>
           <div className="mobile-menu-header">
               <h3>메뉴</h3>
               <button onClick={() => setIsMenuOpen(false)} className="close-btn"><FiX /></button>
           </div>
           <div className="mobile-menu-content">
               {menuItems.map(item => (
                   <div key={item.id} className="mobile-menu-group">
                       <Link to={item.path} className="mobile-menu-title" onClick={() => setIsMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           {item.icon} {item.label}
                       </Link>
                       <div className="mobile-sub-links">
                           {item.children.map(sub => (
                               <Link key={sub.path} to={sub.path} className="mobile-menu-link" onClick={() => setIsMenuOpen(false)}>
                                   - {sub.label}
                               </Link>
                           ))}
                       </div>
                   </div>
               ))}
               <div className="mobile-util-links">
                   {!isLoggedIn ? (
                       <Link to="/login" onClick={() => setIsMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <FiUser /> 로그인
                       </Link>
                   ) : (
                       <>
                           <Link to="/mypage" onClick={() => setIsMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                               <FiUser /> 마이페이지
                           </Link>
                           <a href="/" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e11d48' }}>
                               <FiLogOut /> 로그아웃
                           </a>
                       </>
                   )}
               </div>
           </div>
        </div>

      </nav>
    </header>
  );
};

export default Header;
