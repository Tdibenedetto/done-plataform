import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requirePlan } from "../middleware/auth.js";
import { mapProdutoColumns } from "../lib/claude.js";
import { parseSpreadsheet } from "../lib/spreadsheet.js";
import { calcularAlocacoes } from "../lib/estoque.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Mesmo padrão de acesso dos outros módulos operacionais.
router.use(requirePlan(["vendas", "gestao", "completo", "sortimento"]));

const STATUS_VALUES = ["ativo", "pausado", "descontinuado"];
const EMBALAGEM_VALUES = ["Adesivo", "Blister", "Brownbox", "Cinta", "Giftbox", "Tag"];

// Vira "metalurgica-bravo-ltda" — usado só para deixar a URL da tabela pública legível.
function slugify(str) {
  return String(str || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "empresa";
}
const CANONICAL_HEADERS = ["produto", "sku", "categoria", "marca", "subcategoria", "cmv", "precoAtacado", "precoPSV", "descontoAtacado", "descontoPSV", "estoqueAtual", "giroMedioMensal", "coberturaIdealDias"];

// -------- Cálculo de margem e cobertura — mesma lógica testada isoladamente antes de integrar --------
function calcMargem(preco, cmv, desconto) {
  if (preco == null || cmv == null) return null;
  const precoFinal = desconto ? preco * (1 - desconto / 100) : preco;
  if (!precoFinal) return null;
  return ((precoFinal - cmv) / precoFinal) * 100;
}

// `aloc` = { alocado, emCarteira } vindos dos leads Fechado/Carteira (ver lib/estoque.js).
// alocado nunca passa do estoque, então disponível nunca fica negativo.
function serializeProduto(p, aloc) {
  const alocado = aloc?.alocado || 0;
  const emCarteira = aloc?.emCarteira || 0;
  const margemAtacado = p.margemAtacadoManual ?? calcMargem(p.precoAtacado, p.cmv, null);
  const margemAtacadoDesconto = p.margemAtacadoDescontoManual ?? calcMargem(p.precoAtacado, p.cmv, p.descontoAtacado);
  const margemPSV = p.margemPSVManual ?? calcMargem(p.precoPSV, p.cmv, null);
  const margemPSVDesconto = p.margemPSVDescontoManual ?? calcMargem(p.precoPSV, p.cmv, p.descontoPSV);

  const giroDiario = p.giroMedioMensal ? p.giroMedioMensal / 30 : null;
  const coberturaAtualDias = giroDiario ? Math.round(p.estoqueAtual / giroDiario) : null;
  const estoqueProjetado = p.estoqueAtual + (p.compraProducao || 0);
  const coberturaProjetadaDias = giroDiario ? Math.round(estoqueProjetado / giroDiario) : null;

  const abaixoCobertura = p.coberturaIdealDias != null && coberturaAtualDias != null && coberturaAtualDias < p.coberturaIdealDias;
  const terminoDeEstoque = p.status === "descontinuado" && p.estoqueAtual > 0;

  return {
    id: p.id, produto: p.produto, sku: p.sku, categoria: p.categoria, marca: p.marca, subcategoria: p.subcategoria,
    status: p.status, fotoUrl: p.fotoUrl,
    cmv: p.cmv, precoAtacado: p.precoAtacado, precoPSV: p.precoPSV, descontoAtacado: p.descontoAtacado, descontoPSV: p.descontoPSV,
    margemAtacado, margemAtacadoDesconto, margemPSV, margemPSVDesconto,
    margemAtacadoManual: p.margemAtacadoManual, margemAtacadoDescontoManual: p.margemAtacadoDescontoManual,
    margemPSVManual: p.margemPSVManual, margemPSVDescontoManual: p.margemPSVDescontoManual,
    estoqueAtual: p.estoqueAtual, alocado, emCarteira, disponivel: Math.max(0, p.estoqueAtual - alocado), giroMedioMensal: p.giroMedioMensal,
    compraProducao: p.compraProducao, dataChegada: p.dataChegada,
    coberturaIdealDias: p.coberturaIdealDias, coberturaAtualDias, coberturaProjetadaDias,
    abaixoCobertura, terminoDeEstoque, origemCadastro: p.origemCadastro, createdAt: p.createdAt,
    altura: p.altura, largura: p.largura, comprimento: p.comprimento, pesoGross: p.pesoGross, pesoNet: p.pesoNet,
    caixaMaster: p.caixaMaster, tipoEmbalagem: p.tipoEmbalagem, ncm: p.ncm,
  };
}

// Curva ABC pelo critério escolhido — Pareto clássico: A até 80% acumulado, B até 95%, C o resto.
function computeCurvaABC(produtos, criterio) {
  const valorFn = criterio === "faturamento"
    ? (p) => (p.giroMedioMensal || 0) * (p.precoAtacado || 0)
    : (p) => p.giroMedioMensal || 0;
  const sorted = [...produtos].sort((a, b) => valorFn(b) - valorFn(a));
  const total = sorted.reduce((s, p) => s + valorFn(p), 0);
  let acumulado = 0;
  const curvas = {};
  for (const p of sorted) {
    acumulado += valorFn(p);
    const pct = total > 0 ? acumulado / total : 0;
    curvas[p.id] = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
  }
  return curvas;
}

function validateBody(body, { partial = false } = {}) {
  const data = {};
  if (body.produto !== undefined) data.produto = String(body.produto).trim();
  if (body.sku !== undefined) data.sku = String(body.sku).trim();
  if (!partial) {
    if (!data.produto) return { error: "Informe o nome do produto." };
    if (!data.sku) return { error: "Informe o SKU." };
  }
  if (body.categoria !== undefined) data.categoria = body.categoria || null;
  if (body.marca !== undefined) data.marca = body.marca || null;
  if (body.subcategoria !== undefined) data.subcategoria = body.subcategoria || null;
  if (body.status !== undefined) {
    if (!STATUS_VALUES.includes(body.status)) return { error: `Status inválido. Use um de: ${STATUS_VALUES.join(", ")}.` };
    data.status = body.status;
  }
  if (body.fotoUrl !== undefined) data.fotoUrl = body.fotoUrl || null;

  for (const f of ["cmv", "precoAtacado", "precoPSV", "descontoAtacado", "descontoPSV", "estoqueAtual", "giroMedioMensal", "compraProducao",
    "margemAtacadoManual", "margemAtacadoDescontoManual", "margemPSVManual", "margemPSVDescontoManual"]) {
    if (body[f] !== undefined) data[f] = body[f] === null || body[f] === "" ? null : Number(body[f]);
  }
  if (body.coberturaIdealDias !== undefined) data.coberturaIdealDias = body.coberturaIdealDias === null || body.coberturaIdealDias === "" ? null : Math.round(Number(body.coberturaIdealDias));

  for (const f of ["altura", "largura", "comprimento", "pesoGross", "pesoNet"]) {
    if (body[f] !== undefined) data[f] = body[f] === null || body[f] === "" ? null : Number(body[f]);
  }
  if (body.caixaMaster !== undefined) data.caixaMaster = body.caixaMaster === null || body.caixaMaster === "" ? null : Math.round(Number(body.caixaMaster));
  if (body.tipoEmbalagem !== undefined) {
    if (body.tipoEmbalagem && !EMBALAGEM_VALUES.includes(body.tipoEmbalagem)) {
      return { error: `Tipo de embalagem inválido. Use um de: ${EMBALAGEM_VALUES.join(", ")}.` };
    }
    data.tipoEmbalagem = body.tipoEmbalagem || null;
  }
  if (body.ncm !== undefined) data.ncm = body.ncm ? String(body.ncm).trim() : null;

  // Compra/produção sempre exige mês de chegada — sem isso a cobertura projetada não sabe quando contar.
  if (body.compraProducao !== undefined && data.compraProducao != null) {
    if (!body.dataChegada) return { error: "Informe o mês de chegada da compra/produção." };
  }
  if (body.dataChegada !== undefined) {
    data.dataChegada = body.dataChegada ? new Date(body.dataChegada) : null;
  }
  return { data };
}

// =====================================================================================
// IMPORTANTE: todas as rotas de CAMINHO FIXO (/tabela-publica, /preferencias/..., /upload)
// precisam vir ANTES das rotas genéricas /:id abaixo. O Express casa rotas na ordem em que
// são registradas — "/:id" aceita QUALQUER segmento único, incluindo a palavra literal
// "tabela-publica". Bug real que já aconteceu aqui: GET /tabela-publica estava sendo
// respondido pela rota GET /:id (tratando "tabela-publica" como se fosse um id de produto),
// nunca chegando na rota certa — o pedido "funcionava" (200 ou 404), só que errado, e o
// frontend ficava preso em "Carregando..." porque não reconhecia aquele formato de resposta.
// =====================================================================================

// -------- Listagem, com curva ABC no critério salvo do usuário (ou o informado via query) --------
router.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { sortimentoAbcCriterio: true } });
  const criterio = req.query.criterio === "faturamento" || req.query.criterio === "giro" ? req.query.criterio : user?.sortimentoAbcCriterio || "giro";

  const produtos = await prisma.produto.findMany({ where: { organizationId: req.organizationId }, orderBy: { produto: "asc" } });
  const curvas = computeCurvaABC(produtos, criterio);
  const { porProduto } = await calcularAlocacoes(prisma, req.organizationId);

  res.json({
    criterio,
    produtos: produtos.map((p) => ({ ...serializeProduto(p, porProduto[p.id]), curva: curvas[p.id] })),
  });
});

router.post("/", async (req, res) => {
  const { data, error } = validateBody(req.body);
  if (error) return res.status(400).json({ error });

  const existing = await prisma.produto.findUnique({ where: { organizationId_sku: { organizationId: req.organizationId, sku: data.sku } } });
  if (existing) return res.status(409).json({ error: "Já existe um produto cadastrado com esse SKU." });

  const produto = await prisma.produto.create({ data: { ...data, organizationId: req.organizationId, origemCadastro: "manual" } });
  res.status(201).json(serializeProduto(produto));
});

// -------- Preferência de visualização da curva ABC (por usuário, não por organização) --------
router.put("/preferencias/abc-criterio", async (req, res) => {
  const { criterio } = req.body;
  if (criterio !== "giro" && criterio !== "faturamento") return res.status(400).json({ error: "Critério inválido." });
  await prisma.user.update({ where: { id: req.userId }, data: { sortimentoAbcCriterio: criterio } });
  res.json({ ok: true, criterio });
});

// -------- Upload de planilha (mesmo padrão de Gestão/DRE): find-or-create por SKU --------
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const { headers, data, errors } = parseSpreadsheet(req.file.buffer, req.file.originalname);
  if (errors.length) return res.status(400).json({ error: "Não foi possível ler a planilha.", details: errors });
  if (!data.length) return res.status(400).json({ error: "A planilha está vazia." });

  const headersMatch = CANONICAL_HEADERS.every((h) => headers.includes(h));
  let mapping = null;
  if (!headersMatch) {
    mapping = await mapProdutoColumns(headers, data.slice(0, 3));
    if (!mapping || !mapping.produto || !mapping.sku) {
      return res.status(400).json({
        error: "Não conseguimos identificar as colunas dessa planilha automaticamente. Tente usar o formato padrão (produto, sku, categoria, marca, subcategoria, cmv, precoAtacado, precoPSV, descontoAtacado, descontoPSV, estoqueAtual, giroMedioMensal, coberturaIdealDias) ou verifique se a IA está configurada.",
      });
    }
  }
  const col = (field) => (headersMatch ? field : mapping[field]);
  const numOrNull = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  let created = 0, updated = 0, skipped = 0;
  for (const row of data) {
    const produtoNome = col("produto") ? String(row[col("produto")] || "").trim() : "";
    const sku = col("sku") ? String(row[col("sku")] || "").trim() : "";
    if (!produtoNome || !sku) { skipped++; continue; }

    const payload = {
      produto: produtoNome,
      categoria: col("categoria") ? row[col("categoria")] || null : null,
      marca: col("marca") ? row[col("marca")] || null : null,
      subcategoria: col("subcategoria") ? row[col("subcategoria")] || null : null,
      cmv: numOrNull(col("cmv") && row[col("cmv")]),
      precoAtacado: numOrNull(col("precoAtacado") && row[col("precoAtacado")]),
      precoPSV: numOrNull(col("precoPSV") && row[col("precoPSV")]),
      descontoAtacado: numOrNull(col("descontoAtacado") && row[col("descontoAtacado")]),
      descontoPSV: numOrNull(col("descontoPSV") && row[col("descontoPSV")]),
      estoqueAtual: numOrNull(col("estoqueAtual") && row[col("estoqueAtual")]) ?? 0,
      giroMedioMensal: numOrNull(col("giroMedioMensal") && row[col("giroMedioMensal")]),
      coberturaIdealDias: col("coberturaIdealDias") ? Math.round(numOrNull(row[col("coberturaIdealDias")]) ?? 0) || null : null,
    };

    const existing = await prisma.produto.findUnique({ where: { organizationId_sku: { organizationId: req.organizationId, sku } } });
    if (existing) {
      await prisma.produto.update({ where: { id: existing.id }, data: payload });
      updated++;
    } else {
      await prisma.produto.create({ data: { ...payload, sku, organizationId: req.organizationId, origemCadastro: "planilha" } });
      created++;
    }
  }

  res.json({ created, updated, skipped, mappingUsed: mapping });
});

// -------- Tabela de preços pública: status do link atual --------
router.get("/tabela-publica", async (req, res) => {
  const existing = await prisma.tabelaPrecoPublica.findUnique({ where: { organizationId: req.organizationId } });
  res.json(existing ? { token: existing.token, slug: existing.slug, createdAt: existing.createdAt } : null);
});

// Gerar sempre REVOGA o link anterior — é a decisão do usuário (não um link fixo pra sempre).
// Apaga e recria numa transação pra nunca deixar a organização com dois tokens nem com zero
// por um instante em caso de erro no meio do caminho.
router.post("/tabela-publica/gerar", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.organizationId }, select: { name: true } });
  const slug = slugify(org?.name);
  // 4 bytes (8 caracteres hex) é de sobra pra não adivinharem por tentativa — a URL fica curta
  // de propósito, já que agora tem o nome da empresa junto (link mais legível pra compartilhar).
  const token = crypto.randomBytes(4).toString("hex");
  await prisma.$transaction([
    prisma.tabelaPrecoPublica.deleteMany({ where: { organizationId: req.organizationId } }),
    prisma.tabelaPrecoPublica.create({ data: { organizationId: req.organizationId, token, slug } }),
  ]);
  res.json({ token, slug });
});

router.delete("/tabela-publica", async (req, res) => {
  await prisma.tabelaPrecoPublica.deleteMany({ where: { organizationId: req.organizationId } });
  res.json({ ok: true });
});

// -------- A partir daqui, só rotas genéricas por :id --------
router.get("/:id", async (req, res) => {
  const produto = await prisma.produto.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!produto) return res.status(404).json({ error: "Produto não encontrado." });
  const { porProduto } = await calcularAlocacoes(prisma, req.organizationId, { produtoIds: [produto.id] });
  res.json(serializeProduto(produto, porProduto[produto.id]));
});

router.put("/:id", async (req, res) => {
  const existing = await prisma.produto.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!existing) return res.status(404).json({ error: "Produto não encontrado." });

  const { data, error } = validateBody(req.body, { partial: true });
  if (error) return res.status(400).json({ error });

  const produto = await prisma.produto.update({ where: { id: existing.id }, data });
  const { porProduto } = await calcularAlocacoes(prisma, req.organizationId, { produtoIds: [produto.id] });
  res.json(serializeProduto(produto, porProduto[produto.id]));
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.produto.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!existing) return res.status(404).json({ error: "Produto não encontrado." });
  await prisma.produto.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
