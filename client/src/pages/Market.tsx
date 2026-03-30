import { useEffect, useRef, useState } from "react";
import { io as socketIo } from "socket.io-client";
import { api, formatNum, getUser, getToken } from "../api";

type SortKey = "market_cap" | "volume" | "change_rate" | "name";

function CompanyLogo({ company }: { company: any }) {
  if (company.logo_url) {
    return <img src={company.logo_url} className="w-10 h-10 rounded-xl object-cover" alt={company.name} />;
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">
      {company.logo_emoji || "🏢"}
    </div>
  );
}

function IpoApplyModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [coins, setCoins] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "", description: "", businessPlan: "",
    totalShares: "1000", ipoPrice: "", assetTypeId: "", logoEmoji: "🏢", logoUrl: "",
  });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api("/api/companies/my-coins").then(d => {
      const list = Array.isArray(d) ? d : (d.coins || []);
      setCoins(list);
    });
  }, []);

  const handleLogoUpload = async (file: File) => {
    setLogoPreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.append("logo", file);
    const token = getToken();
    const res = await fetch("/api/companies/upload-logo", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      method: "POST",
      body: fd,
    });
    const d = await res.json();
    if (!res.ok) { setMsg(`❌ ${d?.error || "업로드 실패"}`); return; }
    if (d.url) setForm(p => ({ ...p, logoUrl: d.url }));
  };

  const submit = async () => {
    if (!form.name || !form.ipoPrice || !form.assetTypeId) {
      return setMsg("회사명, IPO 가격, 코인 종류는 필수입니다");
    }
    setLoading(true);
    const r = await api("/api/companies", { method: "POST", body: JSON.stringify(form) });
    setLoading(false);
    if (r.error) setMsg("❌ " + r.error);
    else onDone();
  };

  const inp = "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-400 bg-white text-gray-800 placeholder-gray-400";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-gray-900">🏢 IPO 신청</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-600 mb-4">
          💡 IPO 신청 후 관리자 승인이 나면 주식 시장에 상장됩니다.
        </div>
        {msg && (
          <div className={`mb-3 p-3 rounded-xl text-sm font-medium ${msg.startsWith("❌") ? "bg-red-50 text-red-500 border border-red-200" : "bg-green-50 text-green-600"}`}>
            {msg}
          </div>
        )}
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block font-medium">로고</label>
            <div className="flex items-center gap-3">
              <input className="w-14 px-2 py-2.5 rounded-xl border border-gray-200 bg-white text-center text-xl outline-none"
                value={form.logoEmoji}
                onChange={e => setForm(p => ({ ...p, logoEmoji: e.target.value }))} />
              <span className="text-xs text-gray-400">또는</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-600 bg-white hover:bg-gray-50 font-medium">
                  📁 이미지 업로드
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
                {logoPreview && <img src={logoPreview} className="w-12 h-12 rounded-xl object-cover border border-gray-200" alt="preview" />}
              </div>
            </div>
          </div>
          <input className={inp} placeholder="회사명 *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <textarea className={inp + " resize-none"} rows={2} placeholder="사업 소개 (선택)"
            value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <textarea className={inp + " resize-none"} rows={2} placeholder="사업 계획서 (선택)"
            value={form.businessPlan} onChange={e => setForm(p => ({ ...p, businessPlan: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">총 주식 수 *</label>
              <input type="number" className={inp} placeholder="1000" value={form.totalShares}
                onChange={e => setForm(p => ({ ...p, totalShares: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">IPO 가격 *</label>
              <input type="number" className={inp} placeholder="100" value={form.ipoPrice}
                onChange={e => setForm(p => ({ ...p, ipoPrice: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">거래 코인 *</label>
            <select className={inp} value={form.assetTypeId}
              onChange={e => setForm(p => ({ ...p, assetTypeId: e.target.value }))}>
              <option value="">코인 선택...</option>
              {coins.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.symbol}){c.org_name ? ` — ${c.org_name}` : ""}</option>
              ))}
            </select>
            {coins.length === 0 && <p className="text-xs text-yellow-600 mt-1">⚠️ 소속 조직에 등록된 코인이 없습니다.</p>}
          </div>
        </div>
        <button onClick={submit} disabled={loading}
          className="w-full mt-4 py-3 bg-blue-500 text-white rounded-xl font-black text-sm disabled:opacity-50 hover:bg-blue-600 transition">
          {loading ? "⏳ 신청 중..." : "📋 IPO 신청하기"}
        </button>
      </div>
    </div>
  );
}

export default function Market({ onSelect, onLogout }: { onSelect: (id: number) => void; onLogout: () => void }) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [myApps, setMyApps] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("market_cap");
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [showIpo, setShowIpo] = useState(false);
  const [ipoSuccess, setIpoSuccess] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const user = getUser();

  const load = async () => {
    setLoading(true);
    const [data, apps, wl] = await Promise.all([
      api(`/api/companies`),
      api(`/api/companies/my-applications`).catch(() => []),
      api(`/api/watchlist`).catch(() => []),
    ]);
    setCompanies(Array.isArray(data) ? data : []);
    setMyApps(Array.isArray(apps) ? apps : []);
    if (Array.isArray(wl)) setWatchlist(new Set(wl));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // WebSocket으로 실시간 시장 가격 갱신 (폴링 대체)
  useEffect(() => {
    const socket = socketIo({ path: "/socket.io" });
    const orgId = user?.orgId;
    socket.on("connect", () => {
      if (orgId) socket.emit("subscribe_org", orgId);
    });
    // 거래 체결 또는 신규 상장 시 시장 목록 갱신
    socket.on("market_updated", () => {
      api("/api/companies").then(data => {
        if (Array.isArray(data)) setCompanies(data);
      });
    });
    socket.on("company_listed", () => load());
    return () => { socket.disconnect(); };
  }, [user?.orgId]);

  const toggleWatchlist = async (companyId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await api(`/api/watchlist/${companyId}`, { method: "POST" });
    setWatchlist(prev => {
      const next = new Set(prev);
      if (res.watching) next.add(companyId);
      else next.delete(companyId);
      return next;
    });
  };

  const listed = companies.filter(c => c.status === "listed");
  const suspended = companies.filter(c => c.status === "suspended");
  const upCount = listed.filter(c => parseFloat(c.change_rate || 0) > 0).length;
  const downCount = listed.filter(c => parseFloat(c.change_rate || 0) < 0).length;
  const totalMarketCap = companies.reduce((s, c) => s + (parseFloat(c.market_cap) || 0), 0);

  let filtered = companies.filter(c =>
    (c.name.includes(search) || c.ceo_name?.includes(search) || c.ceo_username?.includes(search)) &&
    (!showWatchlistOnly || watchlist.has(c.id))
  );

  filtered = [...filtered].sort((a, b) => {
    if (sortKey === "market_cap") return (parseFloat(b.market_cap) || 0) - (parseFloat(a.market_cap) || 0);
    if (sortKey === "volume") return (parseInt(b.volume) || 0) - (parseInt(a.volume) || 0);
    if (sortKey === "change_rate") return parseFloat(b.change_rate || 0) - parseFloat(a.change_rate || 0);
    return a.name.localeCompare(b.name, "ko");
  });

  return (
    <div className="pb-24 bg-[#F4F6FA] min-h-screen">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 shadow-sm px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📈</span>
            <div>
              <h1 className="font-black text-lg text-gray-900 leading-tight">두런허브스탁</h1>
              <p className="text-[10px] text-gray-400 leading-tight">주식 시장</p>
            </div>
          </div>
          <div className="relative">
            <button onClick={() => setShowProfile(v => !v)}
              className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-base font-black text-white shadow">
              {user?.username?.[0]?.toUpperCase() || "?"}
            </button>
            {showProfile && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
                <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 z-50 min-w-52">
                  <div className="pb-2 mb-2 border-b border-gray-100">
                    <p className="text-sm font-black text-gray-900">{user?.fullName || user?.username}</p>
                    <p className="text-xs text-gray-400">@{user?.username}</p>
                    {user?.orgName && <p className="text-xs text-blue-500 mt-0.5">🏫 {user.orgName}</p>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setShowIpo(true); setShowProfile(false); }}
                    className="w-full text-left text-sm py-2 px-2 rounded-xl hover:bg-gray-50 text-gray-700 transition">
                    🏢 IPO 신청
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowProfile(false); onLogout(); }}
                    className="w-full text-left text-sm py-2 px-2 rounded-xl hover:bg-red-50 text-red-500 mt-0.5 transition">
                    🚪 로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* IPO 성공 배너 */}
      {ipoSuccess && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-600 font-medium flex justify-between">
          <span>✅ IPO 신청 완료! 관리자 승인 후 상장됩니다.</span>
          <button onClick={() => setIpoSuccess(false)} className="text-green-400">✕</button>
        </div>
      )}

      {/* 시장 대시보드 */}
      <div className="mx-4 mt-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white">
        <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider mb-2">시장 현황</p>
        <div className="grid grid-cols-4 gap-1 text-center">
          <div>
            <p className="text-[9px] opacity-60">총 시총</p>
            <p className="text-xs font-black leading-tight">{formatNum(totalMarketCap)}</p>
          </div>
          <div>
            <p className="text-[9px] opacity-60">상장</p>
            <p className="text-xs font-black">{listed.length}개</p>
          </div>
          <div>
            <p className="text-[9px] text-red-300">▲ 상승</p>
            <p className="text-xs font-black text-red-200">{upCount}개</p>
          </div>
          <div>
            <p className="text-[9px] text-blue-300">▼ 하락</p>
            <p className="text-xs font-black text-blue-200">{downCount}개</p>
          </div>
        </div>
        {suspended.length > 0 && (
          <p className="text-[10px] text-orange-200 mt-1.5 text-center">⚠️ 거래정지 {suspended.length}개 종목</p>
        )}
      </div>

      {/* 검색바 */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="회사명 또는 CEO 검색"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white border border-gray-200 text-gray-800 placeholder-gray-400 outline-none focus:border-blue-300"
          />
        </div>
      </div>

      {/* 정렬 + 관심종목 필터 */}
      <div className="px-4 pb-3 flex gap-1.5 flex-wrap items-center">
        {([
          ["market_cap", "시총순"],
          ["volume", "거래량순"],
          ["change_rate", "등락률순"],
          ["name", "이름순"],
        ] as [SortKey, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setSortKey(k)}
            className={`text-xs font-bold px-2.5 py-1 rounded-full border transition
              ${sortKey === k ? "bg-indigo-500 text-white border-indigo-500" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
            {l}
          </button>
        ))}
        <button
          onClick={() => setShowWatchlistOnly(v => !v)}
          className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full border transition
            ${showWatchlistOnly ? "bg-yellow-400 text-white border-yellow-400" : "bg-white border-gray-200 text-gray-500 hover:border-yellow-300"}`}>
          ⭐ 관심{watchlist.size > 0 ? ` (${watchlist.size})` : ""}
        </button>
      </div>

      {/* 종목 카드 목록 */}
      <div className="px-4 space-y-2">
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">⏳</p>
            <p className="text-sm">불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">{showWatchlistOnly ? "⭐" : "🏢"}</p>
            <p className="text-sm font-bold text-gray-500">
              {showWatchlistOnly ? "관심 종목이 없습니다" : "아직 상장된 회사가 없습니다"}
            </p>
            {!showWatchlistOnly && <p className="text-xs mt-1 text-gray-400">우측 상단 아바타 → IPO 신청으로 등록해보세요!</p>}
          </div>
        ) : filtered.map(c => {
          const rate = parseFloat(c.change_rate || 0);
          const isSuspended = c.status === "suspended";
          const isWatching = watchlist.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full bg-white rounded-2xl shadow-sm p-4 text-left transition active:scale-[0.98]
                ${isSuspended ? "opacity-60" : "hover:shadow-md"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <CompanyLogo company={c} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-base text-gray-900 truncate">{c.name}</p>
                      {isSuspended && (
                        <span className="flex-shrink-0 text-[10px] bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full font-bold">정지</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{c.coin_symbol} · {c.ceo_name || c.ceo_username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="text-right">
                    <p className="font-black text-base text-gray-900 tabular-nums">
                      {formatNum(c.current_price || c.ipo_price)}
                      <span className="text-xs font-normal text-gray-400 ml-0.5">{c.coin_symbol}</span>
                    </p>
                    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 tabular-nums
                      ${rate > 0 ? "bg-red-50 text-red-500" : rate < 0 ? "bg-blue-50 text-blue-500" : "bg-gray-50 text-gray-400"}`}>
                      {rate > 0 ? "▲" : rate < 0 ? "▼" : "–"} {Math.abs(rate).toFixed(2)}%
                    </span>
                  </div>
                  <button
                    onClick={e => toggleWatchlist(c.id, e)}
                    className={`text-xl leading-none transition ${isWatching ? "text-yellow-400" : "text-gray-200 hover:text-yellow-300"}`}
                  >
                    ★
                  </button>
                </div>
              </div>
              <div className="flex gap-3 mt-2.5 pt-2 border-t border-gray-50 text-xs text-gray-400">
                <span>시총 <span className="font-black text-gray-600">{formatNum(c.market_cap || 0)}</span></span>
                <span>·</span>
                <span>거래량 <span className="font-black text-gray-600">{formatNum(c.volume || 0)}</span></span>
                <span>·</span>
                <span>주주 <span className="font-black text-gray-600">{c.shareholder_count || 0}</span>명</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 내 IPO 신청 현황 */}
      {myApps.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">📋 내 IPO 신청 현황</p>
          <div className="space-y-2">
            {myApps.map(a => {
              const statusMap: Record<string, { label: string; color: string }> = {
                pending:   { label: "심사 중",   color: "bg-yellow-100 text-yellow-600" },
                listed:    { label: "상장됨",    color: "bg-green-100 text-green-600" },
                rejected:  { label: "반려됨",    color: "bg-red-100 text-red-500" },
                suspended: { label: "거래정지",  color: "bg-orange-100 text-orange-500" },
                delisted:  { label: "상장폐지",  color: "bg-gray-100 text-gray-400" },
              };
              const st = statusMap[a.status] || { label: a.status, color: "bg-gray-100 text-gray-400" };
              return (
                <div key={a.id}
                  className={`flex items-center justify-between bg-white rounded-2xl shadow-sm px-4 py-3 ${a.status === "listed" ? "cursor-pointer hover:shadow-md" : ""}`}
                  onClick={() => a.status === "listed" && onSelect(a.id)}
                >
                  <div className="flex items-center gap-3">
                    <CompanyLogo company={a} />
                    <div>
                      <p className="text-sm font-bold text-gray-900">{a.name}</p>
                      <p className="text-xs text-gray-400">{a.coin_symbol} · IPO {formatNum(a.ipo_price)}</p>
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
