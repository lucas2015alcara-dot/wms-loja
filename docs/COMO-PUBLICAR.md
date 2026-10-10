# Como publicar

## Hoje (fase de transição)

- **Produção** (wms-loja.onrender.com) continua usando o `index.html` e o `painel-tv.html` da **raiz** do repositório — a versão antiga em arquivo único. Nada muda para quem está usando.
- **Teste** (wms-loja-teste.onrender.com) publica a pasta **`app/`** — a versão nova, dividida em arquivos, ligada ao banco de teste.

Fluxo de uma alteração:
1. Claude entrega os arquivos alterados (sempre dentro de `app/`, `supabase/` ou `docs/`).
2. Lucas sobe no GitHub (GitHub Desktop: "Commit to main" → "Push origin"; ou pelo site: Add file → Upload files, arrastando as pastas).
3. Claude dispara a publicação do site de teste e confere.
4. Lucas faz o `CHECKLIST-TESTE.md` no site de teste.

## A virada (quando o teste estiver aprovado)

1. Render → serviço **wms-loja** → Settings → **Publish Directory**: trocar `.` por `app` → Save.
2. Claude dispara a publicação e confere a produção.
3. Se der problema: voltar o Publish Directory para `.` (a versão antiga da raiz continua lá) — volta em 1 minuto.
4. Depois de uma semana estável: apagar `index.html`, `index-novo.html` e `painel-tv.html` da raiz.

## Depois da virada: teste antes da produção

Como os dois sites passam a publicar `app/`, o teste ganha um ramo próprio:
1. GitHub → botão do ramo `main` → digitar `teste` → "Create branch: teste from main".
2. Render → serviço **wms-loja-teste** → Settings → Branch: `teste`.
3. A partir daí: alteração sobe no ramo `teste` → testa → GitHub "Compare & pull request" → `teste` para `main` → Merge. Só o Merge chega na produção.

## Voltar uma versão

- Render → serviço → Events → escolher um deploy antigo → "Rollback". Ou pedir ao Claude.
