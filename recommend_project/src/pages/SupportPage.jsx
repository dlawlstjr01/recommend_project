import React, { useEffect, useState } from "react";

const API_BASE = ""; // Vite proxy 사용: /api, /auth 그대로 호출

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
};

const statusToKo = (s) => {
  if (s === "ANSWERED") return "답변완료";
  if (s === "CLOSED") return "종료";
  return "접수대기"; // OPEN
};

const categoryToKo = (c) => {
  if (!c) return "일반";
  const v = String(c);
  if (v === "general") return "일반";
  if (v === "product") return "상품";
  if (v === "shipping") return "배송";
  return v;
};

// 쿠키 accessToken 포함 fetch
async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, credentials: "include" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.message || "요청 실패");
    err.status = res.status;
    throw err;
  }
  return data;
}

const SupportPage = () => {
  // 로그인/권한
  const [me, setMe] = useState(null);
  const isAdmin = me?.role === "admin";

  // ✅ 공지 (유저): 상세 모달 상태를 먼저 선언 (ESC useEffect에서 사용)
  const [selectedNotice, setSelectedNotice] = useState(null);

  // ✅ 모달 닫기(중복 제거)
  const closeModal = () => setSelectedNotice(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJson(`${API_BASE}/auth/me`);
        setMe(data);
      } catch {
        setMe(null);
      }
    })();
  }, []);

  // ✅ ESC 키로 모달 닫기 (selectedNotice 선언 이후에 와야 함)
  useEffect(() => {
    if (!selectedNotice) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeModal();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNotice]);

  // 탭/공통
  const [tab, setTab] = useState("notice");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 공지 (유저)
  const [notices, setNotices] = useState([]);

  // FAQ (유저)
  const [faqs, setFaqs] = useState([]);

  // 문의 (유저)
  const [inquiryForm, setInquiryForm] = useState({
    title: "",
    category: "general",
    content: "",
  });
  const [inquiryHistory, setInquiryHistory] = useState([]);
  const [expandedInquiryId, setExpandedInquiryId] = useState(null);

  // 문의 (관리자)
  const [adminInquiries, setAdminInquiries] = useState([]);
  const [adminSelectedId, setAdminSelectedId] = useState(null);
  const [adminSelected, setAdminSelected] = useState(null);
  const [adminReply, setAdminReply] = useState("");

  // 공지 (관리자)
  const [adminNotices, setAdminNotices] = useState([]);
  const [adminNoticeForm, setAdminNoticeForm] = useState({
    id: null,
    title: "",
    content: "",
    is_pinned: false,
    is_published: true,
  });

  // FAQ (관리자)
  const [adminFaqs, setAdminFaqs] = useState([]);
  const [adminFaqForm, setAdminFaqForm] = useState({
    id: null,
    category: "general",
    question: "",
    answer: "",
    is_published: true,
  });

  // 관리자 문의: 상세 조회/답변
  const openAdminInquiry = async (id) => {
    setAdminSelectedId(id);
    setErrorMsg("");
    setLoading(true);

    try {
      const detail = await fetchJson(`${API_BASE}/api/admin/cs/inquiries/${id}`);
      setAdminSelected(detail);
      setAdminReply(detail.reply_content || "");
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitAdminReply = async () => {
    if (!adminSelected?.id) return;
    if (!adminReply.trim()) return alert("답변 내용을 입력하세요.");

    setErrorMsg("");
    setLoading(true);

    try {
      await fetchJson(`${API_BASE}/api/admin/cs/inquiries/${adminSelected.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply_content: adminReply, status: "ANSWERED" }),
      });

      alert("답변이 등록되었습니다.");

      // 목록 새로고침
      const data = await fetchJson(`${API_BASE}/api/admin/cs/inquiries?page=1&limit=50`);
      setAdminInquiries(data.items || []);

      // 상세 갱신
      const detail = await fetchJson(`${API_BASE}/api/admin/cs/inquiries/${adminSelected.id}`);
      setAdminSelected(detail);
      setAdminReply(detail.reply_content || "");
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 관리자 공지: 목록/선택/저장/삭제
  const reloadAdminNotices = async () => {
    const data = await fetchJson(`${API_BASE}/api/admin/cs/notices?page=1&limit=50`);
    setAdminNotices(data.items || []);
  };

  const selectAdminNotice = async (id) => {
    setErrorMsg("");
    setLoading(true);
    try {
      const detail = await fetchJson(`${API_BASE}/api/admin/cs/notices/${id}`);
      setAdminNoticeForm({
        id: detail.id,
        title: detail.title || "",
        content: detail.content || "",
        is_pinned: !!detail.is_pinned,
        is_published: !!detail.is_published,
      });
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const newAdminNotice = () => {
    setAdminNoticeForm({
      id: null,
      title: "",
      content: "",
      is_pinned: false,
      is_published: true,
    });
  };

  const saveAdminNotice = async () => {
    if (!adminNoticeForm.title.trim() || !adminNoticeForm.content.trim()) {
      alert("제목/내용을 입력하세요.");
      return;
    }

    setErrorMsg("");
    setLoading(true);

    try {
      if (adminNoticeForm.id) {
        await fetchJson(`${API_BASE}/api/admin/cs/notices/${adminNoticeForm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: adminNoticeForm.title,
            content: adminNoticeForm.content,
            is_pinned: adminNoticeForm.is_pinned,
            is_published: adminNoticeForm.is_published,
          }),
        });
        alert("공지 수정 완료");
      } else {
        await fetchJson(`${API_BASE}/api/admin/cs/notices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: adminNoticeForm.title,
            content: adminNoticeForm.content,
            is_pinned: adminNoticeForm.is_pinned,
            is_published: adminNoticeForm.is_published,
          }),
        });
        alert("공지 등록 완료");
      }

      await reloadAdminNotices();
      newAdminNotice();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteAdminNotice = async (id) => {
    if (!id) return;
    if (!window.confirm("이 공지를 삭제할까요?")) return;

    setErrorMsg("");
    setLoading(true);

    try {
      await fetchJson(`${API_BASE}/api/admin/cs/notices/${id}`, { method: "DELETE" });
      alert("삭제 완료");
      await reloadAdminNotices();
      if (adminNoticeForm.id === id) newAdminNotice();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 관리자 FAQ: 목록/선택/저장/삭제
  const reloadAdminFaqs = async () => {
    const data = await fetchJson(`${API_BASE}/api/admin/cs/faqs`);
    setAdminFaqs(Array.isArray(data) ? data : []);
  };

  const selectAdminFaq = (f) => {
    setAdminFaqForm({
      id: f.id,
      category: f.category || "general",
      question: f.question || "",
      answer: f.answer || "",
      is_published: !!f.is_published,
    });
  };

  const newAdminFaq = () => {
    setAdminFaqForm({
      id: null,
      category: "general",
      question: "",
      answer: "",
      is_published: true,
    });
  };

  const saveAdminFaq = async () => {
    if (!adminFaqForm.question.trim() || !adminFaqForm.answer.trim()) {
      alert("질문/답변을 입력하세요.");
      return;
    }

    setErrorMsg("");
    setLoading(true);

    try {
      if (adminFaqForm.id) {
        await fetchJson(`${API_BASE}/api/admin/cs/faqs/${adminFaqForm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: adminFaqForm.category,
            question: adminFaqForm.question,
            answer: adminFaqForm.answer,
            is_published: adminFaqForm.is_published,
          }),
        });
        alert("FAQ 수정 완료");
      } else {
        await fetchJson(`${API_BASE}/api/admin/cs/faqs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: adminFaqForm.category,
            question: adminFaqForm.question,
            answer: adminFaqForm.answer,
            is_published: adminFaqForm.is_published,
          }),
        });
        alert("FAQ 등록 완료");
      }

      await reloadAdminFaqs();
      newAdminFaq();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteAdminFaq = async (id) => {
    if (!id) return;
    if (!window.confirm("이 FAQ를 삭제할까요?")) return;

    setErrorMsg("");
    setLoading(true);

    try {
      await fetchJson(`${API_BASE}/api/admin/cs/faqs/${id}`, { method: "DELETE" });
      alert("삭제 완료");
      await reloadAdminFaqs();
      if (adminFaqForm.id === id) newAdminFaq();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 탭 변경 시 데이터 로딩
  useEffect(() => {
    const load = async () => {
      setErrorMsg("");
      setLoading(true);

      try {
        if (tab === "notice") {
          if (isAdmin) {
            await reloadAdminNotices();
          } else {
            const data = await fetchJson(`${API_BASE}/api/cs/notices?page=1&limit=50`);
            setNotices(data.items || []);
          }
        }

        if (tab === "faq") {
          if (isAdmin) {
            await reloadAdminFaqs();
          } else {
            const data = await fetchJson(`${API_BASE}/api/cs/faqs`);
            setFaqs(Array.isArray(data) ? data : []);
          }
        }

        if (tab === "qna") {
          if (isAdmin) {
            const data = await fetchJson(`${API_BASE}/api/admin/cs/inquiries?page=1&limit=50`);
            setAdminInquiries(data.items || []);
          } else {
            const data = await fetchJson(`${API_BASE}/api/cs/inquiries?page=1&limit=50`);
            setInquiryHistory(data.items || []);
          }
        }
      } catch (e) {
        if (e.status === 401) {
          if (tab === "qna") {
            setInquiryHistory([]);
            setAdminInquiries([]);
            setErrorMsg("1:1 문의는 로그인 후 이용 가능합니다.");
          } else {
            setErrorMsg("로그인이 필요합니다.");
          }
        } else if (e.status === 403) {
          setErrorMsg("관리자 권한이 필요합니다.");
        } else {
          setErrorMsg(e.message);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tab, isAdmin]);

  // 공지(유저): 상세(조회수 +1 포함)
  const handleNoticeClick = async (notice) => {
    try {
      setErrorMsg("");
      setLoading(true);
      const detail = await fetchJson(`${API_BASE}/api/cs/notices/${notice.id}`);
      setSelectedNotice(detail);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 문의(유저): 입력/등록
  const handleInquiryChange = (e) => {
    const { name, value } = e.target;
    setInquiryForm((prev) => ({ ...prev, [name]: value }));
  };

  const reloadMyInquiries = async () => {
    const data = await fetchJson(`${API_BASE}/api/cs/inquiries?page=1&limit=50`);
    setInquiryHistory(data.items || []);
  };

  const handleInquirySubmit = async (e) => {
    e.preventDefault();

    if (!inquiryForm.title || !inquiryForm.content) {
      alert("제목과 내용을 모두 입력해주세요.");
      return;
    }

    try {
      setErrorMsg("");
      setLoading(true);

      await fetchJson(`${API_BASE}/api/cs/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: inquiryForm.category,
          title: inquiryForm.title,
          content: inquiryForm.content,
        }),
      });

      setInquiryForm({ title: "", category: "general", content: "" });
      alert("문의가 접수되었습니다.");
      await reloadMyInquiries();
    } catch (e2) {
      if (e2.status === 401) alert("로그인이 필요합니다.");
      else alert(e2.message);
    } finally {
      setLoading(false);
    }
  };

  // 문의(유저): 펼치기(상세 불러오기)
  const toggleInquiry = async (id) => {
    const next = expandedInquiryId === id ? null : id;
    setExpandedInquiryId(next);

    if (!next) return;

    const alreadyHasDetail = inquiryHistory.some(
      (x) => x.id === id && (x.content || x.reply_content !== undefined)
    );
    if (alreadyHasDetail) return;

    try {
      setErrorMsg("");
      setLoading(true);

      const detail = await fetchJson(`${API_BASE}/api/cs/inquiries/${id}`);
      setInquiryHistory((prev) => prev.map((x) => (x.id === id ? { ...x, ...detail } : x)));
    } catch (e) {
      if (e.status === 401) setErrorMsg("로그인이 필요합니다.");
      else setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 관리자 공지/FAQ 폼 핸들러
  const onAdminNoticeChange = (e) => {
    const { name, value, type, checked } = e.target;
    setAdminNoticeForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const onAdminFaqChange = (e) => {
    const { name, value, type, checked } = e.target;
    setAdminFaqForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  return (
    <div className="support-container">
      <h2 className="support-title">고객센터</h2>

      <div className="tab-menu">
        <button onClick={() => setTab("notice")} className={`tab-btn ${tab === "notice" ? "active" : ""}`}>
          공지사항
        </button>
        <button onClick={() => setTab("faq")} className={`tab-btn ${tab === "faq" ? "active" : ""}`}>
          자주 묻는 질문 (FAQ)
        </button>
        <button onClick={() => setTab("qna")} className={`tab-btn ${tab === "qna" ? "active" : ""}`}>
          1:1 문의
        </button>
      </div>

      {loading && <div style={{ margin: "10px 0" }}>불러오는 중...</div>}
      {errorMsg && <div style={{ margin: "10px 0", color: "crimson" }}>{errorMsg}</div>}

      <div className="support-content-box">
        {/* ======================
            공지사항
        ====================== */}
        {tab === "notice" &&
          (isAdmin ? (
            // ===== 관리자 공지 관리 UI =====
            <div className="inquiry-container">
              <div className="inquiry-history-section">
                <h3 className="section-title">공지 관리 (관리자)</h3>

                <div className="history-table">
                  <div className="history-header">
                    <span className="col-title">제목</span>
                    <span className="col-date">작성일</span>
                  </div>

                  {adminNotices.length === 0 ? (
                    <div className="no-history">공지사항이 없습니다.</div>
                  ) : (
                    adminNotices.map((n) => (
                      <div key={n.id} className="history-item-wrapper">
                        <div
                          className={`history-row ${adminNoticeForm.id === n.id ? "active" : ""}`}
                          onClick={() => selectAdminNotice(n.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <span className="col-title">
                            {n.is_pinned ? "📌 " : ""}
                            {n.is_published ? "" : "🔒 "}
                            {n.title}
                          </span>
                          <span className="col-date">{formatDate(n.created_at)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="inquiry-form-section" style={{ marginTop: 30 }}>
                <h3 className="section-title">{adminNoticeForm.id ? "공지 수정" : "공지 등록"}</h3>

                <div className="inquiry-form">
                  <div className="form-row">
                    <input
                      className="inquiry-input"
                      name="title"
                      value={adminNoticeForm.title}
                      onChange={onAdminNoticeChange}
                      placeholder="공지 제목"
                    />
                  </div>

                  <textarea
                    className="inquiry-textarea"
                    name="content"
                    value={adminNoticeForm.content}
                    onChange={onAdminNoticeChange}
                    placeholder="공지 내용"
                  />

                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" name="is_pinned" checked={adminNoticeForm.is_pinned} onChange={onAdminNoticeChange} />
                      상단 고정
                    </label>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" name="is_published" checked={adminNoticeForm.is_published} onChange={onAdminNoticeChange} />
                      공개
                    </label>
                  </div>

                  <div className="form-footer" style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="submit-btn" onClick={saveAdminNotice}>
                      저장
                    </button>
                    <button type="button" className="submit-btn" onClick={newAdminNotice} style={{ opacity: 0.9 }}>
                      새로작성
                    </button>
                    {adminNoticeForm.id && (
                      <button
                        type="button"
                        className="submit-btn"
                        onClick={() => deleteAdminNotice(adminNoticeForm.id)}
                        style={{ backgroundColor: "#e11d48" }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // ===== 유저 공지 보기 UI =====
            <ul className="notice-list">
              {notices.map((item) => (
                <li key={item.id} className="notice-item" onClick={() => handleNoticeClick(item)}>
                  <span className="notice-number">{item.id}</span>
                  <span className="notice-title">{item.title}</span>
                  <span className="notice-date">{formatDate(item.created_at)}</span>
                </li>
              ))}
              {notices.length === 0 && !loading && <div className="no-history">공지사항이 없습니다.</div>}
            </ul>
          ))}

        {/* ======================
            FAQ
        ====================== */}
        {tab === "faq" &&
          (isAdmin ? (
            // ===== 관리자 FAQ 관리 UI =====
            <div className="inquiry-container">
              <div className="inquiry-history-section">
                <h3 className="section-title">FAQ 관리 (관리자)</h3>

                <div className="history-table">
                  <div className="history-header">
                    <span className="col-category">분류</span>
                    <span className="col-title">질문</span>
                    <span className="col-date">등록일</span>
                  </div>

                  {adminFaqs.length === 0 ? (
                    <div className="no-history">FAQ가 없습니다.</div>
                  ) : (
                    adminFaqs.map((f) => (
                      <div key={f.id} className="history-item-wrapper">
                        <div
                          className={`history-row ${adminFaqForm.id === f.id ? "active" : ""}`}
                          onClick={() => selectAdminFaq(f)}
                          style={{ cursor: "pointer" }}
                        >
                          <span className="col-category">{categoryToKo(f.category)}</span>
                          <span className="col-title">
                            {f.is_published ? "" : "🔒 "}
                            {f.question}
                          </span>
                          <span className="col-date">{formatDate(f.created_at)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="inquiry-form-section" style={{ marginTop: 30 }}>
                <h3 className="section-title">{adminFaqForm.id ? "FAQ 수정" : "FAQ 등록"}</h3>

                <div className="inquiry-form">
                  <div className="form-row">
                    <select name="category" value={adminFaqForm.category} onChange={onAdminFaqChange} className="inquiry-select">
                      <option value="general">일반</option>
                      <option value="product">상품</option>
                      <option value="shipping">배송</option>
                    </select>
                  </div>

                  <input
                    className="inquiry-input"
                    name="question"
                    value={adminFaqForm.question}
                    onChange={onAdminFaqChange}
                    placeholder="질문"
                    style={{ marginTop: 10 }}
                  />

                  <textarea
                    className="inquiry-textarea"
                    name="answer"
                    value={adminFaqForm.answer}
                    onChange={onAdminFaqChange}
                    placeholder="답변"
                  />

                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" name="is_published" checked={adminFaqForm.is_published} onChange={onAdminFaqChange} />
                      공개
                    </label>
                  </div>

                  <div className="form-footer" style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="submit-btn" onClick={saveAdminFaq}>
                      저장
                    </button>
                    <button type="button" className="submit-btn" onClick={newAdminFaq} style={{ opacity: 0.9 }}>
                      새로작성
                    </button>
                    {adminFaqForm.id && (
                      <button
                        type="button"
                        className="submit-btn"
                        onClick={() => deleteAdminFaq(adminFaqForm.id)}
                        style={{ backgroundColor: "#e11d48" }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // ===== 유저 FAQ 보기 UI =====
            <div className="faq-list">
              {faqs.map((f) => (
                <details key={f.id} className="faq-details">
                  <summary className="faq-summary">
                    <span className="faq-qbadge">Q</span>
                    <span className="faq-qtext">{f.question}</span>
                  </summary>

                  <p className="faq-answer">
                    <span className="faq-abedge">A</span>
                    <span className="faq-atext">{f.answer}</span>
                  </p>

                </details>
              ))}
              {faqs.length === 0 && !loading && <div className="no-history">FAQ가 없습니다.</div>}
            </div>
          ))}

        {/* ======================
            1:1 문의
        ====================== */}
        {tab === "qna" &&
          (isAdmin ? (
            // ===== 관리자 문의 UI =====
            <div className="inquiry-container">
              <div className="inquiry-history-section">
                <h3 className="section-title">전체 문의 내역 (관리자)</h3>

                <div className="history-table">
                  <div className="history-header">
                    <span className="col-status">상태</span>
                    <span className="col-category">분류</span>
                    <span className="col-title">제목</span>
                    <span className="col-date">작성일</span>
                  </div>

                  {adminInquiries.length === 0 ? (
                    <div className="no-history">문의 내역이 없습니다.</div>
                  ) : (
                    adminInquiries.map((item) => {
                      const koStatus = statusToKo(item.status);
                      const isDone = item.status === "ANSWERED" || item.status === "CLOSED";

                      return (
                        <div key={item.id} className="history-item-wrapper">
                          <div
                            className={`history-row ${adminSelectedId === item.id ? "active" : ""}`}
                            onClick={() => openAdminInquiry(item.id)}
                          >
                            <span className={`col-status status-${isDone ? "done" : "wait"}`}>{koStatus}</span>
                            <span className="col-category">{categoryToKo(item.category)}</span>
                            <span className="col-title">{item.title}</span>
                            <span className="col-date">{formatDate(item.created_at)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {adminSelected && (
                <div className="inquiry-detail-card" style={{ marginTop: 20 }}>
                  <div className="question-box">
                    <span className="badge-q">Q</span>
                    <p style={{ whiteSpace: "pre-wrap" }}>{adminSelected.content}</p>
                  </div>

                  <div className="answer-box">
                    <span className="badge-a">A</span>

                    <textarea
                      placeholder="답변을 입력하세요."
                      value={adminReply}
                      onChange={(e) => setAdminReply(e.target.value)}
                      className="inquiry-textarea"
                    />

                    <div className="form-footer">
                      <button type="button" className="submit-btn" onClick={submitAdminReply}>
                        답변 등록
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // ===== 유저 문의 UI =====
            <div className="inquiry-container">
              <div className="inquiry-form-section">
                <h3 className="section-title">문의 작성</h3>

                <form onSubmit={handleInquirySubmit} className="inquiry-form">
                  <div className="form-row">
                    <select
                      name="category"
                      value={inquiryForm.category}
                      onChange={handleInquiryChange}
                      className="inquiry-select"
                    >
                      <option value="general">일반 문의</option>
                      <option value="product">상품 문의</option>
                      <option value="shipping">배송 문의</option>
                    </select>

                    <input
                      type="text"
                      name="title"
                      placeholder="제목을 입력하세요"
                      value={inquiryForm.title}
                      onChange={handleInquiryChange}
                      className="inquiry-input"
                    />
                  </div>

                  <textarea
                    name="content"
                    placeholder="문의 내용을 자세히 적어주세요."
                    value={inquiryForm.content}
                    onChange={handleInquiryChange}
                    className="inquiry-textarea"
                  />

                  <div className="form-footer">
                    <button type="submit" className="submit-btn">
                      문의하기
                    </button>
                  </div>
                </form>
              </div>

              <div className="inquiry-history-section">
                <h3 className="section-title" style={{ marginTop: "40px" }}>
                  나의 문의 내역
                </h3>

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
                    inquiryHistory.map((item) => {
                      const koStatus = statusToKo(item.status);
                      const isDone = item.status === "ANSWERED" || item.status === "CLOSED";

                      return (
                        <div key={item.id} className="history-item-wrapper">
                          <div
                            className={`history-row ${expandedInquiryId === item.id ? "active" : ""}`}
                            onClick={() => toggleInquiry(item.id)}
                          >
                            <span className={`col-status status-${isDone ? "done" : "wait"}`}>{koStatus}</span>
                            <span className="col-category">{categoryToKo(item.category)}</span>
                            <span className="col-title">{item.title}</span>
                            <span className="col-date">{formatDate(item.created_at)}</span>
                          </div>

                          {expandedInquiryId === item.id && (
                            <div className="inquiry-detail-card">
                              <div className="question-box">
                                <span className="badge-q">Q</span>
                                <p>{item.content || "내용을 불러오는 중..."}</p>
                              </div>

                              <div className="answer-box">
                                <span className="badge-a">A</span>
                                {item.reply_content ? (
                                  <p>{item.reply_content}</p>
                                ) : (
                                  <p className="no-answer-text">아직 답변이 등록되지 않았습니다.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* 공지 상세 모달 (유저용) */}
      {!isAdmin && selectedNotice && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedNotice.title}</h3>
              <button className="close-btn" onClick={closeModal}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-date">{formatDate(selectedNotice.created_at)}</p>
              <div className="modal-text">
                {String(selectedNotice.content || "")
                  .split("\n")
                  .map((line, idx) => (
                    <React.Fragment key={idx}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportPage;
