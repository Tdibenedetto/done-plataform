import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requirePlan } from "../middleware/auth.js";

const router = Router();

// Mesma regra de acesso da Análise de Crédito — essa gestão vive dentro desse módulo.
router.use(requirePlan(["vendas", "gestao", "completo", "credito"]));

function normalizeCnpj(raw) {
  return (raw || "").replace(/\D/g, "");
}

// Soma tudo que já foi faturado (invoiceEvents) para os leads vinculados a este cliente,
// mais o histórico anterior ao uso da plataforma (preenchido manualmente, uma vez).
// Importante: sem um sistema de "pago/a receber" ainda (isso é o Faturamento interno, que vem
// depois), tratamos TODO faturamento como exposição em aberto — é a leitura mais conservadora
// possível, e evita mostrar mais crédito disponível do que existe de verdade.
function computeExposicao(cliente) {
  const faturadoLeads = (cliente.leads || []).reduce(
    (sum, l) => sum + (l.invoiceEvents || []).reduce((s, e) => s + e.amount, 0),
    0
  );
  return faturadoLeads + (cliente.faturamentoAnteriorPlataforma || 0);
}

function serializeCliente(cliente) {
  const faturadoEmAberto = computeExposicao(cliente);
  const creditoDisponivel = cliente.creditoAprovado != null ? cliente.creditoAprovado - faturadoEmAberto : null;
  return {
    id: cliente.id,
    cnpj: cliente.cnpj,
    razaoSocial: cliente.razaoSocial,
    status: cliente.status,
    statusMotivo: cliente.statusMotivo,
    creditoAprovado: cliente.creditoAprovado,
    creditoSugeridoIA: cliente.creditoSugeridoIA,
    faturamentoAnteriorPlataforma: cliente.faturamentoAnteriorPlataforma,
    faturadoEmAberto,
    creditoDisponivel,
    createdAt: cliente.createdAt,
    leadsCount: (cliente.leads || []).length,
  };
}

// -------- Lista de clientes da organização --------
router.get("/", async (req, res) => {
  const clientes = await prisma.cliente.findMany({
    where: { organizationId: req.organizationId },
    include: { leads: { include: { invoiceEvents: true } } },
    orderBy: { razaoSocial: "asc" },
  });
  res.json(clientes.map(serializeCliente));
});

// -------- Detalhe de um cliente: resumo + histórico de limite + negociações --------
router.get("/:id", async (req, res) => {
  const cliente = await prisma.cliente.findFirst({
    where: { id: req.params.id, organizationId: req.organizationId },
    include: {
      leads: { include: { invoiceEvents: true }, orderBy: { createdAt: "desc" } },
      limiteHistorico: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });

  res.json({
    ...serializeCliente(cliente),
    limiteHistorico: cliente.limiteHistorico,
    leads: cliente.leads.map((l) => ({
      id: l.id, name: l.name, value: l.value, stage: l.stage, createdAt: l.createdAt,
      totalFaturado: (l.invoiceEvents || []).reduce((s, e) => s + e.amount, 0),
    })),
  });
});

// -------- Criar cliente manualmente (CNPJ + razão social) --------
router.post("/", async (req, res) => {
  const cnpj = normalizeCnpj(req.body.cnpj);
  const razaoSocial = (req.body.razaoSocial || "").trim();
  if (cnpj.length !== 14) return res.status(400).json({ error: "CNPJ inválido — precisa ter 14 dígitos." });
  if (!razaoSocial) return res.status(400).json({ error: "Informe a razão social." });

  const existing = await prisma.cliente.findUnique({ where: { organizationId_cnpj: { organizationId: req.organizationId, cnpj } } });
  if (existing) return res.status(409).json({ error: "Já existe um cliente cadastrado com esse CNPJ." });

  const cliente = await prisma.cliente.create({ data: { organizationId: req.organizationId, cnpj, razaoSocial } });
  res.status(201).json(serializeCliente({ ...cliente, leads: [] }));
});

// -------- Editar limite de crédito — sempre gera uma linha de histórico, nunca sobrescreve --------
router.put("/:id/limite", async (req, res) => {
  const cliente = await prisma.cliente.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });

  const novoLimite = Number(req.body.novoLimite);
  if (!Number.isFinite(novoLimite) || novoLimite < 0) return res.status(400).json({ error: "Informe um valor de limite válido." });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });

  await prisma.$transaction([
    prisma.limiteHistorico.create({
      data: {
        clienteId: cliente.id,
        valorAnterior: cliente.creditoAprovado,
        valorNovo: novoLimite,
        alteradoPor: user?.name || "Usuário",
      },
    }),
    prisma.cliente.update({ where: { id: cliente.id }, data: { creditoAprovado: novoLimite } }),
  ]);

  res.json({ ok: true, creditoAprovado: novoLimite });
});

// -------- Mudar status (ativo / atrasado / bloqueado) --------
const VALID_STATUS = ["ativo", "atrasado", "bloqueado"];
router.put("/:id/status", async (req, res) => {
  const { status, motivo } = req.body;
  if (!VALID_STATUS.includes(status)) return res.status(400).json({ error: `Status inválido. Use um de: ${VALID_STATUS.join(", ")}.` });

  const cliente = await prisma.cliente.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });

  await prisma.cliente.update({ where: { id: cliente.id }, data: { status, statusMotivo: status === "ativo" ? null : (motivo || null) } });
  res.json({ ok: true, status });
});

// -------- Faturamento anterior ao uso da plataforma (preenchido manualmente) --------
router.put("/:id/faturamento-anterior", async (req, res) => {
  const valor = Number(req.body.valor);
  if (!Number.isFinite(valor) || valor < 0) return res.status(400).json({ error: "Informe um valor válido." });

  const cliente = await prisma.cliente.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });

  await prisma.cliente.update({ where: { id: cliente.id }, data: { faturamentoAnteriorPlataforma: valor } });
  res.json({ ok: true, faturamentoAnteriorPlataforma: valor });
});

export default router;
