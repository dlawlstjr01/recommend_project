const db = require("../config/DB");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const toInt = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const badRequest = (res, message = "Bad Request") =>
  res.status(400).json({ message });
const notFound = (res, message = "Not Found") =>
  res.status(404).json({ message });

// =====================
// Public
// =====================

// GET /api/cs/faqs?category=
exports.listPublished = asyncHandler(async (req, res) => {
  const category = req.query.category ? String(req.query.category) : undefined;

  const where = ["deleted_at IS NULL", "is_published = 1"];
  const params = [];

  if (category) {
    where.push("category = ?");
    params.push(category);
  }

  const [rows] = await db.query(
    `
    SELECT id, author_user_no, updated_user_no, category, question, answer,
           display_order, is_published, created_at, updated_at
    FROM faqs
    WHERE ${where.join(" AND ")}
    ORDER BY display_order ASC, id ASC
    `,
    params
  );

  res.json(rows);
});

// =====================
// Admin
// =====================

// GET /api/admin/cs/faqs?category=&publishedOnly=
exports.listAdmin = asyncHandler(async (req, res) => {
  const category = req.query.category ? String(req.query.category) : undefined;
  const publishedOnly = String(req.query.publishedOnly || "").toLowerCase();
  const onlyPublished = ["1", "true", "y", "yes"].includes(publishedOnly);

  const where = ["deleted_at IS NULL"];
  const params = [];

  if (category) {
    where.push("category = ?");
    params.push(category);
  }
  if (onlyPublished) where.push("is_published = 1");

  const [rows] = await db.query(
    `
    SELECT id, author_user_no, updated_user_no, category, question, answer,
           display_order, is_published, created_at, updated_at
    FROM faqs
    WHERE ${where.join(" AND ")}
    ORDER BY display_order ASC, id ASC
    `,
    params
  );

  res.json(rows);
});

// POST /api/admin/cs/faqs
exports.create = asyncHandler(async (req, res) => {
  const {
    category = null,
    question,
    answer,
    display_order = 0,
    is_published = true,
  } = req.body || {};

  if (!question || typeof question !== "string" || question.length > 255)
    return badRequest(res, "Invalid question");
  if (!answer || typeof answer !== "string")
    return badRequest(res, "Invalid answer");

  const [result] = await db.query(
    `
    INSERT INTO faqs (author_user_no, updated_user_no, category, question, answer, display_order, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      req.user.userNo,
      req.user.userNo,
      category,
      question,
      answer,
      toInt(display_order, 0),
      is_published ? 1 : 0,
    ]
  );

  res.status(201).json({ id: result.insertId });
});

// PATCH /api/admin/cs/faqs/:id
exports.update = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const patch = req.body || {};
  const fields = [];
  const values = [];

  const allow = ["category", "question", "answer", "display_order", "is_published"];
  for (const key of allow) {
    if (patch[key] === undefined) continue;
    fields.push(`${key} = ?`);
    if (key === "is_published") values.push(patch[key] ? 1 : 0);
    else if (key === "display_order") values.push(toInt(patch[key], 0));
    else values.push(patch[key]);
  }

  fields.push("updated_user_no = ?");
  values.push(req.user.userNo);

  if (fields.length === 1) return badRequest(res, "No fields to update");

  values.push(id);
  const [result] = await db.query(
    `UPDATE faqs SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    values
  );

  if (!result.affectedRows) return notFound(res);
  res.json({ ok: true });
});

// DELETE /api/admin/cs/faqs/:id
exports.remove = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const [result] = await db.query(
    `UPDATE faqs SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );

  if (!result.affectedRows) return notFound(res);
  res.json({ ok: true });
});
