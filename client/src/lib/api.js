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
  coachTrackToggle: (resultId, itemKey, done) => request(`/coach/track/${resultId}`, { method: "PATCH", body: { itemKey, done } }),

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
  gestaoAll: () => request("/gestao/all"),
  gestaoGoals: () => request("/gestao/goals"),
  gestaoGoalSet: (data) => request("/gestao/goals", { method: "PUT", body: data }),

  checkout: (product) => request("/billing/checkout", { method: "POST", body: { product } }),
  billingStatus: () => request("/billing/status"),
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

// Equipe / convites (adicionado na evolução multiusuário)
Object.assign(api, {
  teamGet: () => request("/team"),
  teamInvite: (email) => request("/team/invite", { method: "POST", body: { email } }),
  teamRevokeInvite: (id) => request(`/team/invite/${id}`, { method: "DELETE" }),
  teamRemoveMember: (id) => request(`/team/member/${id}`, { method: "DELETE" }),
  inviteInfo: (token) => request(`/auth/invite/${token}`),
  inviteAccept: (token, data) => request(`/auth/invite/${token}/accept`, { method: "POST", body: data }),
  leadNotesList: (id) => request(`/leads/${id}/notes`),
  leadNoteAdd: (id, content) => request(`/leads/${id}/notes`, { method: "POST", body: { content } }),
  leadInvoice: (id, amount) => request(`/leads/${id}/invoice`, { method: "POST", body: { amount } }),
  creditoList: () => request("/credito"),
  creditoCnpj: (cnpj) => request("/credito/cnpj", { method: "POST", body: { cnpj } }),
  creditoBalanco: (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return request(`/credito/${id}/balanco`, { method: "POST", body: form, isForm: true });
  },
  chatThread: () => request("/chat/thread"),
  chatSend: (content) => request("/chat/message", { method: "POST", body: { content } }),
  chatEscalate: () => request("/chat/escalate", { method: "POST" }),
  chatThreadsInbox: () => request("/chat/threads"),
  chatThreadGet: (id) => request(`/chat/threads/${id}`),
  chatThreadReply: (id, content) => request(`/chat/threads/${id}/reply`, { method: "POST", body: { content } }),
  chatThreadResolve: (id) => request(`/chat/threads/${id}/resolve`, { method: "POST" }),
  teamSetPhone: (phone) => request("/team/phone", { method: "PATCH", body: { phone } }),
  teamSetFollowupDays: (followUpDays) => request("/team/followup-settings", { method: "PATCH", body: { followUpDays } }),
  teamFollowupTest: () => request("/team/followup-test", { method: "POST" }),
  dreList: () => request("/dre"),
  dreAdd: (data) => request("/dre", { method: "POST", body: data }),
  dreDelete: (id) => request(`/dre/${id}`, { method: "DELETE" }),
  dreSetSaldoInicial: (saldoInicial) => request("/dre/saldo-inicial", { method: "PUT", body: { saldoInicial } }),
});

