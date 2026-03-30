import { Router, Request, Response } from "express";
import { requireAuth } from "../auth.js";
import { sql, pool } from "../db.js";
import { transferCoin } from "../coinApi.js";
import { getIo } from "../socket.js";

const router = Router();

const FEE_RATE = 0.001; // 0.1% 수수료
const CIRCUIT_BREAKER_RATE = 0.30; // 30% 등락 시 서킷브레이커
const SUSPEND_MINUTES = 10;

// ── 매칭 엔진 ────────────────────────────────────────────────────────
async function matchOrder(params: {
  userId: string;
  companyId: number;
  orderType: "BUY" | "SELL";
  price: number;
  quantity: number;
  orgId: number;
  assetTypeId: number;
  feeRate?: number;
}) {
  const { userId, companyId, orderType, price, quantity, orgId, assetTypeId, feeRate = FEE_RATE } = params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. 회사 상태 확인
    const companyRes = await client.query(
      `SELECT * FROM investment.companies WHERE id = $1`,
      [companyId]
    );
    const company = companyRes.rows[0];
    if (!company) throw new Error("존재하지 않는 회사입니다");
    if (company.status === "suspended") {
      const now = new Date();
      if (new Date(company.suspended_until) > now) {
        throw new Error(`서킷브레이커 발동 중 — ${new Date(company.suspended_until).toLocaleTimeString("ko-KR")}에 거래 재개`);
      }
      // 정지 해제
      await client.query(
        `UPDATE investment.companies SET status='listed', suspended_until=NULL WHERE id=$1`,
        [companyId]
      );
    }
    if (company.status !== "listed") throw new Error("거래 불가 상태입니다");

    // 2. 매도 주문 시 보유 주식 확인
    if (orderType === "SELL") {
      const ownerRes = await client.query(
        `SELECT quantity FROM investment.ownership WHERE user_id::text=$1 AND company_id=$2`,
        [userId, companyId]
      );
      const owned = ownerRes.rows[0]?.quantity || 0;
      // 이미 매도 주문 걸린 수량 고려
      const pendingRes = await client.query(
        `SELECT COALESCE(SUM(remaining_qty), 0) as pending
         FROM investment.orders
         WHERE user_id::text=$1 AND company_id=$2 AND order_type='SELL' AND status IN ('OPEN','PARTIAL')`,
        [userId, companyId]
      );
      const pendingQty = parseInt(pendingRes.rows[0]?.pending || "0");
      if (owned - pendingQty < quantity) {
        throw new Error(`보유 주식 부족 (보유: ${owned}주, 매도 대기: ${pendingQty}주)`);
      }
    }

    // 3. 매수 주문 시 잔액 확인 (기존 미체결 매수 주문 홀딩분 차감 후 가용 잔액 계산)
    if (orderType === "BUY") {
      const balRes = await client.query(
        `SELECT COALESCE(balance, 0) as balance FROM economy.wallets
         WHERE user_id=$1 AND asset_type_id=$2`,
        [userId, assetTypeId]
      );
      const balance = parseFloat(balRes.rows[0]?.balance || "0");

      // 이미 미체결 매수 주문으로 묶인 금액 (= price * remaining_qty 합산)
      const holdingRes = await client.query(
        `SELECT COALESCE(SUM(price * remaining_qty), 0) as holding
         FROM investment.orders o
         JOIN investment.companies c ON o.company_id = c.id
         WHERE o.user_id::text = $1
           AND o.order_type = 'BUY'
           AND o.status IN ('OPEN', 'PARTIAL')
           AND c.asset_type_id = $2`,
        [userId, assetTypeId]
      );
      const holdingAmount = parseFloat(holdingRes.rows[0]?.holding || "0");
      const available = balance - holdingAmount;
      const required = price * quantity;

      if (available < required) {
        throw new Error(
          `가용 잔액 부족 (보유: ${balance.toLocaleString("ko-KR")}, 주문 홀딩: ${holdingAmount.toLocaleString("ko-KR")}, 가용: ${available.toLocaleString("ko-KR")}, 필요: ${required.toLocaleString("ko-KR")})`
        );
      }
    }

    // 4. 주문 등록
    const orderRes = await client.query(
      `INSERT INTO investment.orders (user_id, company_id, order_type, price, quantity, remaining_qty)
       VALUES ($1::uuid, $2, $3, $4, $5, $5) RETURNING *`,
      [userId, companyId, orderType, price, quantity]
    );
    const myOrderId = orderRes.rows[0].id;

    // 5. 상대 주문 탐색 (가격/시간 우선)
    const oppositeType = orderType === "BUY" ? "SELL" : "BUY";
    const matchRes = await client.query(
      `SELECT * FROM investment.orders
       WHERE company_id=$1 AND order_type=$2 AND status IN ('OPEN','PARTIAL')
         AND price ${orderType === "BUY" ? "<=" : ">="} $3
         AND user_id::text != $4
       ORDER BY price ${orderType === "BUY" ? "ASC" : "DESC"}, created_at ASC`,
      [companyId, oppositeType, price, userId]
    );

    let remaining = quantity;
    let lastPrice: number | null = null;
    const coinTransfers: Array<() => Promise<void>> = [];

    for (const match of matchRes.rows) {
      if (remaining <= 0) break;

      const matchQty = Math.min(remaining, match.remaining_qty);
      const execPrice = parseFloat(match.price);
      const totalAmount = execPrice * matchQty;
      const fee = Math.floor(totalAmount * feeRate * 100) / 100;

      const buyerId = orderType === "BUY" ? userId : match.user_id;
      const sellerId = orderType === "SELL" ? userId : match.user_id;

      // 체결 기록
      await client.query(
        `INSERT INTO investment.trades (company_id, buyer_id, seller_id, price, quantity, fee)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [companyId, buyerId, sellerId, execPrice, matchQty, fee]
      );

      // 상대 주문 잔량 감소
      const newRemaining = match.remaining_qty - matchQty;
      await client.query(
        `UPDATE investment.orders SET remaining_qty=$1, status=$2 WHERE id=$3`,
        [newRemaining, newRemaining === 0 ? "FILLED" : "PARTIAL", match.id]
      );

      // 주식 소유권 이전
      // 판매자 차감
      await client.query(
        `UPDATE investment.ownership SET quantity = quantity - $1
         WHERE user_id::text=$2 AND company_id=$3`,
        [matchQty, sellerId, companyId]
      );
      // 구매자 증가
      await client.query(
        `INSERT INTO investment.ownership (user_id, company_id, quantity)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT (user_id, company_id) DO UPDATE SET quantity = investment.ownership.quantity + $3`,
        [buyerId, companyId, matchQty]
      );

      remaining -= matchQty;
      lastPrice = execPrice;

      // 코인 이전은 커밋 후 실행 (DB 트랜잭션과 분리)
      const reqId = `trade-${companyId}-${buyerId}-${sellerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const netAmount = totalAmount - fee;
      const _buyerId = buyerId;
      const _sellerId = sellerId;
      const _reqId = reqId;
      const _netAmount = netAmount;
      const _fee = fee;
      const _assetTypeId = assetTypeId;
      const _companyId = companyId;

      coinTransfers.push(async () => {
        // 구매자 → 판매자
        await transferCoin({
          fromUserId: _buyerId,
          toUserId: _sellerId,
          assetTypeId: _assetTypeId,
          amount: _netAmount,
          description: `주식 체결: ${_companyId}번 회사 ${matchQty}주 @ ${execPrice}`,
          requestId: _reqId,
        });
        // 수수료 → 회사 지갑
        if (_fee > 0) {
          await transferCoin({
            fromUserId: _buyerId,
            toUserId: `company:${_companyId}`,
            assetTypeId: _assetTypeId,
            amount: _fee,
            description: `거래 수수료 (${_companyId}번 회사)`,
            requestId: `${_reqId}-fee`,
          }).catch(() => {}); // 수수료 실패는 무시
        }
      });
    }

    // 내 주문 잔량 업데이트
    const filled = quantity - remaining;
    const myStatus = remaining === 0 ? "FILLED" : filled > 0 ? "PARTIAL" : "OPEN";
    await client.query(
      `UPDATE investment.orders SET remaining_qty=$1, status=$2 WHERE id=$3`,
      [remaining, myStatus, myOrderId]
    );

    // 현재가 업데이트
    if (lastPrice !== null) {
      const prevRes = await client.query(
        `SELECT current_price FROM investment.market_price WHERE company_id=$1`,
        [companyId]
      );
      const prevPrice = parseFloat(prevRes.rows[0]?.current_price || "0");

      await client.query(
        `INSERT INTO investment.market_price (company_id, current_price, prev_price, high_price, low_price, volume)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (company_id) DO UPDATE SET
           prev_price = investment.market_price.current_price,
           current_price = $2,
           high_price = GREATEST(COALESCE(investment.market_price.high_price, $2), $2),
           low_price = LEAST(COALESCE(investment.market_price.low_price, $2), $2),
           volume = investment.market_price.volume + $6,
           updated_at = NOW()`,
        [companyId, lastPrice, prevPrice || lastPrice, lastPrice, lastPrice, quantity - remaining]
      );

      // 서킷브레이커 체크
      if (prevPrice > 0) {
        const changeRate = Math.abs((lastPrice - prevPrice) / prevPrice);
        if (changeRate >= CIRCUIT_BREAKER_RATE) {
          const suspendUntil = new Date(Date.now() + SUSPEND_MINUTES * 60 * 1000);
          await client.query(
            `UPDATE investment.companies SET status='suspended', suspended_until=$1,
             suspend_reason=$2 WHERE id=$3`,
            [
              suspendUntil,
              `가격 ${(changeRate * 100).toFixed(1)}% 급변동으로 ${SUSPEND_MINUTES}분 거래 정지`,
              companyId,
            ]
          );
          await client.query(
            `INSERT INTO investment.circuit_breaker_logs
               (company_id, trigger_price, base_price, change_rate, suspended_from, suspended_until)
             VALUES ($1, $2, $3, $4, NOW(), $5)`,
            [companyId, lastPrice, prevPrice, changeRate * 100, suspendUntil]
          );
          try {
            getIo().to(`company_${companyId}`).emit("circuit_breaker", {
              companyId,
              message: `⚠️ 서킷브레이커 발동! ${SUSPEND_MINUTES}분간 거래 정지`,
              resumeAt: suspendUntil,
            });
          } catch {}
        }
      }
    }

    await client.query("COMMIT");

    // 커밋 후 코인 이전 실행
    for (const transfer of coinTransfers) {
      await transfer().catch((e) => console.error("[Stock] 코인 이전 실패:", e.message));
    }

    // WebSocket 실시간 알림
    try {
      const io = getIo();
      if (lastPrice !== null) {
        io.to(`company_${companyId}`).emit("trade_executed", {
          companyId,
          price: lastPrice,
          quantity: quantity - remaining,
        });
      }
      io.to(`company_${companyId}`).emit("orderbook_updated", { companyId });
    } catch {}

    return { success: true, filled: quantity - remaining, remaining, orderId: myOrderId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ── 주문 접수 ──────────────────────────────────────────────────────
// POST /orders
// priceType: "limit"(지정가) | "market"(시장가)
router.post("/orders", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { companyId, orderType, price, quantity, priceType = "limit" } = req.body;

    if (!companyId || !orderType || !quantity) {
      return res.status(400).json({ error: "companyId, orderType, quantity 필수" });
    }
    if (!["BUY", "SELL"].includes(orderType)) {
      return res.status(400).json({ error: "orderType은 BUY 또는 SELL" });
    }
    if (priceType !== "limit" && priceType !== "market") {
      return res.status(400).json({ error: "priceType은 limit 또는 market" });
    }

    // 시장가 주문: 상대방 최우선 호가를 가격으로 사용
    let resolvedPrice = price;
    if (priceType === "market") {
      if (orderType === "BUY") {
        // 최저 매도 호가
        const bestSell = await sql`
          SELECT MIN(price) as best FROM investment.orders
          WHERE company_id = ${parseInt(companyId)}
            AND order_type = 'SELL' AND status IN ('OPEN','PARTIAL')
        `;
        if (!bestSell[0]?.best) {
          return res.status(400).json({ error: "시장가 매수 불가: 매도 호가가 없습니다" });
        }
        resolvedPrice = parseFloat(bestSell[0].best);
      } else {
        // 최고 매수 호가
        const bestBuy = await sql`
          SELECT MAX(price) as best FROM investment.orders
          WHERE company_id = ${parseInt(companyId)}
            AND order_type = 'BUY' AND status IN ('OPEN','PARTIAL')
        `;
        if (!bestBuy[0]?.best) {
          return res.status(400).json({ error: "시장가 매도 불가: 매수 호가가 없습니다" });
        }
        resolvedPrice = parseFloat(bestBuy[0].best);
      }
    }

    if (!resolvedPrice || resolvedPrice <= 0 || quantity <= 0) {
      return res.status(400).json({ error: "가격과 수량은 0보다 커야 합니다" });
    }

    // 회사 코인 정보 조회
    const companies = await sql`
      SELECT asset_type_id, organization_id FROM investment.companies WHERE id = ${companyId}
    `;
    if (!companies[0]) return res.status(404).json({ error: "회사 없음" });

    // 거래 설정 조회
    const settingsRes = await pool.query(
      "SELECT key, value FROM investment.settings WHERE organization_id = $1",
      [companies[0].organization_id]
    );
    const cfg: Record<string, string> = {
      fee_rate: "0.3",
      trading_enabled: "true",
      min_order_qty: "1",
      max_order_qty: "1000",
    };
    for (const row of settingsRes.rows) cfg[row.key] = row.value;

    if (cfg.trading_enabled === "false") {
      return res.status(403).json({ error: "현재 거래가 중단된 상태입니다" });
    }
    const minQty = parseInt(cfg.min_order_qty);
    const maxQty = parseInt(cfg.max_order_qty);
    if (quantity < minQty || quantity > maxQty) {
      return res.status(400).json({ error: `주문 수량은 ${minQty}~${maxQty}주 사이여야 합니다` });
    }
    const feeRate = parseFloat(cfg.fee_rate) / 100;

    const result = await matchOrder({
      userId: user.userId,
      companyId: parseInt(companyId),
      orderType,
      price: resolvedPrice,
      quantity: parseInt(quantity),
      orgId: companies[0].organization_id,
      assetTypeId: companies[0].asset_type_id,
      feeRate,
    });

    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 호가창 조회
// GET /orders/:companyId/orderbook
router.get("/orders/:companyId/orderbook", requireAuth, async (req: Request, res: Response) => {
  try {
    const companyId = parseInt(req.params.companyId);
    const [buyOrders, sellOrders] = await Promise.all([
      sql`
        SELECT price::numeric, SUM(remaining_qty)::int as total_qty
        FROM investment.orders
        WHERE company_id=${companyId} AND order_type='BUY' AND status IN ('OPEN','PARTIAL')
        GROUP BY price ORDER BY price DESC LIMIT 10
      `,
      sql`
        SELECT price::numeric, SUM(remaining_qty)::int as total_qty
        FROM investment.orders
        WHERE company_id=${companyId} AND order_type='SELL' AND status IN ('OPEN','PARTIAL')
        GROUP BY price ORDER BY price ASC LIMIT 10
      `,
    ]);
    res.json({ buy: buyOrders, sell: sellOrders });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 내 미체결 주문 목록
// GET /orders/my
router.get("/orders/my", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : null;
    const orders = companyId
      ? await sql`
          SELECT o.*, c.name as company_name, at.symbol
          FROM investment.orders o
          JOIN investment.companies c ON o.company_id = c.id
          JOIN economy.asset_types at ON c.asset_type_id = at.id
          WHERE o.user_id = ${user.userId}::uuid AND o.company_id = ${companyId}
            AND o.status IN ('OPEN','PARTIAL')
          ORDER BY o.created_at DESC
        `
      : await sql`
          SELECT o.*, c.name as company_name, at.symbol
          FROM investment.orders o
          JOIN investment.companies c ON o.company_id = c.id
          JOIN economy.asset_types at ON c.asset_type_id = at.id
          WHERE o.user_id = ${user.userId}::uuid
            AND o.status IN ('OPEN','PARTIAL')
          ORDER BY o.created_at DESC LIMIT 50
        `;
    res.json(orders);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 주문 취소
// DELETE /orders/:orderId
router.delete("/orders/:orderId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await sql`
      UPDATE investment.orders
      SET status = 'CANCELLED'
      WHERE id = ${parseInt(req.params.orderId)}
        AND user_id = ${user.userId}::uuid
        AND status IN ('OPEN', 'PARTIAL')
      RETURNING *
    `;
    if (result.length === 0) return res.status(404).json({ error: "취소할 수 없는 주문" });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
