import { Router, Request, Response } from "express";
import { requireAuth, verifySsoToken, generateStockToken } from "../auth.js";
import { sql } from "../db.js";
import { comparePasswords } from "../auth-utils.js";

const router = Router();

// 공통 유저 조회 쿼리 (username 기준)
async function getUserByUsername(username: string) {
  return sql`
    SELECT u.id, u.username, u.password, u.school_id,
           CONCAT(u.last_name, u.first_name) as full_name,
           s.name as org_name,
           uo.role as org_role, uo.organization_id,
           (SELECT role FROM economy.coin_roles
            WHERE user_id::text = u.id::text
            ORDER BY CASE role WHEN 'platform_admin' THEN 0 ELSE 1 END
            LIMIT 1) as coin_role
    FROM public.users u
    LEFT JOIN public.schools s ON u.school_id = s.id
    LEFT JOIN public.user_organizations uo
      ON uo.user_id::text = u.id::text
      AND uo.is_approved = true
      AND uo.organization_id = u.school_id
    WHERE u.username = ${username}
    LIMIT 1
  `;
}

// 공통 유저 조회 쿼리 (id 기준)
async function getUserById(userId: string) {
  return sql`
    SELECT u.id, u.username, u.school_id,
           CONCAT(u.last_name, u.first_name) as full_name,
           s.name as org_name,
           uo.role as org_role, uo.organization_id,
           (SELECT role FROM economy.coin_roles
            WHERE user_id::text = u.id::text
            ORDER BY CASE role WHEN 'platform_admin' THEN 0 ELSE 1 END
            LIMIT 1) as coin_role
    FROM public.users u
    LEFT JOIN public.schools s ON u.school_id = s.id
    LEFT JOIN public.user_organizations uo
      ON uo.user_id::text = u.id::text
      AND uo.is_approved = true
      AND uo.organization_id = u.school_id
    WHERE u.id::text = ${userId}
    LIMIT 1
  `;
}

function resolveRole(u: any): string {
  if (u.coin_role === "platform_admin") return "platform_admin";
  if (u.org_role === "admin") return "관리자";
  return u.org_role || "member";
}

function buildUserResponse(u: any) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    orgName: u.org_name,
    orgId: u.organization_id || u.school_id,
    role: resolveRole(u),
  };
}

// 직접 로그인 (두런 허브/코인 계정)
// POST /auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "아이디와 비밀번호 필요" });

    const users = await getUserByUsername(username);
    if (users.length === 0) return res.status(401).json({ error: "아이디 또는 비밀번호가 틀렸습니다" });
    const u = users[0];

    // 비밀번호 확인 (scrypt hex.salt 또는 bcrypt)
    const valid = await comparePasswords(password, u.password || "");
    if (!valid) return res.status(401).json({ error: "아이디 또는 비밀번호가 틀렸습니다" });

    const userInfo = buildUserResponse(u);
    const token = generateStockToken({
      userId: u.id,
      role: userInfo.role,
      organizationId: userInfo.orgId,
      username: u.username,
    });

    res.json({ token, user: userInfo });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// SSO 로그인 (두런 코인/허브 JWT 토큰)
// GET /auth/sso?sso_token=...
router.get("/auth/sso", async (req: Request, res: Response) => {
  try {
    const { sso_token } = req.query as any;
    if (!sso_token) return res.status(400).json({ error: "sso_token 필요" });

    const decoded = verifySsoToken(sso_token);
    if (!decoded) return res.status(401).json({ error: "유효하지 않은 토큰" });

    const users = await getUserById(decoded.userId);
    if (users.length === 0) return res.status(404).json({ error: "계정 없음" });

    const u = users[0];
    const userInfo = buildUserResponse(u);
    const token = generateStockToken({
      userId: u.id,
      role: userInfo.role,
      organizationId: userInfo.orgId,
      username: u.username,
    });

    res.json({ token, user: userInfo });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 현재 로그인 유저 정보
// GET /auth/me
router.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).user;
    const users = await getUserById(userId);
    if (users.length === 0) return res.status(404).json({ error: "유저 없음" });
    res.json(buildUserResponse(users[0]));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
