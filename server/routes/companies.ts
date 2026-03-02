import { Router, Request, Response } from "express";
import { requireAuth } from "../auth.js";
import { sql } from "../db.js";
import { createCompanyWallet } from "../coinApi.js";
import { getIo } from "../socket.js";

const router = Router();

// 조직 내 상장 회사 목록
// GET /companies?orgId=
router.get("/companies", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const orgId = parseInt(req.query.orgId as string) || user.organizationId;

    // platform_admin 또는 orgId 없으면 전체 상장 목록
    const orgFilter = orgId
      ? sql`WHERE c.organization_id = ${orgId} AND c.status != 'pending'`
      : sql`WHERE c.status != 'pending'`;

    const companies = await sql`
      SELECT
        c.*,
        mp.current_price,
        mp.prev_price,
        mp.high_price,
        mp.low_price,
        mp.volume,
        CASE
          WHEN mp.prev_price > 0
          THEN ROUND(((mp.current_price - mp.prev_price) / mp.prev_price * 100)::numeric, 2)
          ELSE 0
        END as change_rate,
        u.username as ceo_username,
        CONCAT(u.last_name, u.first_name) as ceo_name,
        at.symbol as coin_symbol,
        at.name as coin_name,
        (SELECT COUNT(*) FROM investment.ownership WHERE company_id = c.id AND quantity > 0) as shareholder_count,
        (SELECT COALESCE(SUM(quantity * mp2.current_price), 0)
         FROM investment.ownership o2
         JOIN investment.market_price mp2 ON mp2.company_id = o2.company_id
         WHERE o2.company_id = c.id) as market_cap
      FROM investment.companies c
      LEFT JOIN investment.market_price mp ON c.id = mp.company_id
      LEFT JOIN public.users u ON c.ceo_user_id = u.id
      LEFT JOIN economy.asset_types at ON c.asset_type_id = at.id
      ${orgFilter}
      ORDER BY
        CASE c.status WHEN 'listed' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END,
        c.listed_at DESC NULLS LAST
    `;
    res.json(companies);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 승인 대기 목록 (관리자용)
// GET /companies/pending
router.get("/companies/pending", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!["관리자", "org_issuer", "platform_admin"].includes(user.role)) {
      return res.status(403).json({ error: "관리자만 접근 가능" });
    }
    const orgId = user.organizationId;
    const companies = await sql`
      SELECT c.*, u.username as ceo_username, u.full_name as ceo_name,
             at.symbol as coin_symbol
      FROM investment.companies c
      LEFT JOIN public.users u ON c.ceo_user_id = u.id
      LEFT JOIN economy.asset_types at ON c.asset_type_id = at.id
      WHERE c.organization_id = ${orgId} AND c.status = 'pending'
      ORDER BY c.created_at DESC
    `;
    res.json(companies);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 내 IPO 신청 현황
// GET /companies/my-applications
router.get("/companies/my-applications", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const rows = await sql`
      SELECT c.id, c.name, c.logo_emoji, c.status, c.ipo_price, c.total_shares,
             c.created_at, at.symbol as coin_symbol, s.name as org_name
      FROM investment.companies c
      LEFT JOIN economy.asset_types at ON c.asset_type_id = at.id
      LEFT JOIN public.schools s ON s.id = c.organization_id
      WHERE c.ceo_user_id::text = ${user.userId}
      ORDER BY c.created_at DESC
    `;
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 내 조직 코인 목록 (로그인 사용자 기준 user_organizations 조회)
// GET /companies/my-coins
router.get("/companies/my-coins", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // DB에서 실제 coin_role 확인 (토큰 role이 잘못됐을 수 있으므로)
    const roleCheck = await sql`
      SELECT role FROM economy.coin_roles
      WHERE user_id::text = ${user.userId}
      ORDER BY CASE role WHEN 'platform_admin' THEN 0 ELSE 1 END
      LIMIT 1
    `;
    const actualRole = roleCheck[0]?.role || user.role;
    const isPlatformAdmin = actualRole === "platform_admin" || user.role === "platform_admin";

    if (isPlatformAdmin) {
      const coins = await sql`
        SELECT at.id, at.name, at.symbol, at.type, s.name as org_name, s.id as org_id
        FROM economy.asset_types at
        LEFT JOIN public.schools s ON s.id = at.organization_id
        WHERE at.is_active = true
          AND at.type IN ('community', 'sub')
        ORDER BY s.name, at.id
      `;
      return res.json(coins);
    }

    // 일반 사용자: user_organizations 기준 내 조직들의 코인
    const coins = await sql`
      SELECT DISTINCT at.id, at.name, at.symbol, at.type, s.name as org_name, s.id as org_id
      FROM public.user_organizations uo
      JOIN public.schools s ON s.id = uo.organization_id
      JOIN economy.asset_types at ON at.organization_id = uo.organization_id
      WHERE uo.user_id::text = ${user.userId}
        AND uo.is_approved = true
        AND at.is_active = true
        AND at.type IN ('community', 'sub')
      ORDER BY s.name, at.id
    `;
    res.json(coins);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 회사 상세
// GET /companies/:id
router.get("/companies/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const companies = await sql`
      SELECT c.*, mp.current_price, mp.prev_price, mp.high_price, mp.low_price, mp.volume,
             CASE WHEN mp.prev_price > 0
               THEN ROUND(((mp.current_price - mp.prev_price) / mp.prev_price * 100)::numeric, 2)
               ELSE 0 END as change_rate,
             u.username as ceo_username, u.full_name as ceo_name,
             at.symbol as coin_symbol, at.name as coin_name,
             s.name as org_name
      FROM investment.companies c
      LEFT JOIN investment.market_price mp ON c.id = mp.company_id
      LEFT JOIN public.users u ON c.ceo_user_id = u.id
      LEFT JOIN economy.asset_types at ON c.asset_type_id = at.id
      LEFT JOIN public.schools s ON c.organization_id = s.id
      WHERE c.id = ${id}
    `;
    if (!companies[0]) return res.status(404).json({ error: "회사 없음" });
    res.json(companies[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 회사 상장 신청
// POST /companies
router.post("/companies", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, description, businessPlan, totalShares, ipoPrice, assetTypeId, logoEmoji } = req.body;

    if (!name || !ipoPrice || !assetTypeId) {
      return res.status(400).json({ error: "회사명, IPO 가격, 코인 종류는 필수입니다" });
    }
    if (ipoPrice < 1) return res.status(400).json({ error: "IPO 가격은 1 이상이어야 합니다" });
    const shares = Math.max(100, Math.min(10000, parseInt(totalShares) || 1000));

    const company = await sql`
      INSERT INTO investment.companies
        (name, ceo_user_id, organization_id, asset_type_id, description, business_plan,
         total_shares, available_shares, ipo_price, logo_emoji)
      VALUES
        (${name}, ${user.userId}::uuid, ${user.organizationId}, ${assetTypeId},
         ${description || ""}, ${businessPlan || ""},
         ${shares}, ${shares}, ${ipoPrice}, ${logoEmoji || "🏢"})
      RETURNING *
    `;
    res.json({ success: true, company: company[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// IPO 승인 (관리자)
// POST /companies/:id/approve
router.post("/companies/:id/approve", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!["관리자", "org_issuer", "platform_admin"].includes(user.role)) {
      return res.status(403).json({ error: "관리자만 가능합니다" });
    }

    const id = parseInt(req.params.id);
    const companies = await sql`SELECT * FROM investment.companies WHERE id = ${id}`;
    if (!companies[0]) return res.status(404).json({ error: "회사 없음" });
    const company = companies[0];
    if (company.status !== "pending") return res.status(400).json({ error: "이미 처리된 신청입니다" });

    // 1. 상태 변경
    await sql`
      UPDATE investment.companies
      SET status = 'listed', listed_at = NOW()
      WHERE id = ${id}
    `;

    // 2. 초기 주가 설정
    await sql`
      INSERT INTO investment.market_price (company_id, current_price, prev_price, high_price, low_price, volume)
      VALUES (${id}, ${company.ipo_price}, ${company.ipo_price}, ${company.ipo_price}, ${company.ipo_price}, 0)
      ON CONFLICT (company_id) DO NOTHING
    `;

    // 3. CEO에게 전체 주식 지급
    await sql`
      INSERT INTO investment.ownership (user_id, company_id, quantity)
      VALUES (${company.ceo_user_id}::uuid, ${id}, ${company.total_shares})
      ON CONFLICT (user_id, company_id) DO UPDATE SET quantity = investment.ownership.quantity + ${company.total_shares}
    `;

    // 4. 회사 지갑 생성
    await createCompanyWallet(id, company.asset_type_id);

    // 소켓 알림
    try {
      getIo().to(`org_${company.organization_id}`).emit("company_listed", {
        companyId: id,
        name: company.name,
        ipoPrice: company.ipo_price,
      });
    } catch {}

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// IPO 거절 (관리자)
// POST /companies/:id/reject
router.post("/companies/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!["관리자", "org_issuer", "platform_admin"].includes(user.role)) {
      return res.status(403).json({ error: "관리자만 가능합니다" });
    }
    const { reason } = req.body;
    await sql`
      UPDATE investment.companies
      SET status = 'rejected', suspend_reason = ${reason || "관리자 거절"}
      WHERE id = ${parseInt(req.params.id)}
    `;
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 상장폐지 (관리자)
// POST /companies/:id/delist
router.post("/companies/:id/delist", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!["관리자", "org_issuer", "platform_admin"].includes(user.role)) {
      return res.status(403).json({ error: "관리자만 가능합니다" });
    }
    const { reason } = req.body;
    const id = parseInt(req.params.id);
    // 미체결 주문 전체 취소
    await sql`
      UPDATE investment.orders SET status = 'CANCELLED'
      WHERE company_id = ${id} AND status IN ('OPEN', 'PARTIAL')
    `;
    await sql`
      UPDATE investment.companies
      SET status = 'delisted', suspend_reason = ${reason || "관리자 상장폐지"}
      WHERE id = ${id}
    `;
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
