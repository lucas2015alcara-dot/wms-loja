"use strict";
// WMS Pilchs — js/modulos/operacao/reserva.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- RESERVA (evita dois separadores/embaladores pegarem o mesmo pedido) ----------------
var RESERVA_MIN = 15; // depois disso, um pedido esquecido aberto volta a ficar livre
var tokenAtual = null;
function tentarReservarPedido(pedidoId, statusEsperado, cb) {
  var limite = new Date(Date.now() - RESERVA_MIN * 60 * 1000).toISOString();
  sb.from("pedidos")
    .update({ reservado_por: meu.id, reservado_em: new Date().toISOString() })
    .eq("id", pedidoId)
    .eq("status", statusEsperado)
    .or("reservado_por.is.null,reservado_por.eq." + meu.id + ",reservado_em.lt." + limite)
    .select("id")
    .then(function (res) {
      var ok = !res.error && res.data && res.data.length > 0;
      if (ok) sb.auth.getSession().then(function (r) { tokenAtual = r.data.session ? r.data.session.access_token : null; });
      cb(ok);
    });
}
function liberarReservaPedido(pedidoId) {
  if (!pedidoId) return;
  sb.from("pedidos").update({ reservado_por: null, reservado_em: null }).eq("id", pedidoId).eq("reservado_por", meu.id).then(function () {});
}
// solta o pedido aberto ao trocar de aba (separação e embalagem)
function liberarReservasAtivas() {
  if (typeof sepAtivoId !== "undefined" && sepAtivoId) { liberarReservaPedido(sepAtivoId); sepAtivoId = null; }
  if (typeof embAtivoId !== "undefined" && embAtivoId) { liberarReservaPedido(embAtivoId); embAtivoId = null; }
}
// solta também ao fechar ou recarregar a página (envio que sobrevive ao fechamento)
window.addEventListener("pagehide", function () {
  if (!meu || !tokenAtual) return;
  [sepAtivoId, embAtivoId].forEach(function (id) {
    if (!id) return;
    try {
      fetch(SUPABASE_URL + "/rest/v1/pedidos?id=eq." + encodeURIComponent(id) + "&reservado_por=eq." + encodeURIComponent(meu.id), {
        method: "PATCH", keepalive: true,
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + tokenAtual, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify({ reservado_por: null, reservado_em: null })
      });
    } catch (e) {}
  });
});
function reservaAtivaDeOutro(o) {
  if (!o.reservado_por || (meu && o.reservado_por === meu.id)) return false;
  return o.reservado_em && (Date.now() - new Date(o.reservado_em).getTime()) < RESERVA_MIN * 60 * 1000;
}
function liberarReservaAdmin(pedidoId, depois) {
  sb.from("pedidos").update({ reservado_por: null, reservado_em: null }).eq("id", pedidoId).then(function (r) {
    if (r.error) { toast("Não foi possível liberar: " + r.error.message, "err"); return; }
    toast("Pedido liberado ✓", "ok");
    if (depois) depois();
  });
}
