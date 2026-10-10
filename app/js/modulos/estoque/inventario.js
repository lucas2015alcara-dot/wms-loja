"use strict";
// WMS Pilchs — js/modulos/estoque/inventario.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- INVENTÁRIO ----------------
var invWired = false;
var invItensAtuais = []; // {produto_id, sku, nome, sistema}

function carregarInventario() {
  if (!invWired) {
    invWired = true;
    document.getElementById("invEndereco").addEventListener("change", carregarItensInventario);
    document.getElementById("invAdicionarSku").addEventListener("click", adicionarSkuInventario);
    document.getElementById("invSalvar").addEventListener("click", salvarInventario);
    // bipar o endereço (leitor ou câmera) em vez de procurar na lista
    var bipe = document.getElementById("invEnderecoBipe");
    bipe.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); destravarAudio(); invBiparEndereco(bipe.value); }
    });
    document.getElementById("invEnderecoCam").addEventListener("click", function () {
      abrirCamera(function (code) { fecharCamera(); invBiparEndereco(code); });
    });
    document.getElementById("invEndereco").addEventListener("change", function () {
      var e = invEnderecos.find(function (x) { return x.id === document.getElementById("invEndereco").value; });
      bipe.value = e ? e.codigo : "";
    });
    // SKU não listado: Enter ou câmera já adicionam
    var novoSku = document.getElementById("invNovoSku");
    novoSku.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); adicionarSkuInventario(); }
    });
    document.getElementById("invNovoSkuCam").addEventListener("click", function () {
      abrirCamera(function (code) { fecharCamera(); novoSku.value = code; adicionarSkuInventario(); });
    });
  }
  sb.from("enderecos").select("id,codigo").eq("ativo", true).order("codigo").then(function (res) {
    invEnderecos = res.data || [];
    var sel = document.getElementById("invEndereco");
    var atual = sel.value;
    sel.innerHTML = '<option value="">— escolha um endereço —</option>';
    (res.data || []).forEach(function (e) {
      sel.innerHTML += '<option value="' + e.id + '">' + escapeHtml(e.codigo) + '</option>';
    });
    if (atual) sel.value = atual;
  });
}

var invEnderecos = [];
function invBiparEndereco(codigo) {
  codigo = (codigo || "").toString().trim();
  if (!codigo) return;
  var alvo = normalizarCodigo(codigo);
  var e = invEnderecos.find(function (x) { return normalizarCodigo(x.codigo) === alvo; });
  var bipe = document.getElementById("invEnderecoBipe");
  if (!e) {
    // continua no endereço que já estava sendo contado (se houver)
    var atual = invEnderecos.find(function (x) { return x.id === document.getElementById("invEndereco").value; });
    bipe.value = atual ? atual.codigo : "";
    toastScan("Endereço \"" + codigo + "\" não cadastrado", "err");
    return;
  }
  bipe.value = e.codigo;
  document.getElementById("invEndereco").value = e.id;
  toastScan("📍 Contando: " + e.codigo, "ok");
  carregarItensInventario();
}

function carregarItensInventario() {
  var endId = document.getElementById("invEndereco").value;
  var lista = document.getElementById("invLista");
  invItensAtuais = [];
  if (!endId) { lista.innerHTML = ""; document.getElementById("invSalvar").style.display = "none"; return; }
  lista.innerHTML = '<div class="empty">Carregando...</div>';
  sb.from("estoque_enderecos").select("quantidade,produtos(id,sku,nome)").eq("endereco_id", endId).gt("quantidade", 0).then(function (res) {
    invItensAtuais = (res.data || []).map(function (r) {
      return { produto_id: r.produtos.id, sku: r.produtos.sku, nome: r.produtos.nome, sistema: r.quantidade };
    });
    renderInventarioLista();
  });
}

function renderInventarioLista() {
  var lista = document.getElementById("invLista");
  var btnSalvar = document.getElementById("invSalvar");
  if (invItensAtuais.length === 0) {
    lista.innerHTML = '<div class="empty">Nenhum SKU cadastrado nesse endereço ainda. Use o campo abaixo pra adicionar um.</div>';
  } else {
    lista.innerHTML = "";
    invItensAtuais.forEach(function (it, idx) {
      var row = document.createElement("div");
      row.className = "pick-item";
      row.innerHTML =
        '<div class="top"><div><div class="name">' + escapeHtml(it.nome) + '</div><div class="sku mono">' + skuTxt(it.sku) + ' · sistema: ' + it.sistema + '</div></div>' +
        '<input type="number" min="0" value="' + it.sistema + '" data-inv-idx="' + idx + '" class="mono" style="width:80px; text-align:center"></div>';
      lista.appendChild(row);
    });
  }
  btnSalvar.style.display = invItensAtuais.length ? "" : "none";
}

function adicionarSkuInventario() {
  var input = document.getElementById("invNovoSku");
  var sku = input.value.trim();
  if (!sku) { toast("Informe o SKU", "err"); return; }
  if (invItensAtuais.some(function (it) { return normalizarCodigo(it.sku) === normalizarCodigo(sku); })) {
    toast("Esse SKU já está na lista", "err"); return;
  }
  buscarProdutoPorCodigo(sku).then(function (res) {
    if (res.error || !res.data) { toast("SKU não encontrado nos produtos cadastrados", "err"); return; }
    invItensAtuais.push({ produto_id: res.data.id, sku: res.data.sku, nome: res.data.nome, sistema: 0 });
    input.value = "";
    renderInventarioLista();
  });
}

function salvarInventario() {
  var endId = document.getElementById("invEndereco").value;
  if (!endId) return;
  var lista = document.getElementById("invLista");
  var inputs = lista.querySelectorAll("[data-inv-idx]");
  var chamadas = [];
  inputs.forEach(function (inp) {
    var idx = parseInt(inp.dataset.invIdx, 10);
    var it = invItensAtuais[idx];
    var contado = parseInt(inp.value, 10);
    if (isNaN(contado) || contado < 0) return;
    chamadas.push(sb.rpc("registrar_contagem_inventario", { p_endereco_id: endId, p_produto_id: it.produto_id, p_qtd_contada: contado }));
  });
  if (chamadas.length === 0) { toast("Nada pra salvar", "err"); return; }
  var btn = document.getElementById("invSalvar");
  btn.disabled = true;
  Promise.all(chamadas).then(function (resultados) {
    var erro = resultados.find(function (r) { return r && r.error; });
    if (erro) { toast("Erro ao salvar: " + erro.error.message, "err"); return; }
    toast("Contagem salva ✓", "ok");
    carregarItensInventario();
  }).finally(function () { btn.disabled = false; });
}
