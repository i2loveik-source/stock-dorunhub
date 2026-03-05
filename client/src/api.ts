/** 두런허브스탁 API 유틸 */
const API_BASE = (window as any).__STOCK_API_BASE || "";

export function getToken(): string | null {
  return localStorage.getItem("stock_token");
}

export function setToken(token: string) {
  localStorage.setItem("stock_token", token);
}

export function clearToken() {
  localStorage.removeItem("stock_token");
  localStorage.removeItem("stock_user");
}

export function getUser(): any {
  const s = localStorage.getItem("stock_user");
  return s ? JSON.parse(s) : null;
}

export function setUser(user: any) {
  localStorage.setItem("stock_user", JSON.stringify(user));
}

export async function api(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (res.status === 401) {
    clearToken();
    window.location.href = "/";
  }
  return data;
}

export function formatNum(n: number | string, decimals = 0): string {
  return parseFloat(String(n || 0)).toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function changeColor(rate: number): string {
  if (rate > 0) return "text-red-500";
  if (rate < 0) return "text-blue-500";
  return "text-gray-500";
}

export function changeBg(rate: number): string {
  if (rate > 0) return "bg-red-50 text-red-600 border-red-200";
  if (rate < 0) return "bg-blue-50 text-blue-600 border-blue-200";
  return "bg-gray-50 text-gray-500 border-gray-200";
}

export function changeArrow(rate: number): string {
  if (rate > 0) return "▲";
  if (rate < 0) return "▼";
  return "–";
}
