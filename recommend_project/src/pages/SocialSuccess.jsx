import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const SocialSuccess = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const token = params.get('token');      // 기존 방식 유지 시
    const isNew = params.get('isNew');   
    const provider = params.get('provider'); //   (google/kakao)

    if (isNew === '1') {
      alert(`${provider === 'google' ? '구글' : '카카오'} 가입이 완료되었습니다!`);
    } else {
      alert('로그인 성공!');
    }

    if (token) {
      localStorage.setItem('token', token);
      window.dispatchEvent(new Event('storage'));
      navigate('/', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return <div>로그인 중...</div>;
};

export default SocialSuccess;
