const db = require("../config/DB");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const toInt = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const toBool = (v, def) => {
  if (v === undefined) return def;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (["1", "true", "y", "yes"].includes(s)) return true;
  if (["0", "false", "n", "no"].includes(s)) return false;
  return def;
};

const badRequest = (res, message = "Bad Request") =>
  res.status(400).json({ message });
const notFound = (res, message = "Not Found") =>
  res.status(404).json({ message });

// =====================
// Public
// =====================

// GET /api/cs/notices?page=&limit=
exports.listPublished = asyncHandler(async (req, res) => {
  const page = Math.max(1, toInt(req.query.page, 1));
  const limit = Math.min(50, Math.max(1, toInt(req.query.limit, 10)));
  const offset = (page - 1) * limit;

  const whereSql = `WHERE deleted_at IS NULL AND is_published = 1`;

  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM notices ${whereSql}`
  );

  const [rows] = await db.query(
    `
    SELECT id, author_user_no, title, content, views, is_pinned, is_published,
           created_at, updated_at
    FROM notices
    ${whereSql}
    ORDER BY is_pinned DESC, created_at DESC
    LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );

  res.json({ total: countRow.total, page, limit, items: rows });
});

// GET /api/cs/notices/:id
exports.getPublished = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const [rows] = await db.query(
    `
    SELECT id, author_user_no, title, content, views, is_pinned, is_published,
           created_at, updated_at
    FROM notices
    WHERE id = ? AND deleted_at IS NULL AND is_published = 1
    `,
    [id]
  );

  const notice = rows[0];
  if (!notice) return notFound(res);

  await db.query(
    `UPDATE notices SET views = views + 1 WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  notice.views += 1;

  res.json(notice);
});

// =====================
// Admin
// =====================

// GET /api/admin/cs/notices?publishedOnly=&page=&limit=
exports.listAdmin = asyncHandler(async (req, res) => {
  const page = Math.max(1, toInt(req.query.page, 1));
  const limit = Math.min(50, Math.max(1, toInt(req.query.limit, 10)));
  const offset = (page - 1) * limit;

  const publishedOnly = toBool(req.query.publishedOnly, false);

  const where = ["deleted_at IS NULL"];
  if (publishedOnly) where.push("is_published = 1");
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM notices ${whereSql}`
  );

  const [rows] = await db.query(
    `
    SELECT id, author_user_no, title, content, views, is_pinned, is_published,
           created_at, updated_at
    FROM notices
    ${whereSql}
    ORDER BY is_pinned DESC, created_at DESC
    LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );

  res.json({ total: countRow.total, page, limit, items: rows });
});

// GET /api/admin/cs/notices/:id
exports.getAdmin = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const [rows] = await db.query(
    `
    SELECT id, author_user_no, title, content, views, is_pinned, is_published,
           created_at, updated_at
    FROM notices
    WHERE id = ? AND deleted_at IS NULL
    `,
    [id]
  );

  const notice = rows[0];
  if (!notice) return notFound(res);

  res.json(notice);
});

// POST /api/admin/cs/notices
exports.create = asyncHandler(async (req, res) => {
  const { title, content, is_pinned = false, is_published = true } = req.body || {};

  if (!title || typeof title !== "string" || title.length > 200)
    return badRequest(res, "Invalid title");
  if (!content || typeof content !== "string")
    return badRequest(res, "Invalid content");

  const [result] = await db.query(
    `
    INSERT INTO notices (author_user_no, title, content, is_pinned, is_published)
    VALUES (?, ?, ?, ?, ?)
    `,
    [req.user.userNo, title, content, is_pinned ? 1 : 0, is_published ? 1 : 0]
  );

  res.status(201).json({ id: result.insertId });
});

// PATCH /api/admin/cs/notices/:id
exports.update = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const patch = req.body || {};
  const fields = [];
  const values = [];

  const allow = ["title", "content", "is_pinned", "is_published"];
  for (const key of allow) {
    if (patch[key] === undefined) continue;
    fields.push(`${key} = ?`);
    if (key.startsWith("is_")) values.push(patch[key] ? 1 : 0);
    else values.push(patch[key]);
  }

  if (!fields.length) return badRequest(res, "No fields to update");

  values.push(id);
  const [result] = await db.query(
    `UPDATE notices SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    values
  );

  if (!result.affectedRows) return notFound(res);
  res.json({ ok: true });
});

// DELETE /api/admin/cs/notices/:id (soft delete)
exports.remove = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const [result] = await db.query(
    `UPDATE notices SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );

  if (!result.affectedRows) return notFound(res);
  res.json({ ok: true });
});
