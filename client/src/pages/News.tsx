import { useEffect, useState } from "react";
import { api, getUser } from "../api";

type FilterKey = "all" | "positive" | "negative" | "neutral";

const FILTER_TABS: [FilterKey, string, string][] = [
  ["all",      "전체",   "bg-gray-100 text-gray-600"],
  ["positive", "📈 호재", "bg-red-100 text-red-600"],
  ["negative", "📉 악재", "bg-blue-100 text-blue-600"],
  ["neutral",  "📢 공시", "bg-gray-100 text-gray-600"],
];

export default function News() {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const user = getUser();

  useEffect(() => {
    api(`/api/news?orgId=${user?.orgId || ""}`).then(d => {
      if (Array.isArray(d)) setNews(d);
      setLoading(false);
    });
  }, []);

  const impactStyle = (impact: string) =>
    impact === "positive" ? "bg-red-50 border-red-200 text-red-700"
    : impact === "negative" ? "bg-blue-50 border-blue-200 text-blue-700"
    : "bg-gray-50 border-gray-200 text-gray-600";

  const impactLabel = (impact: string) =>
    impact === "positive" ? "📈 호재"
    : impact === "negative" ? "📉 악재"
    : "📢 공시";

  const filtered = news.filter(n => {
    const matchFilter = filter === "all" || n.impact === filter;
    const matchSearch = !search || n.title?.includes(search) || n.company_name?.includes(search) || n.content?.includes(search);
    return matchFilter && matchSearch;
  });

  const counts = {
    all: news.length,
    positive: news.filter(n => n.impact === "positive").length,
    negative: news.filter(n => n.impact === "negative").length,
    neutral: news.filter(n => n.impact === "neutral").length,
  };

  return (
    <div className="pb-24 bg-[#F4F6FA] min-h-screen">
      {/* 헤더 */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10 shadow-sm">
        <h2 className="font-black text-xl text-gray-800">📰 공시 뉴스</h2>
        <p className="text-xs text-gray-400">기업 공시와 시장 뉴스</p>
      </div>

      {/* 검색 */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="제목, 회사명 검색..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white border border-gray-200 text-gray-800 placeholder-gray-400 outline-none focus:border-blue-300"
          />
        </div>
      </div>

      {/* 카테고리 필터 탭 */}
      <div className="px-4 pb-3 flex gap-2">
        {FILTER_TABS.map(([key, label, style]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition border
              ${filter === key
                ? key === "positive" ? "bg-red-500 text-white border-red-500"
                  : key === "negative" ? "bg-blue-500 text-white border-blue-500"
                  : "bg-gray-700 text-white border-gray-700"
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className={`ml-1 ${filter === key ? "opacity-70" : "opacity-50"}`}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 뉴스 목록 */}
      <div className="px-4 space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-2xl shadow-sm">
            <p className="text-4xl mb-2">⏳</p>
            <p>불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-2xl shadow-sm">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-sm font-medium">
              {search ? "검색 결과가 없습니다" : "공시가 없습니다"}
            </p>
          </div>
        ) : filtered.map(n => (
          <div key={n.id} className={`rounded-2xl p-4 border ${impactStyle(n.impact)}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-bold">{impactLabel(n.impact)}</span>
                  {n.company_name && (
                    <span className="text-xs bg-white bg-opacity-60 px-2 py-0.5 rounded-full font-medium">
                      {n.company_name}
                    </span>
                  )}
                </div>
                <p className="font-black text-sm leading-snug">{n.title}</p>
                {n.content && (
                  <p className="text-xs mt-1.5 opacity-70 leading-relaxed line-clamp-3">{n.content}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-current border-opacity-10">
              <p className="text-[10px] opacity-50">
                {n.author_fullname || n.author_name}
              </p>
              <p className="text-[10px] opacity-50">
                {new Date(n.created_at).toLocaleString("ko-KR", {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
