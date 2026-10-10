"use strict";
// WMS Pilchs — js/modulos/operacao/fase.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- FASE COMPARTILHADA (separação / embalagem) ----------------
var FASE_CFG = {
  sep: { campo: "qtd_separada", tipo: "separacao", proximoStatus: "separado", wrapId: "sepAtivo", voltar: carregarFilaSeparacao },
  emb: { campo: "qtd_embalada", tipo: "embalagem", proximoStatus: "embalado", wrapId: "embAtivo", voltar: carregarFilaEmbalagem }
};

var enderecosCache = [];
var sepEnderecoAtivo = null;

function renderFase(pedidoId, fase) {
  var cfg = FASE_CFG[fase];
  if (fase === "sep") sepEnderecoAtivo = null;
  var carregarPedido = sb.from("pedidos").select("id,id_externo,canal,itens_pedido(id,produto_id,qtd,qtd_separada,qtd_embalada,produtos(sku,nome))").eq("id", pedidoId).single();
  var carregarEnderecosP = fase === "sep" ? sb.from("enderecos").select("id,codigo").eq("ativo", true) : Promise.resolve({ data: [] });

  Promise.all([carregarPedido, carregarEnderecosP]).then(function (results) {
    var res = results[0];
    if (res.error || !res.data) { toast("Erro ao carregar pedido", "err"); return; }
    var pedido = res.data;
    enderecosCache = results[1].data || [];
    var wrap = document.getElementById(cfg.wrapId);
    var allDone = pedido.itens_pedido.every(function (i) { return i[cfg.campo] >= i.qtd; });
    var html = '<div class="card"><div class="op-cab"><div><div class="canal">' + canalLabel(pedido.canal) + '</div><h2 class="op-title">Pedido ' + escapeHtml(pedido.id_externo) + '</h2></div><div class="op-prog" id="prog_' + fase + '"></div></div>';
    html += '<div class="scan-box">';
    if (fase === "sep") html += '<div id="endAtivo_sep" class="scan-hint" style="margin-bottom:8px; font-weight:600">' + (ENDERECAMENTO ? "📍 Bipe o endereço antes do produto" : "Sem endereçamento: bipe só o produto") + '</div>';
    if (fase === "emb") html += '<label for="scanInput_' + fase + '" class="scan-rot">Bipe cada produto</label>';
    html += '<input type="text" id="scanInput_' + fase + '" class="mono" placeholder="' + (fase === "sep" && ENDERECAMENTO ? "bipe o endereço ou o produto" : "bipe ou digite o código") + '" autocomplete="off" autocapitalize="off">';
    html += '<button class="btn primary btn-camera" id="btnCam_' + fase + '">📷 Usar câmera do celular</button>';
    html += '<div class="scan-hint">Leitor USB/Bluetooth funciona direto. Sem leitor, use a câmera ou digite e aperte Enter.</div></div>';
    html += '<div id="itemsList_' + fase + '"></div>';
    html += '<div class="row" style="margin-top:12px"><button class="btn ghost" id="voltar_' + fase + '" style="width:100%">← voltar à fila</button></div></div>';
    wrap.innerHTML = html;

    renderItensFase(pedido.itens_pedido, fase);
    if (allDone) { concluirFase(pedido, fase); return; }

    document.getElementById("voltar_" + fase).addEventListener("click", function () {
      liberarReservaPedido(pedido.id);
      cfg.voltar();
    });
    document.getElementById("btnCam_" + fase).addEventListener("click", function () {
      abrirCamera(function (code) { handleScan(pedido, code, fase); });
    });

    var input = document.getElementById("scanInput_" + fase);
    input.focus();
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        destravarAudio();
        handleScan(pedido, input.value.trim(), fase);
        input.value = "";
      }
    });
  });
}

function concluirFase(pedido, fase) {
  var cfg = FASE_CFG[fase];
  sb.from("pedidos").update({ status: cfg.proximoStatus, reservado_por: null, reservado_em: null }).eq("id", pedido.id).then(function (r) {
    if (r.error) { toast("Erro ao concluir: " + r.error.message, "err"); return; }
    fecharCamera();
    toast("Pedido " + pedido.id_externo + " " + statusLabel(cfg.proximoStatus).toLowerCase() + " ✓", "ok");
    cfg.voltar();
    if (fase === "emb") mostrarDocumentosSimulados(pedido);
  });
}

function renderItensFase(itens, fase) {
  var cfg = FASE_CFG[fase];
  var list = document.getElementById("itemsList_" + fase);
  list.innerHTML = "";
  var prog = document.getElementById("prog_" + fase);
  if (prog) {
    var tot = itens.reduce(function (s, i) { return s + i.qtd; }, 0);
    var feito = itens.reduce(function (s, i) { return s + Math.min(i[cfg.campo], i.qtd); }, 0);
    prog.innerHTML = '<b>' + feito + ' de ' + tot + (fase === "emb" ? ' conferidos' : ' separados') + '</b><div class="trilho"><div style="width:' + (tot ? Math.round(feito / tot * 100) : 0) + '%"></div></div>';
  }
  var jaMarcouAgora = false;
  itens.forEach(function (it) {
    var done = it[cfg.campo] >= it.qtd;
    var row = document.createElement("div");
    var agora = fase === "sep" && !done && !jaMarcouAgora;
    if (agora) jaMarcouAgora = true;
    row.className = "pick-item" + (done ? " done" : "") + (agora ? " agora" : "");
    row.id = "item_" + fase + "_" + it.id;
    row.innerHTML =
      '<div class="top"><div><div class="name">' + escapeHtml(it.produtos.nome) + '</div><div class="sku mono">' + skuTxt(it.produtos.sku) + '</div></div>' +
      '<div class="qty"><span class="' + (done ? "done-c" : "") + '">' + it[cfg.campo] + '</span> / ' + it.qtd + '</div></div>' +
      '<div class="sku mono" id="locais_' + fase + '_' + it.id + '"></div>' +
      (done ? '' : '<button class="alerta-btn" data-item="' + it.id + '">' + (fase === "sep" ? "reportar falta de estoque" : "reportar problema") + '</button>');
    list.appendChild(row);
    if (fase === "sep" && !done && ENDERECAMENTO) carregarLocaisItem(it, fase);
  });
  list.querySelectorAll(".alerta-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { reportarAlerta(btn.dataset.item, btn, fase); });
  });
}

function carregarLocaisItem(item, fase) {
  sb.from("estoque_enderecos").select("quantidade,enderecos(codigo)").eq("produto_id", item.produto_id).gt("quantidade", 0).order("quantidade", { ascending: false }).then(function (res) {
    var el = document.getElementById("locais_" + fase + "_" + item.id);
    if (!el) return;
    var lista = res.data || [];
    if (lista.length === 0) { el.textContent = "📍 sem endereço com estoque cadastrado"; return; }
    // um endereço por linha, sem quebrar no meio do código (ex.: "Rua 01 - PP3 - A2")
    el.innerHTML = lista.map(function (r) { return '<span style="white-space:nowrap">📍 ' + escapeHtml(r.enderecos.codigo) + " (" + r.quantidade + ")</span>"; }).join("<br>");
  });
}

function reportarAlerta(itemId, btnEl, fase) {
  var origem = fase === "emb" ? "embalagem" : "separacao";
  sb.from("alertas_estoque").insert({ item_id: itemId, reportado_por: meu.id, origem: origem }).then(function (res) {
    if (res.error) { toast("Erro ao reportar: " + res.error.message, "err"); return; }
    toast("Reportado ao admin", "ok");
    btnEl.outerHTML = '<div class="alerta-tag">⚠ ' + (origem === "embalagem" ? "problema reportado" : "falta reportada") + '</div>';
  });
}

function normalizarCodigo(c) {
  c = (c || "").toString().trim().toLowerCase();
  // códigos só-numéricos: tira zeros à esquerda, pra não falhar quando a câmera
  // lê um EAN-13 (com zero na frente) como UPC-A (sem o zero), ou vice-versa
  if (/^\d+$/.test(c)) { var s = c.replace(/^0+/, ""); return s === "" ? "0" : s; }
  return c;
}

// Acha um produto pelo código lido ou digitado, com a mesma regra da separação: ignora zeros à
// esquerda (a câmera lê o mesmo código de barras como EAN-13, com zero, ou UPC-A, sem zero) e
// maiúsculas/minúsculas. Devolve no formato do Supabase: { data: produto | null, error }.
function buscarProdutoPorCodigo(codigo) {
  var bruto = (codigo || "").toString().trim();
  var alvo = normalizarCodigo(bruto);
  var consulta = sb.from("produtos").select("id,sku,nome");
  if (/^\d+$/.test(bruto)) {
    consulta = consulta.in("sku", [bruto, alvo, "0" + alvo, "00" + alvo]);
  } else {
    consulta = consulta.ilike("sku", bruto.replace(/[\\%_]/g, "\\$&"));
  }
  return consulta.then(function (res) {
    if (res.error) return { data: null, error: res.error };
    var p = (res.data || []).find(function (x) { return normalizarCodigo(x.sku) === alvo; });
    return { data: p || null, error: null };
  });
}

function atualizarEnderecoAtivoUI() {
  var el = document.getElementById("endAtivo_sep");
  if (!el) return;
  el.textContent = sepEnderecoAtivo ? "📍 Endereço ativo: " + sepEnderecoAtivo.codigo : "📍 Bipe o endereço antes do produto";
}

function handleScan(pedido, code, fase) {
  if (!code) return;
  var cfg = FASE_CFG[fase];
  var alvo = normalizarCodigo(code);

  // na separação, primeiro tenta reconhecer como código de endereço (só com endereçamento ligado)
  if (fase === "sep" && ENDERECAMENTO) {
    var end = enderecosCache.find(function (e) { return normalizarCodigo(e.codigo) === alvo; });
    if (end) {
      sepEnderecoAtivo = end;
      atualizarEnderecoAtivoUI();
      fecharCamera(); // libera a tela para o operador pegar o produto e abrir a câmera de novo
      toastScan("📍 Endereço ativo: " + end.codigo, "ok");
      return;
    }
  }

  var item = pedido.itens_pedido.find(function (i) { return normalizarCodigo(i.produtos.sku) === alvo; });
  if (!item) { toastScan(ENDERECAMENTO && fase === "sep" ? "Código não pertence a este pedido nem é um endereço conhecido" : "Código não pertence a este pedido", "err"); return; }
  if (item[cfg.campo] >= item.qtd) { toastScan("Item já conferido (" + item.qtd + "/" + item.qtd + ")", "err"); return; }

  if (fase === "sep" && ENDERECAMENTO) {
    if (!sepEnderecoAtivo) { toastScan("Bipe o endereço antes do produto", "err"); return; }
    sb.rpc("bipar_endereco_sku", { p_produto_id: item.produto_id, p_endereco_id: sepEnderecoAtivo.id }).then(function (rpcRes) {
      if (rpcRes.error) { toastScan("Esse SKU não tem estoque em " + sepEnderecoAtivo.codigo, "err"); return; }
      aplicarIncrementoItem(pedido, item, fase);
    });
  } else {
    aplicarIncrementoItem(pedido, item, fase);
  }
}

function aplicarIncrementoItem(pedido, item, fase) {
  var cfg = FASE_CFG[fase];
  var novoValor = item[cfg.campo] + 1;
  var eraPrimeiro = item[cfg.campo] === 0;
  var patch = {}; patch[cfg.campo] = novoValor;

  sb.from("itens_pedido").update(patch).eq("id", item.id).then(function (res) {
    if (res.error) { toastScan("Erro ao gravar: " + res.error.message, "err"); return; }
    item[cfg.campo] = novoValor;
    var ficouCompleto = novoValor >= item.qtd;

    // registra evento de tarefa (início na primeira bipagem, fim quando completa)
    if (eraPrimeiro) {
      sb.from("eventos_tarefa").insert({ usuario_id: meu.id, item_id: item.id, tipo: cfg.tipo }).then(function (evRes) {
        if (!evRes.error && ficouCompleto) fecharEvento(item.id, cfg.tipo);
      });
    } else if (ficouCompleto) {
      fecharEvento(item.id, cfg.tipo);
    }

    renderItensFase(pedido.itens_pedido, fase);
    var allDone = pedido.itens_pedido.every(function (i) { return i[cfg.campo] >= i.qtd; });
    if (allDone) {
      toastScan(escapeHtml(item.produtos.nome) + " ✓ último item — concluindo pedido...", "ok");
      concluirFase(pedido, fase);
    } else {
      toastScan(escapeHtml(item.produtos.nome) + " ✓ " + novoValor + "/" + item.qtd, "ok");
    }
  });
}

function fecharEvento(itemId, tipo) {
  sb.from("eventos_tarefa").update({ finalizado_em: new Date().toISOString() })
    .eq("item_id", itemId).eq("tipo", tipo).eq("usuario_id", meu.id).is("finalizado_em", null).then(function () {});
}
