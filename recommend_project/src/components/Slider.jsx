import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import latestTrend from "../assets/최신트렌드.png";
import priceAnalysis from "../assets/가격비교분석.png";
import notice from "../assets/공지사항.png";
import recommend from "../assets/맞춤추천.png";
import benchmark from "../assets/스펙벤치마크.png";

const Slider = () => {
  const slides = [
    { id: 1, text : "최신 트렌드",img: latestTrend, link: "/products" },
    { id: 2, text : "가격 비교 분석",img: priceAnalysis, link: "/analysis/price" },
    { id: 3, text : "맞춤 추천",img: recommend, link: "/products" },
    { id: 4, text : "공지사항",img: notice, link: "/support" }
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
