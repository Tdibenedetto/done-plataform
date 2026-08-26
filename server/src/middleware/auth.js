import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Não autenticado." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "Sessão inválida ou expirada." });
    req.userId = user.id;
    req.organizationId = user.organizationId;
    req.userRole = user.role;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
}

export function requireMaster(req, res, next) {
  if (req.userRole !== "master") {
    return res.status(403).json({ error: "Apenas o usuário Master pode fazer isso." });
  }
  next();
}

// Exige que a organização tenha uma assinatura ativa de Vendas, Gestão ou Completo.
export async function requirePaidModule(req, res, next) {
  const sub = await prisma.subscription.findFirst({
    where: { organizationId: req.organizationId, status: "active", module: { in: ["vendas", "gestao", "completo"] } },
  });
  if (!sub) {
    return res.status(402).json({ error: "Este recurso é exclusivo para assinantes de Vendas, Gestão ou do Pacote Completo." });
  }
  next();
}

