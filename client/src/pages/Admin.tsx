import { useEffect, useState } from "react";
import { api, formatNum, getUser } from "../api";

export default function Admin() {
  const [pending, setPending] = useState<any[]>([]);
  const [orgCoins, setOrgCoins] = useState<any[]>([]);
  const [tab, setTab] = useState<"ipo" | "news" | "dividend" | "create">("ipo");
  const [msg, setMsg] = useState("");
  const user = getUser();

  // 공시 작성 폼
  const [newsForm, setNewsForm] = useState({ title: "", content: "", companyId: "", impact: "neutral" });
  // 배당 폼
  const [divForm, setDivForm] = useState({ companyId: "", totalAmount: "", memo: "" });
  // 회사 생성 폼
  const [createForm, setCreateForm] = useState({
    name: "", description: "", businessPlan: "", totalShares: "1000",
    ipoPrice: "", assetTypeId: "", logoEmoji: "🏢",
  });

  const load = async () => {
    const [p, c] = await Promise.all([
      api("/api/companies/pending"),
      api("/api/companies/my-coins").catch(() => []),
    ]);
    if (Array.isArray(p)) setPending(p);
    if (Array.isArray(c)) setOrgCoins(c);
  };

  useEffect(() => { load(); }, []);

  const approve = async (id: number) => {
    const r = await api(`/api/companies/${id}/approve`, { method: "POST" });
    setMsg(r.error ? "❌ " + r.error : "✅ 승인 완료!");
    load();
  };

  const reject = async (id: number) => {
    const reason = prompt("거절 사유:");
    if (!reason) return;
    await api(`/api/companies/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
    setMsg("거절 처리 완료");
    load();
  };

  const sendNews = async () => {
    if (!newsForm.title) return setMsg("제목 필수");
    const r = await api("/api/news", { method: "POST", body: JSON.stringify(newsForm) });
    if (r.error) setMsg("❌ " + r.error);
    else { setMsg("✅ 공시 발행 완료!"); setNewsForm({ title: "", content: "", companyId: "", impact: "neutral" }); }
  };

  const executeDividend = async () => {
    if (!divForm.companyId || !divForm.totalAmount) return setMsg("회사와 금액 필수");
    if (!confirm(`${divForm.totalAmount} 코인을 배당 지급하시겠습니까?`)) return;
    const r = await api("/api/dividend", {
      method: "POST",
      body: JSON.stringify({ companyId: parseInt(divForm.companyId), totalAmount: parseFloat(divForm.totalAmount), memo: divForm.memo }),
    });
    if (r.error) setMsg("❌ " + r.error);
    else setMsg(`✅ 배당 완료! ${r.successCount}명에게 1주당 ${parseFloat(r.perShare).toFixed(4)} 지급`);
  };

  const createCompany = async () => {
    if (!createForm.name || !createForm.ipoPrice || !createForm.assetTypeId) {
      return setMsg("회사명, IPO 가격, 코인 종류 필수");
    }
    const r = await api("/api/companies", { method: "POST", body: JSON.stringify(createForm) });
    if (r.error) setMsg("❌ " + r.error);
    else { setMsg("✅ 회사 신청 완료! 승인 후 상장됩니다."); load(); }
  };

  const inp = "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 bg-white";
  const btnPri = "w-full py-3 bg-indigo-500 text-white rounded-xl font-black text-sm hover:bg-indigo-600 disabled:opacity-40";

  // 권한 체크: 관리자 이상만 접근
  const allowedRoles = ["관리자", "org_issuer", "platform_admin", "admin", "super_admin"];
  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center text-gray-400 p-8">
          <p className="text-5xl mb-3">🔒</p>
          <p className="text-lg font-black text-gray-700">접근 권한 없음</p>
          <p className="text-sm mt-2 text-gray-400">관리자 계정으로 로그인 후 이용해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="bg-white border-b px-4 py-3">
        <h2 className="font-black text-xl text-gray-800">⚙️ 관리자 패널</h2>
        <p className="text-xs text-gray-400">IPO 승인 · 공시 · 배당</p>
      </div>

      {msg && (
        <div className={`mx-4 mt-3 p-3 rounded-xl text-sm font-medium
          ${msg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
          {msg}
        </div>
      )}

      {/* 탭 */}
      <div className="flex bg-gray-100 rounded-2xl mx-4 mt-3 p-1 gap-1">
        {([
          ["ipo", `🏢 IPO (${pending.length})`],
          ["news", "📰 공시"],
          ["dividend", "💰 배당"],
          ["create", "✏️ 회사 등록"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition
              ${tab === k ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* IPO 승인 탭 */}
      {tab === "ipo" && (
        <div className="px-4 mt-3 space-y-3">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-2">✅</p><p className="text-sm">대기 중인 IPO 신청이 없습니다</p>
            </div>
          ) : pending.map(c => (
            <div key={c.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{c.logo_emoji || "🏢"}</span>
                <div>
                  <p className="font-black text-sm text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    CEO {c.ceo_name || c.ceo_username} · IPO {formatNum(c.ipo_price)} {c.coin_symbol}
                  </p>
                </div>
              </div>
              {c.description && <p className="text-xs text-gray-500 mb-2 bg-gray-50 rounded-lg p-2">{c.description}</p>}
              {c.business_plan && <p className="text-xs text-gray-500 mb-3 bg-blue-50 rounded-lg p-2">{c.business_plan}</p>}
              <div className="flex gap-2">
                <button onClick={() => approve(c.id)} className="flex-1 py-2.5 bg-indigo-500 text-white rounded-xl font-bold text-sm">
                  ✅ 승인
                </button>
                <button onClick={() => reject(c.id)} className="flex-1 py-2.5 bg-gray-100 text-gray-500 rounded-xl font-bold text-sm">
                  ❌ 거절
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 공시 탭 */}
      {tab === "news" && (
        <div className="px-4 mt-3 space-y-2">
          <input className={inp} placeholder="공시 제목 *" value={newsForm.title} onChange={e => setNewsForm(p => ({ ...p, title: e.target.value }))} />
          <textarea className={inp + " resize-none"} rows={3} placeholder="내용 (선택)" value={newsForm.content} onChange={e => setNewsForm(p => ({ ...p, content: e.target.value }))} />
          <input className={inp} placeholder="관련 회사 ID (선택, 비우면 전체 공시)" value={newsForm.companyId} onChange={e => setNewsForm(p => ({ ...p, companyId: e.target.value }))} />
          <select className={inp} value={newsForm.impact} onChange={e => setNewsForm(p => ({ ...p, impact: e.target.value }))}>
            <option value="neutral">📢 일반 공시</option>
            <option value="positive">📈 호재</option>
            <option value="negative">📉 악재</option>
          </select>
          <button onClick={sendNews} className={btnPri}>📰 공시 발행</button>
        </div>
      )}

      {/* 배당 탭 */}
      {tab === "dividend" && (
        <div className="px-4 mt-3 space-y-2">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            💡 배당금은 회사 지갑에서 자동으로 지급됩니다. 회사 지갑 잔액이 충분한지 먼저 확인하세요.
          </div>
          <input className={inp} placeholder="회사 ID *" value={divForm.companyId} onChange={e => setDivForm(p => ({ ...p, companyId: e.target.value }))} />
          <input type="number" className={inp} placeholder="총 배당 금액 *" value={divForm.totalAmount} onChange={e => setDivForm(p => ({ ...p, totalAmount: e.target.value }))} />
          <input className={inp} placeholder="배당 메모 (선택)" value={divForm.memo} onChange={e => setDivForm(p => ({ ...p, memo: e.target.value }))} />
          <button onClick={executeDividend} className={btnPri}>💰 배당 실행</button>
        </div>
      )}

      {/* 회사 등록 탭 (관리자 직접 등록) */}
      {tab === "create" && (
        <div className="px-4 mt-3 space-y-2">
          <div className="flex gap-2">
            <input className={inp + " flex-1"} placeholder="회사명 *" value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} />
            <input className="w-16 px-2 py-2.5 rounded-xl border border-gray-200 text-center text-xl outline-none" value={createForm.logoEmoji} onChange={e => setCreateForm(p => ({ ...p, logoEmoji: e.target.value }))} />
          </div>
          <textarea className={inp + " resize-none"} rows={2} placeholder="사업 소개" value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} />
          <textarea className={inp + " resize-none"} rows={2} placeholder="사업 계획" value={createForm.businessPlan} onChange={e => setCreateForm(p => ({ ...p, businessPlan: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" className={inp} placeholder="총 주식 수 *" value={createForm.totalShares} onChange={e => setCreateForm(p => ({ ...p, totalShares: e.target.value }))} />
            <input type="number" className={inp} placeholder="IPO 가격 *" value={createForm.ipoPrice} onChange={e => setCreateForm(p => ({ ...p, ipoPrice: e.target.value }))} />
          </div>
          <select className={inp} value={createForm.assetTypeId} onChange={e => setCreateForm(p => ({ ...p, assetTypeId: e.target.value }))}>
            <option value="">코인 종류 선택 *</option>
            {orgCoins.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.symbol}){c.org_name ? ` — ${c.org_name}` : ""}
              </option>
            ))}
          </select>
          <button onClick={createCompany} className={btnPri}>🏢 회사 등록 (즉시 상장)</button>
        </div>
      )}
    </div>
  );
}
