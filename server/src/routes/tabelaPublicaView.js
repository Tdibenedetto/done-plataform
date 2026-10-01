import { Router } from "express";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";

const router = Router();

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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
router.get("/tabela/:token", async (req, res) => {
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

  const rows = produtos.map((p) => {
    const atacado = precoComDesconto(p.precoAtacado, p.descontoAtacado);
    const psv = precoComDesconto(p.precoPSV, p.descontoPSV);
    const disponivel = p.estoqueAtual > 0;
    const temCompra = p.compraProducao != null && p.compraProducao > 0;
    const mesChegada = temCompra && p.dataChegada ? `${MESES[new Date(p.dataChegada).getUTCMonth()]}/${new Date(p.dataChegada).getUTCFullYear()}` : null;

    return `<tr>
      <td>${p.fotoUrl ? `<img class="thumb" src="${escAttr(p.fotoUrl)}">` : `<div class="thumb"></div>`}</td>
      <td class="code">${esc(p.sku)}</td>
      <td>${esc(p.produto)}</td>
      <td>${atacado ? (atacado.temDesconto ? `<span class="price-old">${fmtBRL(atacado.original)}</span><span class="price-new">${fmtBRL(atacado.final)}</span>` : fmtBRL(atacado.original)) : "—"}</td>
      <td>${psv ? (psv.temDesconto ? `<span class="price-old">${fmtBRL(psv.original)}</span><span class="price-new">${fmtBRL(psv.final)}</span>` : fmtBRL(psv.original)) : "—"}</td>
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
  .page { max-width:1100px; margin:0 auto; padding:36px 24px; }
  .top { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:4px; }
  .client-logo { height:34px; max-width:220px; object-fit:contain; }
  .client-logo-fallback { font-family:'Lora',serif; font-weight:700; font-size:20px; color:var(--ink); }
  .date { font-size:12px; color:var(--muted); }
  .title { font-family:'Lora',serif; font-size:26px; font-weight:600; color:var(--ink); margin:14px 0 4px; }
  .subtitle { font-size:12.5px; color:var(--muted); margin-bottom:20px; }
  .btn-download { font-size:12.5px; font-weight:700; padding:10px 18px; border-radius:8px; background:var(--ink); color:#fff; border:none; cursor:pointer; text-decoration:none; display:inline-block; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-top:16px; }
  th { text-align:left; font-size:9.5px; font-weight:700; letter-spacing:0.3px; color:var(--muted); text-transform:uppercase; padding:12px 14px; background:#FAF9F5; border-bottom:1px solid var(--border); }
  td { padding:12px 14px; font-size:12.5px; color:#2A2E3A; border-bottom:1px solid var(--border); vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  .thumb { width:38px; height:38px; border-radius:6px; object-fit:cover; background:#EDEBE4; }
  .code { font-size:10.5px; color:var(--muted); }
  .price-old { text-decoration:line-through; color:var(--muted); font-size:11px; margin-right:6px; }
  .price-new { color:var(--danger); font-weight:700; }
  .yes { color:var(--sage); font-weight:700; }
  .no { color:var(--muted); }
  .empty { padding:40px; text-align:center; color:var(--muted); font-size:13px; }
  .foot { margin-top:18px; font-size:11px; color:var(--muted); text-align:center; }
  @media (max-width:700px) { table, thead, tbody, th, td, tr { display:block; } thead { display:none; } tr { border-bottom:2px solid var(--border); padding:10px 0; } td { border:none; padding:4px 14px; } }
</style>
</head><body>
<div class="page">
  <div class="top">${brandHtml}<div class="date">Atualizado em ${hoje}</div></div>
  <div class="title">Tabela de Preços</div>
  <div class="subtitle">Consulte os preços vigentes. Para pedidos, fale com seu representante comercial.</div>
  <a class="btn-download" href="/tabela/${req.params.token}/download">⬇ Baixar tabela (Excel)</a>
  ${produtos.length === 0 ? `<div class="empty">Nenhum produto disponível no momento.</div>` : `
  <table>
    <thead><tr><th></th><th>Código</th><th>Descrição</th><th>Preço Atacado</th><th>PSV</th><th>Estoque</th><th>Compras</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`}
  <div class="foot">Página gerada automaticamente pela D.O.N.E — os preços podem mudar sem aviso prévio.</div>
</div>
</body></html>`);
});

// -------- Download em Excel --------
router.get("/tabela/:token/download", async (req, res) => {
  const data = await loadTabela(req.params.token);
  if (!data) return res.status(404).send("Link inválido.");

  const rows = data.produtos.map((p) => {
    const atacado = precoComDesconto(p.precoAtacado, p.descontoAtacado);
    const psv = precoComDesconto(p.precoPSV, p.descontoPSV);
    const temCompra = p.compraProducao != null && p.compraProducao > 0;
    const mesChegada = temCompra && p.dataChegada ? `${MESES[new Date(p.dataChegada).getUTCMonth()]}/${new Date(p.dataChegada).getUTCFullYear()}` : "";
    return {
      "Código": p.sku,
      "Descrição": p.produto,
      "Preço Atacado": atacado ? Number(atacado.final.toFixed(2)) : null,
      "PSV": psv ? Number(psv.final.toFixed(2)) : null,
      "Estoque": p.estoqueAtual > 0 ? "Disponível" : "Indisponível",
      "Compras": temCompra ? `Sim — ${mesChegada || "a definir"}` : "Não",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tabela de Preços");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="tabela-de-precos.xlsx"`);
  res.send(buffer);
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
