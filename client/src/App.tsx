import { useState, useEffect } from "react";
import { api, getToken, setToken, setUser, clearToken, getUser } from "./api";
import Market from "./pages/Market";
import Company from "./pages/Company";
import Portfolio from "./pages/Portfolio";
import News from "./pages/News";
import Admin from "./pages/Admin";

type Page = "market" | "portfolio" | "news" | "admin";

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username || !password) return setError("아이디와 비밀번호를 입력해주세요");
    setLoading(true);
    setError("");
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (data.token) {
      setToken(data.token);
      setUser(data.user);
      onLogin();
    } else {
      setError(data.error || "로그인에 실패했습니다");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-6xl mb-3">📈</p>
          <h1 className="text-3xl font-black text-gray-800">두런허브스탁</h1>
          <p className="text-gray-400 text-sm mt-1">학생 창업 투자 플랫폼</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
          <p className="font-bold text-gray-700 text-sm mb-1">🔐 로그인</p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="아이디"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="비밀번호"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
          />
          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-3 bg-indigo-500 text-white rounded-xl font-black text-sm disabled:opacity-50"
          >
            {loading ? "⏳ 로그인 중..." : "로그인"}
          </button>

          <div className="pt-2 border-t border-gray-50">
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              두런 허브 또는 두런 코인 계정으로 로그인하세요.<br />
              <a href="https://dorunhub.com" className="text-indigo-400 underline">dorunhub.com</a>에서 계정을 만들 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());
  const [page, setPage] = useState<Page>("market");
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const user = getUser();
  const isAdmin = ["관리자", "org_issuer", "platform_admin"].includes(user?.role || "");

  // SSO 자동 로그인
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get("sso_token");
    const next = params.get("next");

    if (ssoToken) {
      api(`/api/auth/sso?sso_token=${ssoToken}`).then(data => {
        if (data.token) {
          setToken(data.token);
          setUser(data.user);
          setLoggedIn(true);
          if (next === "admin") setPage("admin");
          window.history.replaceState({}, "", window.location.pathname);
        }
        setLoading(false);
      });
    } else if (getToken()) {
      api("/api/auth/me").then(data => {
        if (data.error) {
          clearToken();
          setLoggedIn(false);
        } else {
          setUser(data);
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center text-gray-400">
        <p className="text-5xl mb-3">📈</p>
        <p className="text-lg font-bold text-gray-600">두런허브스탁</p>
        <p className="text-sm mt-1">불러오는 중...</p>
      </div>
    </div>
  );

  if (!loggedIn) return <LoginScreen onLogin={() => setLoggedIn(true)} />;

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
      {selectedCompany ? (
        <Company companyId={selectedCompany} onBack={() => setSelectedCompany(null)} />
      ) : (
        <>
          {page === "market" && <Market onSelect={setSelectedCompany} onLogout={() => { clearToken(); setLoggedIn(false); }} />}
          {page === "portfolio" && <Portfolio />}
          {page === "news" && <News />}
          {page === "admin" && <Admin />}
        </>
      )}

      {!selectedCompany && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30 max-w-lg mx-auto">
          <div className="flex">
            {[
              { key: "market", icon: "📈", label: "시장" },
              { key: "portfolio", icon: "💼", label: "포트폴리오" },
              { key: "news", icon: "📰", label: "공시" },
              ...(isAdmin ? [{ key: "admin", icon: "⚙️", label: "관리" }] : []),
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setPage(tab.key as Page)}
                className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition
                  ${page === tab.key ? "text-indigo-600" : "text-gray-400"}`}
              >
                <span className="text-xl">{tab.icon}</span>
                <span className="text-[10px] font-bold">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
