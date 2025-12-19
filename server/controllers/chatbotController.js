const jwt = require("jsonwebtoken");
const db = require("../config/DB"); 


const PPLX_URL = "https://api.perplexity.ai/chat/completions";

// MVP: 대화 메모리
const memory = new Map(); // conversationId -> [{role, content}]
const getHistory = (cid) => (memory.get(cid) || []).slice(-10);
const pushHistory = (cid, role, content) => {
  const h = memory.get(cid) || [];
  h.push({ role, content });
  memory.set(cid, h.slice(-20));
};

// Perplexity 호출
async function pplxChat({ model, messages, disable_search = true, response_format, temperature = 0.2, max_tokens = 600 }) {
  const resp = await fetch(PPLX_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, messages, disable_search, response_format, temperature, max_tokens }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Perplexity API error: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

// JWT(로그인 안해도 검색은 되게)
function getUserIdOptional(req) {
  // 1 Authorization 헤더(있으면)도 지원
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  // 2  쿠키에서 JWT
  const cookieToken =
    req.cookies?.accessToken ||
    req.cookies?.token ||
    req.cookies?.jwt ||
    req.cookies?.access_token;

  const token = bearer || cookieToken;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    //  payload에 실제로 뭐가 들어가는지 맞춰야 함
    return payload.userNo || payload.userId || payload.user_id || payload.login_id || payload.sub || null;
  } catch (e) {
    console.log("JWT verify failed:", e.message);
    return null;
  }
}
// 속성 필터 EXISTS 만들기
function buildAttrExists(attrs = []) {
  const clauses = [];
  const params = [];

  for (const a of attrs) {
    if (!a?.key || a?.value == null) continue;
    const op = a.op === "like" ? "LIKE" : "=";

    clauses.push(`
      EXISTS (
        SELECT 1 FROM PRODUCT_ATTRIBUTE pa
        WHERE pa.product_id = p.product_id
          AND pa.attr_key = ?
          AND pa.attr_value ${op} ?
      )
    `);

    params.push(a.key, op === "LIKE" ? `%${a.value}%` : String(a.value));
  }
  return { clauses, params };
}

//  상품 검색
async function searchProducts({ query, categoryId, brand, priceMin, priceMax, attrs, limit = 8 }) {
  const where = [];
  const params = [];

  if (query) {
    where.push(`(p.product_name LIKE ? OR d.spec_text LIKE ?)`);
    params.push(`%${query}%`, `%${query}%`);
  }
  if (categoryId) { where.push(`p.category_id = ?`); params.push(categoryId); }
  if (brand) { where.push(`p.brand = ?`); params.push(brand); }
  if (priceMin != null) { where.push(`p.price >= ?`); params.push(priceMin); }
  if (priceMax != null) { where.push(`p.price <= ?`); params.push(priceMax); }

  const { clauses: attrClauses, params: attrParams } = buildAttrExists(attrs);
  where.push(...attrClauses);
  params.push(...attrParams);

  const sql = `
    SELECT p.product_id, p.category_id, p.product_name, p.brand, p.price, p.thumbnail_url
    FROM PRODUCT p
    LEFT JOIN PRODUCT_DETAIL d ON d.product_id = p.product_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY p.created_at DESC
    LIMIT ?
  `;
  params.push(Number(limit));

  const [rows] = await db.query(sql, params);
  return rows;
}

//  개인화 추천 RECOMMEND_SCORE 기반
async function recommendProducts({ userId, categoryId, brand, priceMin, priceMax, attrs, limit = 8 }) {
  const where = [`rs.user_id = ?`];
  const params = [userId];

  if (categoryId) { where.push(`p.category_id = ?`); params.push(categoryId); }
  if (brand) { where.push(`p.brand = ?`); params.push(brand); }
  if (priceMin != null) { where.push(`p.price >= ?`); params.push(priceMin); }
  if (priceMax != null) { where.push(`p.price <= ?`); params.push(priceMax); }

  const { clauses: attrClauses, params: attrParams } = buildAttrExists(attrs);
  where.push(...attrClauses);
  params.push(...attrParams);

  const sql = `
    SELECT p.product_id, p.category_id, p.product_name, p.brand, p.price, p.thumbnail_url, rs.total_score
    FROM RECOMMEND_SCORE rs
    JOIN PRODUCT p ON p.product_id = rs.product_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY rs.total_score DESC
    LIMIT ?
  `;
  params.push(Number(limit));

  const [rows] = await db.query(sql, params);
  return rows;
}

async function getProductDetail(productId) {
  const [pRows] = await db.query(
    `SELECT p.product_id, p.category_id, p.product_name, p.brand, p.price, p.thumbnail_url,
            d.description, d.spec_text, d.image_urls
     FROM PRODUCT p
     LEFT JOIN PRODUCT_DETAIL d ON d.product_id = p.product_id
     WHERE p.product_id = ?`,
    [productId]
  );
  const product = pRows?.[0];
  if (!product) return null;

  const [aRows] = await db.query(
    `SELECT attr_key, attr_value FROM PRODUCT_ATTRIBUTE WHERE product_id = ?`,
    [productId]
  );

  return { ...product, attributes: aRows };
}

// ====== 컨트롤러 엔드포인트 ======
async function chat(req, res) {
    console.log("✅ /api/chat hit");
    console.log("body:", req.body);

  try {
    const { conversationId = "default", message } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const userId = getUserIdOptional(req);
    const model = process.env.PERPLEXITY_MODEL || "sonar-pro";

    // 1) 의도/필터 JSON 추출
    const intentText = await pplxChat({
      model,
      disable_search: true,
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "너는 IT기기 쇼핑몰 챗봇이다. 사용자의 문장을 intent와 필터로 구조화해라. 반드시 JSON Schema만 출력해라.",
        },
        { role: "user", content: message },
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
              brand: { type: ["string", "null"] },
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
      intent = { intent: "search", query: message, limit: 8, attrs: [] };
    }

    // 2 DB 조회
    const limit = intent.limit ?? 8;
    let products = [];
    let detail = null;

    if (intent.intent === "detail" && intent.productId) {
      detail = await getProductDetail(intent.productId);
      if (!detail) return res.json({ reply: "해당 상품을 찾지 못했어요. 상품 번호를 확인해줘!", products: [] });

      products = [{
        product_id: detail.product_id,
        product_name: detail.product_name,
        brand: detail.brand,
        price: detail.price,
        thumbnail_url: detail.thumbnail_url,
      }];
    } else if (intent.intent === "recommend") {
      if (!userId) {
        return res.json({
          reply: "개인화 추천은 로그인 후 가능해요. 예산/용도/브랜드를 말해주면 조건 기반으로 찾아줄게요!",
          products: [],
        });
      }
      products = await recommendProducts({
        userId,
        categoryId: intent.categoryId,
        brand: intent.brand,
        priceMin: intent.priceMin,
        priceMax: intent.priceMax,
        attrs: intent.attrs,
        limit,
      });
    } else if (intent.intent === "search") {
      products = await searchProducts({
        query: intent.query || message,
        categoryId: intent.categoryId,
        brand: intent.brand,
        priceMin: intent.priceMin,
        priceMax: intent.priceMax,
        attrs: intent.attrs,
        limit,
      });
    } else {
      return res.json({
        reply: intent.followupQuestion || "원하시는 조건을 1~2개만 더 알려주세요! (예: 예산/용도/브랜드)",
        products: [],
      });
    }

    // 3 답변 생성(중요: products 목록 밖 언급 금지)
    const history = getHistory(conversationId);

    const reply = await pplxChat({
      model,
      disable_search: true,
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: [
            "너는 한국어 IT기기 쇼핑몰 챗봇이다.",
            "반드시 제공된 products 목록에 있는 상품만 언급/추천한다.",
            "products가 비어있으면 1~2개의 짧은 추가 질문만 한다.",
            "답변은 짧고 실용적으로, 가능하면 불릿으로 작성한다.",
          ].join("\n"),
        },
        ...history,
        { role: "user", content: JSON.stringify({ userMessage: message, intent, products, detail }) },
      ],
    });

    pushHistory(conversationId, "user", message);
    pushHistory(conversationId, "assistant", reply);

    return res.json({ reply, products });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "chat failed" });
  }
}

module.exports = { chat };
