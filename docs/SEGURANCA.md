# Segurança — pendências do Lucas (10/10/2026)

Marque conforme for fazendo.

- [ ] **Fechar o cadastro público** — Supabase (nos DOIS projetos: wms-separacao e wms-teste) → Authentication → Sign In / Providers → desligar "Allow new users to sign up".
- [ ] **Verificação em duas etapas (2FA)** — primeiro o Gmail (Conta Google → Segurança), depois GitHub (Settings → Password and authentication), Supabase (Account → Security), Render (Account Settings → Security) e Olist.
- [ ] **Apagar as funções sem uso** — Supabase (wms-separacao) → Edge Functions → `wms-app` e `olist-webhook` → Delete.
- [ ] **Token do Olist fora do PC** — apagar o `criar-pedidos-teste.mjs` da Área de Trabalho (o atual fica em Documentos\Nova pasta). Se ele já foi para o GitHub alguma vez, avisar o Claude para trocar o token.
- [ ] **Senhas no Bitwarden** — passar o `logins-wms.xlsx` para o Bitwarden, apagar o arquivo, esvaziar a Lixeira e apagar cópias no WhatsApp/Downloads.
- [ ] **Repositório privado** — GitHub → Settings → General → Danger Zone → Change visibility → Private. ⚠️ Avisar o Claude antes: ele dispara uma publicação para conferir. Se falhar: GitHub → Settings → Applications → Render → liberar o repositório `wms-loja`.
- [ ] **Usuários de QA no teste** — Supabase (wms-teste) → Authentication → Users → apagar `qa.admin@teste.local` e `qa.operador@teste.local` (já estão bloqueados; sobraram do teste automático de permissões).

Quando assinarem o Supabase Pro: ligar a proteção contra senha vazada e o backup diário.
