import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requirePlan } from "../middleware/auth.js";

const router = Router();
router.use(requirePlan(["vendas", "gestao", "completo", "credito"]));

// Mesma lógica de exposição de clientes.js: tudo que já foi faturado (invoiceEvents) nos leads
// do CNPJ, mais o faturamento anterior à plataforma. Sem "pago/a receber" ainda, é a leitura
// conservadora — evita mostrar mais crédito disponível do que existe de verdade.
function computeExposicaoCliente(cliente) {
  const faturadoLeads = (cliente.leads || []).reduce(
    (sum, l) => sum + (l.invoiceEvents || []).reduce((s, e) => s + e.amount, 0),
    0
  );
  return faturadoLeads + (cliente.faturamentoAnteriorPlataforma || 0);
}

function serializeGrupo(grupo) {
  const faturadoEmAberto = (grupo.clientes || []).reduce((sum, c) => sum + computeExposicaoCliente(c), 0);
  const creditoDisponivel = grupo.creditoAprovado != null ? grupo.creditoAprovado - faturadoEmAberto : null;
  return {
    id: grupo.id,
    nome: grupo.nome,
    creditoAprovado: grupo.creditoAprovado,
    faturadoEmAberto,
    creditoDisponivel,
    createdAt: grupo.createdAt,
    clientesCount: (grupo.clientes || []).length,
  };
}

const CLIENTES_INCLUDE = { leads: { include: { invoiceEvents: true } } };

router.get("/", async (req, res) => {
  const grupos = await prisma.grupoEconomico.findMany({
    where: { organizationId: req.organizationId },
    include: { clientes: { include: CLIENTES_INCLUDE } },
    orderBy: { nome: "asc" },
  });
  res.json(grupos.map(serializeGrupo));
});

router.get("/:id", async (req, res) => {
  const grupo = await prisma.grupoEconomico.findFirst({
    where: { id: req.params.id, organizationId: req.organizationId },
    include: {
      clientes: { include: CLIENTES_INCLUDE, orderBy: { razaoSocial: "asc" } },
      limiteHistorico: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!grupo) return res.status(404).json({ error: "Grupo não encontrado." });

  res.json({
    ...serializeGrupo(grupo),
    limiteHistorico: grupo.limiteHistorico,
    clientes: grupo.clientes.map((c) => ({
      id: c.id, cnpj: c.cnpj, razaoSocial: c.razaoSocial, status: c.status, statusMotivo: c.statusMotivo,
      faturadoEmAberto: computeExposicaoCliente(c),
    })),
  });
});

router.post("/", async (req, res) => {
  const nome = (req.body.nome || "").trim();
  if (!nome) return res.status(400).json({ error: "Informe um nome para o grupo." });
  const grupo = await prisma.grupoEconomico.create({ data: { organizationId: req.organizationId, nome } });
  res.status(201).json(serializeGrupo({ ...grupo, clientes: [] }));
});

// Limite consolidado — mesmo padrão do Cliente: sempre acrescenta uma linha no histórico.
router.put("/:id/limite", async (req, res) => {
  const grupo = await prisma.grupoEconomico.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!grupo) return res.status(404).json({ error: "Grupo não encontrado." });

  const novoLimite = Number(req.body.novoLimite);
  if (!Number.isFinite(novoLimite) || novoLimite < 0) return res.status(400).json({ error: "Informe um valor de limite válido." });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  await prisma.$transaction([
    prisma.grupoLimiteHistorico.create({
      data: { grupoId: grupo.id, valorAnterior: grupo.creditoAprovado, valorNovo: novoLimite, alteradoPor: user?.name || "Usuário" },
    }),
    prisma.grupoEconomico.update({ where: { id: grupo.id }, data: { creditoAprovado: novoLimite } }),
  ]);
  res.json({ ok: true, creditoAprovado: novoLimite });
});

// Excluir o grupo NÃO exclui os CNPJs: eles só voltam a ser clientes avulsos (onDelete: SetNull).
router.delete("/:id", async (req, res) => {
  const grupo = await prisma.grupoEconomico.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!grupo) return res.status(404).json({ error: "Grupo não encontrado." });
  await prisma.grupoEconomico.delete({ where: { id: grupo.id } });
  res.json({ ok: true });
});

export default router;
