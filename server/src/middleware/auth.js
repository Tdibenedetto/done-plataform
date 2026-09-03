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

// Restrito ao Admin Geral da D.O.N.E (o próprio fundador) — não confundir com "master" de organização,
// que é o admin de UMA empresa cliente. Identificado por e-mail (variável PLATFORM_ADMIN_EMAIL no Render),
// não por um papel no banco, para não precisar de migração/seed extra para promover a conta.
export async function requirePlatformAdmin(req, res, next) {
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!adminEmail) return res.status(403).json({ error: "Painel Admin não configurado (PLATFORM_ADMIN_EMAIL ausente)." });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || user.email.toLowerCase() !== adminEmail.toLowerCase()) {
    return res.status(403).json({ error: "Acesso restrito ao Admin Geral da D.O.N.E." });
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

// Exige um add-on pago específico (ex: "dre", "whatsapp"), além do plano base que o add-on requer.
export function requireAddon(addonModule, baseModules) {
  return async (req, res, next) => {
    const [addon, base] = await Promise.all([
      prisma.subscription.findFirst({ where: { organizationId: req.organizationId, status: "active", module: addonModule } }),
      prisma.subscription.findFirst({ where: { organizationId: req.organizationId, status: "active", module: { in: baseModules } } }),
    ]);
    if (!base) {
      return res.status(402).json({ error: `Este recurso exige uma assinatura ativa de ${baseModules.join(" ou ")}.` });
    }
    if (!addon) {
      return res.status(402).json({ error: "Este recurso é um add-on pago à parte — assine para desbloquear." });
    }
    next();
  };
}

