const API_URL = import.meta.env.VITE_API_URL || "/api";

function authHeaders() {
  const token = localStorage.getItem("done-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Erro de chamada ao servidor, com o código HTTP junto — é isso que permite às telas diferenciar
// "seu plano não inclui isto" (402) de "a internet caiu" ou "o servidor falhou". Antes, QUALQUER
// erro virava a tela de "exclusivo para assinantes", inclusive para quem estava pagando.
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0 = não chegou no servidor (sem internet / servidor fora do ar)
    this.code = code || null;
  }
}
// true só quando o servidor respondeu que o plano não cobre o recurso (ou o pagamento está pendente).
export const isPlanLocked = (e) => e?.status === 402;

const NETWORK_MESSAGE = "Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.";
const SERVER_MESSAGE = "O servidor não respondeu como esperado. Tente de novo em instantes.";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(path, { method = "GET", body, isForm = false } = {}) {
  // Leituras (GET) são repetidas sozinhas em caso de falha passageira — rede oscilando ou servidor
  // reiniciando numa publicação. Gravações nunca são repetidas, para não duplicar nada.
  const attempts = method === "GET" ? 3 : 1;
  const hadToken = !!localStorage.getItem("done-token");

  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API_URL}${path}`, {
        method,
        headers: isForm ? authHeaders() : { "Content-Type": "application/json", ...authHeaders() },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      });
    } catch {
      if (attempt < attempts) { await sleep(1200 * attempt); continue; }
      throw new ApiError(NETWORK_MESSAGE, 0, "network");
    }
    if ([502, 503, 504].includes(res.status) && attempt < attempts) { await sleep(1200 * attempt); continue; }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // Sessão vencida ou inválida: volta para o login com um aviso, em vez de mostrar telas quebradas.
      if (res.status === 401 && hadToken && !path.startsWith("/auth/")) {
        window.dispatchEvent(new Event("done-session-expired"));
        throw new ApiError("Sua sessão expirou. Entre de novo.", 401, "session_expired");
      }
      throw new ApiError(err.error || (res.status >= 500 ? SERVER_MESSAGE : "Não foi possível concluir a ação."), res.status, err.code);
    }
    return res.json();
  }
}

export const api = {
  register: (data) => request("/auth/register", { method: "POST", body: data }),
  login: (data) => request("/auth/login", { method: "POST", body: data }),
  forgotPassword: (email) => request("/auth/forgot", { method: "POST", body: { email } }),
  resetInfo: (token) => request(`/auth/reset/${token}`),
  resetPassword: (token, password) => request(`/auth/reset/${token}`, { method: "POST", body: { password } }),

  coachSubmit: (data) => request("/coach/submit", { method: "POST", body: data }),
  coachLatest: () => request("/coach/latest"),
  coachHistory: () => request("/coach/history"),
  coachGenerateReport: (resultId) => request(`/coach/${resultId}/generate-report`, { method: "POST" }),
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

  produtosList: (criterio) => request(`/produtos${criterio ? "?criterio=" + criterio : ""}`),
  produtosGet: (id) => request(`/produtos/${id}`),
  produtosCreate: (data) => request("/produtos", { method: "POST", body: data }),
  produtosUpdate: (id, data) => request(`/produtos/${id}`, { method: "PUT", body: data }),
  produtosDelete: (id) => request(`/produtos/${id}`, { method: "DELETE" }),
  produtosSetAbcCriterio: (criterio) => request("/produtos/preferencias/abc-criterio", { method: "PUT", body: { criterio } }),
  produtosUpload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/produtos/upload", { method: "POST", body: form, isForm: true });
  },

  checkout: (product) => request("/billing/checkout", { method: "POST", body: { product } }),
  billingStatus: () => request("/billing/status"),
  billingConfirm: (sessionId) => request(`/billing/confirm?session_id=${encodeURIComponent(sessionId)}`),
  billingPortal: (module) => request("/billing/portal", { method: "POST", body: { module } }),
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
  leadItemsList: (id) => request(`/leads/${id}/items`),
  leadItemAdd: (id, sku, quantidade) => request(`/leads/${id}/items`, { method: "POST", body: { sku, quantidade } }),
  leadItemRemove: (id, itemId) => request(`/leads/${id}/items/${itemId}`, { method: "DELETE" }),
  creditoList: () => request("/credito"),
  creditoCnpj: (cnpj) => request("/credito/cnpj", { method: "POST", body: { cnpj } }),
  clientesList: () => request("/clientes"),
  clientesGet: (id) => request(`/clientes/${id}`),
  clientesCreate: (cnpj, razaoSocial) => request("/clientes", { method: "POST", body: { cnpj, razaoSocial } }),
  clientesSetLimite: (id, novoLimite) => request(`/clientes/${id}/limite`, { method: "PUT", body: { novoLimite } }),
  clientesSetStatus: (id, status, motivo) => request(`/clientes/${id}/status`, { method: "PUT", body: { status, motivo } }),
  clientesSetGrupo: (id, grupoEconomicoId) => request(`/clientes/${id}/grupo`, { method: "PUT", body: { grupoEconomicoId: grupoEconomicoId || null } }),
  gruposList: () => request("/grupos"),
  gruposGet: (id) => request(`/grupos/${id}`),
  gruposCreate: (nome) => request("/grupos", { method: "POST", body: { nome } }),
  gruposSetLimite: (id, novoLimite) => request(`/grupos/${id}/limite`, { method: "PUT", body: { novoLimite } }),
  gruposDelete: (id) => request(`/grupos/${id}`, { method: "DELETE" }),
  clientesSetFaturamentoAnterior: (id, valor) => request(`/clientes/${id}/faturamento-anterior`, { method: "PUT", body: { valor } }),
  // Aceita um arquivo ou vários (Balanço e DRE juntos).
  creditoBalanco: (id, files) => {
    const form = new FormData();
    for (const f of Array.isArray(files) ? files : [files]) form.append("files", f);
    return request(`/credito/${id}/balanco`, { method: "POST", body: form, isForm: true });
  },
  creditoSetMonitoring: (id, monitoring) => request(`/credito/${id}/monitoring`, { method: "PATCH", body: { monitoring } }),
  creditoMonitorTest: () => request("/credito/monitor-test", { method: "POST" }),
  chatThread: () => request("/chat/thread"),
  chatSend: (content) => request("/chat/message", { method: "POST", body: { content } }),
  chatEscalate: () => request("/chat/escalate", { method: "POST" }),
  chatThreadsInbox: () => request("/chat/threads"),
  chatThreadGet: (id) => request(`/chat/threads/${id}`),
  chatThreadReply: (id, content) => request(`/chat/threads/${id}/reply`, { method: "POST", body: { content } }),
  chatThreadResolve: (id) => request(`/chat/threads/${id}/resolve`, { method: "POST" }),
  teamSetPhone: (phone) => request("/team/phone", { method: "PATCH", body: { phone } }),
  teamSetFollowupDays: (followUpDays) => request("/team/followup-settings", { method: "PATCH", body: { followUpDays } }),
  teamSetLogo: (logoUrl) => request("/team/logo", { method: "PATCH", body: { logoUrl } }),
  tabelaPublicaStatus: () => request("/produtos/tabela-publica"),
  tabelaPublicaGerar: () => request("/produtos/tabela-publica/gerar", { method: "POST" }),
  tabelaPublicaRevogar: () => request("/produtos/tabela-publica", { method: "DELETE" }),
  // precos.donestrategy.com aponta pro mesmo done-api (domínio dedicado só pra deixar o link
  // bonito) — continua funcionando pelo endereço antigo também, essa é só a forma preferida.
  tabelaPublicaUrl: (slug, token) => `https://precos.donestrategy.com/tabela/${encodeURIComponent(slug || "empresa")}/${token}`,
  teamFollowupTest: () => request("/team/followup-test", { method: "POST" }),
  teamGrantTestAccess: (modules) => request("/team/grant-test-access", { method: "POST", body: { modules } }),
  teamWeeklyReportTest: () => request("/team/weekly-report-test", { method: "POST" }),
  dreList: () => request("/dre"),
  dreUpload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/dre/upload", { method: "POST", body: form, isForm: true });
  },
  dreAdd: (data) => request("/dre", { method: "POST", body: data }),
  dreDelete: (id) => request(`/dre/${id}`, { method: "DELETE" }),
  dreSetSaldoInicial: (saldoInicial) => request("/dre/saldo-inicial", { method: "PUT", body: { saldoInicial } }),
  adminOverview: () => request("/admin/overview"),
  adminClients: () => request("/admin/clients"),
  adminActivationRisk: () => request("/admin/activation-risk"),
  adminGenerateTrialLink: (organizationId, product, trialDays) => request("/billing/admin-checkout-link", { method: "POST", body: { organizationId, product, trialDays } }),
  adminSetWhatsappNumber: (organizationId, whatsappNumber) => request(`/admin/clients/${organizationId}/whatsapp-number`, { method: "PUT", body: { whatsappNumber } }),
  adminRenameClient: (organizationId, name) => request(`/admin/clients/${organizationId}/rename`, { method: "PUT", body: { name } }),
  adminDeleteClient: (organizationId, confirmName) => request(`/admin/clients/${organizationId}`, { method: "DELETE", body: { confirmName } }),
  adminBackfillClientes: () => request("/admin/backfill-clientes", { method: "POST" }),
});

