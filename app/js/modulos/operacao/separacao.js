"use strict";
// WMS Pilchs — js/modulos/operacao/separacao.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- SEPARAÇÃO ----------------
var sepAtivoId = null;
var sepModoAtual = "pedido";
function idadeTexto(iso) {
  var min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return min + " min";
  var h = Math.floor(min / 60), m = min % 60;
  return h + " h" + (m ? " " + m : "");
}
function carregarSepProximos() {
  var el = document.getElementById("sepProximos");
  if (!el) return;
  sb.from("pedidos").select("id,id_externo,canal,criado_em,reservado_por,reservado_em,itens_pedido(qtd)").eq("status", "a_separar").order("criado_em").limit(30).then(function (res) {
    var lista = res.data || [];
    if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum pedido esperando separação.</div>'; return; }
    el.innerHTML = "";
    lista.forEach(function (o) {
      var un = (o.itens_pedido || []).reduce(function (s, i) { return s + i.qtd; }, 0);
      var ocupado = reservaAtivaDeOutro(o);
      var velho = !ocupado && o.id !== sepAtivoId && (Date.now() - new Date(o.criado_em).getTime()) > 2 * 3600 * 1000;
      var row = document.createElement("div");
      row.className = "prox-row" + (o.id === sepAtivoId ? " atual" : "") + (ocupado ? " ocupado" : "");
      row.innerHTML = '<div><b>' + escapeHtml(o.id_externo) + '</b><br><span>' + canalLabel(o.canal) + ', ' + un + (un === 1 ? ' item' : ' itens') + '</span></div>' +
        '<span class="idade' + (velho ? ' velho' : '') + '">' + (ocupado ? 'em uso' : (o.id === sepAtivoId ? 'aberto' : idadeTexto(o.criado_em))) + '</span>';
      if (ocupado && meu.papel === "admin") {
        row.title = "Em uso por outra pessoa. Clique para liberar.";
        row.style.cursor = "pointer";
        row.addEventListener("click", function () { liberarReservaAdmin(o.id, carregarSepProximos); });
      } else if (!ocupado && o.id !== sepAtivoId) {
        row.addEventListener("click", function () {
          if (sepAtivoId) liberarReservaPedido(sepAtivoId);
          abrirSeparacao(o.id);
        });
      }
      el.appendChild(row);
    });
  });
}

function carregarFilaSeparacao() {
  sepAtivoId = null;
  carregarSepProximos();
  document.getElementById("sepSelectCard").style.display = "";
  document.getElementById("sepAtivo").style.display = "none";
  document.getElementById("sepLoteAtivo").style.display = "none";
  wireModoSep();
  mostrarModoSep(sepModoAtual);
}

function wireModoSep() {
  var bP = document.getElementById("btnModoSepPedido");
  var bL = document.getElementById("btnModoSepLote");
  if (bP && !bP.dataset.wired) {
    bP.dataset.wired = "1";
    bP.addEventListener("click", function () { mostrarModoSep("pedido"); });
    bL.addEventListener("click", function () { mostrarModoSep("lote"); });
  }
}

function mostrarModoSep(modo) {
  sepModoAtual = modo;
  document.getElementById("btnModoSepPedido").className = "btn " + (modo === "pedido" ? "primary" : "ghost");
  document.getElementById("btnModoSepLote").className = "btn " + (modo === "lote" ? "primary" : "ghost");
  document.getElementById("sepModoPedido").style.display = modo === "pedido" ? "" : "none";
  document.getElementById("sepModoLote").style.display = modo === "lote" ? "" : "none";
  if (modo === "pedido") carregarFilaSeparacaoLista(); else carregarLotesSimples();
}

function carregarFilaSeparacaoLista() {
  sb.from("pedidos").select("id,id_externo,canal,reservado_por,reservado_em,itens_pedido(qtd)").eq("status", "a_separar").order("criado_em").then(function (res) {
    var el = document.getElementById("sepFila");
    el.innerHTML = "";
    var lista = res.data || [];
    if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhum pedido aguardando separação.</div>'; return; }
    lista.forEach(function (o) {
      var qtdTotal = (o.itens_pedido || []).reduce(function (s, i) { return s + i.qtd; }, 0);
      var row = document.createElement("div");
      row.className = "order-row";
      var ocupado = reservaAtivaDeOutro(o);
      row.innerHTML = '<div><div class="oid">' + escapeHtml(o.id_externo) + '</div><div class="meta">' + canalLabel(o.canal) + ' · ' + qtdTotal + ' un.' + (ocupado ? ' · em uso por outra pessoa' : '') + '</div></div>' +
        (ocupado
          ? '<div class="acoes">' + (meu.papel === "admin" ? '<button class="btn small" data-liberar="1">Liberar</button>' : '') + '<span class="badge exp">em uso</span></div>'
          : '<span class="badge wait">iniciar →</span>');
      if (ocupado) {
        var bl = row.querySelector("[data-liberar]");
        if (bl) bl.addEventListener("click", function (e) { e.stopPropagation(); liberarReservaAdmin(o.id, carregarFilaSeparacaoLista); });
        row.addEventListener("click", function () { toast("Esse pedido está aberto com outra pessoa.", "err"); });
      } else {
        row.addEventListener("click", function () { abrirSeparacao(o.id); });
      }
      el.appendChild(row);
    });
  });
}

function abrirSeparacao(pedidoId) {
  tentarReservarPedido(pedidoId, "a_separar", function (ok) {
    if (!ok) { toast("Esse pedido já está sendo separado por outra pessoa.", "err"); carregarFilaSeparacaoLista(); return; }
    sepAtivoId = pedidoId;
    document.getElementById("sepSelectCard").style.display = "none";
    document.getElementById("sepAtivo").style.display = "";
    renderFase(pedidoId, "sep");
    carregarSepProximos();
  });
}

// ---------------- SEPARAÇÃO EM LOTE (pedidos com 1 único item e 1 unidade) ----------------
function carregarLotesSimples() {
  sb.from("pedidos")
    .select("id,id_externo,criado_em,itens_pedido(id,produto_id,qtd,qtd_separada,produtos(sku,nome))")
    .eq("status", "a_separar")
    .order("criado_em")
    .then(function (res) {
      var el = document.getElementById("sepLoteLista");
      el.innerHTML = "";
      var lista = (res.data || []).filter(function (p) {
        return p.itens_pedido.length === 1 && p.itens_pedido[0].qtd === 1 && p.itens_pedido[0].qtd_separada < 1;
      });
      if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhum pedido simples (1 item, 1 unidade) aguardando.</div>'; return; }

      var grupos = {};
      var ordem = [];
      lista.forEach(function (p) {
        var it = p.itens_pedido[0];
        var pid = it.produto_id;
        if (!grupos[pid]) {
          grupos[pid] = { produto_id: pid, sku: it.produtos.sku, nome: it.produtos.nome, pedidos: [] };
          ordem.push(pid);
        }
        grupos[pid].pedidos.push({ id: p.id, id_externo: p.id_externo, item_id: it.id });
      });

      ordem.forEach(function (pid) {
        var g = grupos[pid];
        var row = document.createElement("div");
        row.className = "order-row";
        row.innerHTML = '<div><div class="oid">' + skuTxt(g.sku) + ' — ' + escapeHtml(g.nome) + '</div><div class="meta">' + g.pedidos.length + ' pedido(s)</div></div><span class="badge wait">separar →</span>';
        row.addEventListener("click", function () { abrirLote(g); });
        el.appendChild(row);
      });
    });
}

var loteAtivo = null;
var loteEnderecoAtivo = null;
function abrirLote(grupo) {
  loteAtivo = { produto_id: grupo.produto_id, sku: grupo.sku, nome: grupo.nome, pendentes: grupo.pedidos.slice(), total: grupo.pedidos.length, confirmados: 0 };
  loteEnderecoAtivo = null;

  sb.from("enderecos").select("id,codigo").eq("ativo", true).then(function (res) {
    enderecosCache = res.data || [];
    document.getElementById("sepSelectCard").style.display = "none";
    var wrap = document.getElementById("sepLoteAtivo");
    wrap.style.display = "";
    var html = '<div class="card"><h2 class="op-title"><span class="mono">' + skuTxt(loteAtivo.sku) + '</span> — ' + escapeHtml(loteAtivo.nome) + '</h2>';
    html += '<div class="meta" style="margin-bottom:10px" id="loteContador">0/' + loteAtivo.total + ' confirmadas</div>';
    html += '<div class="scan-box">';
    html += '<div id="loteEnderecoHint" class="scan-hint" style="margin-bottom:8px; font-weight:600">' + (ENDERECAMENTO ? "📍 Bipe o endereço antes do produto" : "Sem endereçamento: bipe só o produto") + '</div>';
    html += '<input type="text" id="loteScanInput" class="mono" placeholder="' + (ENDERECAMENTO ? "bipe o endereço ou o SKU" : "bipe o SKU") + '" autocomplete="off" autocapitalize="off">';
    html += '<button class="btn primary btn-camera" id="loteCamBtn">📷 Usar câmera do celular</button>';
    html += '</div>';
    html += '<div class="row" style="margin-top:12px"><button class="btn ghost" id="loteVoltar" style="width:100%">← voltar</button></div></div>';
    wrap.innerHTML = html;

    document.getElementById("loteVoltar").addEventListener("click", function () {
      fecharCamera();
      wrap.style.display = "none";
      document.getElementById("sepSelectCard").style.display = "";
      carregarLotesSimples();
    });
    document.getElementById("loteCamBtn").addEventListener("click", function () {
      abrirCamera(function (code) { handleScanLote(code); });
    });
    var input = document.getElementById("loteScanInput");
    input.focus();
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        destravarAudio();
        handleScanLote(input.value.trim());
        input.value = "";
      }
    });
  });
}

function handleScanLote(code) {
  if (!code || !loteAtivo) return;
  var alvo = normalizarCodigo(code);

  var end = ENDERECAMENTO ? enderecosCache.find(function (e) { return normalizarCodigo(e.codigo) === alvo; }) : null;
  if (end) {
    loteEnderecoAtivo = end;
    var hint = document.getElementById("loteEnderecoHint");
    if (hint) hint.textContent = "📍 Endereço ativo: " + end.codigo;
    fecharCamera(); // libera a tela para o operador pegar o produto e abrir a câmera de novo
    toastScan("📍 Endereço ativo: " + end.codigo, "ok");
    return;
  }

  if (normalizarCodigo(loteAtivo.sku) !== alvo) { toastScan(ENDERECAMENTO ? "Esse código não é o SKU desse lote nem um endereço conhecido" : "Esse código não é o SKU desse lote", "err"); return; }
  if (loteAtivo.pendentes.length === 0) { toastScan("Lote já concluído", "err"); return; }
  if (!ENDERECAMENTO) { confirmarProximoDoLote(); return; }
  if (!loteEnderecoAtivo) { toastScan("Bipe o endereço antes do produto", "err"); return; }

  sb.rpc("bipar_endereco_sku", { p_produto_id: loteAtivo.produto_id, p_endereco_id: loteEnderecoAtivo.id }).then(function (rpcRes) {
    if (rpcRes.error) { toastScan("Esse SKU não tem estoque em " + loteEnderecoAtivo.codigo, "err"); return; }
    confirmarProximoDoLote();
  });
}

function confirmarProximoDoLote() {
  if (!loteAtivo || loteAtivo.pendentes.length === 0) return;
  var alvo = loteAtivo.pendentes.shift();
  tentarReservarPedido(alvo.id, "a_separar", function (ok) {
    if (!ok) {
      toast("Pedido " + alvo.id_externo + " já está com outra pessoa, pulando para o próximo", "err");
      confirmarProximoDoLote();
      return;
    }
    sb.from("itens_pedido").update({ qtd_separada: 1 }).eq("id", alvo.item_id).then(function () {
      sb.from("pedidos").update({ status: "separado", reservado_por: null, reservado_em: null }).eq("id", alvo.id).then(function () {
        loteAtivo.confirmados++;
        var c = document.getElementById("loteContador");
        if (c) c.textContent = loteAtivo.confirmados + "/" + loteAtivo.total + " confirmadas";
        toastScan("Pedido " + alvo.id_externo + " ✓ (" + loteAtivo.confirmados + "/" + loteAtivo.total + ")", "ok");
        carregarContadores();
        if (loteAtivo.pendentes.length === 0) {
          toast("Lote concluído ✓", "ok");
          fecharCamera();
          document.getElementById("sepLoteAtivo").style.display = "none";
          document.getElementById("sepSelectCard").style.display = "";
          carregarLotesSimples();
        }
      });
    });
  });
}
