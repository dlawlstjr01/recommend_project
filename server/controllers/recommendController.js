const db = require("../config/DB");

exports.getUserRecommendations = async (req, res) => {
  try {
    const userNo = Number(req.query.user_no);

    if (!userNo) {
      return res.json([]);
    }

    //  개인화 추천
    const [rows] = await db.query(`
      SELECT
        ur.item_no           AS product_id,
        ur.score,
        ur.rec_rank,
        p.product_name       AS name,
        p.brand              AS brand,
        p.price              AS price,
        p.thumbnail_url      AS thumbnail
      FROM user_recommendations ur
      JOIN PRODUCT p
        ON ur.item_no = p.product_id
      WHERE ur.user_no = ?
      ORDER BY ur.rec_rank
      LIMIT 10
    `, [userNo]);

    // 추천 없을 경우 (콜드스타트)
    if (rows.length === 0) {
      const [fallback] = await db.query(`
        SELECT
          product_id,
          product_name AS name,
          brand,
          price,
          thumbnail_url AS thumbnail
        FROM PRODUCT
        ORDER BY created_at DESC
        LIMIT 10
      `);
      return res.json(fallback);
    }

    res.json(rows);

  } catch (err) {
    console.error("❌ recommend error:", err);
    res.status(500).json({ message: "recommend failed" });
  }
};
