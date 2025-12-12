import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const MyPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [linkedProviders, setLinkedProviders] = useState([]);

  
  const [editData, setEditData] = useState({
    id: '', name: '', email: '', 
    job: 'student', brand: [], design: 'simple', budget: 'unlimited'
  });

  const [isPwChanging, setIsPwChanging] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', new: '', confirm: '' });

 useEffect(() => {
    const fetchMe = async () => {
      try {
        //  쿠키로 로그인 확인
        const meRes = await axios.get('/auth/me');
        setUser(meRes.data);
        setEditData(meRes.data);

        const providerRes = await axios.get('/auth/providers');
        setLinkedProviders(providerRes.data);
      } catch (err) {
        //  쿠키 없거나 만료면 로그인으로
        navigate('/login', { replace: true });
      }
    };

    fetchMe();
  }, [navigate]);


  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e, field) => {
    const { value, checked } = e.target;
    setEditData(prev => {
      const list = prev[field] || [];
      return { ...prev, [field]: checked ? [...list, value] : list.filter(item => item !== value) };
    });
  };

const handleSave = async () => {
  if (!editData.name) {
    alert('이름을 입력해주세요.');
    return;
  }

  try {
    const res = await axios.put('/auth/profile', {
      name: editData.name,
      job: editData.job,
      brand: editData.brand,
      design: editData.design,
      budget: editData.budget,
    });

    const updatedUser = res.data.user;
    setUser(updatedUser);
    setEditData(updatedUser);
    setIsEditing(false);

    alert('정보가 수정되었습니다.');
  } catch (err) {
    console.error('정보 수정 실패:', err?.response?.status, err?.response?.data || err);
    alert('정보 수정 실패');
  }
};



  const handleCancel = () => {
    setEditData(user);
    setIsEditing(false);
  };

  const handlePwChange = async () => {
  if (!pwForm.current || !pwForm.new || !pwForm.confirm) {
    alert('모든 항목을 입력해주세요.');
    return;
  }

  if (pwForm.new !== pwForm.confirm) {
    alert('새 비밀번호가 일치하지 않습니다.');
    return;
  }

  try {
    await axios.post('/auth/change-password', {
      currentPassword: pwForm.current,
      newPassword: pwForm.new,
    });

    alert('비밀번호가 변경되었습니다.');
    setIsPwChanging(false);
    setPwForm({ current: '', new: '', confirm: '' });
  } catch (err) {
    console.error('비밀번호 변경 실패:', err?.response?.status, err?.response?.data || err);
    if (err.response?.status === 401) {
      alert('현재 비밀번호가 올바르지 않습니다.');
    } else {
      alert('비밀번호 변경 실패');
    }
  }
};


  if (!user) return <div className="loading-text">Loading...</div>;

  return (
    <div className="mypage-container">
      {/* 1. 페이지 헤더 */}
      <div className="mypage-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="page-header-title">마이페이지</h2>
        
        {/* ★ 정보 수정 버튼을 여기로 이동 (로그아웃 버튼 삭제됨) */}
        <div>
          {!isEditing ? (
            <button onClick={() => {setEditData(user); setIsEditing(true);}} className="btn-primary-small">정보 수정</button>
          ) : (
            <div className="btn-group">
              <button onClick={handleCancel} className="btn-secondary-small">취소</button>
              <button onClick={handleSave} className="btn-success-small">저장</button>
            </div>
          )}
        </div>
      </div>

      <div className="mypage-content">
        
        {/* 2. 내 정보 카드 */}
        <div className="profile-card">
          <div className="card-header">
            {/* "내 정보 관리" 타이틀만 남김 (버튼 제거됨) */}
            <div><h3 className="card-title">👤 내 정보 관리</h3></div>
          </div>
          
          <div className="auth-form no-shadow">
            {/* 아이디 & 이름 */}
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">아이디</label>
                <input className="auth-input disabled-bg" value={editData.id} disabled />
              </div>
              <div className="input-group">
                <label className="input-label">이름</label>
                <input 
                  className={`auth-input ${!isEditing ? 'disabled-bg' : ''}`}
                  name="name" 
                  value={editData.name} 
                  onChange={handleChange} 
                  disabled={!isEditing} 
                />
              </div>
            </div>
            
            <h4 className="sub-section-title">📋 맞춤 추천 설정</h4>
            {/* 직군 & 예산 */}
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">직군</label>
                <select className={`auth-input ${!isEditing ? 'disabled-bg' : ''}`} name="job" value={editData.job} onChange={handleChange} disabled={!isEditing}>
                  <option value="student">학생</option><option value="developer">개발자</option><option value="designer">디자이너</option><option value="office">사무직</option><option value="creator">크리에이터</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">예산</label>
                <select className={`auth-input ${!isEditing ? 'disabled-bg' : ''}`} name="budget" value={editData.budget} onChange={handleChange} disabled={!isEditing}>
                  <option value="100_down">100만원 이하</option><option value="100_200">100~200만원</option><option value="200_up">200만원 이상</option><option value="unlimited">상관없음</option>
                </select>
              </div>
            </div>

            {/* 브랜드 */}
            <div className="input-group mt-20">
              <label className="input-label">선호 브랜드</label>
              <div className="checkbox-group">
                {['Samsung', 'Apple', 'LG', 'ASUS'].map(brand => (
                  <label key={brand} className="checkbox-label-simple">
                    <input type="checkbox" value={brand} checked={editData.brand ? editData.brand.includes(brand) : false} onChange={(e) => handleCheckboxChange(e, 'brand')} disabled={!isEditing} />
                    {brand}
                  </label>
                ))}
              </div>
            </div>

            {/* 디자인 */}
            <div className="input-group mt-20">
              <label className="input-label">디자인 취향</label>
              <div className="radio-group">
                {['simple', 'colorful', 'unique'].map(style => (
                  <label key={style} className="radio-label-simple">
                    <input type="radio" name="design" value={style} checked={editData.design === style} onChange={handleChange} disabled={!isEditing} />
                    {style === 'simple' ? '심플/모던' : style === 'colorful' ? '화려함' : '유니크'}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 3. 소셜 계정 연동 */}
        <div className="profile-card">
          <div className="card-header">
            <h3 className="card-title">🔗 소셜 계정 연동</h3>
          </div>

          <div className="social-link-area">
            {/* Kakao */}
            {linkedProviders.includes('kakao') ? (
              <span className="linked-text">✔ 카카오 연동됨</span>
            ) : (
              <button
                className="social-btn kakao"
                onClick={() => window.location.href = 'http://localhost:5000/auth/kakao/link'}
              >
                카카오 연동
              </button>
            )}

            {/* Google */}
            {linkedProviders.includes('google') ? (
              <span className="linked-text">✔ 구글 연동됨</span>
            ) : (
              <button
                className="social-btn google"
                onClick={() => window.location.href = 'http://localhost:5000/auth/google/link'}
              >
                구글 연동
              </button>
            )}
          </div>
        </div>

        {/* 4. 비밀번호 변경 카드 */}
        <div className="profile-card danger-zone">
          <div className="card-header">
            <div>
              <h3 className="card-title danger-text">🔒 비밀번호 관리</h3>
              <p className="card-subtitle">계정 보안을 위해 정기적으로 비밀번호를 변경해주세요.</p>
            </div>
            
            <div>
              {!isPwChanging && (
                <button 
                  onClick={() => setIsPwChanging(true)} 
                  className="btn-danger"
                  style={{ backgroundColor: '#e11d48', color: 'white', border: 'none' }} 
                >
                  비밀번호 변경
                </button>
              )}
            </div>
          </div>

          {isPwChanging && (
            <div className="pw-change-area">
              <div className="pw-form-container">
                <div className="input-group">
                  <label className="input-label">현재 비밀번호</label>
                  <input type="password" placeholder="현재 비밀번호 입력" className="auth-input bg-white" value={pwForm.current} onChange={(e) => setPwForm({...pwForm, current: e.target.value})} />
                </div>
                <div className="input-group">
                  <label className="input-label">새 비밀번호</label>
                  <input type="password" placeholder="새로운 비밀번호" className="auth-input bg-white" value={pwForm.new} onChange={(e) => setPwForm({...pwForm, new: e.target.value})} />
                </div>
                <div className="input-group">
                  <label className="input-label">새 비밀번호 확인</label>
                  <input type="password" placeholder="새로운 비밀번호 확인" className="auth-input bg-white" value={pwForm.confirm} onChange={(e) => setPwForm({...pwForm, confirm: e.target.value})} />
                </div>
                
                <div className="btn-group mt-10">
                  <button 
                    onClick={handlePwChange} 
                    className="btn-danger flex-1"
                    style={{ backgroundColor: '#e11d48', color: 'white' }}
                  >
                    변경 사항 저장
                  </button>
                  <button onClick={() => setIsPwChanging(false)} className="btn-secondary">취소</button>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default MyPage;
