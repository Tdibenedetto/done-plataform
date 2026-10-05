// Alocação e baixa de estoque a partir dos produtos lançados nos leads (módulo de Vendas).
//
// Regras:
//  - Lead em "Fechado" ou "Carteira": os itens ficam ALOCADOS para o cliente. O estoque físico
//    (Produto.estoqueAtual) não muda; o que diminui é o "disponível" (estoque − alocado).
//  - Só se aloca o que existe. Se o pedido passa do estoque, a diferença fica EM CARTEIRA
//    (aguardando estoque) — o disponível nunca fica negativo.
//  - Fila por ordem de fechamento: quem fechou primeiro é atendido primeiro. Quando entra
//    estoque (ou outro pedido cai), o que estava em carteira passa a alocado sozinho.
//  - Nada disso é gravado: é sempre calculado a partir dos itens em aberto. Por isso, apagar o
//    lead, marcar como perdido ou voltar de etapa devolve o estoque sem nenhum ajuste.
//  - Lead em "Faturado Total": baixa definitiva da parte ALOCADA — estoqueAtual diminui e o item
//    guarda quanto foi baixado (quantidadeBaixada). O que estava em carteira não é baixado.
//  - Se um lead sair de "Faturado Total" (ex: movido por engano), a baixa é estornada.
//  - Cliente bloqueado por crédito: o pedido fica em Carteira mas NÃO segura estoque. Ao ser
//    desbloqueado, entra no fim da fila (ver rota de status em routes/clientes.js).
//
// A "Carteira" é uma só: pedido fechado que ainda não faturou. O motivo é que varia —
// aguardando estoque, aguardando crédito ou saldo a faturar (ver pendenciasDoLead).

export const RESERVA_STAGES = ["Fechado", "Carteira"];
export const BAIXA_STAGE = "Faturado Total";

// Calcula a alocação atual de todos os itens em aberto da organização.
//  - produtoIds: limita aos produtos informados
//  - incluirLeadId: trata esse lead como se já estivesse fechado (para simular / dar baixa)
// Retorna:
//  - porProduto[produtoId] = { alocado, emCarteira }
//  - porItem[itemId]       = { alocado, emCarteira }
export async function calcularAlocacoes(db, organizationId, { produtoIds, incluirLeadId } = {}) {
  const emAberto = { lead: { organizationId, stage: { in: RESERVA_STAGES } } };
  const where = { baixadoEm: null, ...emAberto };
  if (incluirLeadId) {
    delete where.lead;
    where.OR = [emAberto, { leadId: incluirLeadId }];
  }
  if (produtoIds) where.produtoId = { in: produtoIds };

  const itens = await db.leadItem.findMany({
    where,
    select: {
      id: true, leadId: true, produtoId: true, quantidade: true, createdAt: true,
      lead: { select: { fechadoEm: true, cliente: { select: { status: true } } } },
      produto: { select: { estoqueAtual: true } },
    },
  });

  // Posição na fila: o momento em que o item passou a disputar estoque — o fechamento do lead,
  // ou a inclusão do item, se ele entrou depois do fechamento.
  const agora = Date.now();
  const posicao = (it) => {
    const criado = new Date(it.createdAt).getTime();
    const fechado = it.lead?.fechadoEm ? new Date(it.lead.fechadoEm).getTime() : (it.leadId === incluirLeadId ? agora : criado);
    return Math.max(criado, fechado);
  };
  itens.sort((a, b) => posicao(a) - posicao(b) || new Date(a.createdAt) - new Date(b.createdAt));

  const saldo = {};
  const porProduto = {};
  const porItem = {};
  for (const it of itens) {
    // Crédito bloqueado: fora da fila — não aloca e não conta como "aguardando estoque".
    if (it.lead?.cliente?.status === "bloqueado") {
      porItem[it.id] = { alocado: 0, emCarteira: 0, semAlocacaoPorCredito: true };
      continue;
    }
    if (saldo[it.produtoId] === undefined) saldo[it.produtoId] = Math.max(0, it.produto.estoqueAtual);
    const alocado = Math.min(it.quantidade, saldo[it.produtoId]);
    const emCarteira = it.quantidade - alocado;
    saldo[it.produtoId] -= alocado;
    porItem[it.id] = { alocado, emCarteira, semAlocacaoPorCredito: false };
    const p = (porProduto[it.produtoId] ||= { alocado: 0, emCarteira: 0 });
    p.alocado += alocado;
    p.emCarteira += emCarteira;
  }
  return { porProduto, porItem };
}

// Chamar DENTRO de uma transação e ANTES de gravar a etapa nova no lead (a baixa precisa
// enxergar a alocação do lead como ela está agora). Devolve os itens que foram faturados
// com parte em carteira, para a rota avisar o usuário.
export async function aplicarEstoqueNaMudancaDeEtapa(tx, organizationId, leadId, etapaAnterior, etapaNova) {
  if (etapaAnterior === etapaNova) return [];

  if (etapaNova === BAIXA_STAGE) {
    const itens = await tx.leadItem.findMany({ where: { leadId, baixadoEm: null }, include: { produto: { select: { sku: true } } } });
    if (itens.length === 0) return [];
    const { porItem } = await calcularAlocacoes(tx, organizationId, { produtoIds: itens.map((i) => i.produtoId), incluirLeadId: leadId });
    const naoBaixados = [];
    for (const it of itens) {
      const alocado = porItem[it.id]?.alocado ?? 0;
      if (alocado > 0) {
        await tx.produto.update({ where: { id: it.produtoId }, data: { estoqueAtual: { decrement: alocado } } });
      }
      await tx.leadItem.update({ where: { id: it.id }, data: { baixadoEm: new Date(), quantidadeBaixada: alocado } });
      if (alocado < it.quantidade) naoBaixados.push({ sku: it.produto.sku, quantidade: it.quantidade, baixado: alocado });
    }
    return naoBaixados;
  }

  if (etapaAnterior === BAIXA_STAGE) {
    const itens = await tx.leadItem.findMany({ where: { leadId, baixadoEm: { not: null } } });
    for (const it of itens) {
      const devolver = it.quantidadeBaixada ?? it.quantidade;
      if (devolver > 0) {
        await tx.produto.update({ where: { id: it.produtoId }, data: { estoqueAtual: { increment: devolver } } });
      }
      await tx.leadItem.update({ where: { id: it.id }, data: { baixadoEm: null, quantidadeBaixada: null } });
    }
  }
  return [];
}

// Itens de um lead fechado que ficaram (total ou parcialmente) em carteira por falta de estoque.
export async function itensEmCarteira(db, organizationId, leadId) {
  const itens = await db.leadItem.findMany({
    where: { leadId, baixadoEm: null },
    include: { produto: { select: { sku: true } } },
  });
  if (itens.length === 0) return [];
  const { porItem } = await calcularAlocacoes(db, organizationId, { produtoIds: itens.map((i) => i.produtoId), incluirLeadId: leadId });
  return itens
    .map((it) => ({ sku: it.produto.sku, quantidade: it.quantidade, alocado: porItem[it.id]?.alocado ?? 0, emCarteira: porItem[it.id]?.emCarteira ?? it.quantidade }))
    .filter((x) => x.emCarteira > 0);
}

// Por que um lead fechado ainda não faturou. `lead` precisa trazer stage, value, cliente.status,
// invoiceEvents (amount) e items (id); `porItem` vem de calcularAlocacoes.
//  - "credito": cliente bloqueado na Análise de Crédito
//  - "estoque": algum produto do pedido não coube no estoque
//  - "saldo":   já faturou uma parte, falta o restante
// Pronto para faturar (lead verde) = fechado, sem pendência de crédito nem de estoque.
export function pendenciasDoLead(lead, porItem) {
  if (!RESERVA_STAGES.includes(lead.stage)) return { pendencias: [], prontoParaFaturar: false };
  const pendencias = [];
  const bloqueado = lead.cliente?.status === "bloqueado";
  if (bloqueado) pendencias.push("credito");
  else if ((lead.items || []).some((it) => (porItem[it.id]?.emCarteira || 0) > 0)) pendencias.push("estoque");
  const faturado = (lead.invoiceEvents || []).reduce((s, e) => s + e.amount, 0);
  if (faturado > 0 && faturado < lead.value) pendencias.push("saldo");
  return { pendencias, prontoParaFaturar: !pendencias.includes("credito") && !pendencias.includes("estoque") };
}
