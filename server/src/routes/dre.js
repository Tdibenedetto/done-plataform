import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { prisma } from "../lib/prisma.js";
import { requireMaster, requireAddon } from "../middleware/auth.js";
import { mapDreColumns, normalizeMesAno, normalizeDreType } from "../lib/claude.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Dado financeiro é sensível — só o Master vê, e só quem tem o add-on DRE ativo (exige Gestão/Completo como base).
router.use(requireMaster, requireAddon("dre", ["gestao", "completo"]));

const TYPES = ["receita", "cmv", "despesa", "imposto"];
const CANONICAL_HEADERS = ["mes", "tipo", "categoria", "valor"];

router.get("/", async (req, res) => {
  const entries = await prisma.dreEntry.findMany({
    where: { organizationId: req.organizationId },
    orderBy: [{ month: "asc" }, { createdAt: "asc" }],
  });
  const org = await prisma.organization.findUnique({ where: { id: req.organizationId }, select: { dreSaldoInicial: true } });
  res.json({ entries, saldoInicial: org.dreSaldoInicial });
});

router.post("/", async (req, res) => {
  const { month, type, category, amount } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Mês inválido — use o formato AAAA-MM." });
  if (!TYPES.includes(type)) return res.status(400).json({ error: "Tipo de lançamento inválido." });
  if (!category?.trim()) return res.status(400).json({ error: "Informe uma categoria." });
  const n = Number(amount);
  if (isNaN(n) || n <= 0) return res.status(400).json({ error: "Valor inválido." });

  const entry = await prisma.dreEntry.create({
    data: { organizationId: req.organizationId, month, type, category: category.trim(), amount: n },
  });
  res.json(entry);
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.dreEntry.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } });
  if (!existing) return res.status(404).json({ error: "Lançamento não encontrado." });
  await prisma.dreEntry.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

router.put("/saldo-inicial", async (req, res) => {
  const n = Number(req.body.saldoInicial);
  if (isNaN(n)) return res.status(400).json({ error: "Valor inválido." });
  await prisma.organization.update({ where: { id: req.organizationId }, data: { dreSaldoInicial: n } });
  res.json({ ok: true });
});

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const text = req.file.buffer.toString("utf-8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) return res.status(400).json({ error: "Não foi possível ler o CSV.", details: parsed.errors });
  if (!parsed.data.length) return res.status(400).json({ error: "A planilha está vazia." });

  const headers = parsed.meta.fields || [];
  const headersMatch = CANONICAL_HEADERS.every((h) => headers.includes(h));

  let rows;
  let mappingUsed = null;

  if (headersMatch) {
    rows = parsed.data.map((r) => ({
      mes: normalizeMesAno(r.mes),
      tipo: TYPES.includes(String(r.tipo).toLowerCase()) ? String(r.tipo).toLowerCase() : normalizeDreType(r.tipo),
      categoria: r.categoria || "Sem categoria",
      valor: Number(String(r.valor).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0,
    }));
  } else {
    const sample = parsed.data.slice(0, 3);
    const mapping = await mapDreColumns(headers, sample);
    if (!mapping || !mapping.valor) {
      return res.status(400).json({
        error: "Não conseguimos identificar as colunas dessa planilha automaticamente. Tente usar o formato padrão (mes, tipo, categoria, valor) ou verifique se a IA está configurada.",
      });
    }
    mappingUsed = mapping;
    rows = parsed.data.map((r) => ({
      mes: normalizeMesAno(mapping.mes ? r[mapping.mes] : ""),
      tipo: normalizeDreType(mapping.tipo ? r[mapping.tipo] : ""),
      categoria: mapping.categoria ? r[mapping.categoria] : "Sem categoria",
      valor: Number(String(mapping.valor ? r[mapping.valor] : 0).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0,
    }));
  }

  const valid = rows.filter((r) => r.mes && r.valor > 0);
  const skipped = rows.length - valid.length;
  if (!valid.length) {
    return res.status(400).json({ error: "Nenhuma linha válida encontrada — confira se as colunas de mês e valor estão preenchidas." });
  }

  await prisma.dreEntry.createMany({
    data: valid.map((r) => ({ organizationId: req.organizationId, month: r.mes, type: r.tipo, category: r.categoria, amount: r.valor })),
  });

  res.json({ imported: valid.length, skipped, autoMapped: !!mappingUsed, mapping: mappingUsed });
});

export default router;
