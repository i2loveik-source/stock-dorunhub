import { useEffect, useState } from "react";
import { api, formatNum, changeBg, changeArrow, getUser } from "../api";

function IpoApplyModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [coins, setCoins] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "", description: "", businessPlan: "",
    totalShares: "1000", ipoPrice: "", assetTypeId: "", logoEmoji: "🏢",
  });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api("/api/companies/my-coins").then(d => {
      console.log("[IPO] coins:", d);
      const list = Array.isArray(d) ? d : (d.coins || []);
      setCoins(list);
    });
  }, []);

  const submit = async () => {
    if (!form.name || !form.ipoPrice || !form.assetTypeId) {
      return setMsg("회사명, IPO 가격, 코인 종류는 필수입니다");
    }
    setLoading(true);
    const r = await api("/api/companies", { method: "POST", body: JSON.stringify(form) });
    setLoading(false);
    if (r.error) setMsg("❌ " + r.error);
    else { onDone(); }
  };

  const inp = "w-full px-3 py-2.5 rounded-xl border border-[#2d3450] text-sm outline-none focus:border-[#4169E1] bg-[#1e2436] text-white placeholder-gray-500";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end" onClick={onClose}>
      <div className="bg-[#141824] w-full max-w-lg mx-auto rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-white">🏢 IPO 신청</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <div className="bg-[#1e2436] border border-[#2d3450] rounded-xl p-3 text-xs text-blue-400 mb-4">
          💡 IPO 신청 후 관리자 승인이 나면 주식 시장에 상장됩니다.
        </div>
        {msg && (
          <div className={`mb-3 p-3 rounded-xl text-sm font-medium
            ${msg.startsWith("❌") ? "bg-red-900/40 text-red-400 border border-red-800" : "bg-green-900/40 text-green-400"}`}>
            {msg}
          </div>
        )}
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <input className="w-12 px-2 py-2.5 rounded-xl border border-[#2d3450] bg-[#1e2436] text-center text-xl outline-none text-white"
              value={form.logoEmoji} onChange={e => setForm(p => ({ ...p, logoEmoji: e.target.value }))} />
            <input className={inp + " flex-1"} placeholder="회사명 *"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <textarea className={inp + " resize-none"} rows={2} placeholder="사업 소개 (선택)"
            value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <textarea className={inp + " resize-none"} rows={2} placeholder="사업 계획서 (선택)"
            value={form.businessPlan} onChange={e => setForm(p => ({ ...p, businessPlan: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">총 주식 수 *</label>
              <input type="number" className={inp} placeholder="1000"
                value={form.totalShares} onChange={e => setForm(p => ({ ...p, totalShares: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">IPO 가격 *</label>
              <input type="number" className={inp} placeholder="100"
                value={form.ipoPrice} onChange={e => setForm(p => ({ ...p, ipoPrice: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">거래 코인 *</label>
            <select className={inp} value={form.assetTypeId}
              onChange={e => setForm(p => ({ ...p, assetTypeId: e.target.value }))}>
              <option value="">코인 선택...</option>
              {coins.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.symbol}){c.org_name ? ` — ${c.org_name}` : ""}
                </option>
              ))}
            </select>
            {coins.length === 0 && (
              <p className="text-xs text-yellow-500 mt-1">⚠️ 소속 조직에 등록된 코인이 없습니다. 관리자에게 문의하세요.</p>
            )}
          </div>
        </div>
        <button onClick={submit} disabled={loading}
          className="w-full mt-4 py-3 bg-[#4169E1] text-white rounded-xl font-black text-sm disabled:opacity-50">
          {loading ? "⏳ 신청 중..." : "📋 IPO 신청하기"}
        </button>
      </div>
    </div>
  );
}

export default function Market({ onSelect, onLogout }: { onSelect: (id: number) => void; onLogout: () => void }) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [myApps, setMyApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showIpo, setShowIpo] = useState(false);
  const [ipoSuccess, setIpoSuccess] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const user = getUser();

  const load = async () => {
    setLoading(true);
    const [data, apps] = await Promise.all([
      api(`/api/companies`),
      api(`/api/companies/my-applications`).catch(() => []),
    ]);
    setCompanies(Array.isArray(data) ? data : []);
    setMyApps(Array.isArray(apps) ? apps : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const filtered = companies.filter(c =>
    c.name.includes(search) || c.ceo_name?.includes(search)
  );

  return (
    <div className="pb-24 bg-[#0a0e1a] min-h-screen">
      {/* 헤더 */}
      <div className="bg-[#0a0e1a] border-b border-[#1e2436] px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📈</span>
            <div>
              <h1 className="font-black text-lg text-white leading-tight">두런허브스탁</h1>
              <p className="text-[10px] text-gray-500 leading-tight">주식 시장</p>
            </div>
          </div>
          {/* 유저 아바타 */}
          <div className="relative">
            <button onClick={() => setShowProfile(v => !v)}
              className="w-9 h-9 rounded-full bg-[#4169E1] flex items-center justify-center text-base font-black text-white shadow-lg">
              {user?.username?.[0]?.toUpperCase() || "?"}
            </button>
            {/* 드롭다운 */}
            {showProfile && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
                <div className="absolute top-full right-0 mt-2 bg-[#141824] border border-[#2d3450] rounded-2xl shadow-2xl p-3 z-50 min-w-52">
                  <div className="pb-2 mb-2 border-b border-[#2d3450]">
                    <p className="text-sm font-black text-white">{user?.fullName || user?.username}</p>
                    <p className="text-xs text-gray-400">@{user?.username}</p>
                    {user?.orgName && <p className="text-xs text-blue-400 mt-0.5">🏫 {user.orgName}</p>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setShowIpo(true); setShowProfile(false); }}
                    className="w-full text-left text-sm py-2 px-2 rounded-xl hover:bg-[#1e2436] text-gray-200 transition">
                    🏢 IPO 신청
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowProfile(false); onLogout(); }}
                    className="w-full text-left text-sm py-2 px-2 rounded-xl hover:bg-red-900/30 text-red-400 mt-0.5 transition">
                    🚪 로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* IPO 성공 메시지 */}
      {ipoSuccess && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-green-900/30 border border-green-700 text-sm text-green-400 font-medium flex justify-between">
          <span>✅ IPO 신청 완료! 관리자 승인 후 상장됩니다.</span>
          <button onClick={() => setIpoSuccess(false)} className="text-green-600">✕</button>
        </div>
      )}

      {/* 검색바 */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="회사명 또는 CEO 검색"
            className="w-full pl-9 pr-4 py-2.5 rounded-2xl text-sm bg-[#1e2436] text-white placeholder-gray-500 outline-none focus:ring-1 focus:ring-[#4169E1]"
          />
        </div>
      </div>

      {/* 시장 통계 pill 행 */}
      <div className="px-4 pb-3 flex gap-2">
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#141824] text-green-400">
          📊 상장 {companies.filter(c => c.status === "listed").length}
        </span>
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#141824] text-yellow-400">
          ⚠️ 정지 {companies.filter(c => c.status === "suspended").length}
        </span>
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#141824] text-gray-400">
          전체 {companies.length}종목
        </span>
      </div>

      {/* 종목 카드 목록 */}
      <div className="px-4 space-y-2">
        {loading ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">⏳</p>
            <p className="text-sm">불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-5xl mb-3">🏢</p>
            <p className="text-sm font-bold text-gray-400">아직 상장된 회사가 없습니다</p>
            <p className="text-xs mt-1">우측 상단 아바타 → IPO 신청으로 등록해보세요!</p>
          </div>
        ) : filtered.map(c => {
          const rate = parseFloat(c.change_rate || 0);
          const isSuspended = c.status === "suspended";
          const isUp = rate >= 0;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full bg-[#141824] rounded-2xl p-4 text-left transition active:scale-95
                ${isSuspended ? "opacity-60" : "hover:bg-[#1a2030]"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{c.logo_emoji || "🏢"}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-base text-white">{c.name}</p>
                      {isSuspended && (
                        <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold">
                          거래정지
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 lowercase">
                      {c.coin_symbol} · {c.ceo_name || c.ceo_username}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-base text-white">
                    {formatNum(c.current_price || c.ipo_price)}
                    <span className="text-xs font-normal text-gray-500 ml-1">{c.coin_symbol}</span>
                  </p>
                  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 ${isUp ? "bg-[#FF4B4B]/20 text-[#FF4B4B]" : "bg-[#4B9EFF]/20 text-[#4B9EFF]"}`}>
                    {rate >= 0 ? "▲" : "▼"} {Math.abs(rate).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="flex gap-3 mt-2.5 pt-2 border-t border-[#1e2436] text-xs text-gray-500">
                <span>시총 <span className="font-black text-gray-300">{formatNum(c.market_cap || 0)}</span></span>
                <span>·</span>
                <span>주주 <span className="font-black text-gray-300">{c.shareholder_count || 0}</span>명</span>
                <span>·</span>
                <span>IPO <span className="font-black text-gray-300">{formatNum(c.ipo_price)}</span></span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 내 IPO 신청 현황 */}
      {myApps.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">📋 내 IPO 신청 현황</p>
          <div className="space-y-2">
            {myApps.map(a => {
              const statusMap: Record<string, { label: string; color: string }> = {
                pending:   { label: "심사 중", color: "bg-yellow-900/40 text-yellow-400" },
                listed:    { label: "상장됨", color: "bg-green-900/40 text-green-400" },
                rejected:  { label: "반려됨", color: "bg-red-900/40 text-red-400" },
                suspended: { label: "거래정지", color: "bg-orange-900/40 text-orange-400" },
                delisted:  { label: "상장폐지", color: "bg-gray-800 text-gray-500" },
              };
              const st = statusMap[a.status] || { label: a.status, color: "bg-gray-800 text-gray-500" };
              return (
                <div key={a.id}
                  className={`flex items-center justify-between bg-[#141824] rounded-2xl px-4 py-3 ${a.status === "listed" ? "cursor-pointer hover:bg-[#1a2030]" : ""}`}
                  onClick={() => a.status === "listed" && onSelect(a.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{a.logo_emoji || "🏢"}</span>
                    <div>
                      <p className="text-sm font-black text-white">{a.name}</p>
                      <p className="text-xs text-gray-500">{a.coin_symbol} · IPO {formatNum(a.ipo_price)}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* IPO 신청 모달 */}
      {showIpo && (
        <IpoApplyModal
          onClose={() => setShowIpo(false)}
          onDone={() => { setShowIpo(false); setIpoSuccess(true); load(); }}
        />
      )}
    </div>
  );
}
