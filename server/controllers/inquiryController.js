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
const unauthorized = (res, message = "Unauthorized") =>
  res.status(401).json({ message });

// =====================
// User
// =====================

// POST /api/cs/inquiries
exports.create = asyncHandler(async (req, res) => {
  const user_no = req.user?.userNo;
  if (!user_no) return unauthorized(res);

  const { category = null, title, content } = req.body || {};
  if (!title || typeof title !== "string" || title.length > 200)
    return badRequest(res, "Invalid title");
  if (!content || typeof content !== "string")
    return badRequest(res, "Invalid content");

  const [result] = await db.query(
    `
    INSERT INTO inquiries (user_no, category, title, content)
    VALUES (?, ?, ?, ?)
    `,
    [user_no, category, title, content]
  );

  res.status(201).json({ id: result.insertId });
});

// GET /api/cs/inquiries?page=&limit=
exports.listMine = asyncHandler(async (req, res) => {
  const user_no = req.user?.userNo;
  if (!user_no) return unauthorized(res);

  const page = Math.max(1, toInt(req.query.page, 1));
  const limit = Math.min(50, Math.max(1, toInt(req.query.limit, 10)));
  const offset = (page - 1) * limit;

  const [[countRow]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM inquiries
    WHERE user_no = ? AND deleted_at IS NULL
    `,
    [user_no]
  );

  const [rows] = await db.query(
    `
    SELECT id, user_no, category, title, status,
           replied_at, created_at, updated_at
    FROM inquiries
    WHERE user_no = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [user_no, limit, offset]
  );

  res.json({ total: countRow.total, page, limit, items: rows });
});

// GET /api/cs/inquiries/:id
exports.getMine = asyncHandler(async (req, res) => {
  const user_no = req.user?.userNo;
  if (!user_no) return unauthorized(res);

  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const [rows] = await db.query(
    `
    SELECT id, user_no, category, title, content, status,
           reply_content, replied_by, replied_at,
           created_at, updated_at
    FROM inquiries
    WHERE id = ? AND user_no = ? AND deleted_at IS NULL
    `,
    [id, user_no]
  );

  const inquiry = rows[0];
  if (!inquiry) return notFound(res);

  res.json(inquiry);
});

// =====================
// Admin
// =====================

// GET /api/admin/cs/inquiries?status=&page=&limit=
exports.listAdmin = asyncHandler(async (req, res) => {
  const page = Math.max(1, toInt(req.query.page, 1));
  const limit = Math.min(50, Math.max(1, toInt(req.query.limit, 10)));
  const offset = (page - 1) * limit;

  const status = req.query.status ? String(req.query.status) : undefined;
  const allowedStatus = new Set(["OPEN", "ANSWERED", "CLOSED"]);
  if (status && !allowedStatus.has(status)) return badRequest(res, "Invalid status");

  const where = ["deleted_at IS NULL"];
  const params = [];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM inquiries WHERE ${where.join(" AND ")}`,
    params
  );

  const [rows] = await db.query(
    `
    SELECT id, user_no, category, title, status,
           replied_by, replied_at, created_at, updated_at
    FROM inquiries
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  res.json({ total: countRow.total, page, limit, items: rows });
});

// GET /api/admin/cs/inquiries/:id
exports.getAdmin = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const [rows] = await db.query(
    `
    SELECT id, user_no, category, title, content, status,
           reply_content, replied_by, replied_at,
           created_at, updated_at
    FROM inquiries
    WHERE id = ? AND deleted_at IS NULL
    `,
    [id]
  );

  const inquiry = rows[0];
  if (!inquiry) return notFound(res);

  res.json(inquiry);
});

// POST /api/admin/cs/inquiries/:id/reply
exports.reply = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const { reply_content, status } = req.body || {};
  if (!reply_content || typeof reply_content !== "string")
    return badRequest(res, "Invalid reply_content");

  const allowedStatus = new Set(["ANSWERED", "CLOSED"]);
  const nextStatus = status ? String(status) : "ANSWERED";
  if (!allowedStatus.has(nextStatus)) return badRequest(res, "Invalid status");

  const [result] = await db.query(
    `
    UPDATE inquiries
    SET reply_content = ?,
        replied_by = ?,
        replied_at = NOW(),
        status = ?
    WHERE id = ? AND deleted_at IS NULL
    `,
    [reply_content, req.user.userNo, nextStatus, id]
  );

  if (!result.affectedRows) return notFound(res);
  res.json({ ok: true });
});

// PATCH /api/admin/cs/inquiries/:id/status
exports.updateStatus = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const { status } = req.body || {};
  const allowedStatus = new Set(["OPEN", "ANSWERED", "CLOSED"]);
  if (!status || !allowedStatus.has(String(status)))
    return badRequest(res, "Invalid status");

  const [result] = await db.query(
    `
    UPDATE inquiries
    SET status = ?
    WHERE id = ? AND deleted_at IS NULL
    `,
    [String(status), id]
  );

  if (!result.affectedRows) return notFound(res);
  res.json({ ok: true });
});

// DELETE /api/admin/cs/inquiries/:id (soft delete)
exports.remove = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return badRequest(res, "Invalid id");

  const [result] = await db.query(
    `UPDATE inquiries SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );

  if (!result.affectedRows) return notFound(res);
  res.json({ ok: true });
});
