import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { prisma } from "../lib/prisma.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const text = req.file.buffer.toString("utf-8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    return res.status(400).json({ error: "Não foi possível ler o CSV.", details: parsed.errors });
  }

  const rows = parsed.data.map((r) => ({
    mes: r.mes, categoria: r.categoria, produto: r.produto, sku: r.sku,
    valor: Number(r.valor) || 0, margem: Number(r.margem) || 0,
    estoque: (r.estoque || "ok").toLowerCase(),
  }));

  const record = await prisma.gestaoUpload.create({
    data: { userId: req.userId, filename: req.file.originalname, rows },
  });
  res.json(record);
});

router.get("/latest", async (req, res) => {
  const record = await prisma.gestaoUpload.findFirst({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(record || null);
});

export default router;

