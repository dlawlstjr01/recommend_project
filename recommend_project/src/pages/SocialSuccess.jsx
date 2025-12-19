import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const SocialSuccess = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const isNew = params.get('isNew');
      const provider = params.get('provider'); // google/kakao

      try {
        // 쿠키가 잘 왔는지 확인
        await axios.get('/auth/me', { withCredentials: true });

        if (isNew === '1') {
          alert(`${provider === 'google' ? '구글' : provider === 'kakao' ? '카카오' : ''} 가입이 완료되었습니다!`);
        } else {
          alert('로그인 성공!');
        }

        navigate('/', { replace: true });
      } catch (err) {
        // 쿠키 없거나 만료/실패
        navigate('/login', { replace: true });
      }
    };

    run();
  }, [navigate]);

  return <div>로그인 중...</div>;
};

export default SocialSuccess;
