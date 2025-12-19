import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FcGoogle } from 'react-icons/fc';
import { RiKakaoTalkFill } from 'react-icons/ri';

const LoginPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ id: '', password: '' });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 
  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      await axios.post(
        "/auth/login",
        { id: formData.id, password: formData.password },
        { withCredentials: true } // 전역 defaults 쓰면 생략 가능
      );

      alert("로그인 성공!");
      navigate("/");
    } catch (err) {
      alert(err?.response?.data?.message || "로그인 실패");
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:5000/auth/google';
  };

  const handleKakaoLogin = () => {
    window.location.href = 'http://localhost:5000/auth/kakao';
  };

  const handleFindPw = async () => {
    const email = prompt('이메일을 입력하세요');
    if (!email) return;

    try {
      await axios.post('/auth/find-password', { email });
      alert('이메일로 임시 비밀번호를 전송했습니다.');
    } catch {
      alert('일치하는 회원이 없습니다.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="auth-title">로그인</h2>

        <form onSubmit={handleLogin} className="auth-form">
          <div className="input-group">
            <label className="input-label">아이디</label>
            <input
              className="auth-input"
              type="text"
              name="id"
              value={formData.id}
              onChange={handleChange}
              placeholder="아이디 입력"
              autoFocus
            />
          </div>

          <div className="input-group">
            <label className="input-label">비밀번호</label>
            <input
              className="auth-input"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="비밀번호 입력"
            />
          </div>

          <button type="submit" className="auth-button">로그인</button>
        </form>

        <div className="social-login">
          <button className="social-btn google" onClick={handleGoogleLogin}>
            <FcGoogle size={22} />
            <span>Google로 로그인</span>
          </button>

          <button className="social-btn kakao" onClick={handleKakaoLogin}>
            <RiKakaoTalkFill size={22} />
            <span>Kakao로 로그인</span>
          </button>
        </div>

        <p className="auth-footer">
          <span className="link-text" onClick={handleFindPw} style={{ marginRight: '15px', color: '#666', fontWeight: 'normal' }}>
            비밀번호 찾기
          </span>
          |
          <span className="link-text" onClick={() => navigate('/signup')} style={{ marginLeft: '15px' }}>
            회원가입
          </span>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;

//나중에
//지울거
//일단
//대충
//쓰는거