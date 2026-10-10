"use strict";
// WMS Pilchs — js/modulos/estoque/enderecamento.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- INTERRUPTOR DE ENDEREÇAMENTO ----------------
// Desligado: a separação pede só o produto (sem endereço e sem baixa de estoque por endereço).
var ENDERECAMENTO = true;
function lerConfigEnderecamento(cb) {
  sb.from("config_wms").select("valor").eq("chave", "enderecamento_ativo").maybeSingle().then(function (res) {
    if (!res.error && res.data) ENDERECAMENTO = res.data.valor === "true";
    atualizarCardEnderecamento();
    if (cb) cb();
  });
}
function atualizarCardEnderecamento() {
  var est = document.getElementById("enderecamentoEstado");
  var bt = document.getElementById("enderecamentoBtn");
  if (!est || !bt) return;
  est.innerHTML = ENDERECAMENTO
    ? "<b>Ligado.</b> Na separação, o operador bipa o endereço e depois o produto, e o estoque sai do endereço."
    : "<b>Desligado.</b> Na separação, o operador bipa só o produto. Use enquanto não houver porta-paletes e endereços.";
  bt.textContent = ENDERECAMENTO ? "Desligar endereçamento" : "Ligar endereçamento";
  bt.className = ENDERECAMENTO ? "btn ghost" : "btn primary";
}
var endBtn = document.getElementById("enderecamentoBtn");
if (endBtn) endBtn.addEventListener("click", function () {
  if (!meu || meu.papel !== "admin") return;
  var novo = !ENDERECAMENTO;
  endBtn.disabled = true;
  sb.from("config_wms").update({ valor: novo ? "true" : "false", atualizado_em: new Date().toISOString(), atualizado_por: meu.id }).eq("chave", "enderecamento_ativo").then(function (res) {
    endBtn.disabled = false;
    if (res.error) { toast("Não foi possível alterar: " + res.error.message, "err"); return; }
    ENDERECAMENTO = novo;
    atualizarCardEnderecamento();
    toast(novo ? "Endereçamento ligado." : "Endereçamento desligado: separação só pelo produto.", "ok");
  });
});
