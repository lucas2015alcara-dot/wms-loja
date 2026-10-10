"use strict";
// WMS Pilchs — js/modulos/loja/retirada.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- RETIRADA DA LOJA (Parte 1) ----------------
var retWired = false, retProdutos = [], retSel = null, retDados = { depositos: [], vendedores: [], retiradas: [] }, retConfirmarSaldo = false;
function chamarRetirada(payload) {
  return sb.functions.invoke("loja-retirada", { method: "POST", body: payload }).then(function (res) {
    if (!res.error) return res.data || {};
    var ctx = res.error.context;
    if (ctx && typeof ctx.json === "function") return ctx.json().then(function (j) { return { error: (j && j.error) || res.error.message }; }, function () { return { error: res.error.message }; });
    return { error: res.error.message || "Falha na comunicação." };
  }, function (e) { return { error: String(e) }; });
}
function retCaixa(texto, tipo, html) {
  var el = document.getElementById("retMsg");
  if (!texto) { el.style.display = "none"; el.innerHTML = ""; return; }
  el.className = "ret-box " + (tipo || "");
  el.innerHTML = html ? texto : escapeHtml(texto);
  el.style.display = "block";
}
function tempoDesde(iso) {
  var min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return min + " min";
  var h = Math.floor(min / 60);
  if (h < 24) return h + " h";
  return Math.floor(h / 24) + " d " + (h % 24) + " h";
}
function dataCurta(iso) {
  var d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function carregarRetirada() {
  if (!retWired) {
    retWired = true;
    document.getElementById("retBuscar").addEventListener("click", buscarRetirada);
    document.getElementById("retBusca").addEventListener("keydown", function (e) { if (e.key === "Enter") buscarRetirada(); });
    document.getElementById("retRegistrar").addEventListener("click", registrarRetirada);
    document.getElementById("retCamBtn").addEventListener("click", function () {
      abrirCamera(function (code) { fecharCamera(); document.getElementById("retBusca").value = code; buscarRetirada(); });
    });
    document.getElementById("retAtualizar").addEventListener("click", carregarRetirada);
    function mudarQtd(d) {
      var q = document.getElementById("retQtd");
      var n = Math.min(50, Math.max(1, (parseInt(q.value, 10) || 1) + d));
      q.value = n; q.dispatchEvent(new Event("change"));
    }
    document.getElementById("retMenos").addEventListener("click", function () { mudarQtd(-1); });
    document.getElementById("retMais").addEventListener("click", function () { mudarQtd(1); });
    document.getElementById("retDeposito").addEventListener("change", renderDepositosRetirada);
    ["retDeposito", "retQtd", "retVendedor"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () { retConfirmarSaldo = false; atualizarBotaoRetirada(); retCaixa(""); });
    });
  }
  document.getElementById("retAbertas").innerHTML = '<div class="scan-hint" style="text-align:left">Carregando…</div>';
  chamarRetirada({ acao: "inicio" }).then(function (r) {
    if (r.error) { document.getElementById("retAbertas").innerHTML = '<div class="scan-hint" style="text-align:left; color:var(--red)">' + escapeHtml(r.error) + "</div>"; return; }
    retDados = r;
    var dep = document.getElementById("retDeposito"), vDep = dep.value;
    dep.innerHTML = (r.depositos.length > 1 ? '<option value="">— escolha —</option>' : "") +
      r.depositos.map(function (d) { return '<option value="' + escapeHtml(d.id) + '">' + escapeHtml(d.nome) + "</option>"; }).join("");
    if (vDep) dep.value = vDep;
    renderDepositosRetirada();
    var ven = document.getElementById("retVendedor"), vVen = ven.value;
    ven.innerHTML = '<option value="">— escolha —</option>' + r.vendedores.map(function (v) { return '<option value="' + escapeHtml(v.id) + '">' + escapeHtml(v.nome) + "</option>"; }).join("");
    if (vVen) ven.value = vVen;
    if (r.aviso) retCaixa("Não consegui carregar os vendedores: " + r.aviso, "err");
    renderRetiradas();
    atualizarBotaoRetirada();
  });
}
function buscarRetirada() {
  var termo = document.getElementById("retBusca").value.trim();
  var m = document.getElementById("retBuscaMsg");
  if (termo.length < 2) { msg(m, "Digite pelo menos 2 letras ou o código.", "err"); return; }
  retSel = null; retConfirmarSaldo = false; retCaixa("");
  document.getElementById("retRes").innerHTML = "";
  msg(m, "Buscando no Olist…");
  document.getElementById("retBuscar").disabled = true;
  chamarRetirada({ acao: "buscar", termo: termo }).then(function (r) {
    document.getElementById("retBuscar").disabled = false;
    if (r.error) { msg(m, r.error, "err"); return; }
    retProdutos = r.produtos || [];
    if (!retProdutos.length) { msg(m, "Nenhum produto encontrado.", "err"); atualizarBotaoRetirada(); return; }
    msg(m, retProdutos.length === 1 ? "Confira o produto abaixo." : "Toque no produto certo." + (r.mais ? " (mostrando os 8 primeiros — refine a busca se não achar)" : ""));
    if (retProdutos.length === 1) retSel = retProdutos[0];
    renderResultadosRetirada();
    atualizarBotaoRetirada();
  });
}
// botões grandes de depósito (o select #retDeposito continua sendo a fonte do valor)
function renderDepositosRetirada() {
  var el = document.getElementById("retDepChips");
  var sel = document.getElementById("retDeposito");
  if (!el || !retDados) return;
  var deps = retDados.depositos || [];
  if (!deps.length) { el.innerHTML = '<div class="pn-obs">Nenhum depósito da loja configurado.</div>'; return; }
  var saldos = {};
  if (retSel && retSel.saldos) retSel.saldos.forEach(function (x) { saldos[x.id] = x.saldo; });
  el.innerHTML = "";
  deps.forEach(function (d) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "ret-dep" + (sel.value === d.id ? " sel" : "");
    var tem = saldos.hasOwnProperty(d.id);
    b.innerHTML = "<b>" + escapeHtml(d.nome) + "</b>" + (tem ? '<span class="' + (saldos[d.id] <= 0 && sel.value !== d.id ? "zero" : "") + '">' + saldos[d.id] + " no Olist</span>" : "<span>escolha o produto</span>");
    b.addEventListener("click", function () { sel.value = d.id; sel.dispatchEvent(new Event("change")); });
    el.appendChild(b);
  });
}
function renderResultadosRetirada() {
  var el = document.getElementById("retRes");
  el.innerHTML = "";
  retProdutos.forEach(function (p) {
    var d = document.createElement("div");
    d.className = "ret-item" + (retSel && retSel.id === p.id ? " sel" : "");
    d.innerHTML = (p.foto ? '<img alt="" src="' + escapeHtml(p.foto) + '">' : '<div class="ret-sf">sem foto</div>') +
      '<div class="ret-tx"><div class="ret-nome">' + escapeHtml(p.nome) + '</div><div class="ret-sub mono">' + escapeHtml(p.codigo || "—") + " · " + moedaBR(p.preco) + "</div>" +
      '<div class="ret-sub">' + p.saldos.map(function (s) { return escapeHtml(s.nome) + ": <b>" + s.saldo + "</b>"; }).join(" · ") + "</div></div>";
    d.addEventListener("click", function () { retSel = p; retConfirmarSaldo = false; retCaixa(""); renderResultadosRetirada(); atualizarBotaoRetirada(); });
    el.appendChild(d);
  });
  renderDepositosRetirada();
}
function atualizarBotaoRetirada() {
  var b = document.getElementById("retRegistrar");
  b.textContent = retConfirmarSaldo ? "Registrar mesmo assim" : "Registrar retirada";
  b.disabled = !(retSel && document.getElementById("retDeposito").value && document.getElementById("retVendedor").value);
}
function registrarRetirada() {
  var b = document.getElementById("retRegistrar");
  var payload = {
    acao: "registrar", produto_id: retSel && retSel.id,
    deposito_id: document.getElementById("retDeposito").value,
    vendedor_id: document.getElementById("retVendedor").value,
    quantidade: Number(document.getElementById("retQtd").value),
    obs: document.getElementById("retObs").value.trim(),
    forcar: retConfirmarSaldo
  };
  if (!(payload.quantidade >= 1 && payload.quantidade <= 50 && Math.floor(payload.quantidade) === payload.quantidade)) { retCaixa("Quantidade inválida.", "err"); return; }
  b.disabled = true;
  retCaixa("Registrando no Olist… não feche a tela.", "");
  chamarRetirada(payload).then(function (r) {
    b.disabled = false;
    if (r.error) { retCaixa(r.error, "err"); return; }
    if (r.aviso === "saldo") {
      retConfirmarSaldo = true;
      atualizarBotaoRetirada();
      retCaixa("⚠️ O Olist mostra saldo <b>" + r.saldo + "</b> em " + escapeHtml(r.deposito) + ". O produto está mesmo na sua mão? Se estiver, confira o depósito e toque em <b>Registrar mesmo assim</b> (o saldo vai ficar negativo e alguém precisa acertar o estoque depois).", "aviso", true);
      return;
    }
    var t = r.retirada;
    retCaixa("✓ Retirada registrada. Pedido <b>Nº " + escapeHtml(t.olist_pedido_numero) + "</b> criado no Olist em nome de " + escapeHtml(t.vendedor_nome) + ". Finalize a venda <b>nesse pedido</b>.", "ok", true);
    retSel = null; retProdutos = []; retConfirmarSaldo = false;
    document.getElementById("retRes").innerHTML = "";
    renderDepositosRetirada();
    document.getElementById("retBusca").value = "";
    document.getElementById("retQtd").value = "1";
    document.getElementById("retObs").value = "";
    msg(document.getElementById("retBuscaMsg"), "");
    atualizarBotaoRetirada();
    carregarRetirada();
  });
}
var RET_STATUS = { vendida: ["Vendida", "emb"], devolvida: ["Devolvida", "exp"], cancelada_olist: ["Cancelada no Olist", "exp"], erro: ["Erro", "cancel"] };
function renderRetiradas() {
  var abertas = retDados.retiradas.filter(function (r) { return r.status === "aberta"; });
  var fechadas = retDados.retiradas.filter(function (r) { return r.status !== "aberta"; }).slice(0, 20);
  var elA = document.getElementById("retAbertas");
  var qa = document.getElementById("retAbertasQtd"); if (qa) qa.textContent = abertas.length ? abertas.length : "";
  elA.innerHTML = abertas.length ? "" : '<div class="scan-hint" style="text-align:left">Nenhuma retirada aberta.</div>';
  abertas.forEach(function (r) {
    var velha = (Date.now() - new Date(r.criado_em).getTime()) > 24 * 3600 * 1000;
    var d = document.createElement("div");
    d.className = "ret-linha";
    d.innerHTML = '<div class="ret-tx"><b>' + escapeHtml(String(r.quantidade)) + "×</b> " + escapeHtml(r.produto_nome) +
      '<div class="ret-sub">Pedido Nº <b>' + escapeHtml(r.olist_pedido_numero || "?") + "</b> · " + escapeHtml(r.vendedor_nome) + " · " + escapeHtml(r.deposito_nome) + "</div>" +
      '<div class="ret-sub">há <span class="' + (velha ? "ret-velha" : "") + '">' + tempoDesde(r.criado_em) + "</span> · registrado por " + escapeHtml(r.criado_por_nome || "?") + (r.obs ? " · " + escapeHtml(r.obs) : "") + "</div></div>" +
      '<button class="btn danger small" style="flex:0 0 auto">Devolver</button>';
    var btn = d.querySelector("button"), armado = false;
    btn.addEventListener("click", function () {
      if (!armado) {
        armado = true; btn.textContent = "Confirmar devolução";
        setTimeout(function () { if (armado && !btn.disabled) { armado = false; btn.textContent = "Devolver"; } }, 5000);
        return;
      }
      btn.disabled = true; btn.textContent = "Devolvendo…";
      chamarRetirada({ acao: "devolver", id: r.id }).then(function (res) {
        if (res.error) { btn.disabled = false; armado = false; btn.textContent = "Devolver"; retCaixa(res.error, "err"); return; }
        retCaixa("✓ Estoque devolvido e pedido Nº " + r.olist_pedido_numero + " cancelado no Olist.", "ok");
        carregarRetirada();
      });
    });
    elA.appendChild(d);
  });
  var elF = document.getElementById("retFechadas");
  elF.innerHTML = fechadas.length ? "" : '<div class="scan-hint" style="text-align:left">Nada por aqui ainda.</div>';
  fechadas.forEach(function (r) {
    var st = RET_STATUS[r.status] || [r.status, "exp"];
    var d = document.createElement("div");
    d.className = "ret-linha";
    d.innerHTML = '<div class="ret-tx">' + escapeHtml(String(r.quantidade)) + "× " + escapeHtml(r.produto_nome) +
      '<div class="ret-sub">Pedido Nº ' + escapeHtml(r.olist_pedido_numero || "?") + " · " + escapeHtml(r.vendedor_nome) + " · " + dataCurta(r.criado_em) + (r.fechado_por_nome ? " · encerrada por " + escapeHtml(r.fechado_por_nome) : "") + "</div></div>" +
      '<span class="badge ' + st[1] + '" style="flex:0 0 auto">' + st[0] + "</span>";
    elF.appendChild(d);
  });
}
