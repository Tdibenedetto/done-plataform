import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requirePlan } from "../middleware/auth.js";
import { findOrCreateCliente } from "../lib/clientes.js";
import { RESERVA_STAGES, BAIXA_STAGE, calcularAlocacoes, aplicarEstoqueNaMudancaDeEtapa, itensEmCarteira, pendenciasDoLead } from "../lib/estoque.js";

const router = Router();
const STAGES = ["Novo Lead", "Qualificação", "Proposta", "Negociação", "Fechado", "Carteira", "Faturado Total", "Perdido"];

// Antes desta linha, este módulo não checava plano nenhum — qualquer conta cadastrada
// usava a Ferramenta de Vendas por completo, de graça, para sempre.
router.use(requirePlan(["vendas", "completo"]));

function leadWhere(req, id) {
  return req.userRole === "master"
    ? { id, organizationId: req.organizationId }
    : { id, organizationId: req.organizationId, assignedUserId: req.userId };
}

router.get("/", async (req, res) => {
  const where = req.userRole === "master"
    ? { organizationId: req.organizationId }
    : { organizationId: req.organizationId, assignedUserId: req.userId };
  const leads = await prisma.lead.findMany({
    where,
    include: {
      assignedUser: { select: { id: true, name: true } },
      _count: { select: { notes: true } },
      invoiceEvents: { select: { id: true, amount: true, date: true }, orderBy: { date: "asc" } },
      cliente: { select: { id: true, status: true, statusMotivo: true } },
      items: { select: { id: true, quantidade: true, baixadoEm: true, produto: { select: { sku: true, produto: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  // Motivo de cada pedido fechado ainda não ter faturado + se já está pronto para faturar (verde).
  const { porItem } = await calcularAlocacoes(prisma, req.organizationId);
  res.json(leads.map((l) => ({ ...l, ...pendenciasDoLead(l, porItem) })));
});

router.post("/", async (req, res) => {
  const { name, value, assignedUserId, expectedCloseDate, categoria, clienteId, cnpj } = req.body;
  if (!name) return res.status(400).json({ error: "Nome do lead é obrigatório." });

  // Membro só cria lead para si mesmo; Master pode atribuir a qualquer um do time.
  let ownerId = req.userId;
  if (req.userRole === "master" && assignedUserId) {
    const target = await prisma.user.findFirst({ where: { id: assignedUserId, organizationId: req.organizationId } });
    if (!target) return res.status(400).json({ error: "Vendedor inválido." });
    ownerId = assignedUserId;
  }

  let finalClienteId = null;
  if (cnpj) {
    // Vincula pelo CNPJ — encontra o Cliente já existente, ou cria um novo usando o nome do
    // lead como razão social provisória (até alguém rodar uma Análise de Crédito de verdade).
    const { cliente, error: cnpjError } = await findOrCreateCliente(req.organizationId, cnpj, name);
    if (cnpjError) return res.status(400).json({ error: cnpjError });
    finalClienteId = cliente.id;
  } else if (clienteId) {
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, organizationId: req.organizationId } });
    if (!cliente) return res.status(400).json({ error: "Cliente inválido." });
    finalClienteId = clienteId;
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId: req.organizationId,
      assignedUserId: ownerId,
      clienteId: finalClienteId,
      name,
      value: Number(value) || 0,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      categoria: categoria || null,
    },
    include: {
      assignedUser: { select: { id: true, name: true } },
      _count: { select: { notes: true } },
      invoiceEvents: true,
      cliente: { select: { id: true, cnpj: true, status: true, statusMotivo: true } },
    },
  });
  res.json(lead);
});

router.patch("/:id", async (req, res) => {
  const { stage, lostReason, expectedCloseDate, categoria, margemReal, value, clienteId, cnpj } = req.body;
  if (stage && !STAGES.includes(stage)) return res.status(400).json({ error: "Etapa inválida." });
  if (value !== undefined && (isNaN(Number(value)) || Number(value) < 0)) {
    return res.status(400).json({ error: "Valor inválido." });
  }

  const existing = await prisma.lead.findFirst({ where: leadWhere(req, req.params.id) });
  if (!existing) return res.status(404).json({ error: "Lead não encontrado." });

  const data = {};
  if (stage) data.stage = stage;
  if (lostReason !== undefined) data.lostReason = lostReason;
  if (expectedCloseDate !== undefined) data.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
  if (categoria !== undefined) data.categoria = categoria || null;
  if (margemReal !== undefined) data.margemReal = margemReal === null || margemReal === "" ? null : Number(margemReal);
  if (value !== undefined) data.value = Number(value);

  if (cnpj !== undefined) {
    if (cnpj) {
      const { cliente, error: cnpjError } = await findOrCreateCliente(req.organizationId, cnpj, existing.name);
      if (cnpjError) return res.status(400).json({ error: cnpjError });
      data.clienteId = cliente.id;
    } else {
      data.clienteId = null; // cnpj enviado vazio = desvincular
    }
  } else if (clienteId !== undefined) {
    if (clienteId) {
      const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, organizationId: req.organizationId } });
      if (!cliente) return res.status(400).json({ error: "Cliente inválido." });
    }
    data.clienteId = clienteId || null;
  }

  // Cliente bloqueado (gestão de crédito): a venda PODE fechar, mas vai para Carteira como
  // "aguardando crédito", sem alocar estoque. O que não pode é faturar enquanto estiver bloqueado.
  let clienteBloqueado = null;
  if (stage && (RESERVA_STAGES.includes(stage) || stage === BAIXA_STAGE)) {
    const targetClienteId = data.clienteId !== undefined ? data.clienteId : existing.clienteId;
    if (targetClienteId) {
      const cliente = await prisma.cliente.findUnique({ where: { id: targetClienteId } });
      if (cliente?.status === "bloqueado") clienteBloqueado = cliente;
    }
  }
  if (clienteBloqueado && stage === BAIXA_STAGE && existing.stage !== BAIXA_STAGE) {
    return res.status(402).json({ error: msgCreditoBloqueado(clienteBloqueado) });
  }

  // Entrou agora em Fechado/Carteira: marca o momento — é a posição do pedido na fila de estoque.
  const fechandoAgora = !!stage && RESERVA_STAGES.includes(stage) && !RESERVA_STAGES.includes(existing.stage);
  if (fechandoAgora) data.fechadoEm = new Date();

  let naoBaixados = [];
  let pendentesEstoque = [];
  let etapaFinal = stage || existing.stage;
  await prisma.$transaction(async (tx) => {
    // Estoque primeiro, etapa depois: a baixa precisa ver a alocação do lead como está agora.
    if (stage) naoBaixados = await aplicarEstoqueNaMudancaDeEtapa(tx, req.organizationId, existing.id, existing.stage, stage);
    await tx.lead.update({ where: { id: existing.id }, data });

    // Fechou com pendência (crédito ou estoque)? Vai direto para Carteira, com o motivo.
    if (fechandoAgora) {
      if (!clienteBloqueado) pendentesEstoque = await itensEmCarteira(tx, req.organizationId, existing.id);
      if ((clienteBloqueado || pendentesEstoque.length > 0) && stage !== "Carteira") {
        await tx.lead.update({ where: { id: existing.id }, data: { stage: "Carteira" } });
        etapaFinal = "Carteira";
      }
    }
  });

  // Marcar como perdido já registra o motivo no histórico do lead.
  if (stage === "Perdido") {
    await prisma.leadNote.create({
      data: {
        leadId: existing.id,
        authorId: req.userId,
        content: lostReason ? `Marcado como perdido: ${lostReason}` : "Marcado como perdido.",
      },
    });
  }

  // Ao fechar, explica (sem bloquear) por que o pedido foi para Carteira.
  let avisoEstoque = null;
  if (fechandoAgora && clienteBloqueado) {
    avisoEstoque = `Pedido foi para Carteira — aguardando crédito: cliente bloqueado${clienteBloqueado.statusMotivo ? ` (${clienteBloqueado.statusMotivo})` : ""}. O estoque só será alocado depois do desbloqueio na Análise de Crédito.`;
  } else if (fechandoAgora && pendentesEstoque.length > 0) {
    avisoEstoque = "Pedido foi para Carteira — aguardando estoque: " + pendentesEstoque.map((f) => `${f.sku} (${f.alocado} alocado, ${f.emCarteira} em carteira)`).join("; ") + ".";
  } else if (naoBaixados.length > 0) {
    avisoEstoque = avisoNaoBaixados(naoBaixados);
  }
  res.json({ ok: true, stage: etapaFinal, avisoEstoque });
});

function msgCreditoBloqueado(cliente) {
  return `Cliente bloqueado por crédito${cliente.statusMotivo ? `: ${cliente.statusMotivo}` : "."} O pedido fica em Carteira até o cliente ser desbloqueado na Análise de Crédito.`;
}

function avisoNaoBaixados(lista) {
  return "Pedido faturado com itens em carteira — só o alocado saiu do estoque: " + lista.map((f) => `${f.sku} (pedido ${f.quantidade}, baixado ${f.baixado})`).join("; ") + ".";
}

// Apagar o lead apaga os itens junto (cascade). Como a alocação é calculada a partir dos itens em
// aberto, o estoque alocado volta a ficar disponível automaticamente. Se o lead já estava em
// "Faturado Total", a baixa foi definitiva e o estoque NÃO volta.
router.delete("/:id", async (req, res) => {
  const where = leadWhere(req, req.params.id);
  await prisma.lead.deleteMany({ where });
  res.json({ ok: true });
});

// -------- Faturamento --------
// Registra um valor faturado agora. Se somado bater o valor total do pedido,
// o lead vai para "Faturado Total"; senão, fica em "Carteira" com o saldo restante.
router.post("/:id/invoice", async (req, res) => {
  const { amount } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: "Informe um valor de faturamento válido." });

  const lead = await prisma.lead.findFirst({
    where: leadWhere(req, req.params.id),
    include: { invoiceEvents: true },
  });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  if (!["Fechado", "Carteira"].includes(lead.stage)) {
    return res.status(400).json({ error: "Só é possível faturar pedidos em Fechado ou Carteira." });
  }
  // Pedido aguardando crédito não fatura — é exatamente por isso que ele está em Carteira.
  if (lead.clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: lead.clienteId } });
    if (cliente?.status === "bloqueado") return res.status(402).json({ error: msgCreditoBloqueado(cliente) });
  }

  const totalInvoiced = lead.invoiceEvents.reduce((s, e) => s + e.amount, 0) + amt;
  const newStage = totalInvoiced >= lead.value ? "Faturado Total" : "Carteira";
  // Faturamento parcial (Carteira) mantém a alocação; só o Faturado Total dá baixa no estoque.
  let naoBaixados = [];
  await prisma.$transaction(async (tx) => {
    await tx.invoiceEvent.create({ data: { leadId: lead.id, amount: amt } });
    naoBaixados = await aplicarEstoqueNaMudancaDeEtapa(tx, req.organizationId, lead.id, lead.stage, newStage);
    await tx.lead.update({ where: { id: lead.id }, data: { stage: newStage } });
  });

  res.json({ ok: true, stage: newStage, totalInvoiced, avisoEstoque: naoBaixados.length > 0 ? avisoNaoBaixados(naoBaixados) : null });
});

// -------- Produtos do pedido (itens do lead) --------
// O vendedor digita o código (SKU) e a quantidade. Enquanto o lead está antes de "Fechado", é só
// um rascunho do pedido; em "Fechado"/"Carteira" vira alocação; em "Faturado Total" vira baixa.
async function listarItens(organizationId, leadId) {
  const itens = await prisma.leadItem.findMany({
    where: { leadId },
    include: { produto: { select: { id: true, sku: true, produto: true, estoqueAtual: true } } },
    orderBy: { createdAt: "asc" },
  });
  const { porProduto, porItem } = await calcularAlocacoes(prisma, organizationId, { produtoIds: itens.map((i) => i.produtoId) });
  return itens.map((it) => ({
    id: it.id,
    produtoId: it.produtoId,
    sku: it.produto.sku,
    produto: it.produto.produto,
    quantidade: it.quantidade,
    baixado: !!it.baixadoEm,
    quantidadeBaixada: it.baixadoEm ? (it.quantidadeBaixada ?? it.quantidade) : null,
    // preenchidos só quando o lead está em Fechado/Carteira (item disputando estoque)
    alocado: porItem[it.id]?.alocado ?? null,
    emCarteira: porItem[it.id]?.emCarteira ?? null,
    semAlocacaoPorCredito: porItem[it.id]?.semAlocacaoPorCredito || false,
    // estoque livre do produto agora: físico menos tudo o que já está alocado
    disponivel: Math.max(0, it.produto.estoqueAtual - (porProduto[it.produtoId]?.alocado || 0)),
  }));
}

router.get("/:id/items", async (req, res) => {
  const lead = await prisma.lead.findFirst({ where: leadWhere(req, req.params.id) });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  res.json({ stage: lead.stage, alocando: RESERVA_STAGES.includes(lead.stage), items: await listarItens(req.organizationId, lead.id) });
});

router.post("/:id/items", async (req, res) => {
  const sku = String(req.body.sku || "").trim();
  const quantidade = Number(req.body.quantidade);
  if (!sku) return res.status(400).json({ error: "Digite o código do produto." });
  if (!quantidade || isNaN(quantidade) || quantidade <= 0) return res.status(400).json({ error: "Informe uma quantidade maior que zero." });

  const lead = await prisma.lead.findFirst({ where: leadWhere(req, req.params.id) });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  if (lead.stage === BAIXA_STAGE) {
    return res.status(400).json({ error: "Este pedido já foi faturado por completo — o estoque já foi baixado e os produtos não podem mais ser alterados." });
  }

  // Código exato primeiro; se não achar, tenta ignorando maiúsculas/minúsculas.
  let produto = await prisma.produto.findUnique({ where: { organizationId_sku: { organizationId: req.organizationId, sku } } });
  if (!produto) {
    produto = await prisma.produto.findFirst({ where: { organizationId: req.organizationId, sku: { equals: sku, mode: "insensitive" } } });
  }
  if (!produto) return res.status(404).json({ error: `Nenhum produto com o código "${sku}" no Sortimento.` });

  // Mesmo produto lançado de novo = atualiza a quantidade (não duplica a linha).
  await prisma.leadItem.upsert({
    where: { leadId_produtoId: { leadId: lead.id, produtoId: produto.id } },
    create: { leadId: lead.id, produtoId: produto.id, quantidade },
    update: { quantidade },
  });

  const items = await listarItens(req.organizationId, lead.id);
  const item = items.find((i) => i.produtoId === produto.id);
  let aviso = null;
  if (item && item.emCarteira > 0) {
    aviso = `${produto.sku}: ${item.alocado} un alocadas e ${item.emCarteira} un em carteira (sem estoque).`;
  } else if (item && item.alocado == null && item.quantidade > item.disponivel) {
    aviso = `${produto.sku} tem ${item.disponivel} un disponíveis — ao fechar, ${item.quantidade - item.disponivel} un entram em carteira.`;
  }
  res.json({ stage: lead.stage, alocando: RESERVA_STAGES.includes(lead.stage), items, aviso });
});

router.delete("/:id/items/:itemId", async (req, res) => {
  const lead = await prisma.lead.findFirst({ where: leadWhere(req, req.params.id) });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  if (lead.stage === BAIXA_STAGE) {
    return res.status(400).json({ error: "Este pedido já foi faturado por completo — os produtos não podem mais ser alterados." });
  }
  await prisma.leadItem.deleteMany({ where: { id: req.params.itemId, leadId: lead.id } });
  res.json({ stage: lead.stage, alocando: RESERVA_STAGES.includes(lead.stage), items: await listarItens(req.organizationId, lead.id) });
});

// -------- Notas / histórico do lead --------
router.get("/:id/notes", async (req, res) => {
  const lead = await prisma.lead.findFirst({ where: leadWhere(req, req.params.id) });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  const notes = await prisma.leadNote.findMany({
    where: { leadId: lead.id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(notes);
});

router.post("/:id/notes", async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "Escreva algo na nota." });
  const lead = await prisma.lead.findFirst({ where: leadWhere(req, req.params.id) });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  const note = await prisma.leadNote.create({
    data: { leadId: lead.id, authorId: req.userId, content: content.trim() },
    include: { author: { select: { name: true } } },
  });
  res.json(note);
});

export default router;

