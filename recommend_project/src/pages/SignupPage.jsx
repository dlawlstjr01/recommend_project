import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const SignupPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1:기본정보, 2:설문

  // 폼 데이터
  const [formData, setFormData] = useState({
    // 기본 정보
    id: '', password: '', passwordConfirm: '', name: '', email: '',
    emailCode: '', // 인증번호 입력값

    // 설문 정보 (심플 버전)
    job: 'student',
    user_usage: [],
    // ✅ brand 제거
    design: 'simple',     // simple, colorful, unique
    budget: 'unlimited',
  });

  // 이메일 인증 상태
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  // ★ 아이디 중복 확인 관련 상태
  const [isIdChecked, setIsIdChecked] = useState(false);
  const [idCheckMessage, setIdCheckMessage] = useState('');
  const [isIdAvailable, setIsIdAvailable] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // 아이디 수정 시 중복 확인 상태 초기화
    if (name === 'id') {
      setIsIdChecked(false);
      setIdCheckMessage('');
      setIsIdAvailable(null);
    }

    setFormData({ ...formData, [name]: value });
  };

  const handleCheckboxChange = (e, field) => {
    const { value, checked } = e.target;
    setFormData(prev => {
      const list = prev[field] || [];
      return {
        ...prev,
        [field]: checked ? [...list, value] : list.filter(item => item !== value)
      };
    });
  };

  // ★ 아이디 중복 확인 핸들러
  const handleIdCheck = async () => {
    if (!formData.id) {
      setIdCheckMessage('아이디를 입력해주세요.');
      setIsIdAvailable(false);
      return;
    }

    try {
      const res = await axios.post('/auth/check-id', {
        id: formData.id
      });

      if (res.data.available) {
        setIdCheckMessage('사용 가능한 아이디입니다.');
        setIsIdAvailable(true);
        setIsIdChecked(true);
      } else {
        setIdCheckMessage('이미 존재하는 아이디입니다.');
        setIsIdAvailable(false);
        setIsIdChecked(false);
      }
    } catch (err) {
      console.error(err);
      setIdCheckMessage('서버 오류');
      setIsIdAvailable(false);
    }
  };

  // 이메일 인증 요청
  const sendEmailVerification = async () => {
    if (!formData.email || !formData.email.includes('@')) {
      alert('유효한 이메일을 입력해주세요.');
      return;
    }

    try {
      await axios.post('/auth/send-email-code', {
        email: formData.email,
      });

      setIsEmailSent(true);
      alert('인증번호가 이메일로 전송되었습니다.');
    } catch (err) {
      console.error(err);
      alert('이메일 발송 실패');
    }
  };

  // 인증번호 확인
  const verifyEmailCode = async () => {
    try {
      const res = await axios.post('/auth/verify-email-code', {
        email: formData.email,
        code: formData.emailCode,
      });

      if (res.data.verified) {
        setIsEmailVerified(true);
        alert('이메일 인증 완료');
      }
    } catch (err) {
      alert('인증번호가 올바르지 않습니다.');
    }
  };

  // 다음 단계로
  const handleNextStep = (e) => {
    e.preventDefault();
    if (!formData.id || !formData.password || !formData.name) {
      alert('필수 정보를 입력해주세요.'); return;
    }
    if (formData.password !== formData.passwordConfirm) {
      alert('비밀번호가 일치하지 않습니다.'); return;
    }

    // 아이디 중복확인 체크
    if (!isIdChecked) {
      setIdCheckMessage('아이디 중복 확인을 해주세요.');
      setIsIdAvailable(false);
      return;
    }

    if (!isEmailVerified) {
      alert('이메일 인증을 완료해주세요.'); return;
    }

    setStep(2);
  };

  // 가입 완료
  const handleSignup = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.post('/auth/signup', {
        id: formData.id,
        password: formData.password,
        name: formData.name,
        email: formData.email,

        // 설문 데이터
        job: formData.job,
        user_usage: formData.user_usage,
        // ✅ brand 제거
        design: formData.design,
        budget: formData.budget,
      });

      alert(res.data.message || '가입 완료!');
      navigate('/login');
    } catch (err) {
      console.error(err);
      alert('회원가입 실패');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ width: '600px' }}>
        <h2 className="auth-title">{step === 1 ? '회원가입 (1/2)' : '취향 설문 (2/2)'}</h2>

        {/* Step 1: 기본 정보 + 이메일 인증 */}
        {step === 1 && (
          <form onSubmit={handleNextStep} className="auth-form">

            {/* ★ 아이디 입력 그룹 */}
            <div className="input-group">
              <label className="input-label">아이디</label>
              <div className="input-with-button">
                <input
                  className={`auth-input ${isIdAvailable === false ? 'input-error' : ''}`}
                  name="id"
                  value={formData.id}
                  onChange={handleChange}
                  placeholder="아이디 입력"
                  style={{ color: isIdAvailable === false ? '#e11d48' : 'inherit' }}
                />
                <button type="button" onClick={handleIdCheck} className="check-btn">
                  중복확인
                </button>
              </div>

              {idCheckMessage && (
                <span className={`validation-message ${isIdAvailable ? 'success' : 'error'}`}>
                  {idCheckMessage}
                </span>
              )}
            </div>

            <div className="input-group"><label className="input-label">비밀번호</label><input className="auth-input" type="password" name="password" value={formData.password} onChange={handleChange} /></div>
            <div className="input-group"><label className="input-label">비밀번호 확인</label><input className="auth-input" type="password" name="passwordConfirm" value={formData.passwordConfirm} onChange={handleChange} /></div>
            <div className="input-group"><label className="input-label">이름</label><input className="auth-input" name="name" value={formData.name} onChange={handleChange} /></div>

            {/* 이메일 인증 */}
            <div className="input-group">
              <label className="input-label">이메일</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input className="auth-input" name="email" value={formData.email} onChange={handleChange} placeholder="example@email.com" disabled={isEmailVerified} style={{ flex: 1 }} />
                <button type="button" onClick={sendEmailVerification} className="auth-button" style={{ marginTop: 0, padding: '10px', width: '100px', fontSize: '13px', background: isEmailVerified ? '#ccc' : '#3b82f6', height: '48px' }} disabled={isEmailVerified}>
                  {isEmailSent ? '재전송' : '인증요청'}
                </button>
              </div>
            </div>

            {isEmailSent && !isEmailVerified && (
              <div className="input-group">
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input className="auth-input" name="emailCode" value={formData.emailCode} onChange={handleChange} placeholder="인증번호 입력" maxLength={6} style={{ flex: 1 }} />
                  <button type="button" onClick={verifyEmailCode} className="auth-button" style={{ marginTop: 0, padding: '10px', width: '100px', fontSize: '13px', background: '#10b981', height: '48px' }}>확인</button>
                </div>
              </div>
            )}
            {isEmailVerified && <div style={{ color: '#10b981', fontWeight: 'bold', fontSize: '14px' }}>✅ 인증 완료</div>}

            <button type="submit" className="auth-button">다음</button>
          </form>
        )}

        {/* Step 2: 설문 (심플 버전) */}
        {step === 2 && (
          <form onSubmit={handleSignup} className="auth-form" style={{ textAlign: 'left' }}>

            <div className="input-group">
              <label className="input-label">직군</label>
              <select className="auth-input" name="job" value={formData.job} onChange={handleChange}>
                <option value="student">학생</option>
                <option value="developer">개발자</option>
                <option value="designer">디자이너</option>
                <option value="office">사무직</option>
                <option value="creator">크리에이터</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">주 용도 (복수선택)</label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {['문서작업', '영상편집', '코딩', '게임', '웹서핑'].map(use => (
                  <label key={use} style={{ fontSize: '14px' }}>
                    <input type="checkbox" value={use} checked={formData.user_usage.includes(use)} onChange={(e) => handleCheckboxChange(e, 'user_usage')} /> {use}
                  </label>
                ))}
              </div>
            </div>

            {/* ✅ 선호 브랜드 섹션 삭제됨 */}

            {/* 디자인 */}
            <div className="input-group">
              <label className="input-label">디자인 취향</label>
              <div style={{ display: 'flex', gap: '15px' }}>
                <label><input type="radio" name="design" value="simple" checked={formData.design === 'simple'} onChange={handleChange} /> 심플/모던</label>
                <label><input type="radio" name="design" value="colorful" checked={formData.design === 'colorful'} onChange={handleChange} /> 화려함</label>
                <label><input type="radio" name="design" value="unique" checked={formData.design === 'unique'} onChange={handleChange} /> 유니크</label>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">예산</label>
              <select className="auth-input" name="budget" value={formData.budget} onChange={handleChange}>
                <option value="100_down">50만원 이하</option>
                <option value="100_200">100~200만원</option>
                <option value="200_up">200만원 이상</option>
                <option value="unlimited">상관없음</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button type="button" onClick={() => setStep(1)} className="auth-button" style={{ background: '#999' }}>이전</button>
              <button type="submit" className="auth-button" style={{ flex: 1 }}>가입 완료</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SignupPage;
