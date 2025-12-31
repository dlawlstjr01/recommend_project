import React, { useEffect, useRef, useState } from "react";
import { FaCommentDots, FaTimes } from "react-icons/fa";
import axios from "axios";

const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, text: "안녕하세요! 무엇을 도와드릴까요?", isBot: true },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const inputRef = useRef(null);

  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const toggleChat = () => setIsOpen(!isOpen);

  const handleSendMessage = async (e) => {
    console.log("✅ handleSendMessage called:", input);

    e.preventDefault();
    if (!input.trim() || isSending) return;

    const text = input.trim();
    setInput("");

    const userMsg = { id: Date.now(), text, isBot: false };
    const loadingId = Date.now() + 1;

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: loadingId, text: "답변 생성 중...", isBot: true, isLoading: true },
    ]);

    setIsSending(true);

    try {
      const conversationId =
      localStorage.getItem("chat_conversation_id") || "c1";
      localStorage.setItem("chat_conversation_id", conversationId);

      // 쿠키(JWT) 같이 보내기
      const res = await axios.post(
        "/api/chat",
        { conversationId, message: text },
        { withCredentials: true }
      );

      const data = res.data;

      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 2, text: data.reply || "응답이 비어있어요.", isBot: true },
      ]);

      if (Array.isArray(data.products) && data.products.length > 0) {
        const productText = data.products
          .slice(0, 5)
          .map(
            (p, idx) =>
              `#${idx + 1} ${p.product_name} / ${p.brand} / ${Number(p.price).toLocaleString()}원`
          )
          .join("\n");

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 3,
            text: `추천/검색된 상품:\n${productText}`,
            isBot: true,
            products: data.products,
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 4,
          text:
            err?.response?.data?.error
              ? `서버 오류: ${err.response.data.error}`
              : "서버 응답에 실패했어요. 잠시 후 다시 시도해 주세요.",
          isBot: true,
        },
      ]);
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="chatbot-container-wrapper">
      <button
        className={`chatbot-toggle-btn ${isOpen ? "hide" : ""}`}
        onClick={toggleChat}
      >
        <FaCommentDots size={28} />
      </button>

      <div className={`chatbot-window ${isOpen ? "open" : ""}`}>
        <div className="chatbot-header">
          <span>AI 상담원</span>
          <button className="chatbot-close-btn" onClick={toggleChat}>
            <FaTimes />
          </button>
        </div>

        <div className="chatbot-messages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`message-bubble ${msg.isBot ? "bot" : "user"}`}
              style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
            >
              {msg.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form className="chatbot-input-area" onSubmit={handleSendMessage}>
          <input
            ref={inputRef}
            type="text"
            placeholder="메시지 입력..."
            value={input}
            readOnly={isSending}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="chatbot-send-btn" disabled={isSending}>
            <span className="send-arrow">→</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatBot;
