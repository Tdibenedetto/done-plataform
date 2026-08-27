import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireMaster, requireAddon } from "../middleware/auth.js";

const router = Router();

// Dado financeiro é sensível — só o Master vê, e só quem tem o add-on DRE ativo (exige Gestão/Completo como base).
router.use(requireMaster, requireAddon("dre", ["gestao", "completo"]));

const TYPES = ["receita", "cmv", "despesa", "imposto"];

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

export default router;
