import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";

const router = Router();

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

async function loadTabela(token) {
  const link = await prisma.tabelaPrecoPublica.findUnique({ where: { token }, include: { organization: { select: { name: true, logoUrl: true } } } });
  if (!link) return null;
  const produtos = await prisma.produto.findMany({ where: { organizationId: link.organizationId, status: "ativo" }, orderBy: { produto: "asc" } });
  return { organization: link.organization, produtos };
}

function precoComDesconto(preco, desconto) {
  if (preco == null) return null;
  if (!desconto) return { original: preco, final: preco, temDesconto: false };
  return { original: preco, final: preco * (1 - desconto / 100), temDesconto: true };
}

function fmtBRL(n) {
  return n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// -------- Página pública (HTML) --------
// :slug é só estético (aparece bonito na URL) — quem realmente autoriza o acesso é o :token.
router.get("/tabela/:slug/:token", async (req, res) => {
  const data = await loadTabela(req.params.token);
  if (!data) {
    res.status(404).send("<html><body style='font-family:sans-serif; padding:40px; color:#A6462F;'>Este link não existe mais — pode ter sido revogado. Peça um link novo a quem te enviou este.</body></html>");
    return;
  }

  const { organization, produtos } = data;
  const hoje = new Date().toLocaleDateString("pt-BR");
  const brandHtml = organization.logoUrl
    ? `<img class="client-logo" src="${escAttr(organization.logoUrl)}" alt="${esc(organization.name)}">`
    : `<div class="client-logo-fallback">${esc(organization.name)}</div>`;

  const categorias = [...new Set(produtos.map((p) => p.categoria).filter(Boolean))].sort();

  const rows = produtos.map((p) => {
    const atacado = precoComDesconto(p.precoAtacado, p.descontoAtacado);
    const varejo = precoComDesconto(p.precoPSV, p.descontoPSV);
    const disponivel = p.estoqueAtual > 0;
    const temCompra = p.compraProducao != null && p.compraProducao > 0;
    const mesChegada = temCompra && p.dataChegada ? `${MESES[new Date(p.dataChegada).getUTCMonth()]}/${new Date(p.dataChegada).getUTCFullYear()}` : null;
    const descontoTxt = [
      p.descontoAtacado ? `Atacado ${p.descontoAtacado}%` : null,
      p.descontoPSV ? `Varejo ${p.descontoPSV}%` : null,
    ].filter(Boolean).join(" / ") || "—";

    return `<tr data-nome="${escAttr((p.produto + " " + p.sku).toLowerCase())}" data-categoria="${escAttr(p.categoria || "")}" data-preco-atacado="${atacado ? atacado.final : 0}" data-preco-varejo="${varejo ? varejo.final : 0}">
      <td>${p.fotoUrl ? `<img class="thumb" src="${escAttr(p.fotoUrl)}">` : `<div class="thumb"></div>`}</td>
      <td class="code">${esc(p.sku)}</td>
      <td>${esc(p.produto)}</td>
      <td>${atacado ? (atacado.temDesconto ? `<span class="price-old">${fmtBRL(atacado.original)}</span><span class="price-new">${fmtBRL(atacado.final)}</span>` : fmtBRL(atacado.original)) : "—"}</td>
      <td>${varejo ? (varejo.temDesconto ? `<span class="price-old">${fmtBRL(varejo.original)}</span><span class="price-new">${fmtBRL(varejo.final)}</span>` : fmtBRL(varejo.original)) : "—"}</td>
      <td>${descontoTxt}</td>
      <td>${disponivel ? `<span class="yes">Disponível</span>` : `<span class="no">Indisponível</span>`}</td>
      <td>${temCompra ? `<span class="yes">Sim — ${mesChegada || "a definir"}</span>` : `<span class="no">Não</span>`}</td>
    </tr>`;
  }).join("\n");

  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tabela de Preços — ${esc(organization.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;0,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --ink:#1C2130; --gold:#B8863A; --sage:#3B6B57; --danger:#A6462F; --paper:#FAF9F5; --card:#FFFFFF; --muted:#8A8F9C; --border:#E5E2D9; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; background:var(--paper); }
  .page { max-width:1200px; margin:0 auto; padding:36px 24px; }
  .top { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:4px; }
  .client-logo { height:34px; max-width:220px; object-fit:contain; }
  .client-logo-fallback { font-family:'Lora',serif; font-weight:700; font-size:20px; color:var(--ink); }
  .date { font-size:12px; color:var(--muted); }
  .title { font-family:'Lora',serif; font-size:26px; font-weight:600; color:var(--ink); margin:14px 0 4px; }
  .subtitle { font-size:12.5px; color:var(--muted); margin-bottom:20px; }
  .btn-download { font-size:12.5px; font-weight:700; padding:10px 18px; border-radius:8px; background:var(--ink); color:#fff; border:none; cursor:pointer; text-decoration:none; display:inline-block; }
  .controls { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; align-items:center; }
  .controls input, .controls select { font-family:'Inter',sans-serif; font-size:12.5px; padding:9px 12px; border-radius:8px; border:1px solid var(--border); background:var(--card); }
  .controls input { flex:1 1 220px; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-top:14px; }
  th { text-align:left; font-size:9.5px; font-weight:700; letter-spacing:0.3px; color:var(--muted); text-transform:uppercase; padding:12px 14px; background:#FAF9F5; border-bottom:1px solid var(--border); }
  td { padding:12px 14px; font-size:12.5px; color:#2A2E3A; border-bottom:1px solid var(--border); vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  .thumb { width:38px; height:38px; border-radius:6px; object-fit:cover; background:#EDEBE4; }
  .code { font-size:10.5px; color:var(--muted); }
  .price-old { text-decoration:line-through; color:var(--muted); font-size:11px; margin-right:6px; }
  .price-new { color:var(--danger); font-weight:700; }
  .yes { color:var(--sage); font-weight:700; }
  .no { color:var(--muted); }
  .empty, .no-results { padding:40px; text-align:center; color:var(--muted); font-size:13px; }
  .no-results { display:none; }
  .foot { margin-top:18px; font-size:11px; color:var(--muted); text-align:center; }
  @media (max-width:700px) { table, thead, tbody, th, td, tr { display:block; } thead { display:none; } tr { border-bottom:2px solid var(--border); padding:10px 0; } td { border:none; padding:4px 14px; } }
</style>
</head><body>
<div class="page">
  <div class="top">${brandHtml}<div class="date">Atualizado em ${hoje}</div></div>
  <div class="title">Tabela de Preços</div>
  <div class="subtitle">Consulte os preços vigentes. Para pedidos, fale com seu representante comercial.</div>
  <a class="btn-download" href="/tabela/${encodeURIComponent(req.params.slug)}/${req.params.token}/download">⬇ Baixar tabela (PDF)</a>
  ${produtos.length === 0 ? `<div class="empty">Nenhum produto disponível no momento.</div>` : `
  <div class="controls">
    <input id="busca" type="text" placeholder="Buscar por nome ou código...">
    ${categorias.length > 0 ? `<select id="filtroCategoria"><option value="">Todas as categorias</option>${categorias.map((c) => `<option value="${escAttr(c)}">${esc(c)}</option>`).join("")}</select>` : ""}
    <select id="ordenar">
      <option value="nome">Nome (A-Z)</option>
      <option value="atacado-asc">Preço Atacado (menor primeiro)</option>
      <option value="atacado-desc">Preço Atacado (maior primeiro)</option>
      <option value="varejo-asc">Preço Varejo (menor primeiro)</option>
      <option value="varejo-desc">Preço Varejo (maior primeiro)</option>
    </select>
  </div>
  <table>
    <thead><tr><th></th><th>Código</th><th>Descrição</th><th>Preço Atacado</th><th>Preço Varejo</th><th>Desconto</th><th>Estoque</th><th>Compras</th></tr></thead>
    <tbody id="corpoTabela">${rows}</tbody>
  </table>
  <div class="no-results" id="semResultado">Nenhum produto encontrado com esse filtro.</div>
  `}
  <div class="foot">Página gerada automaticamente pela D.O.N.E — os preços podem mudar sem aviso prévio.</div>
</div>
<script>
  const corpo = document.getElementById('corpoTabela');
  const busca = document.getElementById('busca');
  const filtroCategoria = document.getElementById('filtroCategoria');
  const ordenar = document.getElementById('ordenar');
  const semResultado = document.getElementById('semResultado');

  function aplicarFiltro() {
    if (!corpo) return;
    const termo = (busca?.value || '').toLowerCase().trim();
    const categoria = filtroCategoria?.value || '';
    let visiveis = 0;
    for (const tr of corpo.querySelectorAll('tr')) {
      const bateNome = !termo || tr.dataset.nome.includes(termo);
      const bateCategoria = !categoria || tr.dataset.categoria === categoria;
      const mostra = bateNome && bateCategoria;
      tr.style.display = mostra ? '' : 'none';
      if (mostra) visiveis++;
    }
    if (semResultado) semResultado.style.display = visiveis === 0 ? 'block' : 'none';
  }

  function aplicarOrdenacao() {
    if (!corpo) return;
    const modo = ordenar?.value || 'nome';
    const linhas = [...corpo.querySelectorAll('tr')];
    linhas.sort((a, b) => {
      if (modo === 'nome') return a.dataset.nome.localeCompare(b.dataset.nome);
      const campo = modo.startsWith('atacado') ? 'precoAtacado' : 'precoVarejo';
      const dir = modo.endsWith('asc') ? 1 : -1;
      return (parseFloat(a.dataset[campo]) - parseFloat(b.dataset[campo])) * dir;
    });
    linhas.forEach((tr) => corpo.appendChild(tr));
  }

  busca?.addEventListener('input', aplicarFiltro);
  filtroCategoria?.addEventListener('change', aplicarFiltro);
  ordenar?.addEventListener('change', aplicarOrdenacao);
</script>
</body></html>`);
});

// Busca o logo como buffer pra embutir no PDF — pdfkit não aceita URL direto, só PNG/JPEG.
// Se o link falhar ou for um formato que o pdfkit não lê (SVG, WebP...), cai pro título em
// texto puro — igual ao comportamento da página HTML quando o logo não carrega.
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

const PDF_COLS = [
  { key: "sku", label: "Código", width: 50 },
  { key: "produto", label: "Descrição", width: 130 },
  { key: "atacado", label: "Atacado", width: 68 },
  { key: "varejo", label: "Varejo", width: 68 },
  { key: "desconto", label: "Desconto", width: 60 },
  { key: "estoque", label: "Estoque", width: 64 },
  { key: "compras", label: "Compras", width: 75 },
];
const PDF_MARGIN = 40;
const PDF_INK = "#1C2130", PDF_GOLD = "#B8863A", PDF_MUTED = "#8A8F9C", PDF_BORDER = "#E5E2D9";

function pdfTableHeader(doc, x) {
  const rowH = 20;
  const rowY = doc.y; // fixo ANTES do laço — doc.text() com x/y explícitos ainda mexe em doc.y
  // internamente a cada chamada, então sem isso cada coluna empurrava a próxima pra baixo.
  doc.rect(x, rowY, PDF_COLS.reduce((s, c) => s + c.width, 0), rowH).fill("#FAF9F5");
  doc.fillColor(PDF_MUTED).fontSize(8).font("Helvetica-Bold");
  let cx = x;
  for (const col of PDF_COLS) {
    doc.text(col.label.toUpperCase(), cx + 4, rowY + 6, { width: col.width - 8, lineBreak: false });
    cx += col.width;
  }
  doc.y = rowY + rowH; // avança manualmente, não confia no que text() deixou
  doc.font("Helvetica").fillColor(PDF_INK);
}

// -------- Download em PDF --------
router.get("/tabela/:slug/:token/download", async (req, res) => {
  const data = await loadTabela(req.params.token);
  if (!data) return res.status(404).send("Link inválido.");
  const { organization, produtos } = data;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="tabela-de-precos.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: PDF_MARGIN, bufferPages: true });
  doc.pipe(res);

  const logoBuf = await fetchImageBuffer(organization.logoUrl);
  const tituloX = PDF_MARGIN;
  let tituloY = PDF_MARGIN;
  if (logoBuf) {
    try {
      doc.image(logoBuf, PDF_MARGIN, PDF_MARGIN, { fit: [90, 36] });
      tituloY = PDF_MARGIN + 44;
    } catch {
      // formato que o pdfkit não lê (ex: SVG/WebP) — segue só com o título, sem derrubar o PDF
    }
  }
  doc.font("Helvetica-Bold").fontSize(16).fillColor(PDF_INK)
    .text(`Tabela de Preços — ${organization.name}`, tituloX, tituloY, { width: 515 });
  doc.moveDown(1.4);

  const tableX = PDF_MARGIN;
  const tableWidth = PDF_COLS.reduce((s, c) => s + c.width, 0);
  const bottomLimit = doc.page.height - PDF_MARGIN - 20; // espaço reservado pro rodapé

  pdfTableHeader(doc, tableX);

  for (const p of produtos) {
    const atacado = precoComDesconto(p.precoAtacado, p.descontoAtacado);
    const varejo = precoComDesconto(p.precoPSV, p.descontoPSV);
    const temCompra = p.compraProducao != null && p.compraProducao > 0;
    const mesChegada = temCompra && p.dataChegada ? `${MESES_ABREV[new Date(p.dataChegada).getUTCMonth()]}/${new Date(p.dataChegada).getUTCFullYear()}` : "";
    const descontoTxt = [
      p.descontoAtacado ? `Ata. ${p.descontoAtacado}%` : null,
      p.descontoPSV ? `Var. ${p.descontoPSV}%` : null,
    ].filter(Boolean).join(" / ") || "—";

    const rowH = 18;
    if (doc.y + rowH > bottomLimit) {
      doc.addPage();
      doc.y = PDF_MARGIN;
      pdfTableHeader(doc, tableX);
    }

    const rowY = doc.y; // mesmo cuidado do cabeçalho — fixa antes, não deixa text() acumular
    doc.rect(tableX, rowY, tableWidth, rowH).strokeColor(PDF_BORDER).lineWidth(0.5).stroke();
    const values = {
      sku: p.sku,
      produto: p.produto,
      atacado: atacado ? fmtBRL(atacado.final) : "—",
      varejo: varejo ? fmtBRL(varejo.final) : "—",
      desconto: descontoTxt,
      estoque: p.estoqueAtual > 0 ? "Disponível" : "Indisponível",
      compras: temCompra ? `Sim — ${mesChegada || "a definir"}` : "Não",
    };
    let cx = tableX;
    doc.fontSize(8).fillColor(PDF_INK);
    for (const col of PDF_COLS) {
      doc.text(String(values[col.key] ?? ""), cx + 4, rowY + 5, { width: col.width - 8, height: rowH - 4, ellipsis: true, lineBreak: false });
      cx += col.width;
    }
    doc.y = rowY + rowH;
  }

  // Rodapé com a data do download, em TODAS as páginas — só dá pra saber quantas páginas
  // existem depois de desenhar tudo, por isso isso roda no final, não página por página.
  const dataDownload = new Date().toLocaleDateString("pt-BR") + " às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // A margem inferior da página (40pt) faz o pdfkit entender "estourou" e criar uma página
    // nova sozinho sempre que o texto é colocado dentro dela — mesmo com posição explícita.
    // Desativa só pra essa escrita, já que é exatamente ali (na margem) que o rodapé mora.
    const margemOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(7.5).fillColor(PDF_MUTED).text(
      `Baixado em ${dataDownload} — Página ${i + 1} de ${range.count}`,
      PDF_MARGIN, doc.page.height - PDF_MARGIN + 4,
      { width: doc.page.width - PDF_MARGIN * 2, align: "center", lineBreak: false }
    );
    doc.page.margins.bottom = margemOriginal;
  }

  doc.end();
});

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Pra usar dentro de atributos (src, href): além de escapar HTML, bloqueia esquemas perigosos
// (javascript:) já que o link de logo/foto é colado livremente pelo usuário, sem validação de domínio.
function escAttr(url) {
  const clean = String(url ?? "").trim();
  if (/^javascript:/i.test(clean)) return "";
  return esc(clean);
}

export default router;
