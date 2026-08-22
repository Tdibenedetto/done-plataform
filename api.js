const API_URL = import.meta.env.VITE_API_URL || "/api";

function authHeaders() {
  const token = localStorage.getItem("done-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = "GET", body, isForm = false } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: isForm ? authHeaders() : { "Content-Type": "application/json", ...authHeaders() },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro desconhecido." }));
    throw new Error(err.error || "Erro desconhecido.");
  }
  return res.json();
}

export const api = {
  register: (data) => request("/auth/register", { method: "POST", body: data }),
  login: (data) => request("/auth/login", { method: "POST", body: data }),

  coachSubmit: (data) => request("/coach/submit", { method: "POST", body: data }),
  coachLatest: () => request("/coach/latest"),

  leadsList: () => request("/leads"),
  leadCreate: (data) => request("/leads", { method: "POST", body: data }),
  leadUpdate: (id, data) => request(`/leads/${id}`, { method: "PATCH", body: data }),
  leadDelete: (id) => request(`/leads/${id}`, { method: "DELETE" }),

  goalsList: () => request("/goals"),
  goalSet: (data) => request("/goals", { method: "PUT", body: data }),

  gestaoUpload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/gestao/upload", { method: "POST", body: form, isForm: true });
  },
  gestaoLatest: () => request("/gestao/latest"),

  checkout: (product) => request("/billing/checkout", { method: "POST", body: { product } }),
};

export function saveSession(token, user) {
  localStorage.setItem("done-token", token);
  localStorage.setItem("done-user", JSON.stringify(user));
}
export function loadSession() {
  const token = localStorage.getItem("done-token");
  const userRaw = localStorage.getItem("done-user");
  return token && userRaw ? { token, user: JSON.parse(userRaw) } : null;
}
export function clearSession() {
  localStorage.removeItem("done-token");
  localStorage.removeItem("done-user");
}
