# D.O.N.E — Plataforma

Monorepo com o backend (`server/`) e o frontend (`client/`) da plataforma D.O.N.E:
Comercial Coach, Ferramenta de Vendas e Ferramenta de Gestão.

Mesmo stack usado no Iconic Storm Watch: **GitHub** (código) + **Render** (hospedagem) + **Twilio** (alertas).

## Estrutura

```
done-platform/
├── server/        # API Node.js + Express + Prisma (PostgreSQL)
│   ├── prisma/schema.prisma
│   └── src/
│       ├── routes/       (auth, coach, leads, goals, gestao, billing, alerts)
│       ├── middleware/   (autenticação JWT)
│       └── lib/          (prisma, stripe, twilio, cálculo da nota)
├── client/        # Frontend React + Vite
│   └── src/
│       ├── modules/      (ComercialCoach, Vendas, Gestao)
│       └── lib/api.js    (chamadas à API)
└── render.yaml     # Blueprint de deploy (API + frontend + banco de dados)
```

## Rodando localmente

### 1. Banco de dados
Você precisa de um Postgres. Mais simples: crie um banco free no [Render](https://render.com) ou no [Neon](https://neon.tech), e copie a `DATABASE_URL`.

### 2. Backend
```bash
cd server
cp .env.example .env      # preencha DATABASE_URL, JWT_SECRET, etc.
npm install
npx prisma migrate dev --name init
npm run dev                # roda em http://localhost:4000
```

### 3. Frontend
```bash
cd client
cp .env.example .env       # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                 # roda em http://localhost:5173
```

## Publicando no GitHub

```bash
cd done-platform
git init
git add .
git commit -m "Plataforma D.O.N.E — versão inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/done-platform.git
git push -u origin main
```

## Deploy no Render

Este repositório já inclui um `render.yaml` (Blueprint), igual ao padrão que você já usou na Iconic:

1. No painel do Render, clique em **New → Blueprint**.
2. Conecte o repositório `done-platform` que você acabou de subir no GitHub.
3. O Render vai detectar o `render.yaml` e criar automaticamente:
   - Um banco Postgres (`done-db`)
   - O serviço da API (`done-api`)
   - O serviço estático do frontend (`done-client`)
4. Depois de criado, preencha manualmente as variáveis marcadas como `sync: false` no painel de cada serviço:
   - **done-api**: `CLIENT_URL` (URL do done-client depois de criado), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
   - **done-client**: `VITE_API_URL` (URL do done-api + `/api`, ex: `https://done-api.onrender.com/api`)
5. No Stripe, configure um webhook apontando para `https://done-api.onrender.com/api/billing/webhook`, evento `checkout.session.completed`, e cole o "Signing secret" gerado em `STRIPE_WEBHOOK_SECRET`.

## O que já funciona

- Cadastro/login de usuário (e-mail + senha, JWT)
- Comercial Coach completo: triagem, questionário, cálculo da nota, resultado com radar e prioridades, salvo no banco
- Ferramenta de Vendas: pipeline Kanban, leads, metas por vendedor — tudo persistido
- Ferramenta de Gestão: upload de CSV, dashboard de faturamento/margem/estoque
- Checkout do Stripe para o relatório pago e as assinaturas dos módulos
- Rota de alerta via Twilio (mesmo padrão da Iconic) para lembrete de follow-up de lead

## Próximos passos sugeridos

- Testar o fluxo completo localmente antes do primeiro deploy
- Configurar o domínio próprio (donestrategy.com) apontando para o `done-client` no Render
- Ativar os alertas de Twilio de forma automática (hoje a rota existe, mas precisa ser chamada — dá pra criar um job agendado no Render Cron para rodar diariamente e avisar sobre leads parados)

