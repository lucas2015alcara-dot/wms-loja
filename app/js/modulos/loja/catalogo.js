"use strict";
// WMS Pilchs — js/modulos/loja/catalogo.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- CATÁLOGO (Olist, só leitura) ----------------
var catWired = false, catResultado = [];
function moedaBR(v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function prepararCatalogo() {
  if (catWired) return;
  catWired = true;
  document.getElementById("catBuscar").addEventListener("click", buscarCatalogo);
  document.getElementById("catBusca").addEventListener("keydown", function (e) { if (e.key === "Enter") buscarCatalogo(); });
  document.getElementById("catSoLoja").addEventListener("change", renderCatalogo);
  document.getElementById("catCamBtn").addEventListener("click", function () {
    abrirCamera(function (code) { fecharCamera(); document.getElementById("catBusca").value = code; buscarCatalogo(); });
  });
  setTimeout(function () { document.getElementById("catBusca").focus(); }, 50);
}
function buscarCatalogo() {
  var termo = document.getElementById("catBusca").value.trim();
  var m = document.getElementById("catMsg");
  if (termo.length < 2) { msg(m, "Digite pelo menos 2 letras ou o código.", "err"); return; }
  var btn = document.getElementById("catBuscar");
  btn.disabled = true;
  msg(m, "Buscando no Olist…");
  document.getElementById("catLista").innerHTML = "";
  document.getElementById("catDetalhe").style.display = "none";
  sb.functions.invoke("catalogo-olist", { method: "POST", body: { termo: termo } }).then(function (res) {
    if (!res.error) return res.data || {};
    var ctx = res.error.context;
    if (ctx && typeof ctx.json === "function") return ctx.json().then(function (j) { return { error: (j && j.error) || res.error.message }; }, function () { return { error: res.error.message }; });
    return { error: res.error.message || "Falha na comunicação." };
  }).then(function (r) {
    btn.disabled = false;
    if (r.error) { msg(m, r.error, "err"); return; }
    catResultado = r.produtos || [];
    var t = catResultado.length ? catResultado.length + " produto(s)" : "Nenhum produto encontrado.";
    if (r.mais) t += " — mostrando os 10 primeiros, refine a busca para achar outros.";
    msg(m, t);
    renderCatalogo();
  }, function (e) { btn.disabled = false; msg(m, String(e), "err"); });
}
function totalLoja(p) { return (p.saldos.avulsas || 0) + (p.saldos.vitrine || 0) + (p.saldos.kits || 0); }
function chipsSaldo(p) {
  return [["avulsas", "Avulsas"], ["vitrine", "Vitrine"], ["kits", "Kits"]].map(function (g) {
    var v = p.saldos[g[0]] || 0;
    return '<span class="' + (v > 0 ? "tem" : "") + '">' + g[1] + ": " + v + "</span>";
  }).join("");
}
function precoHtml(p) {
  if (p.preco_promocional > 0 && p.preco_promocional < p.preco) return "<s>" + moedaBR(p.preco) + "</s>" + moedaBR(p.preco_promocional);
  return moedaBR(p.preco);
}
function renderCatalogo() {
  var el = document.getElementById("catLista");
  var soLoja = document.getElementById("catSoLoja").checked;
  var lista = catResultado.filter(function (p) { return !soLoja || totalLoja(p) > 0; });
  el.innerHTML = "";
  if (catResultado.length && !lista.length) {
    el.innerHTML = '<div class="scan-hint" style="grid-column:1/-1">Nenhum desses tem saldo na loja. Desmarque "Só o que tem na loja" para ver todos.</div>';
    return;
  }
  lista.forEach(function (p) {
    var d = document.createElement("div");
    d.className = "cat-card" + (totalLoja(p) > 0 ? "" : " sem");
    d.innerHTML = '<div class="cat-foto">' + (p.foto ? '<img loading="lazy" alt="" src="' + escapeHtml(p.foto) + '">' : '<span class="semfoto">sem foto</span>') + "</div>" +
      '<div class="cat-info"><div class="cat-nome">' + escapeHtml(p.nome) + "</div>" +
      '<div class="cat-cod mono">' + escapeHtml(p.codigo || "—") + "</div>" +
      '<div class="cat-preco">' + precoHtml(p) + "</div>" +
      '<div class="cat-saldos">' + chipsSaldo(p) + "</div></div>";
    var img = d.querySelector("img");
    if (img) img.onerror = function () { this.parentNode.innerHTML = '<span class="semfoto">sem foto</span>'; };
    d.addEventListener("click", function () { detalheCatalogo(p); });
    el.appendChild(d);
  });
}
function detalheCatalogo(p) {
  var el = document.getElementById("catDetalhe");
  var fotos = (p.fotos && p.fotos.length) ? p.fotos : (p.foto ? [p.foto] : []);
  el.innerHTML = '<div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start"><h2 style="margin:0">' + escapeHtml(p.nome) + '</h2><button class="btn ghost" id="catFechar" style="flex:0 0 auto">Fechar</button></div>' +
    '<div class="cat-cod mono" style="margin-top:4px">' + escapeHtml(p.codigo || "—") + "</div>" +
    (fotos.length ? '<div class="cat-det-fotos">' + fotos.map(function (f) { return '<img alt="" src="' + escapeHtml(f) + '">'; }).join("") + "</div>" : '<div class="scan-hint" style="text-align:left">Sem foto no Olist.</div>') +
    '<div class="cat-preco" style="margin:6px 0">' + precoHtml(p) + "</div>" +
    '<div class="cat-saldos" style="margin-bottom:8px">' + chipsSaldo(p) + "</div>" +
    '<div class="scan-hint" style="text-align:left">Todos os depósitos: ' + p.depositos.map(function (d) { return escapeHtml(d.nome) + " " + d.saldo; }).join(" · ") + "</div>";
  el.style.display = "block";
  document.getElementById("catFechar").onclick = function () { el.style.display = "none"; };
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
