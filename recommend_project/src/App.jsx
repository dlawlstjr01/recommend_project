import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Slider from './components/Slider.jsx';
import MainProductList from './components/MainProductList.jsx';
import AnalysisPage from './pages/AnalysisPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import ProductDetailPage from "./pages/ProductDetailPage";
import LoginPage from './pages/LoginPage.jsx';
import MyPage from './pages/MyPage.jsx';
import SupportPage from './pages/SupportPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import SocialSuccess from './pages/SocialSuccess.jsx';
import ScrollToTopGlobal from './components/ScrollTopGlobal.jsx';
import './CSS/common.css';
import './CSS/main.css';
import './CSS/sub.css';

const MainPage = () => (
  <div className="main-page">
    <Slider />
    <div style={{ marginTop: '40px' }}>
      <MainProductList />
    </div>
  </div>
);

const App = () => {

  return (
    <BrowserRouter>
      {/* 뒤로가기(POP)일 때 스크롤 맨위로 */}
      <ScrollToTopGlobal />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<MainPage />} />

          {/* 제품찾기 라우트 */}
          <Route path="products/*" element={<ProductsPage />} />

          {/*  상세 라우트: 이건 "products/:id"로 (슬래시 제거 권장) */}
          <Route path="products/:id" element={<ProductDetailPage />} />

          {/* 분석 및 시각화 */}
          <Route path="analysis/*" element={<AnalysisPage />} />

          {/* 로그인 */}
          <Route path="login" element={<LoginPage />} />

          {/* 회원가입 */}
          <Route path="signup" element={<SignupPage />} />

          {/* 마이페이지 */}
          <Route path="mypage" element={<MyPage />} />

          {/* 고객센터 */}
          <Route path="support/*" element={<SupportPage />} />

          {/* 소셜로그인 성공 */}
          <Route path="social-success" element={<SocialSuccess />} />

          {/* 잘못된 라우트 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
