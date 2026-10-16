"use strict";
// WMS Pilchs — js/base/atualizacao.js
// Atualiza as filas sozinho a cada 30 segundos, para os pedidos que a sincronização
// automática traz do Olist aparecerem sem ninguém recarregar a página.
// Não mexe no pedido que está aberto (separação/embalagem em andamento): só nas listas.

var ATUALIZA_MS = 30000;
var ultimoASeparar = null;

function viewAtiva() {
  var v = document.querySelector(".view.active");
  return v ? v.id.replace("view-", "") : "";
}
function visivel(id) {
  var el = document.getElementById(id);
  return !!el && el.style.display !== "none";
}

function atualizarTelaAtual() {
  if (!meu || document.hidden) return;
  var v = viewAtiva();
  if (v === "separacao") {
    carregarSepProximos(); // lista lateral: não atrapalha o pedido aberto
    if (!sepAtivoId && !visivel("sepAtivo") && !visivel("sepLoteAtivo")) {
      if (sepModoAtual === "pedido") carregarFilaSeparacaoLista(); else carregarLotesSimples();
    }
  } else if (v === "embalagem") {
    carregarEmbProximos();
    carregarEmbReimpressao();
  } else if (v === "expedicao") {
    carregarFilaExpedicao();
  } else if (v === "pedidos") {
    carregarFilaPedidos();
  }
  if (v !== "painel" && v !== "laboratorio") carregarContadores();
}

function verificarPedidosNovos() {
  if (!meu || document.hidden) return;
  sb.rpc("contagem_pedidos").then(function (res) {
    if (res.error || !res.data) return;
    var n = 0;
    res.data.forEach(function (r) { if (r.status === "a_separar") n = Number(r.total) || 0; });
    if (ultimoASeparar !== null && n > ultimoASeparar && meu.papel !== "laboratorio") {
      var novos = n - ultimoASeparar;
      toast(novos === 1 ? "Chegou 1 pedido novo para separar" : "Chegaram " + novos + " pedidos novos para separar", "ok");
      try { somOk(); } catch (e) {}
    }
    ultimoASeparar = n;
  });
}

// pedido que voltou de um problema reservado para mim
var ultimaVoltaVista = new Date().toISOString();
function verificarVoltas() {
  if (!meu || document.hidden || meu.papel === "laboratorio") return;
  sb.from("pedidos").select("id_externo,volta_em,volta_aviso").eq("reservado_por", meu.id).gt("volta_em", ultimaVoltaVista).order("volta_em").then(function (r) {
    (r.data || []).forEach(function (p) {
      toast("O pedido " + p.id_externo + " voltou para você: continue de onde parou", "ok");
      try { somOk(); } catch (e) {}
      if (p.volta_em > ultimaVoltaVista) ultimaVoltaVista = p.volta_em;
    });
  });
}

setInterval(function () {
  verificarVoltas();
  verificarPedidosNovos();
  atualizarTelaAtual();
}, ATUALIZA_MS);

// ao voltar para a aba do navegador, atualiza na hora
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) { verificarPedidosNovos(); atualizarTelaAtual(); }
});
