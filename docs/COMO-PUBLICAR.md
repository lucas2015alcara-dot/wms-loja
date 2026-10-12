# Como publicar

## Onde o site fica

| | Produção | Teste |
|---|---|---|
| Cloudflare Pages (principal) | https://wms-pilchs.pages.dev (ramo `main`) | https://teste.wms-pilchs.pages.dev (ramo `teste`) |
| Render (reserva, até desligar) | https://wms-loja.onrender.com (ramo `main`) | https://wms-loja-teste.onrender.com (ramo `teste`) |

Os dois publicam a pasta **`app/`**. O banco é escolhido em `app/js/base/config.js`:
**só os endereços da lista `PRODUCAO` usam o banco de produção**; qualquer outro usa o banco de teste
e mostra a faixa vermelha "AMBIENTE DE TESTE". Endereço novo de produção (ex.: domínio próprio) → incluir na lista.

## Fluxo de uma alteração

1. Claude entrega os arquivos alterados (sempre em `app/`, `supabase/` ou `docs/`).
2. Lucas sobe no ramo **`teste`** (GitHub: trocar o botão de ramo para `teste` antes de "Add file → Upload files").
3. Claude confere o site de teste. Lucas faz o `CHECKLIST-TESTE.md`.
4. GitHub → "Compare & pull request" (`teste` → `main`) → "Merge". Só o Merge chega na produção.

## Montar o Cloudflare Pages (uma vez)

1. Criar conta em dash.cloudflare.com (de preferência com o e-mail da empresa) e ligar a verificação em duas etapas.
2. Menu **Workers & Pages** → **Create** → aba **Pages** → **Connect to Git**.
   (Se só aparecer "Workers", procure o link "Looking to deploy Pages? Get started".)
3. Conectar o GitHub e liberar **só** o repositório `wms-loja`.
4. Configuração:
   - Project name: **`wms-pilchs`** (se o nome já existir, avisar o Claude: o endereço muda e precisa entrar na lista `PRODUCAO`)
   - Production branch: **`main`**
   - Framework preset: **None** · Build command: **(vazio)** · Build output directory: **`app`**
5. Save and Deploy. Depois: Settings → Builds & deployments → **Preview branches: "Custom" → incluir só `teste`** (evita prévias de outros ramos).

## Voltar uma versão

- Cloudflare: projeto → Deployments → escolher um deploy antigo → "Rollback to this deployment".
- Render: serviço → Events → deploy antigo → "Rollback".

## Histórico
- 10/10/2026: virada do arquivo único para `app/` (Render). A versão antiga em arquivo único ainda está na raiz do repositório (`index.html`, `painel-tv.html`, `index-novo.html`); apagar após a semana de pedidos reais estável.
- 12/10/2026: repositório transferido para a organização pilchs-info. App do cloudflare instalado na organização.
