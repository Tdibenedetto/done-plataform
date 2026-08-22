import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const router = Router();

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
}
function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, company: user.company };
}

router.post("/register", async (req, res) => {
  const { email, password, name, company } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Já existe uma conta com esse e-mail." });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash, name, company } });
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "E-mail ou senha inválidos." });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos." });
  res.json({ token: signToken(user), user: publicUser(user) });
});

export default router;
