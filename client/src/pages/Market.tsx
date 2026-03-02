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
    api("/api/companies/my-coins").then(d => { if (Array.isArray(d)) setCoins(d); });
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

  const inp = "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 bg-white";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-gray-800">🏢 IPO 신청</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-600 mb-4">
          💡 IPO 신청 후 관리자 승인이 나면 주식 시장에 상장됩니다.
        </div>

        {msg && (
          <div className={`mb-3 p-3 rounded-xl text-sm font-medium
            ${msg.startsWith("❌") ? "bg-red-50 text-red-600 border border-red-200" : "bg-green-50 text-green-700"}`}>
            {msg}
          </div>
        )}

        <div className="space-y-2.5">
          <div className="flex gap-2">
            <input className="w-12 px-2 py-2.5 rounded-xl border border-gray-200 text-center text-xl outline-none"
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
              <p className="text-xs text-orange-500 mt-1">⚠️ 소속 조직에 코인이 없습니다. 먼저 두런 코인에서 조직 코인을 만들어주세요.</p>
            )}
          </div>
        </div>

        <button onClick={submit} disabled={loading}
          className="w-full mt-4 py-3 bg-indigo-500 text-white rounded-xl font-black text-sm disabled:opacity-50">
          {loading ? "⏳ 신청 중..." : "📋 IPO 신청하기"}
        </button>
      </div>
    </div>
  );
}

export default function Market({ onSelect }: { onSelect: (id: number) => void }) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showIpo, setShowIpo] = useState(false);
  const [ipoSuccess, setIpoSuccess] = useState(false);
  const user = getUser();

  const load = async () => {
    setLoading(true);
    const data = await api(`/api/companies?orgId=${user?.orgId || ""}`);
    setCompanies(Array.isArray(data) ? data : []);
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
    <div className="pb-24">
      {/* 헤더 */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-black text-xl text-gray-800">📈 두런 스탁</h1>
            <p className="text-xs text-gray-400">{user?.orgName || "주식 시장"}</p>
          </div>
          <button onClick={() => { setIpoSuccess(false); setShowIpo(true); }}
            className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-black">
            🏢 IPO 신청
          </button>
        </div>
      </div>

      {/* IPO 성공 메시지 */}
      {ipoSuccess && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700 font-medium flex justify-between">
          <span>✅ IPO 신청 완료! 관리자 승인 후 상장됩니다.</span>
          <button onClick={() => setIpoSuccess(false)} className="text-green-400">✕</button>
        </div>
      )}

      {/* 검색 */}
      <div className="px-4 pt-3 pb-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 회사명 또는 CEO 검색"
          className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm bg-white outline-none focus:border-indigo-400"
        />
      </div>

      {/* 요약 통계 */}
      <div className="px-4 mb-2">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "상장 종목", value: companies.filter(c => c.status === "listed").length + "개" },
            { label: "거래 정지", value: companies.filter(c => c.status === "suspended").length + "개" },
            { label: "전체 종목", value: companies.length + "개" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-3 text-center border border-gray-100">
              <p className="font-black text-lg text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 종목 목록 */}
      <div className="px-4 space-y-2">
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">⏳</p>
            <p className="text-sm">불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">🏢</p>
            <p className="text-sm font-bold">아직 상장된 회사가 없습니다</p>
            <p className="text-xs mt-1">IPO 신청 버튼으로 첫 번째 회사를 등록해보세요!</p>
            <button onClick={() => { setIpoSuccess(false); setShowIpo(true); }}
              className="mt-4 px-5 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-black">
              🏢 IPO 신청하기
            </button>
          </div>
        ) : filtered.map(c => {
          const rate = parseFloat(c.change_rate || 0);
          const isSuspended = c.status === "suspended";
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full bg-white rounded-2xl p-4 border text-left transition active:scale-98 shadow-sm
                ${isSuspended ? "border-orange-200 opacity-70" : "border-gray-100 hover:border-indigo-200"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{c.logo_emoji || "🏢"}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-base text-gray-800">{c.name}</p>
                      {isSuspended && (
                        <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold">
                          ⚠️ 거래정지
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      CEO {c.ceo_name || c.ceo_username} · {c.coin_symbol}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-base text-gray-800">
                    {formatNum(c.current_price || c.ipo_price)} <span className="text-xs font-normal text-gray-400">{c.coin_symbol}</span>
                  </p>
                  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full border mt-0.5 ${changeBg(rate)}`}>
                    {changeArrow(rate)} {Math.abs(rate).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="flex gap-4 mt-2.5 pt-2.5 border-t border-gray-50 text-xs text-gray-400">
                <span>시총 {formatNum(c.market_cap || 0)}</span>
                <span>·</span>
                <span>주주 {c.shareholder_count || 0}명</span>
                <span>·</span>
                <span>IPO {formatNum(c.ipo_price)}</span>
              </div>
            </button>
          );
        })}
      </div>

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
