import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { prisma } from "../lib/prisma.js";
import { requireMaster } from "../middleware/auth.js";
import { mapSpreadsheetColumns, normalizeMes, normalizeMargem, normalizeEstoque } from "../lib/claude.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const CANONICAL_HEADERS = ["mes", "categoria", "produto", "sku", "valor", "margem", "estoque"];

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const text = req.file.buffer.toString("utf-8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    return res.status(400).json({ error: "Não foi possível ler o CSV.", details: parsed.errors });
  }
  if (!parsed.data.length) {
    return res.status(400).json({ error: "A planilha está vazia." });
  }

  const headers = parsed.meta.fields || [];
  const headersMatch = CANONICAL_HEADERS.every((h) => headers.includes(h));

  let rows;
  let mappingUsed = null;

  if (headersMatch) {
    // Caminho rápido: já está no formato esperado — sem chamar a IA.
    rows = parsed.data.map((r) => ({
      mes: r.mes, categoria: r.categoria, produto: r.produto, sku: r.sku,
      valor: Number(r.valor) || 0, margem: Number(r.margem) || 0,
      estoque: (r.estoque || "ok").toLowerCase(),
    }));
  } else {
    // Formato diferente — pede pra IA identificar quais colunas correspondem a quê.
    const sample = parsed.data.slice(0, 3);
    const mapping = await mapSpreadsheetColumns(headers, sample);

    if (!mapping || !mapping.produto || !mapping.valor) {
      return res.status(400).json({
        error: "Não conseguimos identificar as colunas dessa planilha automaticamente. Tente usar o formato padrão (mes, categoria, produto, sku, valor, margem, estoque) ou verifique se a IA está configurada.",
      });
    }
    mappingUsed = mapping;
    rows = parsed.data.map((r) => ({
      mes: normalizeMes(mapping.mes ? r[mapping.mes] : ""),
      categoria: mapping.categoria ? r[mapping.categoria] : "Sem categoria",
      produto: mapping.produto ? r[mapping.produto] : "",
      sku: mapping.sku ? r[mapping.sku] : "",
      valor: Number(String(mapping.valor ? r[mapping.valor] : 0).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0,
      margem: normalizeMargem(mapping.margem ? r[mapping.margem] : 0),
      estoque: normalizeEstoque(mapping.estoque ? r[mapping.estoque] : "ok"),
    }));
  }

  const record = await prisma.gestaoUpload.create({
    data: { organizationId: req.organizationId, filename: req.file.originalname, rows },
  });
  res.json({ ...record, autoMapped: !!mappingUsed, mapping: mappingUsed });
});

// Combina os dados de TODOS os uploads já feitos — dá o histórico completo, não só o último envio.
router.get("/all", async (req, res) => {
  const uploads = await prisma.gestaoUpload.findMany({
    where: { organizationId: req.organizationId },
    orderBy: { createdAt: "asc" },
  });

  const rows = [];
  for (const u of uploads) {
    for (const r of u.rows) {
      rows.push({ ...r, _uploadId: u.id, _uploadDate: u.createdAt });
    }
  }

  res.json({
    uploads: uploads.map((u) => ({ id: u.id, filename: u.filename, createdAt: u.createdAt })),
    rows,
  });
});

router.get("/latest", async (req, res) => {
  const record = await prisma.gestaoUpload.findFirst({
    where: { organizationId: req.organizationId },
    orderBy: { createdAt: "desc" },
  });
  res.json(record || null);
});

// -------- Metas de faturamento (por mês, no nível da empresa) --------
router.get("/goals", async (req, res) => {
  const goals = await prisma.revenueGoal.findMany({ where: { organizationId: req.organizationId } });
  res.json(goals);
});

router.put("/goals", requireMaster, async (req, res) => {
  const { month, target } = req.body;
  if (!month) return res.status(400).json({ error: "Mês é obrigatório." });
  const goal = await prisma.revenueGoal.upsert({
    where: { organizationId_month: { organizationId: req.organizationId, month } },
    update: { target: Number(target) || 0 },
    create: { organizationId: req.organizationId, month, target: Number(target) || 0 },
  });
  res.json(goal);
});

export default router;
