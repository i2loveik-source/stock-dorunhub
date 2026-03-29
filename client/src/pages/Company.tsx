import { useEffect, useState, useCallback, useRef } from "react";
import { io as socketIo } from "socket.io-client";
import { api, formatNum, changeBg, changeArrow, getUser } from "../api";

interface Props {
  companyId: number;
  onBack: () => void;
}

// ── 캔들스틱 차트 ─────────────────────────────────────────────────────────
interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function CandlestickChart({ candles, interval }: { candles: Candle[]; interval: string }) {
  const [tooltip, setTooltip] = useState<{ idx: number; candle: Candle } | null>(null);

  if (!candles.length) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-300 text-sm">
        체결 데이터가 없습니다
      </div>
    );
  }

  const W = 340;
  const H = 180;
  const VOLUME_H = 36;
  const PAD = { top: 8, right: 52, bottom: 16, left: 2 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const spacing = chartW / candles.length;
  const candleW = Math.max(3, Math.min(12, spacing - 2));

  const prices = candles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const priceRange = maxP - minP || 1;

  const maxVol = Math.max(...candles.map(c => c.volume), 1);

  const toY = (p: number) => PAD.top + ((maxP - p) / priceRange) * chartH;
  const toVolH = (v: number) => (v / maxVol) * VOLUME_H;

  const gridPrices = [maxP, minP + priceRange * 0.5, minP];
  const labelIdxSet = new Set([0, Math.floor(candles.length / 2), candles.length - 1]);

  const formatTime = (t: string) => {
    const d = new Date(t);
    if (interval === "1d") return `${d.getMonth() + 1}/${d.getDate()}`;
    if (interval === "1h") return `${d.getHours()}:00`;
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const totalH = H + VOLUME_H + 8;

  return (
    <div className="relative select-none">
      <svg viewBox={`0 0 ${W} ${totalH}`} width="100%" className="overflow-visible">
        {/* 격자선 + 가격 레이블 */}
        {gridPrices.map((p, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={toY(p)} x2={W - PAD.right} y2={toY(p)}
              stroke="#f3f4f6" strokeWidth={1} />
            <text x={W - PAD.right + 3} y={toY(p) + 3.5} fontSize={8} fill="#9ca3af">
              {formatNum(p)}
            </text>
          </g>
        ))}

        {/* 캔들 */}
        {candles.map((c, i) => {
          const cx = PAD.left + i * spacing + spacing / 2;
          const isUp = c.close >= c.open;
          const color = isUp ? "#ef4444" : "#3b82f6";
          const bodyTop = toY(Math.max(c.open, c.close));
          const bodyBot = toY(Math.min(c.open, c.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          const wickTop = toY(c.high);
          const wickBot = toY(c.low);
          const vH = toVolH(c.volume);
          const volY = H + 8 + VOLUME_H - vH;

          return (
            <g key={i}
              onMouseEnter={() => setTooltip({ idx: i, candle: c })}
              onMouseLeave={() => setTooltip(null)}
              className="cursor-crosshair"
            >
              {/* 툴팁 강조 */}
              {tooltip?.idx === i && (
                <rect x={cx - spacing / 2} y={PAD.top} width={spacing} height={chartH}
                  fill="#6366f1" fillOpacity={0.05} />
              )}
              {/* 심지 */}
              <line x1={cx} y1={wickTop} x2={cx} y2={wickBot} stroke={color} strokeWidth={1} />
              {/* 몸통 */}
              <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH}
                fill={color} rx={1} />
              {/* 거래량 */}
              <rect x={cx - candleW / 2} y={volY} width={candleW} height={vH}
                fill={color} fillOpacity={0.45} rx={1} />
              {/* 시간 레이블 */}
              {labelIdxSet.has(i) && (
                <text x={cx} y={totalH - 1} fontSize={7} fill="#9ca3af" textAnchor="middle">
                  {formatTime(c.time)}
                </text>
              )}
            </g>
          );
        })}

        {/* 거래량 레이블 */}
        <text x={PAD.left} y={H + 10} fontSize={7} fill="#d1d5db">거래량</text>
      </svg>

      {/* 툴팁 박스 */}
      {tooltip && (
        <div className="absolute top-1 left-1 bg-gray-800/90 backdrop-blur-sm text-white rounded-xl px-3 py-2 text-[10px] leading-relaxed shadow-xl pointer-events-none z-10">
          <p className="font-bold text-gray-300 mb-1">
            {new Date(tooltip.candle.time).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
          {([["시가", tooltip.candle.open], ["고가", tooltip.candle.high], ["저가", tooltip.candle.low], ["종가", tooltip.candle.close]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <span className="text-gray-400">{k}</span>
              <span className={`font-bold ${k === "고가" ? "text-red-400" : k === "저가" ? "text-blue-400" : "text-white"}`}>{formatNum(v)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-gray-600 mt-1 pt-1">
            <span className="text-gray-400">거래량</span>
            <span className="font-bold">{formatNum(tooltip.candle.volume)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 호가창 잔량 바 ────────────────────────────────────────────────────────
function OrderbookRow({ price, qty, maxQty, side, onClick }: {
  price: number; qty: number; maxQty: number; side: "buy" | "sell"; onClick: () => void;
}) {
  const pct = maxQty > 0 ? (qty / maxQty) * 100 : 0;
  const bgColor = side === "buy" ? "#fee2e2" : "#dbeafe";
  const textColor = side === "buy" ? "text-red-600" : "text-blue-600";
  const subColor = side === "buy" ? "text-red-400" : "text-blue-400";

  return (
    <div className="relative overflow-hidden rounded-lg cursor-pointer hover:opacity-75" onClick={onClick}>
      <div className="absolute inset-y-0 right-0" style={{ width: `${pct}%`, background: bgColor }} />
      <div className="relative flex justify-between items-center px-2 py-1.5">
        <span className={`text-xs font-bold ${textColor}`}>{formatNum(price)}</span>
        <span className={`text-[10px] ${subColor}`}>{formatNum(qty)}</span>
      </div>
    </div>
  );
}

// ── 실적 패널 ─────────────────────────────────────────────────────────────
function FinancialPanel({ reports, coinSymbol, currentPrice, totalShares }: {
  reports: any[]; coinSymbol: string; currentPrice: number; totalShares: number;
}) {
  if (!reports.length) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-300 text-sm">
        아직 실적 데이터가 없습니다
      </div>
    );
  }

  const latest = reports[0];
  const marketCap = currentPrice * totalShares;
  const eps = parseFloat(latest.eps || 0);
  const per = eps > 0 ? (currentPrice / eps).toFixed(1) : "—";

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white">
        <p className="text-xs opacity-70 mb-2 font-bold uppercase tracking-wider">밸류에이션</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["시가총액", formatNum(marketCap)], ["PER", per], ["EPS", eps > 0 ? formatNum(eps, 1) : "—"]].map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px] opacity-60">{k}</p>
              <p className="text-sm font-black">{v}</p>
            </div>
          ))}
        </div>
      </div>
      {reports.slice(0, 4).map(r => {
        const net = parseFloat(r.net_income);
        return (
          <div key={r.id} className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="font-black text-sm text-gray-800">{r.period}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${net >= 0 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
                {net >= 0 ? "▲ 흑자" : "▼ 적자"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {([["매출", r.revenue], ["영업이익", r.operating_profit], ["순이익", r.net_income], ["주당순이익(EPS)", r.eps]] as [string, number][]).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-gray-400">{k}</span>
                  <span className="font-bold text-gray-700">{formatNum(Number(v))}</span>
                </div>
              ))}
            </div>
            {r.notes && <p className="text-[10px] text-gray-400 mt-2 bg-gray-50 rounded-lg px-2.5 py-2 leading-relaxed">{r.notes}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────
type TabKey = "chart" | "orderbook" | "trades" | "info" | "financial" | "myorders";

export default function Company({ companyId, onBack }: Props) {
  const [company, setCompany] = useState<any>(null);
  const [orderbook, setOrderbook] = useState<{ buy: any[]; sell: any[] }>({ buy: [], sell: [] });
  const [trades, setTrades] = useState<any[]>([]);
  const [tradeFeed, setTradeFeed] = useState<{ price: number; quantity: number; time: string }[]>([]);
  const [myHolding, setMyHolding] = useState<any>({ quantity: 0 });
  const [myBalance, setMyBalance] = useState<number>(0);
  const [coinSymbol, setCoinSymbol] = useState<string>("");
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleInterval, setCandleInterval] = useState<"1m" | "5m" | "1h" | "1d">("1d");
  const [financials, setFinancials] = useState<any[]>([]);
  const [tab, setTab] = useState<TabKey>("chart");
  const [orderMode, setOrderMode] = useState<"limit" | "market">("limit");
  const [orderType, setOrderType] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const user = getUser();

  const loadAll = useCallback(async () => {
    const [co, ob, tr, my, myOrd] = await Promise.all([
      api(`/api/companies/${companyId}`),
      api(`/api/orders/${companyId}/orderbook`),
      api(`/api/trades/${companyId}`),
      api(`/api/portfolio/company/${companyId}`),
      api(`/api/orders/my?companyId=${companyId}`),
    ]);
    if (co && !co.error) setCompany(co);
    if (ob && !ob.error) setOrderbook(ob);
    if (Array.isArray(tr)) setTrades(tr);
    if (my && !my.error) {
      setMyHolding({ quantity: my.quantity || 0 });
      setMyBalance(my.myBalance || 0);
      setCoinSymbol(my.coinSymbol || "");
    }
    if (Array.isArray(myOrd)) setMyOrders(myOrd);
  }, [companyId]);

  const loadCandles = useCallback(async (iv: string) => {
    const data = await api(`/api/trades/${companyId}/candles?interval=${iv}&limit=60`);
    if (Array.isArray(data)) setCandles(data);
  }, [companyId]);

  const loadFinancials = useCallback(async () => {
    const data = await api(`/api/financial-reports/${companyId}`);
    if (Array.isArray(data)) setFinancials(data);
  }, [companyId]);

  useEffect(() => {
    loadAll();
    loadCandles(candleInterval);
    loadFinancials();

    const socket = socketIo({ path: "/socket.io" });
    socket.emit("subscribe_company", companyId);

    socket.on("trade_executed", (data: any) => {
      loadAll();
      if (data.companyId === companyId && data.price) {
        const now = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setTradeFeed(prev => [{ price: data.price, quantity: data.quantity || 0, time: now }, ...prev].slice(0, 30));
        // 실시간 캔들 업데이트 (마지막 봉)
        setCandles(prev => {
          if (!prev.length) return prev;
          const last = { ...prev[prev.length - 1] };
          last.close = data.price;
          last.high = Math.max(last.high, data.price);
          last.low = Math.min(last.low, data.price);
          last.volume += data.quantity || 0;
          return [...prev.slice(0, -1), last];
        });
      }
    });
    socket.on("orderbook_updated", () => loadAll());
    socket.on("circuit_breaker", (data: any) => {
      setMsg(`⚠️ ${data.message}`);
      loadAll();
    });
    return () => { socket.disconnect(); };
  }, [companyId, loadAll]);

  useEffect(() => { loadCandles(candleInterval); }, [candleInterval, loadCandles]);

  const submitOrder = async () => {
    if (orderMode === "limit" && !price) return setMsg("지정가를 입력해주세요");
    if (!quantity) return setMsg("수량을 입력해주세요");
    setLoading(true);
    setMsg("");
    const body: any = { companyId, orderType, quantity: parseInt(quantity), priceType: orderMode };
    if (orderMode === "limit") body.price = parseFloat(price);
    const res = await api("/api/orders", { method: "POST", body: JSON.stringify(body) });
    setLoading(false);
    if (res.error) {
      setMsg("❌ " + res.error);
    } else {
      const filled = res.filled || 0;
      setMsg(filled > 0 ? `✅ ${filled}주 체결! (미체결 ${res.remaining}주 대기)` : "✅ 주문 접수 (대기 중)");
      setPrice(""); setQuantity("");
      loadAll();
    }
  };

  const cancelOrder = async (orderId: number) => {
    await api(`/api/orders/${orderId}`, { method: "DELETE" });
    loadAll();
  };

  if (!company) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center text-gray-400"><p className="text-4xl mb-2">⏳</p><p>불러오는 중...</p></div>
    </div>
  );

  const rate = parseFloat(company.change_rate || 0);
  const isSuspended = company.status === "suspended";
  const totalCost = price && quantity ? parseFloat(price) * parseInt(quantity) || 0 : 0;
  const insufficientBalance = orderType === "BUY" && orderMode === "limit" && totalCost > myBalance && totalCost > 0;
  const insufficientStock = orderType === "SELL" && parseInt(quantity) > myHolding.quantity && !!quantity;

  const maxObQty = Math.max(
    ...orderbook.buy.map(o => o.total_qty),
    ...orderbook.sell.map(o => o.total_qty),
    1
  );
  const bestSell = orderbook.sell.length ? Math.min(...orderbook.sell.map(o => parseFloat(o.price))) : null;
  const bestBuy = orderbook.buy.length ? Math.max(...orderbook.buy.map(o => parseFloat(o.price))) : null;

  const TABS: [TabKey, string][] = [
    ["chart", "📈 차트"],
    ["orderbook", "📊 호가"],
    ["trades", "📋 체결"],
    ["info", "ℹ️ 정보"],
    ["financial", "💹 실적"],
    ["myorders", `📋 내주문${myOrders.length > 0 ? ` (${myOrders.length})` : ""}`],
  ];

  return (
    <div className="pb-44 bg-[#F4F6FA] min-h-screen">
      {/* 헤더 */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 text-xl p-1 -ml-1">←</button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {company.logo_url
              ? <img src={company.logo_url} className="w-9 h-9 rounded-xl object-cover" alt="" />
              : <span className="text-2xl">{company.logo_emoji || "🏢"}</span>
            }
            <div className="min-w-0">
              <p className="font-black text-base text-gray-800 truncate">{company.name}</p>
              <p className="text-[11px] text-gray-400 truncate">CEO {company.ceo_name} · {company.coin_symbol}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-black text-lg text-gray-800 leading-tight">
              {formatNum(company.current_price || company.ipo_price)}
            </p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${changeBg(rate)}`}>
              {changeArrow(rate)} {Math.abs(rate).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* 서킷브레이커 */}
      {isSuspended && (
        <div className="mx-4 mt-3 bg-orange-50 border border-orange-200 rounded-2xl p-3 text-center">
          <p className="font-bold text-orange-700">⚠️ 거래 정지 중</p>
          <p className="text-xs text-orange-500 mt-0.5">{company.suspend_reason}</p>
        </div>
      )}

      {/* 보유 현황 */}
      <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-400 mb-0.5">📦 보유 주식</p>
            <p className="font-black text-lg text-red-600">{formatNum(myHolding.quantity)}주</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-400 mb-0.5">💰 코인 잔액</p>
            <p className="font-black text-lg text-blue-600">{formatNum(myBalance, 1)}</p>
            <p className="text-xs text-blue-400">{coinSymbol || company.coin_symbol}</p>
          </div>
        </div>
      </div>

      {/* 탭 바 */}
      <div className="flex bg-white mx-4 mt-3 rounded-2xl p-1 shadow-sm overflow-x-auto scrollbar-hide">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-shrink-0 px-2.5 py-2 rounded-xl text-[11px] font-bold transition whitespace-nowrap
              ${tab === k ? "bg-indigo-500 text-white shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── 차트 탭 ── */}
      {tab === "chart" && (
        <div className="mx-4 mt-3 space-y-3">
          <div className="bg-white rounded-2xl shadow-sm px-4 pt-4 pb-3">
            <div className="flex items-center gap-1 mb-3">
              {(["1m", "5m", "1h", "1d"] as const).map(iv => (
                <button key={iv} onClick={() => setCandleInterval(iv)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition
                    ${candleInterval === iv ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}>
                  {iv}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-gray-300">최근 60봉</span>
            </div>
            <CandlestickChart candles={candles} interval={candleInterval} />
          </div>

          {/* 실시간 체결 피드 */}
          {tradeFeed.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs font-bold text-gray-500 mb-2">⚡ 실시간 체결</p>
              <div className="space-y-1">
                {tradeFeed.slice(0, 8).map((t, i) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 tabular-nums">{t.time}</span>
                    <span className="font-bold text-gray-700 tabular-nums">{formatNum(t.price)}</span>
                    <span className="text-gray-500 tabular-nums">{formatNum(t.quantity)}주</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 호가창 탭 ── */}
      {tab === "orderbook" && (
        <div className="mx-4 mt-3">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-bold text-blue-600 mb-2 text-center">📉 매도 호가</p>
                <div className="space-y-0.5">
                  {[...orderbook.sell].reverse().map((o, i) => (
                    <OrderbookRow key={i}
                      price={parseFloat(o.price)} qty={o.total_qty} maxQty={maxObQty} side="sell"
                      onClick={() => { setPrice(String(o.price)); setOrderType("BUY"); setOrderMode("limit"); }} />
                  ))}
                  {orderbook.sell.length === 0 && <p className="text-center text-xs text-gray-300 py-4">없음</p>}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-red-500 mb-2 text-center">📈 매수 호가</p>
                <div className="space-y-0.5">
                  {orderbook.buy.map((o, i) => (
                    <OrderbookRow key={i}
                      price={parseFloat(o.price)} qty={o.total_qty} maxQty={maxObQty} side="buy"
                      onClick={() => { setPrice(String(o.price)); setOrderType("SELL"); setOrderMode("limit"); }} />
                  ))}
                  {orderbook.buy.length === 0 && <p className="text-center text-xs text-gray-300 py-4">없음</p>}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-100" />
              <span className={`text-sm font-black px-3 py-1 rounded-full border ${changeBg(rate)}`}>
                {changeArrow(rate)} {formatNum(company.current_price || company.ipo_price)}
              </span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
          </div>
        </div>
      )}

      {/* ── 체결 탭 ── */}
      {tab === "trades" && (
        <div className="px-4 mt-3 space-y-1.5">
          {trades.length === 0 ? (
            <div className="text-center py-8 text-gray-300 text-sm bg-white rounded-2xl shadow-sm">체결 내역 없음</div>
          ) : trades.map(t => (
            <div key={t.id} className="flex justify-between items-center bg-white rounded-xl px-3 py-2.5 border border-gray-100">
              <span className="text-xs text-gray-400 tabular-nums">
                {new Date(t.executed_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="font-bold text-sm text-gray-800 tabular-nums">{formatNum(t.price)}</span>
              <span className="text-xs text-gray-500 tabular-nums">{formatNum(t.quantity)}주</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 정보 탭 ── */}
      {tab === "info" && (
        <div className="px-4 mt-3 space-y-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">📊 시장 정보</p>
            {([
              ["IPO 가격", `${formatNum(company.ipo_price)} ${company.coin_symbol}`],
              ["현재가", `${formatNum(company.current_price || company.ipo_price)} ${company.coin_symbol}`],
              ["고가", `${formatNum(company.high_price || company.ipo_price)}`],
              ["저가", `${formatNum(company.low_price || company.ipo_price)}`],
              ["거래량", `${formatNum(company.volume || 0)}주`],
              ["시가총액", `${formatNum((company.current_price || company.ipo_price) * company.total_shares)}`],
              ["총 발행 주식", `${formatNum(company.total_shares)}주`],
              ["주주 수", `${company.shareholder_count || 0}명`],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-400">{k}</span>
                <span className="text-xs font-bold text-gray-700">{v}</span>
              </div>
            ))}
          </div>
          {company.description && (
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs font-bold text-gray-500 mb-2">📝 사업 소개</p>
              <p className="text-sm text-gray-600 leading-relaxed">{company.description}</p>
            </div>
          )}
          {company.business_plan && (
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs font-bold text-gray-500 mb-2">💡 사업 계획</p>
              <p className="text-sm text-gray-600 leading-relaxed">{company.business_plan}</p>
            </div>
          )}
        </div>
      )}

      {/* ── 실적 탭 ── */}
      {tab === "financial" && (
        <div className="px-4 mt-3">
          <FinancialPanel
            reports={financials}
            coinSymbol={coinSymbol || company.coin_symbol}
            currentPrice={parseFloat(company.current_price || company.ipo_price)}
            totalShares={parseInt(company.total_shares)}
          />
        </div>
      )}

      {/* ── 내 주문 탭 ── */}
      {tab === "myorders" && (
        <div className="px-4 mt-3 space-y-2">
          {myOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-300 text-sm bg-white rounded-2xl shadow-sm">미체결 주문 없음</div>
          ) : myOrders.map(o => (
            <div key={o.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-3 border border-gray-100">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${o.order_type === "BUY" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}>
                  {o.order_type === "BUY" ? "매수" : "매도"}
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-700 tabular-nums">{formatNum(o.price)}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(o.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
              <div className="text-right mr-2">
                <p className="text-xs font-bold text-gray-700">{formatNum(o.remaining_qty)}주 대기</p>
                <p className="text-[10px] text-gray-400">총 {formatNum(o.quantity)}주</p>
              </div>
              <button onClick={() => cancelOrder(o.id)}
                className="text-xs text-gray-400 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition">
                취소
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── 주문 패널 (하단 고정) ── */}
      {!isSuspended && (
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t px-4 pt-3 pb-5 z-20 shadow-2xl">
          {msg && (
            <p className={`text-xs mb-2 font-medium px-3 py-2 rounded-xl
              ${msg.startsWith("✅") ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
              {msg}
            </p>
          )}

          {/* 매수/매도 + 지정가/시장가 */}
          <div className="flex gap-2 mb-2">
            <div className="flex gap-1 flex-1">
              {(["BUY", "SELL"] as const).map(t => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition
                    ${orderType === t
                      ? t === "BUY" ? "bg-red-500 text-white" : "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-400"}`}>
                  {t === "BUY" ? "📈 매수" : "📉 매도"}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["limit", "market"] as const).map(m => (
                <button key={m} onClick={() => setOrderMode(m)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition
                    ${orderMode === m ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-400"}`}>
                  {m === "limit" ? "지정가" : "시장가"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 items-center">
            {orderMode === "limit" ? (
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                placeholder={`가격 (현재 ${formatNum(company.current_price || company.ipo_price)})`}
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-300" />
            ) : (
              <div className="flex-1 px-3 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-xs text-indigo-500 font-bold">
                {orderType === "BUY"
                  ? bestSell ? `최우선 매도가: ${formatNum(bestSell)}` : "매도 호가 없음"
                  : bestBuy ? `최우선 매수가: ${formatNum(bestBuy)}` : "매수 호가 없음"
                }
              </div>
            )}
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
              placeholder="수량"
              className="w-20 px-2 py-2.5 rounded-xl border border-gray-200 text-sm outline-none text-center focus:border-indigo-300" />
            {orderType === "SELL" ? (
              <button onClick={() => setQuantity(String(myHolding.quantity))}
                className="px-2.5 py-2.5 rounded-xl border border-blue-200 text-blue-600 text-xs font-bold hover:bg-blue-50 transition">
                전량
              </button>
            ) : orderMode === "limit" && price ? (
              <button onClick={() => setQuantity(String(Math.floor(myBalance / parseFloat(price || "1"))))}
                className="px-2.5 py-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition">
                최대
              </button>
            ) : null}
            <button onClick={submitOrder} disabled={loading || !quantity}
              className={`px-4 py-2.5 rounded-xl font-black text-sm text-white disabled:opacity-40 transition
                ${orderType === "BUY" ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}`}>
              {loading ? "⏳" : "주문"}
            </button>
          </div>

          {orderMode === "limit" && price && quantity && (
            <p className={`text-xs mt-1.5 text-center ${insufficientBalance || insufficientStock ? "text-red-500 font-bold" : "text-gray-400"}`}>
              {insufficientBalance && "⚠️ 잔액 부족 · "}
              {insufficientStock && "⚠️ 보유 주식 부족 · "}
              총 {formatNum(totalCost)} {coinSymbol || company.coin_symbol}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
