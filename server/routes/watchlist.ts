import { Router, Request, Response } from "express";
import { requireAuth } from "../auth.js";
import { sql } from "../db.js";

const router = Router();

// 내 관심 종목 목록
// GET /watchlist
router.get("/watchlist", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await sql`
      SELECT company_id FROM investment.watchlists
      WHERE user_id = ${user.userId}::uuid
    `;
    res.json(result.map((r: any) => r.company_id));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 관심 종목 추가/제거 토글
// POST /watchlist/:companyId
router.post("/watchlist/:companyId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = parseInt(req.params.companyId);

    const existing = await sql`
      SELECT id FROM investment.watchlists
      WHERE user_id = ${user.userId}::uuid AND company_id = ${companyId}
    `;

    if (existing.length > 0) {
      await sql`
        DELETE FROM investment.watchlists
        WHERE user_id = ${user.userId}::uuid AND company_id = ${companyId}
      `;
      res.json({ watching: false });
    } else {
      await sql`
        INSERT INTO investment.watchlists (user_id, company_id)
        VALUES (${user.userId}::uuid, ${companyId})
        ON CONFLICT DO NOTHING
      `;
      res.json({ watching: true });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
