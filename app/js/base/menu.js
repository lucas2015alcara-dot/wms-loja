"use strict";
// WMS Pilchs — js/base/menu.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- NAV ----------------
var TAB_ICONS = {
  pedidos: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  separacao: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 8-9-6-9 6v8l9 6 9-6Z"/><path d="M12 12 3 8"/><path d="M12 12v9"/><path d="M12 12l9-4"/></svg>',
  embalagem: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 7 7 3h10l4 4"/><path d="M9 12h6"/></svg>',
  expedicao: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h3l3-7h6l3 7h3v5H3z"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="16.5" cy="18.5" r="1.5"/></svg>',
  enderecos: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  devolucoes: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>',
  inventario: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  retirada: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18l-1.5 11h-15z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/></svg>',
  catalogo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  usuarios: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c3 .2 5.5 2.3 5.5 5.8"/></svg>',
  relatorios: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-6 3 3 5-7"/></svg>',
  painel: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18.5 8.5 15 12l3.5 3.5"/><path d="M8 7v10l-4-5Z"/></svg>'
};
var TABS = {
  admin: [["pedidos", "Pedidos"], ["separacao", "Separar"], ["embalagem", "Embalar"], ["expedicao", "Expedir"], ["enderecos", "Endereços"], ["devolucoes", "Devoluções"], ["inventario", "Inventário"], ["relatorios", "Relatórios"], ["painel", "Painel"], ["retirada", "Retirada"], ["catalogo", "Catálogo"], ["usuarios", "Usuários"]],
  operador: [["separacao", "Separar"], ["embalagem", "Embalar"], ["expedicao", "Expedir"], ["enderecos", "Endereços"], ["devolucoes", "Devoluções"], ["inventario", "Inventário"], ["painel", "Painel"], ["retirada", "Retirada"], ["catalogo", "Catálogo"]],
  separador: [["separacao", "Separar"], ["painel", "Painel"]],
  embalador: [["embalagem", "Embalar"], ["painel", "Painel"]],
  expedicao: [["expedicao", "Expedir"], ["painel", "Painel"]]
};
var NAV_GROUPS = {
  admin: [
    { label: "Operação", views: ["pedidos", "separacao", "embalagem", "expedicao"] },
    { label: "Estoque", views: ["enderecos", "devolucoes", "inventario", "relatorios"] },
    { label: "Loja", views: ["retirada", "catalogo"] },
    { label: "Admin", views: ["painel", "usuarios"] }
  ],
  operador: [
    { label: "Operação", views: ["separacao", "embalagem", "expedicao"] },
    { label: "Estoque", views: ["enderecos", "devolucoes", "inventario"] },
    { label: "Loja", views: ["retirada", "catalogo"] },
    { label: "Geral", views: ["painel"] }
  ]
};
function montarNav() {
  var tabs = TABS[meu.papel] || [["painel", "Painel"]];
  var nav = document.getElementById("navBar");
  nav.innerHTML = "";
  var groups = NAV_GROUPS[meu.papel];
  var first = true;
  function criarBotao(t) {
    var b = document.createElement("button");
    b.innerHTML = (TAB_ICONS[t[0]] || "") + "<span>" + t[1] + "</span>";
    b.dataset.view = t[0];
    if (first) { b.classList.add("active"); first = false; }
    b.addEventListener("click", function () { showView(t[0]); });
    nav.appendChild(b);
  }
  if (groups) {
    var byView = {};
    tabs.forEach(function (t) { byView[t[0]] = t; });
    groups.forEach(function (g) {
      var header = document.createElement("span");
      header.className = "navGroupLabel";
      header.textContent = g.label;
      nav.appendChild(header);
      g.views.forEach(function (v) { if (byView[v]) criarBotao(byView[v]); });
    });
  } else {
    tabs.forEach(function (t) { criarBotao(t); });
  }
  montarTabBar(tabs, groups);
  showView(tabs[0][0]);
}

// barra de abas embaixo (celular): 3 telas principais + "Mais"
var TAB_PRINCIPAIS = ["separacao", "embalagem", "expedicao", "retirada", "catalogo", "painel"];
var tabBarPrincipais = [];
function iconeGrande(v) { return (TAB_ICONS[v] || "").replace('width="16" height="16"', 'width="22" height="22"'); }
function montarTabBar(tabs, groups) {
  var bar = document.getElementById("tabBar");
  if (!bar) return;
  var tem = {}; tabs.forEach(function (t) { tem[t[0]] = t[1]; });
  tabBarPrincipais = TAB_PRINCIPAIS.filter(function (v) { return tem[v]; }).slice(0, 3);
  if (tabBarPrincipais.length < 3) tabs.forEach(function (t) { if (tabBarPrincipais.length < 3 && tabBarPrincipais.indexOf(t[0]) < 0) tabBarPrincipais.push(t[0]); });
  var resto = tabs.filter(function (t) { return tabBarPrincipais.indexOf(t[0]) < 0; });
  bar.innerHTML = "";
  tabBarPrincipais.forEach(function (v) {
    var b = document.createElement("button");
    b.dataset.view = v;
    b.innerHTML = iconeGrande(v) + "<span>" + escapeHtml(tem[v]) + "</span>";
    b.addEventListener("click", function () { fecharMais(); showView(v); });
    bar.appendChild(b);
  });
  if (resto.length) {
    var m = document.createElement("button");
    m.id = "tabMais";
    m.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg><span>Mais</span>';
    m.addEventListener("click", function () { document.getElementById("maisSheet").classList.contains("aberto") ? fecharMais() : abrirMais(); });
    bar.appendChild(m);
  }
  var lista = document.getElementById("maisLista");
  lista.innerHTML = "";
  var ja = {};
  function grupo(rotulo, views) {
    var vs = views.filter(function (v) { return tem[v] && tabBarPrincipais.indexOf(v) < 0 && !ja[v]; });
    if (!vs.length) return;
    var h = document.createElement("div"); h.className = "mais-grupo"; h.textContent = rotulo; lista.appendChild(h);
    var g = document.createElement("div"); g.className = "mais-itens";
    vs.forEach(function (v) {
      ja[v] = true;
      var b = document.createElement("button");
      b.dataset.view = v;
      b.innerHTML = iconeGrande(v) + "<span>" + escapeHtml(tem[v]) + "</span>";
      b.addEventListener("click", function () { fecharMais(); showView(v); });
      g.appendChild(b);
    });
    lista.appendChild(g);
  }
  (groups || []).forEach(function (g) { grupo(g.label, g.views); });
  grupo(groups ? "Outras" : "Telas", resto.map(function (t) { return t[0]; }));
  document.getElementById("maisFundo").onclick = fecharMais;
}
function abrirMais() { document.getElementById("maisSheet").classList.add("aberto"); document.getElementById("maisFundo").classList.add("aberto"); }
function fecharMais() { var s = document.getElementById("maisSheet"); if (s) { s.classList.remove("aberto"); document.getElementById("maisFundo").classList.remove("aberto"); } }

function showView(name) {
  liberarReservasAtivas();
  var ctr = document.getElementById("counters");
  if (ctr) ctr.style.display = name === "painel" ? "none" : "";
  document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
  document.getElementById("view-" + name).classList.add("active");
  document.querySelectorAll("nav button, #tabBar button, #maisLista button").forEach(function (b) { b.classList.toggle("active", b.dataset.view === name); });
  var tm = document.getElementById("tabMais");
  if (tm) tm.classList.toggle("active", tabBarPrincipais.indexOf(name) < 0);
  if (name === "pedidos") { renderNpItems(); carregarFilaPedidos(); }
  if (name === "separacao") { lerConfigEnderecamento(); carregarFilaSeparacao(); }
  if (name === "embalagem") carregarFilaEmbalagem();
  if (name === "expedicao") carregarFilaExpedicao();
  if (name === "enderecos") carregarEnderecos();
  if (name === "devolucoes") carregarDevolucoes();
  if (name === "inventario") carregarInventario();
  if (name === "relatorios") carregarRelatorios();
  if (name === "usuarios") carregarUsuarios();
  if (name === "catalogo") prepararCatalogo();
  if (name === "retirada") carregarRetirada();
  if (name === "painel") carregarPainel();
  carregarContadores();
}

// ---------------- CONTADOR GERAL ----------------
function carregarContadores() {
  sb.rpc("contagem_pedidos").then(function (res) {
    var el = document.getElementById("counters");
    var kv = { a_separar: 0, separado: 0, embalado: 0, expedido: 0 };
    if (!res.error && res.data) res.data.forEach(function (r) { kv[r.status] = r.total; });
    el.innerHTML = "";
    [["a_separar", "A separar"], ["separado", "Separado"], ["embalado", "Embalado"], ["expedido", "Expedido"]].forEach(function (p) {
      var d = document.createElement("div");
      d.className = "counter";
      d.innerHTML = '<div class="n">' + kv[p[0]] + '</div><div class="l">' + p[1] + '</div>';
      el.appendChild(d);
    });
    document.getElementById("kWait").textContent = kv.a_separar;
    document.getElementById("kSep").textContent = kv.separado;
    document.getElementById("kEmb").textContent = kv.embalado;
    document.getElementById("kExp").textContent = kv.expedido;
  });
  sb.rpc("contagem_pendencias").then(function (res) {
    var el = document.getElementById("kPend");
    if (el && !res.error) el.textContent = res.data || 0;
  });
}
