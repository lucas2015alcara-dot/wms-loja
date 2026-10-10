# Checklist de teste (10 minutos) — antes de publicar na produção

Fazer no **site de teste** (https://wms-loja-teste.onrender.com), de preferência no celular.
Confirme que aparece a faixa vermelha **AMBIENTE DE TESTE**.

Para recomeçar com pedidos novos: no Supabase do projeto **wms-teste** → SQL Editor → rodar `supabase/seed-teste.sql`.

## Login
- [ ] Entrar com login de admin
- [ ] Entrar com login de operador (em outra aba anônima)
- [ ] Senha errada mostra aviso e não entra

## Operação (login de operador)
- [ ] Separar: abrir TST-001, bipar `0653969769473` → pedido concluído, sai da fila
- [ ] Separar: bipar produto errado → som de erro e aviso
- [ ] Separar em lote: aparecem TST-002/TST-003
- [ ] Embalar: bipar o produto → abre "Documentos do pedido" → Imprimir abre a impressão
- [ ] Reimprimir etiqueta + nota (card em Embalar)
- [ ] Expedir: bipar `TST-001` → fica verde; bipar de novo → "já expedido"
- [ ] Operador NÃO vê o botão "expedir" sem bipe

## Admin
- [ ] Painel abre com os números certos
- [ ] Cancelar um pedido com senha errada → recusa; com a senha certa → cancela
- [ ] Expedir sem bipe pede motivo + senha
- [ ] Usuários: lista aparece
- [ ] Endereços / Devoluções / Inventário / Relatórios abrem sem erro

## Telão
- [ ] https://wms-loja-teste.onrender.com/painel-tv.html mostra os números

Tudo marcado → pode publicar. Algum item falhou → não publica, avisa o Claude com print.
