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
import { sql } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4400;

// Socket.io 초기화
initSocket(server);

// 미들웨어
app.use(cors({ origin: "*", credentials: true }));
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

// 프로덕션: 클라이언트 정적 파일
// __dirname = dist/ (tsc 빌드 후), client/dist = ../client/dist
const clientDist = path.join(__dirname, "../client/dist");
if (fs.existsSync(clientDist)) {
  app.use("/uploads", express.static(path.join(clientDist, "uploads")));
  app.use(express.static(clientDist));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  console.warn("⚠️ client/dist 없음 — 프론트 빌드 필요");
  app.get("/{*path}", (_req, res) => {
    res.send("<h1>두런허브스탁 서버 실행 중</h1><p>프론트 빌드 대기 중...</p>");
  });
}

server.listen(PORT, () => {
  console.log(`📈 두런허브스탁 서버 실행 중: http://localhost:${PORT}`);
});

export default app;
