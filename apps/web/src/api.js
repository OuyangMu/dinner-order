const API_BASE = "";
export function token() {
    return localStorage.getItem("adminToken") || "";
}
export async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (!(options.body instanceof FormData))
        headers.set("Content-Type", "application/json");
    if (token())
        headers.set("Authorization", `Bearer ${token()}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "请求失败" }));
        throw new Error(error.message || "请求失败");
    }
    return response.json();
}
