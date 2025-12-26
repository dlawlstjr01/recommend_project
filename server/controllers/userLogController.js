const db = require("../config/DB");

exports.createUserLog = async (req, res) => {
  try {
    console.log("🔥 /api/logs HIT");
    console.log("BODY:", req.body);

    const { user_id, product_id, stay_time, scroll_depth } = req.body;

    if (!user_id || !product_id) {
      console.log("❌ INVALID DATA");
      return res.status(400).json({ message: "invalid data" });
    }

    await db.query(
      `
      INSERT INTO USER_LOG
      (user_id, product_id, stay_time, scroll_depth, created_at)
      VALUES (?, ?, ?, ?, NOW())
      `,
      [user_id, product_id, stay_time ?? null, scroll_depth ?? null]
    );

    console.log("✅ INSERT SUCCESS");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DB ERROR:", err); // ⭐ 이 로그가 핵심
    res.status(500).json({ message: "db error", error: err.message });
  }
};
