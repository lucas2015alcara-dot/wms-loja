"use strict";
// WMS Pilchs — js/modulos/estoque/enderecos.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- ENDEREÇOS ----------------
var endWired = false;

function carregarEnderecos() {
  carregarSelectsEndereco();
  carregarListaEstoqueEnderecos();
  if (!endWired) {
    endWired = true;
    document.getElementById("endCriar").addEventListener("click", criarEndereco);
    document.getElementById("trfSalvar").addEventListener("click", salvarTransferencia);
    ligarBipeTransferencia();
  }
}

// ---------- bipagem na transferência: produto → origem (opcional) → destino → quantidade ----------
var trfEnderecos = [];

function ligarBipeTransferencia() {
  function ligar(inputId, camId, fn) {
    var inp = document.getElementById(inputId);
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); destravarAudio(); fn(inp.value); }
    });
    document.getElementById(camId).addEventListener("click", function () {
      abrirCamera(function (code) { fecharCamera(); fn(code); });
    });
  }
  ligar("trfSku", "trfSkuCam", trfBiparProduto);
  ligar("trfOrigemBipe", "trfOrigemCam", function (c) { trfBiparEndereco(c, "Origem"); });
  ligar("trfDestinoBipe", "trfDestinoCam", function (c) { trfBiparEndereco(c, "Destino"); });
  // escolher na lista também atualiza o campo de bipagem, pra tela não mostrar duas coisas diferentes
  ["Origem", "Destino"].forEach(function (qual) {
    var sel = document.getElementById("trf" + qual);
    sel.addEventListener("change", function () {
      var e = trfEnderecos.find(function (x) { return x.id === sel.value; });
      document.getElementById("trf" + qual + "Bipe").value = e ? e.codigo : "";
    });
  });
  document.getElementById("trfQtd").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); salvarTransferencia(); }
  });
  // digitou outro SKU à mão: o nome confirmado antes deixa de valer
  document.getElementById("trfSku").addEventListener("input", function () {
    document.getElementById("trfProdutoNome").innerHTML = "&nbsp;";
  });
}

function trfBiparProduto(codigo) {
  codigo = (codigo || "").toString().trim();
  if (!codigo) return;
  var nomeEl = document.getElementById("trfProdutoNome");
  buscarProdutoPorCodigo(codigo).then(function (res) {
    var p = res.data;
    if (!p) {
      document.getElementById("trfSku").value = codigo;
      nomeEl.textContent = "✗ SKU não cadastrado";
      nomeEl.style.color = "var(--red)";
      toastScan("SKU \"" + codigo + "\" não encontrado nos produtos cadastrados", "err");
      return;
    }
    document.getElementById("trfSku").value = p.sku; // grava o SKU como está cadastrado (com zeros à esquerda)
    nomeEl.textContent = "✓ " + p.nome;
    nomeEl.style.color = "var(--green)";
    toastScan("Produto: " + p.nome, "ok");
    document.getElementById("trfDestinoBipe").focus();
  });
}

function trfBiparEndereco(codigo, qual) {
  codigo = (codigo || "").toString().trim();
  if (!codigo) return;
  var alvo = normalizarCodigo(codigo);
  var e = trfEnderecos.find(function (x) { return normalizarCodigo(x.codigo) === alvo; });
  var input = document.getElementById("trf" + qual + "Bipe");
  if (!e) {
    input.value = "";
    toastScan("Endereço \"" + codigo + "\" não cadastrado", "err");
    return;
  }
  document.getElementById("trf" + qual).value = e.id;
  input.value = e.codigo;
  toastScan("📍 " + qual + ": " + e.codigo, "ok");
  document.getElementById(qual === "Origem" ? "trfDestinoBipe" : "trfQtd").focus();
}

function criarEndereco() {
  var codigo = document.getElementById("endCodigo").value.trim();
  if (!codigo) { toast("Informe o código do endereço", "err"); return; }
  sb.from("enderecos").insert({ codigo: codigo }).then(function (res) {
    if (res.error) { toast("Erro: " + (res.error.message.indexOf("duplicate") >= 0 ? "esse endereço já existe" : res.error.message), "err"); return; }
    toast("Endereço \"" + codigo + "\" criado", "ok");
    document.getElementById("endCodigo").value = "";
    carregarSelectsEndereco();
  });
}

function carregarSelectsEndereco() {
  sb.from("enderecos").select("id,codigo").eq("ativo", true).order("codigo").then(function (res) {
    var lista = res.data || [];
    trfEnderecos = lista;
    document.getElementById("trfOrigemBipe").value = "";
    document.getElementById("trfDestinoBipe").value = "";
    var origem = document.getElementById("trfOrigem");
    var destino = document.getElementById("trfDestino");
    origem.innerHTML = '<option value="">— nenhum (entrada nova) —</option>';
    destino.innerHTML = "";
    lista.forEach(function (e) {
      origem.innerHTML += '<option value="' + e.id + '">' + escapeHtml(e.codigo) + '</option>';
      destino.innerHTML += '<option value="' + e.id + '">' + escapeHtml(e.codigo) + '</option>';
    });
    if (lista.length === 0) destino.innerHTML = '<option value="">nenhum endereço cadastrado ainda</option>';
  });
}

function salvarTransferencia() {
  var sku = document.getElementById("trfSku").value.trim();
  var origemId = document.getElementById("trfOrigem").value || null;
  var destinoId = document.getElementById("trfDestino").value;
  var qtd = parseInt(document.getElementById("trfQtd").value, 10) || 0;
  if (!sku) { toast("Informe o SKU do produto", "err"); return; }
  if (!destinoId) { toast("Escolha o endereço de destino", "err"); return; }
  if (qtd <= 0) { toast("Quantidade inválida", "err"); return; }
  var btn = document.getElementById("trfSalvar");
  btn.disabled = true;
  buscarProdutoPorCodigo(sku).then(function (res) {
    if (res.error || !res.data) throw new Error("SKU \"" + sku + "\" não encontrado nos produtos cadastrados");
    return sb.rpc("transferir_estoque", {
      p_produto_id: res.data.id,
      p_endereco_origem_id: origemId,
      p_endereco_destino_id: destinoId,
      p_quantidade: qtd
    });
  }).then(function (res) {
    if (res && res.error) {
      var msg = res.error.message.indexOf("estoque_insuficiente") >= 0 ? "estoque insuficiente no endereço de origem" : res.error.message;
      throw new Error(msg);
    }
    toast("Estoque atualizado ✓", "ok");
    document.getElementById("trfSku").value = "";
    document.getElementById("trfProdutoNome").innerHTML = "&nbsp;";
    document.getElementById("trfQtd").value = "1";
    document.getElementById("trfSku").focus(); // endereços ficam: guardar vários produtos no mesmo lugar fica rápido
    carregarListaEstoqueEnderecos();
  }).catch(function (err) {
    toast("Erro: " + (err.message || err), "err");
  }).finally(function () { btn.disabled = false; });
}

function carregarListaEstoqueEnderecos() {
  sb.from("estoque_enderecos").select("quantidade,produtos(sku,nome),enderecos(codigo)").gt("quantidade", 0).order("atualizado_em", { ascending: false }).then(function (res) {
    var el = document.getElementById("listaEstoqueEnderecos");
    el.innerHTML = "";
    var lista = res.data || [];
    if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhum estoque endereçado ainda.</div>'; return; }
    lista.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "order-row";
      row.style.cursor = "default";
      row.innerHTML = '<div><div class="oid">' + escapeHtml(r.produtos.nome) + '</div><div class="meta mono">' + skuTxt(r.produtos.sku) + '</div><div class="meta" style="white-space:nowrap">📍 ' + escapeHtml(r.enderecos.codigo) + '</div></div><span class="badge sep">' + r.quantidade + ' un.</span>';
      el.appendChild(row);
    });
  });
}
