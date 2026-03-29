import { Router, Request, Response } from "express";
import { requireAuth } from "../auth.js";
import { sql } from "../db.js";

const router = Router();

// 기업 실적 보고서 조회 (최근 4분기)
// GET /financial-reports/:companyId
router.get("/financial-reports/:companyId", requireAuth, async (req: Request, res: Response) => {
  try {
    const companyId = parseInt(req.params.companyId);
    const reports = await sql`
      SELECT fr.*, c.name as company_name, c.ipo_price, c.total_shares,
             mp.current_price
      FROM investment.financial_reports fr
      JOIN investment.companies c ON fr.company_id = c.id
      LEFT JOIN investment.market_price mp ON mp.company_id = c.id
      WHERE fr.company_id = ${companyId}
      ORDER BY fr.period DESC LIMIT 8
    `;
    res.json(reports);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 실적 보고서 등록/수정 (org_issuer, 관리자만)
// POST /financial-reports
router.post("/financial-reports", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const allowedRoles = ["관리자", "org_issuer", "platform_admin"];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: "권한 없음" });
    }

    const { companyId, period, revenue, operatingProfit, netIncome, eps, notes } = req.body;
    if (!companyId || !period) {
      return res.status(400).json({ error: "companyId, period 필수" });
    }

    // 본인 조직 회사만 수정 가능 (platform_admin 제외)
    if (user.role !== "platform_admin") {
      const company = await sql`
        SELECT organization_id FROM investment.companies WHERE id = ${companyId}
      `;
      if (!company[0] || company[0].organization_id !== user.orgId) {
        return res.status(403).json({ error: "본인 조직 회사의 실적만 입력 가능합니다" });
      }
    }

    const result = await sql`
      INSERT INTO investment.financial_reports
        (company_id, period, revenue, operating_profit, net_income, eps, notes, created_by)
      VALUES
        (${companyId}, ${period}, ${revenue || 0}, ${operatingProfit || 0},
         ${netIncome || 0}, ${eps || 0}, ${notes || null}, ${user.userId}::uuid)
      ON CONFLICT (company_id, period) DO UPDATE SET
        revenue = EXCLUDED.revenue,
        operating_profit = EXCLUDED.operating_profit,
        net_income = EXCLUDED.net_income,
        eps = EXCLUDED.eps,
        notes = EXCLUDED.notes,
        created_by = EXCLUDED.created_by,
        created_at = NOW()
      RETURNING *
    `;
    res.json(result[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 실적 보고서 삭제
// DELETE /financial-reports/:id
router.delete("/financial-reports/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const allowedRoles = ["관리자", "org_issuer", "platform_admin"];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: "권한 없음" });
    }
    await sql`DELETE FROM investment.financial_reports WHERE id = ${parseInt(req.params.id)}`;
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
