// controllers/chatbotController.js
const jwt = require("jsonwebtoken");

// Node 18+면 global.fetch 존재
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    // Node 18 미만이면: npm i node-fetch
    fetchFn = require("node-fetch");
  } catch (e) {
    console.error("❌ fetch가 없습니다. Node 18+ 사용 또는 node-fetch 설치 필요");
  }
}

const PPLX_URL = "https://api.perplexity.ai/chat/completions";

// ===== 메모리(대화 히스토리) =====
const memory = new Map(); // conversationId -> [{role, content}]
const getHistory = (cid) => (memory.get(cid) || []).slice(-10);
const pushHistory = (cid, role, content) => {
  const h = memory.get(cid) || [];
  h.push({ role, content });
  memory.set(cid, h.slice(-20));
};

// ===== "추가 질문" 대기 상태 =====
// conversationId -> { baseMessage: string }
const pending = new Map();

// ===== Perplexity 호출 =====
async function pplxChat({
  model,
  messages,
  disable_search = false,
  response_format,
  temperature = 0.2,
  max_tokens = 600,
}) {
  if (!fetchFn) throw new Error("fetch not available");

  const resp = await fetchFn(PPLX_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      disable_search,
      response_format,
      temperature,
      max_tokens,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Perplexity API error: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

// ===== JWT (로그인 없어도 챗봇 가능) =====
function getUserIdOptional(req) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  const cookieToken =
    req.cookies?.accessToken ||
    req.cookies?.token ||
    req.cookies?.jwt ||
    req.cookies?.access_token;

  const token = bearer || cookieToken;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return (
      payload.userNo ||
      payload.userId ||
      payload.user_id ||
      payload.login_id ||
      payload.sub ||
      null
    );
  } catch (e) {
    console.log("JWT verify failed:", e.message);
    return null;
  }
}

// ===== 부족한 정보면 follow-up 질문 만들기 =====
function pickFollowupQuestions(message) {
  const q = [];

  const hasBudget = /(예산|가격|원|만원|\d+\s*만|\d+\s*천|\d+\s*원)/.test(message);
  const hasWireless = /(무선|유선|블루투스|2\.4g|2\.4|동글)/.test(message);
  const hasUsage = /(게임|게이밍|FPS|사무|업무|문서|코딩|디자인|편집)/.test(message);

  const mentionsMouse = /(마우스)/.test(message);

  // ✅ 네가 말한 로직 그대로:
  // "마우스" 언급인데 용도/예산/무선 정보가 없으면 질문
  if (mentionsMouse) {
    if (!hasUsage) q.push("어떤 용도로 쓰실 마우스인가요? (예: 사무/코딩/게임(FPS)/디자인)");
    if (!hasBudget) q.push("예산은 어느 정도로 생각하세요? (예: 5만원대 / 10만원 이하 / 20만원대)");
    if (q.length < 2 && !hasWireless) q.push("무선/유선 중 어떤 걸 선호하세요?");
  } else {
    // 다른 제품도 공통으로(원하면 확장 가능)
    if (!hasUsage) q.push("주 용도는 무엇인가요?");
    if (!hasBudget) q.push("예산 범위를 알려주세요.");
  }

  return q.slice(0, 2);
}

// ====== 컨트롤러 엔드포인트 ======
async function chat(req, res) {
  console.log(" /api/chat hit");
  console.log("body:", req.body);

  try {
    const { conversationId = "default", message } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const model = process.env.PERPLEXITY_MODEL || "sonar";
    const userId = getUserIdOptional(req); // 필요없으면 삭제해도 됨

    // ✅ 이전에 follow-up 질문을 던졌던 상태면 원문 + 이번 답을 합쳐서 처리
    let mergedMessage = message;
    const p = pending.get(conversationId);
    if (p?.baseMessage) {
      mergedMessage = `${p.baseMessage}\n추가 조건: ${message}`;
      pending.delete(conversationId);
    }

    // 1) intent/필터 추출 (기존 유지)
    const intentText = await pplxChat({
      model,
      disable_search: false,
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "너는 IT기기 쇼핑몰 챗봇이다. 사용자의 문장을 intent와 필터로 구조화해라. 반드시 JSON Schema만 출력해라.",
        },
        { role: "user", content: mergedMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intent: { type: "string", enum: ["search", "recommend", "detail", "clarify"] },
              query: { type: "string" },
              categoryId: { type: ["number", "null"] },
              priceMin: { type: ["number", "null"] },
              priceMax: { type: ["number", "null"] },
              attrs: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    key: { type: "string" },
                    op: { type: "string", enum: ["eq", "like"] },
                    value: { type: "string" },
                  },
                  required: ["key", "value"],
                },
              },
              productId: { type: ["number", "null"] },
              limit: { type: ["number", "null"] },
              followupQuestion: { type: ["string", "null"] },
            },
            required: ["intent"],
          },
        },
      },
    });

    let intent;
    try {
      intent = JSON.parse(intentText);
    } catch {
      intent = { intent: "recommend", query: mergedMessage, limit: 5, attrs: [] };
    }

    // ✅ 2) "정보가 없으면 질문" (너가 원하는 핵심 로직)
    // - 질문할 게 있으면 질문하고 종료
    // - 질문할 게 없으면(정보 충분) 바로 추천 답변 생성
    const followups = pickFollowupQuestions(mergedMessage);

    // recommend/search 요청인데 정보 부족하면 질문 먼저
    if ((intent.intent === "recommend" || intent.intent === "search") && followups.length > 0) {
      pending.set(conversationId, { baseMessage: mergedMessage });

      const questionText = followups.map((x, i) => `${i + 1}) ${x}`).join("\n");
      const reply = `추천을 더 정확히 하려면 몇 가지만 알려주세요!\n${questionText}`;

      pushHistory(conversationId, "user", message);
      pushHistory(conversationId, "assistant", reply);

      return res.json({ reply, products: [] });
    }

    // clarify면 intent가 만든 followupQuestion 쓰고 종료
    if (intent.intent === "clarify") {
      const reply =
        intent.followupQuestion ||
        "원하시는 조건을 1~2개만 더 알려주세요! (예: 예산/용도/무선 or 유선)";
      pushHistory(conversationId, "user", message);
      pushHistory(conversationId, "assistant", reply);
      return res.json({ reply, products: [] });
    }

    // ✅ DB 없이: products/detail 항상 빈 값
    const products = [];
    const detail = null;

    // 3) 답변 생성(웹 검색 기반 추천)
    const history = getHistory(conversationId);

    const reply = await pplxChat({
      model,
      disable_search: false, // ✅ 웹검색 허용
      temperature: 0.3,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: [
            "너는 한국어 IT기기 쇼핑 도우미(구매 상담 챗봇)다.",
            "웹에서 최신 제품 후보를 찾아 비교해서 추천한다.",
            "",
            "규칙:",
            "1) 예산/용도/선호(무선/유선, 그립, 소음, 휴대성 등)가 부족하면 최대 2개의 짧은 질문만 한다.",
            "2) 정보가 충분하면 3~5개 제품을 추천한다.",
            "3) 각 제품은: 제품명 / 추천 이유(1~2줄) / 주의점(1줄) / 대략 가격대 / 출처(사이트명 또는 링크 힌트) 로 쓴다.",
            "4) 가격/재고는 변동 가능하니 '대략'으로 표현한다.",
            "5) 답변은 짧고 실용적으로 불릿으로 작성한다.",
          ].join("\n"),
        },
        ...history,
        {
          role: "user",
          content: JSON.stringify({
            userMessage: mergedMessage,
            intent,
            userId: userId ? String(userId) : null,
            products,
            detail,
          }),
        },
      ],
    });

    pushHistory(conversationId, "user", message);
    pushHistory(conversationId, "assistant", reply);

    return res.json({ reply, products: [] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "chat failed" });
  }
}

module.exports = { chat };
