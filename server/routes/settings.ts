import { Router, Request, Response } from "express";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";

const router = Router();

// GET /settings — 조직 설정 조회
router.get("/settings", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const orgId = user.organizationId;
    if (!orgId) return res.status(400).json({ error: "조직 정보 없음" });

    const result = await pool.query(
      "SELECT key, value FROM investment.settings WHERE organization_id = $1",
      [orgId]
    );
    const defaults: Record<string, string> = {
      fee_rate: "0.3",
      circuit_up: "30",
      circuit_down: "30",
      daily_price_limit_up: "30",
      daily_price_limit_down: "30",
      min_order_qty: "1",
      max_order_qty: "1000",
      trading_enabled: "true",
    };
    const settings = { ...defaults };
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /settings — 설정 저장 (관리자만)
router.put("/settings", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const orgId = user.organizationId;
    const isAdmin = ["관리자", "platform_admin"].includes(user.role);
    if (!orgId || !isAdmin) return res.status(403).json({ error: "권한 없음" });

    const updates = req.body as Record<string, string>;
    const allowedKeys = [
      "fee_rate", "circuit_up", "circuit_down",
      "daily_price_limit_up", "daily_price_limit_down",
      "min_order_qty", "max_order_qty", "trading_enabled"
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) continue;
      await pool.query(
        `INSERT INTO investment.settings (organization_id, key, value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (organization_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
        [orgId, key, String(value)]
      );
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
