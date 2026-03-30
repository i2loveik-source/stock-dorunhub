import { useEffect, useState } from "react";
import { api, formatNum, getUser } from "../api";

type AdminTab = "ipo" | "market" | "settings" | "financial" | "notice";

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>("ipo");
  const [pending, setPending] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [allCompanies, setAllCompanies] = useState<any[]>([]); // 상장폐지 포함 전체
  const [msg, setMsg] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  // 회사 편집 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", logoEmoji: "" });
  // 실적 입력 상태
  const [finCompanyId, setFinCompanyId] = useState("");
  const [finForm, setFinForm] = useState({ period: "", revenue: "", operatingProfit: "", netIncome: "", eps: "", notes: "" });
  const [finMsg, setFinMsg] = useState("");
  const [finReports, setFinReports] = useState<any[]>([]);
  const user = getUser();

  const allowedRoles = ["관리자", "org_issuer", "platform_admin"];
  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F6FA]">
        <div className="text-center p-8">
          <p className="text-5xl mb-3">🔒</p>
          <p className="text-lg font-black text-gray-700">관리자 전용 페이지</p>
          <p className="text-sm mt-2 text-gray-400">관리자 계정으로 로그인 후 이용해주세요.</p>
        </div>
      </div>
    );
  }

  const loadPending = async () => {
    const data = await api("/api/companies/pending");
    if (Array.isArray(data)) setPending(data);
  };

  const loadCompanies = async () => {
    const data = await api("/api/companies");
    if (Array.isArray(data)) setCompanies(data.filter((c: any) => c.status !== "pending"));
  };

  const loadAllCompanies = async () => {
    const data = await api("/api/companies/admin/all");
    if (Array.isArray(data)) setAllCompanies(data);
  };

  const loadSettings = async () => {
    const data = await api("/api/settings");
    if (data && !data.error) setSettings(data);
  };

  const saveSettings = async () => {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const loadFinReports = async (companyId: string) => {
    if (!companyId) return;
    const data = await api(`/api/financial-reports/${companyId}`);
    if (Array.isArray(data)) setFinReports(data);
  };

  const submitFinancial = async () => {
    if (!finCompanyId || !finForm.period) {
      return setFinMsg("❌ 회사와 분기 기간은 필수입니다");
    }
    const r = await api("/api/financial-reports", {
      method: "POST",
      body: JSON.stringify({ companyId: parseInt(finCompanyId), ...finForm }),
    });
    if (r.error) setFinMsg("❌ " + r.error);
    else {
      setFinMsg("✅ 실적 저장 완료!");
      setFinForm({ period: "", revenue: "", operatingProfit: "", netIncome: "", eps: "", notes: "" });
      loadFinReports(finCompanyId);
    }
  };

  const deleteFinReport = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await api(`/api/financial-reports/${id}`, { method: "DELETE" });
    loadFinReports(finCompanyId);
  };

  useEffect(() => {
    loadPending();
    loadCompanies();
    loadAllCompanies();
  }, []);

  useEffect(() => {
    if (tab === "settings") loadSettings();
    if (tab === "financial") loadCompanies();
    if (tab === "market") loadAllCompanies();
  }, [tab]);

  useEffect(() => {
    if (finCompanyId) loadFinReports(finCompanyId);
  }, [finCompanyId]);

  const showMsg = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 4000);
  };

  const approve = async (id: number) => {
    setLoading(true);
    const r = await api(`/api/companies/${id}/approve`, { method: "POST" });
    setLoading(false);
    showMsg(r.error ? "❌ " + r.error : "✅ IPO 승인 완료!");
    loadPending();
    loadCompanies();
  };

  const reject = async (id: number) => {
    const reason = prompt("거절 사유를 입력하세요:");
    if (!reason) return;
    setLoading(true);
    await api(`/api/companies/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
    setLoading(false);
    showMsg("거절 처리 완료");
    loadPending();
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditForm({ name: c.name || "", description: c.description || "", logoEmoji: c.logo_emoji || "🏢" });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setLoading(true);
    const r = await api(`/api/companies/${editingId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description,
        logoEmoji: editForm.logoEmoji,
      }),
    });
    setLoading(false);
    setEditingId(null);
    if (r.error) showMsg("❌ " + r.error);
    else { showMsg("✅ 수정 완료!"); loadAllCompanies(); }
  };

  const deleteCompany = async (id: number, name: string) => {
    if (!confirm(`"${name}" 회사를 완전히 삭제하시겠습니까?\n주문, 거래내역, 보유주식 등 모든 데이터가 삭제됩니다.`)) return;
    setLoading(true);
    const r = await api(`/api/companies/${id}`, { method: "DELETE" });
    setLoading(false);
    if (r.error) showMsg("❌ " + r.error);
    else { showMsg("🗑 삭제 완료"); loadAllCompanies(); }
  };

  const updateStatus = async (id: number, status: string) => {
    const actionMap: Record<string, string> = {
      suspended: "거래정지",
      listed: "거래재개",
      delisted: "상장폐지",
    };
    const label = actionMap[status] || status;
    if (!confirm(`${label} 처리하시겠습니까?`)) return;
    setLoading(true);
    const r = await api(`/api/companies/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (r.error) showMsg("❌ " + r.error);
    else { showMsg(`✅ ${label} 처리 완료!`); loadAllCompanies(); loadCompanies(); }
  };

  const tabs: { key: AdminTab; label: string }[] = [
    { key: "ipo", label: `📋 IPO 승인${pending.length > 0 ? ` (${pending.length})` : ""}` },
    { key: "market", label: "📊 시장 관리" },
    { key: "settings", label: "⚙️ 거래 설정" },
    { key: "financial", label: "💹 실적 입력" },
    { key: "notice", label: "📢 공지 관리" },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6FA] pb-24">
      {/* 헤더 */}
      <div className="bg-white px-4 py-4 border-b border-gray-100">
        <h2 className="font-black text-xl text-gray-800">⚙️ 관리자 패널</h2>
        <p className="text-xs text-gray-400 mt-0.5">IPO 승인 · 시장 관리 · 설정</p>
      </div>

      {/* 알림 메시지 */}
      {msg && (
        <div className={`mx-4 mt-3 p-3 rounded-xl text-sm font-medium
          ${msg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
          {msg}
        </div>
      )}

      {/* 탭 바 */}
      <div className="mx-4 mt-3 bg-white rounded-2xl p-1 shadow-sm flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap
              ${tab === t.key ? "bg-indigo-500 text-white shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* IPO 승인 탭 */}
      {tab === "ipo" && (
        <div className="px-4 mt-3 space-y-3">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-2xl shadow-sm">
              <p className="text-4xl mb-2">✅</p>
              <p className="text-sm font-medium">대기 중인 IPO 신청이 없습니다</p>
            </div>
          ) : pending.map((c: any) => (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{c.logo_emoji || "🏢"}</span>
                <div className="flex-1">
                  <p className="font-black text-base text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    CEO: {c.ceo_name || c.ceo_username}
                    {c.org_name ? ` · ${c.org_name}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">IPO가</p>
                  <p className="font-black text-indigo-600 text-sm">{formatNum(c.ipo_price)} {c.coin_symbol}</p>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-gray-500 mb-3 bg-gray-50 rounded-xl px-3 py-2">
                <span>총주식: <b className="text-gray-700">{formatNum(c.total_shares)}주</b></span>
                <span>시총: <b className="text-gray-700">{formatNum(c.ipo_price * c.total_shares)} {c.coin_symbol}</b></span>
              </div>
              {c.description && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-2 mb-2">{c.description}</p>
              )}
              {c.business_plan && (
                <p className="text-xs text-gray-500 bg-blue-50 rounded-xl p-2 mb-3">{c.business_plan}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => approve(c.id)}
                  disabled={loading}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  ✅ 승인
                </button>
                <button
                  onClick={() => reject(c.id)}
                  disabled={loading}
                  className="flex-1 py-2.5 bg-red-100 text-red-600 rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  ❌ 거절
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 시장 관리 탭 */}
      {tab === "market" && (
        <div className="px-4 mt-3 space-y-3">
          {allCompanies.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-2xl shadow-sm">
              <p className="text-4xl mb-2">📊</p>
              <p className="text-sm font-medium">등록된 회사가 없습니다</p>
            </div>
          ) : allCompanies.map((c: any) => (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm p-4">
              {/* 편집 모드 */}
              {editingId === c.id ? (
                <div className="space-y-2">
                  <p className="font-black text-sm text-gray-700 mb-2">✏️ 회사 정보 수정</p>
                  <div className="flex gap-2">
                    <input
                      value={editForm.logoEmoji}
                      onChange={e => setEditForm(f => ({ ...f, logoEmoji: e.target.value }))}
                      placeholder="이모지"
                      className="w-16 border border-gray-200 rounded-xl px-2 py-2 text-center text-xl"
                    />
                    <input
                      value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="회사명"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <textarea
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="회사 설명"
                    rows={2}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={loading}
                      className="flex-1 py-2 bg-indigo-500 text-white rounded-xl font-bold text-xs disabled:opacity-50">
                      💾 저장
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs">
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{c.logo_emoji || "🏢"}</span>
                    <div className="flex-1">
                      <p className="font-black text-sm text-gray-800">{c.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                          ${c.status === "listed" ? "bg-green-100 text-green-700"
                          : c.status === "suspended" ? "bg-orange-100 text-orange-600"
                          : c.status === "pending" ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-600"}`}>
                          {c.status === "listed" ? "상장중" : c.status === "suspended" ? "거래정지"
                            : c.status === "pending" ? "승인대기" : "상장폐지"}
                        </span>
                        <span className="text-xs text-gray-400">CEO: {c.ceo_name || c.ceo_username}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-indigo-600 text-sm">{formatNum(c.current_price || 0)}</p>
                      <p className="text-xs text-gray-400">{c.coin_symbol}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {/* 상태 변경 버튼 */}
                    {c.status === "listed" && (
                      <button onClick={() => updateStatus(c.id, "suspended")} disabled={loading}
                        className="py-1.5 px-3 bg-orange-100 text-orange-600 rounded-xl font-bold text-xs disabled:opacity-50">
                        ⏸ 거래정지
                      </button>
                    )}
                    {c.status === "suspended" && (
                      <button onClick={() => updateStatus(c.id, "listed")} disabled={loading}
                        className="py-1.5 px-3 bg-green-100 text-green-700 rounded-xl font-bold text-xs disabled:opacity-50">
                        ▶ 거래재개
                      </button>
                    )}
                    {c.status !== "delisted" && c.status !== "pending" && (
                      <button onClick={() => updateStatus(c.id, "delisted")} disabled={loading}
                        className="py-1.5 px-3 bg-red-100 text-red-600 rounded-xl font-bold text-xs disabled:opacity-50">
                        🚫 상장폐지
                      </button>
                    )}
                    {/* 편집/삭제 */}
                    <button onClick={() => startEdit(c)} disabled={loading}
                      className="py-1.5 px-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs disabled:opacity-50">
                      ✏️ 수정
                    </button>
                    <button onClick={() => deleteCompany(c.id, c.name)} disabled={loading}
                      className="py-1.5 px-3 bg-gray-100 text-gray-500 rounded-xl font-bold text-xs disabled:opacity-50">
                      🗑 삭제
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 거래 설정 탭 */}
      {tab === "settings" && (
        <div className="space-y-4 px-4 pb-4">
          {/* 거래 활성화 토글 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-black text-sm text-gray-700 mb-3">🔴 거래 활성화</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">전체 거래 허용</span>
              <button
                onClick={() => setSettings(s => ({...s, trading_enabled: s.trading_enabled === "true" ? "false" : "true"}))}
                className={`w-12 h-6 rounded-full transition-colors ${settings.trading_enabled === "true" ? "bg-emerald-500" : "bg-gray-300"}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${settings.trading_enabled === "true" ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
          </div>

          {/* 수수료 설정 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-black text-sm text-gray-700 mb-3">💸 거래 수수료</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">수수료율 (%)</span>
              <input
                type="number" step="0.1" min="0" max="10"
                value={settings.fee_rate || "0.3"}
                onChange={e => setSettings(s => ({...s, fee_rate: e.target.value}))}
                className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
              />
            </div>
          </div>

          {/* 서킷브레이커 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-black text-sm text-gray-700 mb-3">⚡ 서킷브레이커</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">상한 (%)</span>
                <input
                  type="number" step="1" min="1" max="100"
                  value={settings.circuit_up || "30"}
                  onChange={e => setSettings(s => ({...s, circuit_up: e.target.value}))}
                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">하한 (%)</span>
                <input
                  type="number" step="1" min="1" max="100"
                  value={settings.circuit_down || "30"}
                  onChange={e => setSettings(s => ({...s, circuit_down: e.target.value}))}
                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
                />
              </div>
            </div>
          </div>

          {/* 일일 가격 제한 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-black text-sm text-gray-700 mb-3">📊 일일 가격 제한</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">상한가 (%)</span>
                <input type="number" step="1" min="1" max="100"
                  value={settings.daily_price_limit_up || "30"}
                  onChange={e => setSettings(s => ({...s, daily_price_limit_up: e.target.value}))}
                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">하한가 (%)</span>
                <input type="number" step="1" min="1" max="100"
                  value={settings.daily_price_limit_down || "30"}
                  onChange={e => setSettings(s => ({...s, daily_price_limit_down: e.target.value}))}
                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
                />
              </div>
            </div>
          </div>

          {/* 주문 수량 제한 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-black text-sm text-gray-700 mb-3">🔢 주문 수량 제한</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">최소 주문 수량</span>
                <input type="number" step="1" min="1"
                  value={settings.min_order_qty || "1"}
                  onChange={e => setSettings(s => ({...s, min_order_qty: e.target.value}))}
                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">최대 주문 수량</span>
                <input type="number" step="1" min="1"
                  value={settings.max_order_qty || "1000"}
                  onChange={e => setSettings(s => ({...s, max_order_qty: e.target.value}))}
                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
                />
              </div>
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={saveSettings}
            className="w-full py-3 bg-blue-600 text-white rounded-2xl font-black text-sm"
          >
            {settingsSaved ? "✅ 저장됨" : "💾 설정 저장"}
          </button>
        </div>
      )}

      {/* 실적 입력 탭 */}
      {tab === "financial" && (
        <div className="px-4 mt-3 space-y-4 pb-4">
          {/* 회사 선택 */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-black text-sm text-gray-700 mb-2">🏢 회사 선택</p>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              value={finCompanyId}
              onChange={e => setFinCompanyId(e.target.value)}
            >
              <option value="">회사를 선택하세요...</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.coin_symbol})</option>
              ))}
            </select>
          </div>

          {finCompanyId && (
            <>
              {/* 실적 입력 폼 */}
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="font-black text-sm text-gray-700 mb-3">📝 실적 데이터 입력</p>
                {finMsg && (
                  <div className={`mb-3 p-3 rounded-xl text-sm font-medium ${finMsg.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                    {finMsg}
                  </div>
                )}
                <div className="space-y-2.5">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">기간 (예: 2025-Q1) *</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                      placeholder="2025-Q1"
                      value={finForm.period}
                      onChange={e => setFinForm(p => ({ ...p, period: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["revenue", "매출"],
                      ["operatingProfit", "영업이익"],
                      ["netIncome", "순이익"],
                      ["eps", "주당순이익(EPS)"],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                        <input type="number"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                          placeholder="0"
                          value={(finForm as any)[key]}
                          onChange={e => setFinForm(p => ({ ...p, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">비고 (선택)</label>
                    <textarea
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
                      rows={2}
                      placeholder="실적 관련 코멘트..."
                      value={finForm.notes}
                      onChange={e => setFinForm(p => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                </div>
                <button
                  onClick={submitFinancial}
                  className="w-full mt-3 py-3 bg-indigo-500 text-white rounded-xl font-black text-sm hover:bg-indigo-600 transition"
                >
                  💾 실적 저장
                </button>
              </div>

              {/* 기존 실적 목록 */}
              {finReports.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">등록된 실적</p>
                  {finReports.map(r => (
                    <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-black text-sm text-gray-800">{r.period}</span>
                        <button onClick={() => deleteFinReport(r.id)}
                          className="text-xs text-gray-400 border border-gray-200 rounded-lg px-2 py-1 hover:bg-red-50 hover:text-red-500 transition">
                          삭제
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {[["매출", r.revenue], ["영업이익", r.operating_profit], ["순이익", r.net_income], ["EPS", r.eps]].map(([k, v]) => (
                          <div key={String(k)} className="flex justify-between">
                            <span className="text-gray-400">{k}</span>
                            <span className="font-bold text-gray-700">{formatNum(Number(v))}</span>
                          </div>
                        ))}
                      </div>
                      {r.notes && <p className="text-[10px] text-gray-400 mt-2 bg-gray-50 rounded-lg p-2">{r.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 공지 관리 탭 (더미) */}
      {tab === "notice" && (
        <div className="px-4 mt-3 space-y-3">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-black text-sm text-gray-700 mb-2">📢 공지 관리</p>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
              💡 공지 관리 기능은 추후 업데이트 예정입니다.<br />
              현재는 공시(뉴스) 기능을 통해 공지사항을 전달하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
