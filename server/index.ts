import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { initSocket } from "./socket.js";
import authRoutes from "./routes/auth.js";
import companiesRoutes from "./routes/companies.js";
import ordersRoutes from "./routes/orders.js";
import tradesRoutes from "./routes/trades.js";
import newsRoutes from "./routes/news.js";
import dividendRoutes from "./routes/dividend.js";
import portfolioRoutes from "./routes/portfolio.js";
import settingsRoutes from "./routes/settings.js";
import financialRoutes from "./routes/financial-reports.js";
import watchlistRoutes from "./routes/watchlist.js";
import { sql } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4400;

// Socket.io 초기화
initSocket(server);

// 미들웨어
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.use((req, _res, next) => {
  if (process.env.NODE_ENV === "production") {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// migrations
await sql`ALTER TABLE investment.companies ADD COLUMN IF NOT EXISTS logo_url TEXT`.catch(() => {});
await sql`
  CREATE TABLE IF NOT EXISTS investment.settings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, key)
  )
`.catch(() => {});
await sql`
  CREATE TABLE IF NOT EXISTS investment.financial_reports (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES investment.companies(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    revenue NUMERIC DEFAULT 0,
    operating_profit NUMERIC DEFAULT 0,
    net_income NUMERIC DEFAULT 0,
    eps NUMERIC DEFAULT 0,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, period)
  )
`.catch(() => {});
await sql`
  CREATE TABLE IF NOT EXISTS investment.watchlists (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    company_id INTEGER NOT NULL REFERENCES investment.companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, company_id)
  )
`.catch(() => {});
await sql`ALTER TABLE investment.companies ADD COLUMN IF NOT EXISTS ipo_start_date TIMESTAMPTZ`.catch(() => {});
await sql`ALTER TABLE investment.companies ADD COLUMN IF NOT EXISTS ipo_end_date TIMESTAMPTZ`.catch(() => {});
await sql`ALTER TABLE investment.companies ADD COLUMN IF NOT EXISTS subscription_shares INTEGER DEFAULT 0`.catch(() => {});
await sql`
  CREATE TABLE IF NOT EXISTS investment.order_escrow (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES investment.orders(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    asset_type_id INT NOT NULL,
    locked_amount NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id)
  )
`.catch(() => {});

// 헬스체크
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "dorun-stock", timestamp: new Date().toISOString() });
});

// API 라우트
app.use("/api", authRoutes);
app.use("/api", companiesRoutes);
app.use("/api", ordersRoutes);
app.use("/api", tradesRoutes);
app.use("/api", newsRoutes);
app.use("/api", dividendRoutes);
app.use("/api", portfolioRoutes);
app.use("/api", settingsRoutes);
app.use("/api", financialRoutes);
app.use("/api", watchlistRoutes);

// 프로덕션: 클라이언트 정적 파일
// __dirname = dist/ (tsc 빌드 후)
// 빌드: (cd client && vite build) → client/dist/
// 서버 실행: node dist/index.js → __dirname = dist/ → ../client/dist = client/dist/
const clientDist = path.resolve(__dirname, "../client/dist");
const indexHtml = path.join(clientDist, "index.html");
console.log(`[Stock] client dist path: ${clientDist}`);
console.log(`[Stock] index.html exists: ${fs.existsSync(indexHtml)}`);

if (fs.existsSync(indexHtml)) {
  app.use(express.static(clientDist));
  // Express 4 호환 catch-all (SPA 라우팅)
  app.get("*", (_req, res) => {
    res.sendFile(indexHtml);
  });
} else {
  console.warn("⚠️ client/dist/index.html 없음 — 프론트 빌드 필요");
  app.get("*", (_req, res) => {
    res.status(503).send("<h1>두런허브스탁</h1><p>서버 준비 중입니다. 잠시 후 다시 시도하세요.</p>");
  });
}

server.listen(PORT, () => {
  console.log(`📈 두런허브스탁 서버 실행 중: http://localhost:${PORT}`);
});

export default app;
