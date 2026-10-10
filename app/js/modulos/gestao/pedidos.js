"use strict";
// WMS Pilchs — js/modulos/gestao/pedidos.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- PEDIDOS (admin cria) ----------------
var npItemsBuffer = [];
function renderNpItems() {
  var el = document.getElementById("npItems");
  el.innerHTML = "";
  if (npItemsBuffer.length === 0) {
    el.innerHTML = '<div class="empty" style="padding:10px">Nenhum item adicionado ainda.</div>';
    return;
  }
  npItemsBuffer.forEach(function (it, idx) {
    var row = document.createElement("div");
    row.className = "item-line";
    row.innerHTML = '<span class="mono" style="min-width:26px">' + it.qtd + 'x</span>' +
      '<span style="flex:1">' + escapeHtml(it.nome || it.sku) + '<br><span style="color:var(--text-dim);font-size:13px">' + skuTxt(it.sku) + '</span></span>' +
      '<button class="rm" data-idx="' + idx + '" aria-label="remover">✕</button>';
    el.appendChild(row);
  });
  el.querySelectorAll(".rm").forEach(function (btn) {
    btn.addEventListener("click", function () { npItemsBuffer.splice(parseInt(btn.dataset.idx, 10), 1); renderNpItems(); });
  });
}
document.getElementById("npAddItem").addEventListener("click", function () {
  var sku = document.getElementById("npSku").value.trim();
  var nome = document.getElementById("npNome").value.trim();
  var qtd = parseInt(document.getElementById("npQtd").value, 10) || 1;
  if (!sku) { toast("Informe o SKU", "err"); return; }
  npItemsBuffer.push({ sku: sku, nome: nome, qtd: qtd });
  document.getElementById("npSku").value = "";
  document.getElementById("npNome").value = "";
  document.getElementById("npQtd").value = "1";
  renderNpItems();
});

document.getElementById("npSalvar").addEventListener("click", function () {
  var id_externo = document.getElementById("npId").value.trim();
  var canal = document.getElementById("npCanal").value;
  if (!id_externo) { toast("Informe o ID do pedido", "err"); return; }
  if (npItemsBuffer.length === 0) { toast("Adicione ao menos um item", "err"); return; }
  var btn = document.getElementById("npSalvar");
  btn.disabled = true;
  resolverProdutos(npItemsBuffer).then(function (produtoIds) {
    return sb.from("pedidos").insert({ id_externo: id_externo, canal: canal, status: "a_separar" }).select().single().then(function (res) {
      if (res.error) throw res.error;
      var pedidoId = res.data.id;
      var itens = npItemsBuffer.map(function (it, idx) {
        return { pedido_id: pedidoId, produto_id: produtoIds[idx], qtd: it.qtd };
      });
      return sb.from("itens_pedido").insert(itens);
    });
  }).then(function (res) {
    if (res && res.error) throw res.error;
    toast("Pedido " + id_externo + " criado", "ok");
    document.getElementById("npId").value = "";
    npItemsBuffer = [];
    renderNpItems();
    carregarFilaPedidos();
    carregarContadores();
  }).catch(function (err) {
    toast("Erro ao criar pedido: " + (err.message || err), "err");
  }).finally(function () { btn.disabled = false; });
});

function resolverProdutos(itens) {
  // Pra cada item, acha o produto pelo SKU ou cria se não existir. Retorna array de produto_id na mesma ordem.
  var promessas = itens.map(function (it) {
    return buscarProdutoPorCodigo(it.sku).then(function (res) {
      if (res.data) return res.data.id;
      return sb.from("produtos").insert({ sku: it.sku, nome: it.nome || it.sku }).select().single().then(function (r2) {
        if (r2.error) throw r2.error;
        return r2.data.id;
      });
    });
  });
  return Promise.all(promessas);
}

var btnSyncOlist = document.getElementById("btnSyncOlist");
if (btnSyncOlist) {
  btnSyncOlist.addEventListener("click", function () {
    var out = document.getElementById("syncOlistResultado");
    btnSyncOlist.disabled = true;
    btnSyncOlist.textContent = "Sincronizando…";
    out.textContent = "";
    sb.functions.invoke("sincronizar-olist", { method: "POST" }).then(function (res) {
      btnSyncOlist.disabled = false;
      btnSyncOlist.textContent = "Sincronizar pedidos do Olist";
      if (res.error) {
        out.textContent = "Erro: " + res.error.message;
        toast("Falha ao sincronizar com o Olist.", "err");
        return;
      }
      var d = res.data || {};
      if (d.error) {
        out.textContent = "Erro do Olist: " + d.error + (d.detalhe ? " — " + JSON.stringify(d.detalhe) : "");
        toast("Olist retornou um erro.", "err");
        return;
      }
      var linhas = [];
      linhas.push(d.importados + " pedido(s) importado(s)");
      linhas.push(d.ja_existentes + " já existiam");
      if (d.sem_itens_reconhecidos) linhas.push(d.sem_itens_reconhecidos + " sem item válido");
      if (d.cancelados_no_wms && d.cancelados_no_wms.length) linhas.push("cancelados no WMS (cancelados no Olist): " + d.cancelados_no_wms.join(", "));
      if (d.avisos && d.avisos.length) linhas.push(d.avisos.join(" · "));
      if (d.produtos_cadastrados_automaticamente && d.produtos_cadastrados_automaticamente.length) linhas.push("produtos novos cadastrados: " + d.produtos_cadastrados_automaticamente.join("; "));
      out.textContent = linhas.join(" · ");
      toast(d.importados + " pedido(s) importado(s) do Olist.", "ok");
      carregarFilaPedidos();
      carregarContadores();
    });
  });
}

function carregarFilaPedidos() {
  sb.from("pedidos").select("id,id_externo,canal,status,itens_pedido(qtd)").eq("status", "a_separar").order("criado_em", { ascending: false }).then(function (res) {
    var el = document.getElementById("listaPedidos");
    el.innerHTML = "";
    var lista = res.data || [];
    if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhum pedido na fila.</div>'; return; }
    lista.forEach(function (o) {
      var qtdTotal = (o.itens_pedido || []).reduce(function (s, i) { return s + i.qtd; }, 0);
      var row = document.createElement("div");
      row.className = "order-row";
      row.style.cursor = "default";
      row.innerHTML = '<div><div class="oid">' + escapeHtml(o.id_externo) + '</div><div class="meta">' + canalLabel(o.canal) + ' · ' + qtdTotal + ' un.</div></div><span class="badge wait">A separar</span>';
      el.appendChild(row);
    });
  });
}
