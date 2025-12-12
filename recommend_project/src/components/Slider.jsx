import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

const Slider = () => {
  const slides = [
    { id: 1, text: "최신 IT 트렌드", img: "https://picsum.photos/1200/400?random=1", link: "/trend" },
    { id: 2, text: "가격 비교 분석", img: "https://picsum.photos/1200/400?random=2", link: "/analysis" },
    { id: 3, text: "스펙 벤치마크", img: "https://picsum.photos/1200/400?random=3", link: "/benchmark" },
    { id: 4, text: "사용자 리뷰", img: "https://picsum.photos/1200/400?random=4", link: "/reviews" },
    { id: 5, text: "전문가 추천", img: "https://picsum.photos/1200/400?random=5", link: "/recommend" },
    { id: 6, text: "이달의 핫딜", img: "https://picsum.photos/1200/400?random=6", link: "/hotdeal" },
  ];

  return (
    <div className="slider-wrapper">
      <Swiper
        modules={[Navigation, Pagination, Autoplay]}
        spaceBetween={0}
        slidesPerView={1}
        navigation
        pagination={{ clickable: true }}
        autoplay={{ delay: 3000, disableOnInteraction: false }}
        loop={true}
        className="mySwiper"
      >
        {slides.map((slide) => (
          <SwiperSlide key={slide.id}>
            <div className="slide-content">
              {/* 배경 이미지 */}
              <img src={slide.img} alt={slide.text} className="slide-img" />
              
              {/* 텍스트와 버튼을 감싸는 컨테이너 */}
              <div className="slide-content-wrapper">
                <h2 className="slide-text">{slide.text}</h2>
                <button
                  onClick={() => window.location.href = slide.link}
                  className="slide-action-btn"
                >
                  바로가기 &rarr;
                </button>
              </div>
            </div>
            {/* 그림자 오버레이 */}
            <div className="slide-overlay"></div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
};

export default Slider;
