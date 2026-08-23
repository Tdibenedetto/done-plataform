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

