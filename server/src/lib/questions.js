// Espelha client/src/modules/questions.js — mantém as duas em sincronia se o
// questionário mudar. Usado só para dar contexto (texto da pergunta e da
// resposta escolhida) na geração da análise detalhada por IA.
const OPTS4 = (opts) => opts.map((label, i) => ({ label, score: i * (100 / 3) }));

export const DIMENSION_LABEL = {
  processo: "Processo Comercial",
  preco: "Precificação & Margem",
  time: "Time & Performance",
  pipeline: "Pipeline / Estoque",
};

export const QUESTIONS = {
  b2b: {
    processo: [
      { q: "Vocês usam CRM ou sistema para registrar oportunidades?", opts: OPTS4(["Não uso", "Planilha", "CRM básico", "CRM avançado"]) },
      { q: "Existe um funil de vendas com etapas claras?", opts: OPTS4(["Não existe", "Informal", "Formalizado mas não seguido", "Formalizado e seguido"]) },
      { q: "Como é feito o follow-up de propostas enviadas?", opts: OPTS4(["Não é feito", "Esporádico", "Regra informal", "Processo sistemático"]) },
    ],
    preco: [
      { q: "A precificação varia por canal/cliente de forma estruturada?", opts: OPTS4(["Preço único", "Desconto no feeling", "Tabela por categoria", "Modelo com regras"]) },
      { q: "Vocês conhecem a margem real por cliente?", opts: OPTS4(["Só média geral", "Estimativa por grupo", "Por cliente, manual", "Por cliente, automatizado"]) },
      { q: "Existe revisão periódica de preços?", opts: OPTS4(["Nunca", "Raramente", "Anual", "Periódica e baseada em dados"]) },
    ],
    time: [
      { q: "Vendedores têm metas individuais acompanhadas?", opts: OPTS4(["Não têm", "Meta sem acompanhar", "Acompanhada mensalmente", "Acompanhada em tempo real"]) },
      { q: "Existe rotina de treinamento comercial?", opts: OPTS4(["Nunca", "Raramente", "Anual", "Contínua"]) },
      { q: "Existe comissionamento claro ligado a resultado?", opts: OPTS4(["Não", "Informal", "Formal simples", "Formal e sofisticado"]) },
    ],
    pipeline: [
      { q: "Vocês planejam reposição com base em previsão de demanda?", opts: OPTS4(["Não", "Feeling do gestor", "Planilha histórica", "Ferramenta de previsão"]) },
      { q: "Existe visibilidade de ruptura/excesso por SKU?", opts: OPTS4(["Não", "Auditorias esporádicas", "Mensal", "Tempo real"]) },
      { q: "Pedidos em atraso são um problema recorrente?", opts: OPTS4(["Sim, frequente", "Às vezes", "Raro", "Praticamente nunca"]) },
    ],
  },
  varejo: {
    processo: [
      { q: "Existe processo definido de atendimento em loja/online?", opts: OPTS4(["Não existe", "Informal", "Roteiro básico", "Roteiro treinado e monitorado"]) },
      { q: "Vocês medem taxa de conversão (visitantes → vendas)?", opts: OPTS4(["Não medimos", "Estimativa", "Medimos por período", "Medimos por vendedor/canal"]) },
      { q: "Existe estratégia de recompra/fidelização?", opts: OPTS4(["Não", "Informal", "Programa simples", "Programa com dados"]) },
    ],
    preco: [
      { q: "A precificação por categoria/SKU tem margem-alvo clara?", opts: OPTS4(["No feeling", "Regra geral única", "Por categoria", "Por categoria, revisada com dados"]) },
      { q: "Vocês sabem quais produtos dão mais margem?", opts: OPTS4(["Não sabemos", "Estimativa", "Sabemos os principais", "Análise completa"]) },
      { q: "Promoções são baseadas em giro/margem ou intuição?", opts: OPTS4(["Intuição", "Mistura informal", "Baseada em giro", "Giro + margem"]) },
    ],
    time: [
      { q: "Vendedores/atendentes têm metas claras?", opts: OPTS4(["Não têm", "Meta sem acompanhar", "Acompanhada mensalmente", "Acompanhada em tempo real"]) },
      { q: "Existe treinamento de produto e técnica de venda?", opts: OPTS4(["Nunca", "Raramente", "Periódico", "Contínuo"]) },
      { q: "Existe comissionamento ligado a resultado?", opts: OPTS4(["Não", "Informal", "Formal simples", "Formal sofisticado"]) },
    ],
    pipeline: [
      { q: "O sortimento é definido com base em curva ABC/dados de venda?", opts: OPTS4(["No feeling", "Parcialmente", "Sim, por categoria", "Análise completa por SKU"]) },
      { q: "Existe controle de giro de estoque por produto?", opts: OPTS4(["Não", "Estimativa", "Mensal", "Tempo real"]) },
      { q: "Ruptura de itens-chave é um problema recorrente?", opts: OPTS4(["Sim, frequente", "Às vezes", "Raro", "Praticamente nunca"]) },
    ],
  },
};

/** Acha o rótulo da opção mais próxima do score numérico salvo (0/33.3/66.7/100). */
export function labelForScore(score, opts) {
  if (score === undefined || score === null) return null;
  let best = opts[0];
  let bestDiff = Infinity;
  for (const o of opts) {
    const diff = Math.abs(o.score - score);
    if (diff < bestDiff) { bestDiff = diff; best = o; }
  }
  return best.label;
}
