# WMS Pilchs Info

Sistema de gestão do depósito (separação, embalagem, expedição, estoque, loja).
Front-end em HTML/CSS/JS puro, banco e funções no Supabase, site no Render.

## Onde fica cada coisa

```
app/                      ← o site (o que abre no celular e no PC)
  index.html              ← só a "casca": telas em HTML + lista de arquivos JS
  painel-tv.html          ← telão do depósito
  css/estilo.css          ← todo o visual
  js/base/                ← o que todas as telas usam
    config.js             ← escolhe o banco: PRODUÇÃO ou TESTE (pelo endereço do site)
    utilidades.js         ← avisos (toast), sons de bipe, textos
    camera.js             ← leitura de código pela câmera
    login.js              ← entrar/sair, tema claro/escuro
    menu.js               ← menu lateral, abas do celular, contadores
  js/modulos/
    operacao/             ← separacao, reserva, embalagem, fase (bipagem comum), expedicao, documentos (etiqueta/nota)
    estoque/              ← enderecos, devolucoes, inventario, enderecamento (liga/desliga)
    gestao/               ← painel, pedidos, relatorios, cancelamento, usuarios
    loja/                 ← retirada, catalogo   (catálogo robusto nasce aqui)
    entregas/             ← (futuro) DMS
  js/iniciar.js           ← último a carregar: abre a sessão
supabase/
  migrations/             ← o banco inteiro em SQL, com histórico
  functions/              ← as 6 funções do servidor (Olist, usuários, nota, catálogo, retirada)
  seed-teste.sql          ← dados de mentira para o ambiente de teste
docs/                     ← como publicar, checklist de teste, segurança
index.html, painel-tv.html (na raiz) ← versão ANTIGA em arquivo único. Continua sendo a produção
                                       até a virada (ver docs/COMO-PUBLICAR.md).
```

## Dois ambientes

| | Teste | Produção |
|---|---|---|
| Site | https://wms-loja-teste.onrender.com | https://wms-loja.onrender.com |
| Banco | Supabase `wms-teste` (hzijegkbfgxtgzucuaqm) | Supabase `wms-separacao` (levnxrjcvqubfowvvurd) |
| Olist | conta de teste (quando o token for cadastrado) | conta de teste hoje; oficial depois da troca de CNPJ |

No ambiente de teste aparece uma faixa vermelha **AMBIENTE DE TESTE**.

## Regras de ouro

1. Nada vai para a produção sem passar pelo site de teste e pelo `docs/CHECKLIST-TESTE.md`.
2. Senhas, tokens e chaves secretas **nunca** entram neste repositório. Ficam no Supabase (`config_secretos`) e no Bitwarden.
3. Mudança no banco = arquivo novo em `supabase/migrations/` (nunca editar um antigo).
4. Função nova = módulo novo em `app/js/modulos/...`, não "pendurado" em outro arquivo.
