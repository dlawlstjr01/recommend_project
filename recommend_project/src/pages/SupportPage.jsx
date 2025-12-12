import React, { useState } from 'react';

const SupportPage = () => {
  const [tab, setTab] = useState('notice');
  const [selectedNotice, setSelectedNotice] = useState(null); 

  // --- 1:1 문의 관련 상태 ---
  const [inquiryForm, setInquiryForm] = useState({
    title: '',
    category: 'general',
    content: '',
  });

  const [inquiryHistory, setInquiryHistory] = useState([
    { 
      id: 1, 
      category: '배송', 
      title: '배송이 너무 늦어요', 
      content: '주문한 지 일주일이 지났는데 아직도 배송 준비 중입니다. 언제 받을 수 있나요?',
      date: '2025.12.01', 
      status: '답변완료',
      answer: '안녕하세요 고객님. 배송 지연으로 불편을 드려 죄송합니다. 해당 상품은 내일 발송될 예정입니다.'
    },
    { 
      id: 2, 
      category: '상품', 
      title: '상품에 스크래치가 있습니다', 
      content: '어제 받은 상품 뒷면에 긁힌 자국이 있어요. 교환 가능한가요?',
      date: '2025.12.05', 
      status: '접수대기',
      answer: null 
    },
  ]);

  const [expandedInquiryId, setExpandedInquiryId] = useState(null);

  const toggleInquiry = (id) => {
    setExpandedInquiryId(expandedInquiryId === id ? null : id);
  };

  // 공지사항 데이터
  const notices = [
    { id: 1, title: "[공지] 시스템 정기 점검 안내", date: "2025.12.01", content: "더 나은 서비스를 위해 시스템 정기 점검을 진행합니다.\n\n일시: 2025년 12월 5일 02:00 ~ 06:00 (4시간)\n\n점검 시간 동안 서비스 이용이 제한될 수 있습니다. 양해 부탁드립니다." },
    { id: 2, title: "[이벤트] 신규 가입 회원 혜택 안내", date: "2025.12.02", content: "신규 가입 회원님들을 위한 특별 혜택!\n\n가입 즉시 사용 가능한 쿠폰팩을 드립니다.\n자세한 내용은 이벤트 페이지를 참고해주세요." },
    { id: 3, title: "[공지] 개인정보 처리방침 변경 안내", date: "2025.12.03", content: "개인정보 처리방침이 일부 변경됩니다.\n\n변경일: 2025년 12월 10일\n주요 변경 내용: 마케팅 활용 동의 항목 구체화\n\n항상 안전한 서비스 이용을 위해 최선을 다하겠습니다." }
  ];

  const handleNoticeClick = (notice) => setSelectedNotice(notice);
  const closeModal = () => setSelectedNotice(null);

  const handleInquiryChange = (e) => {
    const { name, value } = e.target;
    setInquiryForm({ ...inquiryForm, [name]: value });
  };

  const handleInquirySubmit = (e) => {
    e.preventDefault();
    if (!inquiryForm.title || !inquiryForm.content) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }
    const newInquiry = {
      id: inquiryHistory.length + 1,
      category: inquiryForm.category === 'general' ? '일반' : inquiryForm.category === 'product' ? '상품' : '배송',
      title: inquiryForm.title,
      content: inquiryForm.content,
      date: new Date().toLocaleDateString(),
      status: '접수대기',
      answer: null
    };
    setInquiryHistory([newInquiry, ...inquiryHistory]);
    setInquiryForm({ title: '', category: 'general', content: '' });
    alert('문의가 접수되었습니다.');
  };

  return (
    <div className="support-container">
      <h2 className="support-title">고객센터</h2>
      
      <div className="tab-menu">
        <button onClick={() => setTab('notice')} className={`tab-btn ${tab === 'notice' ? 'active' : ''}`}>공지사항</button>
        <button onClick={() => setTab('faq')} className={`tab-btn ${tab === 'faq' ? 'active' : ''}`}>자주 묻는 질문 (FAQ)</button>
        <button onClick={() => setTab('qna')} className={`tab-btn ${tab === 'qna' ? 'active' : ''}`}>1:1 문의</button>
      </div>

      <div className="support-content-box">
        {/* 공지사항 탭 */}
        {tab === 'notice' && (
          <ul className="notice-list">
            {notices.map(item => (
              <li key={item.id} className="notice-item" onClick={() => handleNoticeClick(item)}>
                <span>{item.title}</span><span className="notice-date">{item.date}</span>
              </li>
            ))}
          </ul>
        )}

        {/* ★ FAQ 탭 (예시 데이터 복구됨) */}
        {tab === 'faq' && (
          <div className="faq-list">
            <details className="faq-details">
              <summary className="faq-summary">Q. 비교 데이터는 정확한가요?</summary>
              <p className="faq-answer">A. 네, 제조사 공식 데이터를 기반으로 제공되며 매일 업데이트됩니다.</p>
            </details>
            <details className="faq-details">
              <summary className="faq-summary">Q. 회원가입은 무료인가요?</summary>
              <p className="faq-answer">A. 네, 모든 기능은 무료로 이용하실 수 있습니다.</p>
            </details>
            <details className="faq-details">
              <summary className="faq-summary">Q. 비밀번호를 잊어버렸어요.</summary>
              <p className="faq-answer">A. 로그인 화면 하단의 '비밀번호 찾기'를 통해 이메일 인증 후 재설정하실 수 있습니다.</p>
            </details>
            <details className="faq-details">
              <summary className="faq-summary">Q. 탈퇴는 어떻게 하나요?</summary>
              <p className="faq-answer">A. 마이페이지 &gt; 내 정보 관리 하단에서 '회원 탈퇴' 버튼을 통해 가능합니다.</p>
            </details>
          </div>
        )}

        {/* 1:1 문의 탭 */}
        {tab === 'qna' && (
          <div className="inquiry-container">
            <div className="inquiry-form-section">
              <h3 className="section-title">문의 작성</h3>
              <form onSubmit={handleInquirySubmit} className="inquiry-form">
                <div className="form-row">
                  <select name="category" value={inquiryForm.category} onChange={handleInquiryChange} className="inquiry-select">
                    <option value="general">일반 문의</option><option value="product">상품 문의</option><option value="shipping">배송 문의</option>
                  </select>
                  <input type="text" name="title" placeholder="제목을 입력하세요" value={inquiryForm.title} onChange={handleInquiryChange} className="inquiry-input"/>
                </div>
                <textarea name="content" placeholder="문의 내용을 자세히 적어주세요." value={inquiryForm.content} onChange={handleInquiryChange} className="inquiry-textarea"></textarea>
                <div className="form-footer"><button type="submit" className="submit-btn">문의하기</button></div>
              </form>
            </div>

            <div className="inquiry-history-section">
              <h3 className="section-title" style={{ marginTop: '40px' }}>나의 문의 내역</h3>
              <div className="history-table">
                <div className="history-header">
                  <span className="col-status">상태</span>
                  <span className="col-category">분류</span>
                  <span className="col-title">제목</span>
                  <span className="col-date">작성일</span>
                </div>
                {inquiryHistory.length === 0 ? (
                  <div className="no-history">문의 내역이 없습니다.</div>
                ) : (
                  inquiryHistory.map((item) => (
                    <div key={item.id} className="history-item-wrapper">
                      <div className={`history-row ${expandedInquiryId === item.id ? 'active' : ''}`} onClick={() => toggleInquiry(item.id)}>
                        <span className={`col-status status-${item.status === '답변완료' ? 'done' : 'wait'}`}>{item.status}</span>
                        <span className="col-category">{item.category}</span>
                        <span className="col-title">{item.title}</span>
                        <span className="col-date">{item.date}</span>
                      </div>
                      {expandedInquiryId === item.id && (
                        <div className="inquiry-detail-card">
                          <div className="question-box">
                            <span className="badge-q">Q</span>
                            <p>{item.content}</p>
                          </div>
                          <div className="answer-box">
                            <span className="badge-a">A</span>
                            {item.answer ? <p>{item.answer}</p> : <p className="no-answer-text">아직 답변이 등록되지 않았습니다.</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedNotice && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
             <div className="modal-header"><h3>{selectedNotice.title}</h3><button className="close-btn" onClick={closeModal}>&times;</button></div>
             <div className="modal-body"><p className="modal-date">{selectedNotice.date}</p><div className="modal-text">{selectedNotice.content.split('\n').map((line, idx) => (<React.Fragment key={idx}>{line}<br /></React.Fragment>))}</div></div>
             <div className="modal-footer"><button className="modal-close-btn" onClick={closeModal}>닫기</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportPage;
