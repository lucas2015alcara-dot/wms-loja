"use strict";
// WMS Pilchs — js/modulos/laboratorio/laboratorio.js
// Requisição de peças do laboratório (LAB 01, LAB 02...).
// O lab monta a lista → vira um pedido "LAB nn" no topo da fila de separação →
// cada unidade bipada pelo operador gera uma transferência Vendas Avulsas → Kits →
// separação completa = "pronto para retirar" → o lab confirma o recebimento.
// Integração com o Olist: DESLIGADA por enquanto (config_wms.lab_integracao_olist).
// Com ela desligada, as transferências ficam "aguardando" e o admin marca quando fizer no Olist.

var labWired = false, labCarrinho = [], labResultados = [], labTimer = null, labIntegracao = "desligada";

function labCaixa(texto, tipo) {
  var el = document.getElementById("labMsg");
  if (!texto) { el.style.display = "none"; el.textContent = ""; return; }
  el.className = "ret-box " + (tipo || "");
  el.textContent = texto;
  el.style.display = "block";
}

function labErroTexto(e) {
  var m = (e && e.message) || String(e || "");
  var mapa = {
    sem_permissao: "Seu login não tem permissão para isso.",
    sem_itens: "Adicione pelo menos uma peça.",
    quantidade_invalida: "Quantidade inválida.",
    produto_invalido: "Uma das peças não foi encontrada no cadastro.",
    ja_em_andamento: "O estoque já começou a separar essa requisição. Peça ao admin para cancelar.",
    ainda_nao_separada: "Essa requisição ainda não foi separada.",
    apenas_admin: "Só o admin pode fazer isso."
  };
  for (var k in mapa) if (m.indexOf(k) >= 0) return mapa[k];
  return m;
}

function carregarLaboratorio() {
  if (!labWired) {
    labWired = true;
    document.getElementById("labBuscar").addEventListener("click", buscarPecaLab);
    document.getElementById("labBusca").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); destravarAudio(); buscarPecaLab(); } });
    document.getElementById("labCamBtn").addEventListener("click", function () {
      abrirCamera(function (code) { fecharCamera(); document.getElementById("labBusca").value = code; buscarPecaLab(); });
    });
    document.getElementById("labEnviar").addEventListener("click", enviarRequisicaoLab);
    document.getElementById("labAtualizar").addEventListener("click", carregarListasLab);
    var bt = document.getElementById("labMarcarTodas");
    if (bt) bt.addEventListener("click", function () { marcarTransferenciasLab(null); });
  }
  document.getElementById("labCardTransf").style.display = meu.papel === "admin" ? "" : "none";
  document.getElementById("labCardNova").style.display = (meu.papel === "admin" || meu.papel === "laboratorio") ? "" : "none";
  renderCarrinhoLab();
  carregarListasLab();
  clearInterval(labTimer);
  labTimer = setInterval(function () {
    var v = document.getElementById("view-laboratorio");
    if (!v || !v.classList.contains("active")) { clearInterval(labTimer); return; }
    carregarListasLab();
  }, 30000);
}

// ---------- busca de peça (cadastro do WMS) ----------
function buscarPecaLab() {
  var termo = document.getElementById("labBusca").value.trim();
  var m = document.getElementById("labBuscaMsg");
  var res = document.getElementById("labRes");
  if (termo.length < 2) { m.textContent = "Digite pelo menos 2 letras ou bipe o código."; return; }
  m.textContent = "Buscando…";
  res.innerHTML = "";
  // 1º tenta o código exato (leitor/câmera); se não achar, busca pelo nome
  buscarProdutoPorCodigo(termo).then(function (r) {
    if (r.data) { m.textContent = ""; adicionarPecaLab(r.data); document.getElementById("labBusca").value = ""; return; }
    var t = termo.replace(/[\\%_,()]/g, " ").trim();
    sb.from("produtos").select("id,sku,nome").or("nome.ilike.%" + t + "%,sku.ilike.%" + t + "%").order("nome").limit(12).then(function (r2) {
      labResultados = r2.data || [];
      if (r2.error) { m.textContent = "Erro na busca: " + r2.error.message; return; }
      if (!labResultados.length) { m.textContent = "Nenhuma peça encontrada para \"" + termo + "\"."; somErro(); return; }
      m.textContent = labResultados.length + " resultado(s). Toque para adicionar.";
      carregarSaldosLab(labResultados.map(function (p) { return p.id; })).then(function (saldos) {
        res.innerHTML = labResultados.map(function (p, i) {
          var s = saldos[p.id] || 0;
          return '<div class="ret-item" data-i="' + i + '"><div class="ret-tx"><div class="ret-nome">' + escapeHtml(p.nome) + '</div><div class="ret-sub mono">' + skuTxt(p.sku) + ' · ' + s + ' no estoque</div></div><span class="badge wait">+ adicionar</span></div>';
        }).join("");
        res.querySelectorAll("[data-i]").forEach(function (el) {
          el.addEventListener("click", function () { adicionarPecaLab(labResultados[+el.dataset.i]); res.innerHTML = ""; m.textContent = ""; document.getElementById("labBusca").value = ""; });
        });
      });
    });
  });
}

// saldo somado dos endereços do WMS (o saldo real de Vendas Avulsas vem do Olist quando a integração for ligada)
function carregarSaldosLab(ids) {
  if (!ids.length) return Promise.resolve({});
  return sb.from("estoque_enderecos").select("produto_id,quantidade").in("produto_id", ids).then(function (r) {
    var s = {};
    (r.data || []).forEach(function (x) { s[x.produto_id] = (s[x.produto_id] || 0) + (x.quantidade || 0); });
    return s;
  });
}

function adicionarPecaLab(p) {
  var ja = labCarrinho.find(function (c) { return c.id === p.id; });
  if (ja) ja.qtd = Math.min(999, ja.qtd + 1); else labCarrinho.push({ id: p.id, sku: p.sku, nome: p.nome, qtd: 1 });
  toastScan(p.nome + " ✓ na lista", "ok");
  labCaixa("");
  renderCarrinhoLab();
}

function renderCarrinhoLab() {
  var el = document.getElementById("labLista");
  var tot = labCarrinho.reduce(function (s, c) { return s + c.qtd; }, 0);
  document.getElementById("labListaQtd").textContent = labCarrinho.length ? tot : "";
  document.getElementById("labEnviar").disabled = labCarrinho.length === 0;
  if (!labCarrinho.length) { el.innerHTML = '<div class="empty" style="padding:12px">Nenhuma peça na lista ainda. Busque ou bipe acima.</div>'; return; }
  el.innerHTML = labCarrinho.map(function (c, i) {
    return '<div class="lab-linha"><div class="ret-tx"><div class="ret-nome">' + escapeHtml(c.nome) + '</div><div class="ret-sub mono">' + skuTxt(c.sku) + '</div></div>' +
      '<div class="ret-qtd lab-qtd"><button type="button" data-m="' + i + '" aria-label="Menos um">−</button><input type="number" min="1" max="999" value="' + c.qtd + '" data-q="' + i + '" aria-label="Quantidade"><button type="button" data-p="' + i + '" aria-label="Mais um">+</button></div>' +
      '<button class="rm" data-r="' + i + '" aria-label="Remover">✕</button></div>';
  }).join("");
  el.querySelectorAll("[data-m]").forEach(function (b) { b.addEventListener("click", function () { var c = labCarrinho[+b.dataset.m]; if (c.qtd > 1) { c.qtd--; renderCarrinhoLab(); } }); });
  el.querySelectorAll("[data-p]").forEach(function (b) { b.addEventListener("click", function () { var c = labCarrinho[+b.dataset.p]; c.qtd = Math.min(999, c.qtd + 1); renderCarrinhoLab(); }); });
  el.querySelectorAll("[data-q]").forEach(function (inp) { inp.addEventListener("change", function () { var c = labCarrinho[+inp.dataset.q]; c.qtd = Math.min(999, Math.max(1, parseInt(inp.value, 10) || 1)); renderCarrinhoLab(); }); });
  el.querySelectorAll("[data-r]").forEach(function (b) { b.addEventListener("click", function () { labCarrinho.splice(+b.dataset.r, 1); renderCarrinhoLab(); }); });
}

function enviarRequisicaoLab() {
  if (!labCarrinho.length) return;
  var btn = document.getElementById("labEnviar");
  btn.disabled = true;
  var montagem = document.getElementById("labMontagem").value.trim();
  sb.rpc("lab_criar_requisicao", { p_itens: labCarrinho.map(function (c) { return { produto_id: c.id, qtd: c.qtd }; }), p_montagem: montagem || null }).then(function (r) {
    btn.disabled = false;
    if (r.error) { labCaixa("Não foi possível enviar: " + labErroTexto(r.error), "err"); return; }
    var d = r.data || {};
    labCarrinho = [];
    document.getElementById("labMontagem").value = "";
    renderCarrinhoLab();
    labCaixa("Requisição " + d.id_externo + " enviada. Ela já está no topo da fila de separação.", "ok");
    toast(d.id_externo + " enviada ✓", "ok");
    carregarListasLab();
    carregarContadores();
  });
}

// ---------- requisições (abertas e recentes) ----------
function carregarListasLab() {
  sb.from("config_wms").select("valor").eq("chave", "lab_integracao_olist").maybeSingle().then(function (r) {
    labIntegracao = (r.data && r.data.valor) || "desligada";
    var b = document.getElementById("labIntegracao");
    if (b) b.innerHTML = labIntegracao === "ligada"
      ? '<b>Integração com o Olist: LIGADA.</b> Cada peça bipada é transferida sozinha de Vendas Avulsas para Kits.'
      : '<b>Integração com o Olist: DESLIGADA.</b> Cada peça bipada fica registrada aqui. Faça a transferência no Olist e marque como feita.';
  });
  var desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  sb.from("pedidos")
    .select("id,id_externo,status,criado_em,cancelado_em,itens_pedido(id,qtd,qtd_separada,produtos(sku,nome)),lab_requisicoes(numero,montagem,pronto_em,recebido_em)")
    .eq("canal", "laboratorio")
    .or("status.in.(a_separar,pronto_lab),criado_em.gte." + desde)
    .order("criado_em", { ascending: false })
    .limit(60)
    .then(function (r) {
      var abertas = document.getElementById("labAbertas"), fechadas = document.getElementById("labFechadas");
      if (r.error) { abertas.innerHTML = '<div class="empty">Erro: ' + escapeHtml(r.error.message) + '</div>'; return; }
      var lista = r.data || [];
      var ab = lista.filter(function (p) { return p.status === "a_separar" || p.status === "pronto_lab"; });
      var fe = lista.filter(function (p) { return p.status !== "a_separar" && p.status !== "pronto_lab"; }).slice(0, 15);
      // pronto para retirar primeiro, depois a fila na ordem de chegada
      ab.sort(function (a, b) { return (a.status === "pronto_lab" ? 0 : 1) - (b.status === "pronto_lab" ? 0 : 1) || new Date(a.criado_em) - new Date(b.criado_em); });
      document.getElementById("labAbertasQtd").textContent = ab.length || "";
      abertas.innerHTML = ab.length ? "" : '<div class="empty">Nenhuma requisição em andamento.</div>';
      ab.forEach(function (p) { abertas.appendChild(cartaoRequisicaoLab(p, true)); });
      fechadas.innerHTML = fe.length ? "" : '<div class="empty">Nada nos últimos 7 dias.</div>';
      fe.forEach(function (p) { fechadas.appendChild(cartaoRequisicaoLab(p, false)); });
    });
  if (meu.papel === "admin") carregarTransferenciasLab();
}

function labSituacao(p) {
  var tot = 0, sep = 0;
  (p.itens_pedido || []).forEach(function (i) { tot += i.qtd; sep += Math.min(i.qtd_separada, i.qtd); });
  if (p.status === "pronto_lab") return { txt: "Pronto para retirar", cls: "emb", tot: tot, sep: sep };
  if (p.status === "entregue_lab") return { txt: "Recebido", cls: "exp", tot: tot, sep: sep };
  if (p.status === "cancelado") return { txt: "Cancelado", cls: "cancel", tot: tot, sep: sep };
  if (sep > 0) return { txt: "Separando " + sep + " de " + tot, cls: "sep", tot: tot, sep: sep };
  return { txt: "Na fila", cls: "wait", tot: tot, sep: sep };
}

function cartaoRequisicaoLab(p, aberta) {
  var req = (Array.isArray(p.lab_requisicoes) ? p.lab_requisicoes[0] : p.lab_requisicoes) || {};
  var s = labSituacao(p);
  var div = document.createElement("div");
  div.className = "lab-req" + (p.status === "pronto_lab" ? " pronto" : "");
  var quando = p.status === "entregue_lab" && req.recebido_em ? "recebido " + dataCurta(req.recebido_em)
    : p.status === "cancelado" && p.cancelado_em ? "cancelado " + dataCurta(p.cancelado_em)
    : "pedido há " + tempoDesde(p.criado_em);
  var itens = (p.itens_pedido || []).map(function (i) {
    var ok = i.qtd_separada >= i.qtd;
    return '<li class="' + (ok ? "ok" : "") + '"><span class="q mono">' + Math.min(i.qtd_separada, i.qtd) + '/' + i.qtd + '</span><span class="n">' + escapeHtml(i.produtos ? i.produtos.nome : "?") + '</span></li>';
  }).join("");
  div.innerHTML =
    '<div class="lab-req-cab"><div><div class="oid">' + escapeHtml(p.id_externo) + '</div><div class="meta">' + (req.montagem ? escapeHtml(req.montagem) + ' · ' : '') + s.tot + ' peça' + (s.tot === 1 ? '' : 's') + ' · ' + quando + '</div></div>' +
    '<span class="badge ' + s.cls + '">' + s.txt + '</span></div>' +
    (aberta && p.status === "a_separar" ? '<div class="trilho-lab"><div style="width:' + (s.tot ? Math.round(s.sep / s.tot * 100) : 0) + '%"></div></div>' : '') +
    '<details' + (aberta ? ' open' : '') + '><summary>Peças</summary><ul class="lab-itens">' + itens + '</ul></details>' +
    '<div class="lab-acoes"></div>';
  var acoes = div.querySelector(".lab-acoes");
  var podeLab = meu.papel === "laboratorio" || meu.papel === "admin";
  if (p.status === "pronto_lab" && podeLab) {
    var b = document.createElement("button");
    b.className = "btn primary"; b.style.width = "100%";
    b.textContent = "Confirmar recebimento";
    b.addEventListener("click", function () {
      b.disabled = true;
      sb.rpc("lab_confirmar_recebimento", { p_pedido_id: p.id }).then(function (r) {
        if (r.error) { b.disabled = false; toast(labErroTexto(r.error), "err"); return; }
        toast(p.id_externo + " recebido ✓", "ok");
        carregarListasLab();
      });
    });
    acoes.appendChild(b);
  }
  if (p.status === "a_separar" && s.sep === 0 && podeLab) {
    var c = document.createElement("button");
    c.className = "btn ghost small";
    c.textContent = "Cancelar requisição";
    c.addEventListener("click", function () {
      if (c.dataset.conf !== "1") { c.dataset.conf = "1"; c.textContent = "Toque de novo para cancelar " + p.id_externo; return; }
      c.disabled = true;
      sb.rpc("lab_cancelar_requisicao", { p_pedido_id: p.id }).then(function (r) {
        if (r.error) { c.disabled = false; toast(labErroTexto(r.error), "err"); return; }
        toast(p.id_externo + " cancelada", "ok");
        carregarListasLab();
        carregarContadores();
      });
    });
    acoes.appendChild(c);
  }
  return div;
}

// ---------- transferências Avulsas → Kits (admin) ----------
var labTransfPendentes = [];
function carregarTransferenciasLab() {
  sb.from("lab_transferencias")
    .select("id,quantidade,origem,destino,status,criado_em,erro,pedidos(id_externo),produtos(sku,nome)")
    .in("status", ["aguardando_manual", "aguardando_api", "erro"])
    .order("criado_em")
    .limit(200)
    .then(function (r) {
      var el = document.getElementById("labTransf");
      if (r.error) { el.innerHTML = '<div class="empty">Erro: ' + escapeHtml(r.error.message) + '</div>'; return; }
      labTransfPendentes = r.data || [];
      document.getElementById("labTransfQtd").textContent = labTransfPendentes.length || "";
      document.getElementById("labMarcarTodas").style.display = labTransfPendentes.some(function (t) { return t.status !== "aguardando_api"; }) ? "" : "none";
      if (!labTransfPendentes.length) { el.innerHTML = '<div class="empty">Nenhuma transferência pendente.</div>'; return; }
      // agrupa por requisição
      var grupos = {}, ordem = [];
      labTransfPendentes.forEach(function (t) {
        var k = t.pedidos ? t.pedidos.id_externo : "?";
        if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
        grupos[k].push(t);
      });
      el.innerHTML = ordem.map(function (k) {
        return '<div class="lab-tr-grupo"><div class="lab-tr-cab">' + escapeHtml(k) + '</div>' + grupos[k].map(function (t) {
          var volta = t.origem !== "Vendas Avulsas" && t.destino === "Vendas Avulsas";
          var st = t.status === "aguardando_api" ? '<span class="badge sep">na fila do Olist</span>'
            : t.status === "erro" ? '<span class="badge cancel" title="' + escapeHtml(t.erro || "") + '">erro</span>'
            : '<button class="btn small" data-feita="' + t.id + '">feita</button>';
          return '<div class="lab-tr' + (volta ? ' volta' : '') + '"><div class="ret-tx"><div class="ret-nome">' + t.quantidade + '× ' + escapeHtml(t.produtos ? t.produtos.nome : "?") + '</div>' +
            '<div class="ret-sub"><span class="mono">' + skuTxt(t.produtos ? t.produtos.sku : "") + '</span> · ' + escapeHtml(t.origem) + ' → ' + escapeHtml(t.destino) + (volta ? ' (devolução)' : '') + ' · ' + horaCurtaLab(t.criado_em) + '</div></div>' + st + '</div>';
        }).join("") + '</div>';
      }).join("");
      el.querySelectorAll("[data-feita]").forEach(function (b) {
        b.addEventListener("click", function () { b.disabled = true; marcarTransferenciasLab([b.dataset.feita]); });
      });
    });
}
function horaCurtaLab(iso) {
  var d = new Date(iso);
  var hoje = new Date();
  var mesmoDia = d.toDateString() === hoje.toDateString();
  return (mesmoDia ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " ") + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function marcarTransferenciasLab(ids) {
  if (!ids) {
    ids = labTransfPendentes.filter(function (t) { return t.status !== "aguardando_api"; }).map(function (t) { return t.id; });
    var b = document.getElementById("labMarcarTodas");
    if (b.dataset.conf !== "1") { b.dataset.conf = "1"; b.textContent = "Confirmar: já fiz as " + ids.length + " no Olist"; return; }
    b.dataset.conf = ""; b.textContent = "Marcar todas como feitas";
  }
  if (!ids.length) return;
  sb.rpc("lab_marcar_transferencias", { p_ids: ids }).then(function (r) {
    if (r.error) { toast(labErroTexto(r.error), "err"); return; }
    toast((r.data || 0) + " transferência(s) marcada(s) ✓", "ok");
    carregarTransferenciasLab();
  });
}
