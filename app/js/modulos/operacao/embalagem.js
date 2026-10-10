"use strict";
// WMS Pilchs — js/modulos/operacao/embalagem.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- EMBALAGEM (bipa o item, sistema acha os pedidos que precisam dele) ----------------
var embAtivoId = null;
function carregarEmbProximos() {
  var el = document.getElementById("embProximos");
  if (!el) return;
  sb.from("pedidos").select("id,id_externo,canal,criado_em,reservado_por,reservado_em,itens_pedido(qtd)").eq("status", "separado").order("criado_em").limit(15).then(function (res) {
    var lista = res.data || [];
    if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum pedido separado esperando embalagem.</div>'; return; }
    el.innerHTML = "";
    lista.forEach(function (o) {
      var un = (o.itens_pedido || []).reduce(function (s, i) { return s + i.qtd; }, 0);
      var ocupado = reservaAtivaDeOutro(o);
      var row = document.createElement("div");
      row.className = "prox-row" + (o.id === embAtivoId ? " atual" : "") + (ocupado ? " ocupado" : "");
      row.innerHTML = '<div><b>' + escapeHtml(o.id_externo) + '</b><br><span>' + canalLabel(o.canal) + ', ' + un + (un === 1 ? ' item' : ' itens') + '</span></div><span>' + (ocupado ? 'em uso' : (o.id === embAtivoId ? 'aberto' : 'abrir')) + '</span>';
      if (!ocupado && o.id !== embAtivoId) row.addEventListener("click", function () {
        if (embAtivoId) liberarReservaPedido(embAtivoId);
        abrirEmbalagem(o.id);
      });
      el.appendChild(row);
    });
  });
}

// pedidos já embalados (ainda não expedidos): permite imprimir de novo etiqueta + nota
function carregarEmbReimpressao() {
  var el = document.getElementById("embReimpressao");
  if (!el) return;
  sb.from("pedidos").select("id,id_externo,canal,itens_pedido(qtd)").eq("status", "embalado").order("criado_em", { ascending: false }).limit(10).then(function (res) {
    var lista = res.data || [];
    if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum pedido embalado esperando expedição.</div>'; return; }
    el.innerHTML = "";
    lista.forEach(function (o) {
      var un = (o.itens_pedido || []).reduce(function (s, i) { return s + i.qtd; }, 0);
      var row = document.createElement("div");
      row.className = "prox-row";
      row.innerHTML = '<div><b>' + escapeHtml(o.id_externo) + '</b><br><span>' + canalLabel(o.canal) + ', ' + un + (un === 1 ? ' item' : ' itens') + '</span></div><span>🖨️ reimprimir</span>';
      row.addEventListener("click", function () { reimprimirPedido(o.id); });
      el.appendChild(row);
    });
  });
}
function reimprimirPedido(pedidoId) {
  sb.from("pedidos").select("id,id_externo,canal,status,itens_pedido(id,produto_id,qtd,qtd_separada,qtd_embalada,produtos(sku,nome))").eq("id", pedidoId).single().then(function (r) {
    if (r.error || !r.data) { toast("Não consegui abrir o pedido para reimprimir.", "err"); return; }
    mostrarDocumentosSimulados(r.data);
    document.getElementById("docsTitulo").textContent = "Reimpressão: documentos do pedido " + r.data.id_externo;
  });
}

function carregarFilaEmbalagem() {
  embAtivoId = null;
  carregarEmbProximos();
  carregarEmbReimpressao();
  document.getElementById("embSelectCard").style.display = "";
  document.getElementById("embAtivo").style.display = "none";
  document.getElementById("embFila").innerHTML = "";
  var input = document.getElementById("embScanSku");
  if (input) {
    input.value = "";
    input.focus();
    input.onkeydown = function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        destravarAudio();
        buscarPedidosPorItemEmbalagem(input.value.trim());
        input.value = "";
      }
    };
  }
  var camBtn = document.getElementById("embScanCamBtn");
  if (camBtn) {
    camBtn.onclick = function () {
      abrirCamera(function (code) {
        fecharCamera(); // fecha assim que lê, sem esperar a busca no banco
        buscarPedidosPorItemEmbalagem(code);
      });
    };
  }
}

function buscarPedidosPorItemEmbalagem(codigo) {
  if (!codigo) return;
  buscarProdutoPorCodigo(codigo).then(function (resProd) {
    fecharCamera();
    var el = document.getElementById("embFila");
    if (resProd.error || !resProd.data) {
      el.innerHTML = '<div class="empty">Nenhum produto com esse SKU.</div>';
      somErro();
      return;
    }
    sb.from("itens_pedido")
      .select("qtd,qtd_embalada,pedido_id,pedidos!inner(id,id_externo,canal,status,reservado_por,reservado_em)")
      .eq("produto_id", resProd.data.id)
      .eq("pedidos.status", "separado")
      .then(function (res) {
        var itens = (res.data || []).filter(function (i) { return i.qtd_embalada < i.qtd; });
        if (itens.length === 0) {
          el.innerHTML = '<div class="empty">Nenhum pedido aguardando embalagem com o SKU "' + escapeHtml(codigo) + '".</div>';
          somErro();
          return;
        }
        somOk();
        el.innerHTML = '<div class="scan-hint" style="margin:10px 0">' + escapeHtml(resProd.data.nome) + ' — escolha o pedido:</div>';
        itens.forEach(function (i) {
          var o = i.pedidos;
          var ocupado = reservaAtivaDeOutro(o);
          var row = document.createElement("div");
          row.className = "order-row";
          row.innerHTML = '<div><div class="oid">' + escapeHtml(o.id_externo) + '</div><div class="meta">' + canalLabel(o.canal) + (ocupado ? ' · em uso por outra pessoa' : '') + '</div></div>' +
            (ocupado && meu.papel === "admin" ? '<div class="acoes"><button class="btn small" data-liberar="1">Liberar</button><span class="badge exp">ocupado</span></div>' : '<span class="badge sep">' + (ocupado ? 'ocupado' : 'usar →') + '</span>');
          var blE = row.querySelector("[data-liberar]");
          if (blE) blE.addEventListener("click", function (e) { e.stopPropagation(); liberarReservaAdmin(o.id, function () { buscarPedidosPorItemEmbalagem(codigo); }); });
          if (!ocupado) row.addEventListener("click", function () { abrirEmbalagem(o.id); });
          el.appendChild(row);
        });
      });
  });
}

function abrirEmbalagem(pedidoId) {
  tentarReservarPedido(pedidoId, "separado", function (ok) {
    if (!ok) { toast("Esse pedido já está sendo embalado por outra pessoa.", "err"); carregarFilaEmbalagem(); return; }
    embAtivoId = pedidoId;
    document.getElementById("embSelectCard").style.display = "none";
    document.getElementById("embAtivo").style.display = "";
    renderFase(pedidoId, "emb");
    carregarEmbProximos();
  });
}
