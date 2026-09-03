import "dotenv/config";
import { prisma } from "../lib/prisma.js";

const RECHECK_INTERVAL_DAYS = 7; // não faz sentido reconsultar todo dia — situação cadastral muda raramente

async function fetchSituacao(cnpj) {
  const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DONE-Platform/1.0)", "Accept": "application/json" },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return { situacao: data.descricao_situacao_cadastral || null, companyName: data.razao_social || data.nome_fantasia || null };
}

/**
 * Reconsulta CNPJs marcados para monitoramento contínuo e registra um alerta
 * quando a situação cadastral muda desde a última checagem. Reaproveitável em
 * processo (agendador leve) e via CLI standalone.
 *
 * options.organizationId: restringe a checagem a uma única organização.
 * options.skipInterval: ignora o intervalo de 7 dias (usado em teste manual).
 */
export async function runCnpjMonitorCheck(options = {}) {
  const { organizationId = null, skipInterval = false } = options;

  const staleBefore = new Date(Date.now() - RECHECK_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

  const analyses = await prisma.creditAnalysis.findMany({
    where: {
      monitoring: true,
      ...(organizationId ? { organizationId } : {}),
      ...(skipInterval ? {} : { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: staleBefore } }] }),
      organization: {
        subscriptions: { some: { status: { in: ["active", "trialing"] }, module: { in: ["vendas", "gestao", "completo"] } } },
      },
    },
  });

  let checked = 0, changed = 0;

  for (const a of analyses) {
    try {
      const fresh = await fetchSituacao(a.cnpj);
      checked += 1;
      if (!fresh) continue;

      if (fresh.situacao && fresh.situacao !== a.situacao) {
        await prisma.creditAlert.create({
          data: {
            organizationId: a.organizationId,
            creditAnalysisId: a.id,
            cnpj: a.cnpj,
            companyName: fresh.companyName || a.companyName,
            previousSituacao: a.situacao,
            newSituacao: fresh.situacao,
          },
        });
        changed += 1;
      }

      await prisma.creditAnalysis.update({
        where: { id: a.id },
        data: { lastCheckedAt: new Date(), situacao: fresh.situacao || a.situacao, companyName: fresh.companyName || a.companyName },
      });
    } catch (e) {
      console.error(`[cnpj-monitor] falha ao checar ${a.cnpj}:`, e.message);
    }
  }

  console.log(`[cnpj-monitor] verificação concluída — ${checked} CNPJ(s) checado(s), ${changed} mudança(s) de situação detectada(s).`);
  return { checked, changed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCnpjMonitorCheck()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error("[cnpj-monitor] falha geral:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
