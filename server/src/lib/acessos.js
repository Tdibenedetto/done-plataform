// Áreas da empresa e módulos que o master pode liberar para cada colaborador.
export const AREAS = ["vendas", "produtos", "marketing", "administrativo", "financeiro", "logistica", "diretoria", "outra"];
export const MODULOS = ["coach", "vendas", "gestao", "credito", "sortimento", "dre"];
// Membros criados antes desta mudança continuam vendo o que já viam (Coach, Vendas e Crédito).
export const MODULOS_PADRAO_MEMBRO = ["coach", "vendas", "credito"];

export function limparArea(raw) {
  const a = String(raw || "").trim().toLowerCase();
  return AREAS.includes(a) ? a : null;
}
export function limparModulos(raw) {
  if (!Array.isArray(raw)) return null;
  return MODULOS.filter((m) => raw.includes(m));
}
export function modulosDoUsuario(user) {
  if (!user) return [];
  if (user.role === "master") return [...MODULOS];
  const lista = limparModulos(user.modulos);
  return lista ?? [...MODULOS_PADRAO_MEMBRO];
}
