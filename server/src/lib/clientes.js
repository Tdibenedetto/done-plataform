import { prisma } from "./prisma.js";

export function normalizeCnpj(raw) {
  return (raw || "").replace(/\D/g, "");
}

// Encontra o Cliente já existente com esse CNPJ nesta organização, ou cria um novo — é o
// vínculo que faz Vendas e Crédito falarem da mesma empresa, em vez de cada um ter seu
// próprio "nome" solto sem relação entre si. Usado tanto na consulta de CNPJ (Crédito)
// quanto ao vincular um Lead a um cliente (Vendas).
export async function findOrCreateCliente(organizationId, cnpjRaw, razaoSocialFallback) {
  const cnpj = normalizeCnpj(cnpjRaw);
  if (cnpj.length !== 14) return { error: "CNPJ inválido — precisa ter 14 dígitos." };

  let cliente = await prisma.cliente.findUnique({ where: { organizationId_cnpj: { organizationId, cnpj } } });
  if (!cliente) {
    cliente = await prisma.cliente.create({
      data: { organizationId, cnpj, razaoSocial: razaoSocialFallback || cnpj },
    });
  }
  return { cliente };
}
