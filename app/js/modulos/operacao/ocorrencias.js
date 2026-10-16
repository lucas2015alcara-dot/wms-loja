"use strict";
// WMS Pilchs — js/modulos/operacao/ocorrencias.js
// Ocorrências (problemas): o operador reporta com MOTIVO → o pedido sai da fila;
// o admin resolve com uma SOLUÇÃO → o pedido volta ao topo, reservado 15 min para quem começou.
// Também: o admin pode passar a reserva de um pedido para outro login.

var OC_MOTIVOS = {
  separacao: [["nao_encontrado", "Produto não encontrado no endereço"], ["quantidade_menor", "Quantidade menor que o pedido"], ["avariado", "Produto avariado"], ["codigo_nao_le", "Código de barras não lê / etiqueta errada"], ["produto_diferente", "Produto diferente do cadastro"], ["outro", "Outro"]],
  embalagem: [["item_faltando", "Item faltando"], ["item_errado", "Item errado"], ["avariado", "Produto avariado"], ["sem_embalagem", "Sem caixa ou embalagem adequada"], ["nota_fiscal", "Nota fiscal com problema"], ["etiqueta", "Etiqueta não gera / bloqueada"], ["outro", "Outro"]],
  expedicao: [["extraviado", "Pacote extraviado"], ["pacote_danificado", "Pacote danificado"], ["etiqueta_ilegivel", "Etiqueta ilegível"], ["transportadora_recusou", "Transportadora recusou"], ["outro", "Outro"]]
};
var OC_SOLUCOES = [
  ["encontrado_outro_endereco", "Encontrado em outro endereço"],
  ["sku_substituto", "Enviar outro SKU (cliente autorizou)"],
  ["envio_parcial", "Envio parcial (cliente autorizou)"],
  ["trocar_unidade", "Trocar por outra unidade (avariado)"],
  ["refazer_embalagem", "Refazer embalagem / etiqueta"],
  ["aguardar_reposicao", "Aguardar reposição (pedido fica parado)"],
  ["outro", "Outro"],
  ["cancelar_pedido", "Cancelar o pedido"]
];
var OC_VIAS = ["Chat do Mercado Livre", "Mensagem do marketplace", "Telefone", "WhatsApp", "E-mail", "Outro"];
var ETAPA_NOME = { separacao: "Separação", embalagem: "Embalagem", expedicao: "Expedição" };

function rotuloOc(cod) {
  var t = null;
  Object.keys(OC_MOTIVOS).forEach(function (k) { OC_MOTIVOS[k].forEach(function (m) { if (m[0] === cod) t = m[1]; }); });
  OC_SOLUCOES.forEach(function (s) { if (s[0] === cod) t = s[1]; });
  return t || cod;
}
function erroOc(e) {
  var m = (e && e.message) || String(e || "");
  var mapa = {
    detalhe_obrigatorio: "Escreva o que aconteceu (obrigatório em \"Outro\").",
    ja_tem_ocorrencia: "Esse pedido já tem um problema em aberto: ele já saiu da fila.",
    pedido_em_outra_etapa: "Esse pedido já mudou de etapa. Atualize a tela.",
    motivo_invalido: "Escolha o que aconteceu.",
    sem_permissao: "Seu login não pode fazer isso.",
    apenas_admin: "Só um admin pode fazer isso.",
    sku_nao_cadastrado: "Esse SKU não está cadastrado no WMS.",
    informe_autorizacao: "Informe como o cliente autorizou.",
    ocorrencia_remover_item: "Tirar o item inteiro ainda não está ligado neste ambiente. Por enquanto, deixe pelo menos 1 unidade.",
    unico_item: "Esse é o único item do pedido: nesse caso, cancele o pedido.",
    sem_endereco_para_corrigir: "Não dá para corrigir o estoque: o reporte não registrou o endereço. Desmarque a correção ou ajuste pelo inventário.",
    quantidade_invalida: "Quantidade inválida: tem que ser menor que a do pedido (0 tira o item inteiro).",
    item_invalido: "Escolha o item.",
    login_invalido: "Esse login não está ativo.",
    pedido_encerrado: "Esse pedido já foi cancelado ou expedido.",
    pedido_indisponivel: "Esse pedido não está disponível (mudou de etapa ou tem problema em aberto)."
  };
  for (var k in mapa) if (m.indexOf(k) >= 0) return mapa[k];
  return m;
}
function minDesde(iso) { return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); }
function tempoOc(iso) {
  var m = minDesde(iso);
  if (m < 60) return m + " min";
  var h = Math.floor(m / 60);
  return h < 24 ? h + " h " + (m % 60) + " min" : Math.floor(h / 24) + " d " + (h % 24) + " h";
}

// ================= OPERADOR: reportar =================
var ocCtx = null;
function abrirReporte(pedido, etapa, item, aoTerminar) {
  ocCtx = { pedido: pedido, etapa: etapa, item: item || null, cb: aoTerminar, motivo: null };
  document.getElementById("ocTitulo").textContent = "Problema no pedido " + pedido.id_externo;
  document.getElementById("ocSub").textContent = ETAPA_NOME[etapa] + (item ? " · " + (item.produtos ? item.produtos.nome + " (" + item.produtos.sku + ")" : "") : " · pedido inteiro");
  var box = document.getElementById("ocMotivos");
  box.innerHTML = OC_MOTIVOS[etapa].map(function (m) {
    return '<button type="button" class="oc-motivo" role="radio" aria-checked="false" data-m="' + m[0] + '">' + escapeHtml(m[1]) + '</button>';
  }).join("");
  box.querySelectorAll(".oc-motivo").forEach(function (b) {
    b.addEventListener("click", function () {
      ocCtx.motivo = b.dataset.m;
      document.getElementById("ocErr").textContent = "";
      box.querySelectorAll(".oc-motivo").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
      var outro = ocCtx.motivo === "outro";
      document.getElementById("ocDetalheRot").textContent = outro ? "O que aconteceu? (obrigatório)" : "Observação (opcional)";
    });
  });
  document.getElementById("ocQtdWrap").style.display = item ? "" : "none";
  document.getElementById("ocQtd").value = "";
  document.getElementById("ocDetalhe").value = "";
  document.getElementById("ocDetalheRot").textContent = "Observação (opcional)";
  document.getElementById("ocErr").textContent = "";
  document.getElementById("ocAviso").innerHTML = etapa === "expedicao"
    ? "O pacote sai da fila de expedição até um admin resolver. <b>Deixe o pacote separado</b> com o número do pedido."
    : "O pedido sai da fila até um admin resolver. <b>Deixe os itens já " + (etapa === "separacao" ? "separados" : "conferidos") + " na caixa de pendências</b> com o número do pedido.";
  document.getElementById("ocConfirmar").disabled = false;
  fecharCamera();
  document.getElementById("ocModal").classList.add("show");
}
function fecharReporte() { document.getElementById("ocModal").classList.remove("show"); ocCtx = null; }
document.getElementById("ocVoltar").addEventListener("click", fecharReporte);
document.getElementById("ocConfirmar").addEventListener("click", function () {
  if (!ocCtx) return;
  var err = document.getElementById("ocErr");
  var detalhe = document.getElementById("ocDetalhe").value.trim();
  if (!ocCtx.motivo) { err.textContent = "Escolha o que aconteceu."; return; }
  if (ocCtx.motivo === "outro" && detalhe.length < 3) { err.textContent = "Escreva o que aconteceu."; return; }
  var qtd = parseInt(document.getElementById("ocQtd").value, 10);
  var b = document.getElementById("ocConfirmar");
  b.disabled = true;
  var ctx = ocCtx;
  // endereço bipado na hora (só na separação): ajuda o admin a corrigir o estoque e entra no relatório
  var endId = (ctx.etapa === "separacao" && typeof sepEnderecoAtivo !== "undefined" && sepEnderecoAtivo) ? sepEnderecoAtivo.id : null;
  sb.rpc("abrir_ocorrencia2", { p_pedido_id: ctx.pedido.id, p_etapa: ctx.etapa, p_motivo: ctx.motivo, p_item_id: ctx.item ? ctx.item.id : null, p_detalhe: detalhe || null, p_qtd: qtd > 0 ? qtd : null, p_endereco_id: endId }).then(function (r) {
    b.disabled = false;
    if (r.error) { err.textContent = erroOc(r.error); return; }
    fecharReporte();
    toastScan("Pedido " + ctx.pedido.id_externo + " saiu da fila: aguardando admin", "ok");
    if (ctx.cb) ctx.cb();
    carregarContadores();
  });
});

// ================= ADMIN: lista de problemas =================
var probTimer = null, probPerfis = null, probCache = {};
function carregarPerfisAtivos() {
  if (probPerfis) return Promise.resolve(probPerfis);
  return sb.from("perfis").select("id,nome,papel,ativo").eq("ativo", true).order("nome").then(function (r) {
    probPerfis = (r.data || []).filter(function (p) { return p.papel !== "laboratorio"; });
    return probPerfis;
  });
}
function nomePerfil(id) {
  var p = (probPerfis || []).find(function (x) { return x.id === id; });
  return p ? p.nome : "—";
}
function carregarProblemas() {
  if (!meu || meu.papel !== "admin") return;
  var bt = document.getElementById("probAtualizar");
  if (bt && !bt.dataset.wired) { bt.dataset.wired = "1"; bt.addEventListener("click", carregarProblemas); }
  var desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  carregarPerfisAtivos().then(function () {
    return sb.from("ocorrencias")
      .select("id,pedido_id,item_id,endereco_id,enderecos(codigo),etapa,motivo,detalhe,qtd_afetada,progresso,status,aberta_por,aberta_em,solucao,solucao_detalhe,solucao_dados,resolvida_por,resolvida_em,devolvida_para,pedidos(id,id_externo,canal,status,itens_pedido(id,qtd,qtd_separada,qtd_embalada,produtos(sku,nome))),itens_pedido(produtos(sku,nome))")
      .or("status.neq.resolvida,resolvida_em.gte." + desde)
      .order("aberta_em", { ascending: true }).limit(200);
  }).then(function (r) {
    if (r.error) { document.getElementById("probAbertas").innerHTML = '<div class="empty">Erro: ' + escapeHtml(r.error.message) + '</div>'; return; }
    var lista = r.data || [];
    probCache = {};
    lista.forEach(function (o) { probCache[o.id] = o; });
    var ab = lista.filter(function (o) { return o.status === "aberta"; });
    var ag = lista.filter(function (o) { return o.status === "aguardando"; });
    var rs = lista.filter(function (o) { return o.status === "resolvida"; }).reverse().slice(0, 30);
    document.getElementById("probAbertasQtd").textContent = ab.length || "";
    document.getElementById("probAguardQtd").textContent = ag.length || "";
    preencherProb("probAbertas", ab, "Nenhum problema em aberto.");
    preencherProb("probAguard", ag, "Nada aguardando reposição.");
    document.getElementById("probResolvidas").innerHTML = rs.length ? rs.map(cartaoResolvida).join("") : '<div class="empty">Nada nos últimos 7 dias.</div>';
  });
  clearInterval(probTimer);
  probTimer = setInterval(function () {
    var v = document.getElementById("view-problemas");
    if (!v || !v.classList.contains("active")) { clearInterval(probTimer); return; }
    carregarProblemas();
  }, 30000);
}
function progressoTxt(p) {
  var itens = (p && p.itens_pedido) || [];
  var tot = 0, sep = 0, emb = 0;
  itens.forEach(function (i) { tot += i.qtd; sep += Math.min(i.qtd_separada, i.qtd); emb += Math.min(i.qtd_embalada, i.qtd); });
  return "separado " + sep + " de " + tot + (emb ? " · conferido " + emb : "");
}
function preencherProb(elId, lista, vazio) {
  var el = document.getElementById(elId);
  el.innerHTML = lista.length ? "" : '<div class="empty">' + vazio + '</div>';
  lista.forEach(function (o) {
    var p = o.pedidos || {};
    var item = o.itens_pedido && o.itens_pedido.produtos ? o.itens_pedido.produtos : null;
    var min = minDesde(o.aberta_em);
    var div = document.createElement("div");
    div.className = "prob-card" + (o.status === "aberta" ? (min >= 240 ? " p-vermelho" : (min >= 60 ? " p-amarelo" : "")) : " p-aguard");
    div.innerHTML =
      '<div class="prob-cab"><div><div class="oid">' + escapeHtml(p.id_externo || "?") + ' <span class="badge ' + (o.etapa === "separacao" ? "wait" : (o.etapa === "embalagem" ? "sep" : "emb")) + '">' + ETAPA_NOME[o.etapa] + '</span></div>' +
      '<div class="meta">' + canalLabel(p.canal) + ' · ' + progressoTxt(p) + '</div></div>' +
      '<span class="prob-tempo">' + tempoOc(o.aberta_em) + '</span></div>' +
      '<div class="prob-motivo">' + escapeHtml(rotuloOc(o.motivo)) + (o.qtd_afetada ? ' · ' + o.qtd_afetada + ' un.' : '') + '</div>' +
      (item ? '<div class="prob-item mono">' + skuTxt(item.sku) + ' — ' + escapeHtml(item.nome) + '</div>' : '') +
      (o.enderecos ? '<div class="prob-end">📍 ' + escapeHtml(o.enderecos.codigo) + '</div>' : '') +
      (o.detalhe ? '<div class="prob-det">“' + escapeHtml(o.detalhe) + '”</div>' : '') +
      '<div class="prob-quem">Reportado por ' + escapeHtml(nomePerfil(o.aberta_por)) + ' · ' + new Date(o.aberta_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + '</div>' +
      (o.status === "aguardando" ? '<div class="prob-det">Aguardando reposição' + (o.solucao_dados && o.solucao_dados.previsao ? ' · previsão ' + new Date(o.solucao_dados.previsao + "T12:00").toLocaleDateString("pt-BR") : '') + (o.solucao_detalhe ? ' · ' + escapeHtml(o.solucao_detalhe) : '') + '</div>' : '') +
      '<div class="prob-acoes"><button class="btn primary small" data-a="resolver">Resolver</button><button class="btn danger small" data-a="cancelar">Cancelar pedido</button></div>';
    div.querySelector('[data-a="resolver"]').addEventListener("click", function () { abrirResolver(o.id); });
    div.querySelector('[data-a="cancelar"]').addEventListener("click", function () { abrirCancelamento(o.pedido_id); });
    el.appendChild(div);
  });
}
function cartaoResolvida(o) {
  var p = o.pedidos || {};
  return '<div class="prob-res"><b>' + escapeHtml(p.id_externo || "?") + '</b> · ' + escapeHtml(rotuloOc(o.motivo)) +
    '<br><span class="pn-obs">→ ' + escapeHtml(rotuloOc(o.solucao)) + (o.solucao_detalhe ? ': ' + escapeHtml(o.solucao_detalhe) : '') +
    (o.resolvida_em ? ' · ' + new Date(o.resolvida_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : '') +
    (o.resolvida_por ? ' · ' + escapeHtml(nomePerfil(o.resolvida_por)) : '') +
    (o.solucao_dados && o.solucao_dados.estoque_antes !== undefined ? '<br>Estoque de ' + escapeHtml(o.solucao_dados.endereco_corrigido || "") + ' corrigido: ' + o.solucao_dados.estoque_antes + ' → ' + o.solucao_dados.estoque_depois : '') +
    (o.solucao_dados && o.solucao_dados.sku_removido ? '<br>SKU ' + escapeHtml(o.solucao_dados.sku_removido) + ' saiu do pedido' : '') + '</span></div>';
}

// ---------- resolver ----------
var resAtual = null;
function abrirResolver(id) {
  var o = probCache[id];
  if (!o) return;
  resAtual = o;
  var p = o.pedidos || {};
  document.getElementById("resTitulo").textContent = "Resolver: pedido " + (p.id_externo || "");
  document.getElementById("resSub").textContent = ETAPA_NOME[o.etapa] + " · " + rotuloOc(o.motivo) + (o.detalhe ? " — " + o.detalhe : "");
  var sel = document.getElementById("resSolucao");
  sel.innerHTML = '<option value="">Escolha…</option>' + OC_SOLUCOES.filter(function (s) { return !(s[0] === "aguardar_reposicao" && o.status === "aguardando"); }).map(function (s) { return '<option value="' + s[0] + '">' + escapeHtml(s[1]) + '</option>'; }).join("");
  var dev = document.getElementById("resDevolver");
  dev.innerHTML = '<option value="">Qualquer pessoa (livre)</option>' + (probPerfis || []).map(function (u) {
    return '<option value="' + u.id + '"' + (u.id === o.aberta_por ? " selected" : "") + '>' + escapeHtml(u.nome) + (u.id === o.aberta_por ? " (quem reportou)" : "") + '</option>';
  }).join("");
  document.getElementById("resDetalhe").value = "";
  document.getElementById("resErr").textContent = "";
  document.getElementById("resCampos").innerHTML = "";
  document.getElementById("resConfirmar").disabled = false;
  atualizarCamposResolver();
  document.getElementById("resModal").classList.add("show");
}
function opcoesItens(o) {
  var itens = (o.pedidos && o.pedidos.itens_pedido) || [];
  return itens.map(function (i) {
    return '<option value="' + i.id + '" data-qtd="' + i.qtd + '"' + (i.id === o.item_id ? " selected" : "") + '>' + escapeHtml((i.produtos ? i.produtos.nome : "?") + " · " + i.qtd + " un.") + '</option>';
  }).join("");
}
function campoVia() {
  return '<label for="resVia">Como o cliente autorizou?</label><select id="resVia" class="usr-select"><option value="">Escolha…</option>' +
    OC_VIAS.map(function (v) { return '<option>' + v + '</option>'; }).join("") + '</select>' +
    '<label for="resContato">Quem falou com o cliente?</label><input type="text" id="resContato" maxlength="80" autocomplete="off">';
}
function atualizarCamposResolver() {
  var s = document.getElementById("resSolucao").value;
  var o = resAtual;
  var c = document.getElementById("resCampos");
  var html = "";
  if (s === "encontrado_outro_endereco") {
    html = '<label for="resEndereco">Em qual endereço?</label><input type="text" id="resEndereco" maxlength="60" autocomplete="off" placeholder="Ex.: Rua 02 - PP1 - B3">';
    if (o && o.endereco_id && o.item_id && o.enderecos) {
      html += '<label class="res-corrigir"><input type="checkbox" id="resCorrigir"' + (o.motivo === "nao_encontrado" ? " checked" : "") + '><span>Corrigir o estoque de <b>' + escapeHtml(o.enderecos.codigo) + '</b> (onde não estava)</span></label>' +
        '<div id="resRealWrap"><label for="resReal">Quantas unidades tem de verdade lá?</label><input type="number" id="resReal" min="0" step="1" value="0"></div>' +
        '<div class="sub">Fica registrado no histórico de contagens, como uma contagem de inventário.</div>';
    }
  }
  else if (s === "sku_substituto") html = '<label for="resItem">Qual item será trocado?</label><select id="resItem" class="usr-select">' + opcoesItens(o) + '</select>' +
    '<label for="resSku">SKU que vai no lugar</label><input type="text" id="resSku" class="mono" maxlength="40" autocomplete="off" placeholder="bipe ou digite">' + campoVia() +
    '<div class="sub">O pedido volta para a <b>separação</b> para pegar o produto novo.</div>';
  else if (s === "envio_parcial") html = '<label for="resItem">Qual item vai a menos?</label><select id="resItem" class="usr-select">' + opcoesItens(o) + '</select>' +
    '<label for="resQtdEnviar">Quantas unidades vão (0 = tirar o item do pedido)</label><input type="number" id="resQtdEnviar" min="0" step="1">' + campoVia() +
    '<div class="sub">Se já foi separado mais do que vai, o aviso pede para devolver a sobra ao endereço.</div>';
  else if (s === "trocar_unidade") html = '<label for="resOnde">Onde está a unidade boa?</label><input type="text" id="resOnde" maxlength="80" autocomplete="off">';
  else if (s === "aguardar_reposicao") html = '<label for="resPrev">Previsão de chegada</label><input type="date" id="resPrev" class="usr-select">' +
    '<div class="sub">O pedido continua fora da fila. Quando o produto chegar, abra de novo e escolha a solução.</div>';
  else if (s === "refazer_embalagem" && o && o.pedidos && o.pedidos.status === "embalado") html = '<div class="sub">O pedido volta para a <b>embalagem</b> para conferir de novo.</div>';
  else if (s === "cancelar_pedido") html = '<div class="sub">Abre o cancelamento (com motivo e sua senha). Ao cancelar, o problema é encerrado sozinho.</div>';
  c.innerHTML = html;
  var cb = document.getElementById("resCorrigir");
  if (cb) {
    var ajusta = function () { document.getElementById("resRealWrap").style.display = cb.checked ? "" : "none"; };
    cb.addEventListener("change", ajusta); ajusta();
  }
  document.getElementById("resDetalheRot").textContent = s === "outro" ? "O que foi feito? (obrigatório)" : "Observação (opcional)";
  document.getElementById("resDevolverWrap").style.display = (s === "aguardar_reposicao" || s === "cancelar_pedido") ? "none" : "";
  document.getElementById("resConfirmar").textContent = s === "cancelar_pedido" ? "Abrir cancelamento" : (s === "aguardar_reposicao" ? "Deixar aguardando" : "Resolver e devolver à fila");
}
document.getElementById("resSolucao").addEventListener("change", function () { document.getElementById("resErr").textContent = ""; atualizarCamposResolver(); });
document.getElementById("ocDetalhe").addEventListener("input", function () { document.getElementById("ocErr").textContent = ""; });
document.getElementById("resModal").addEventListener("input", function () { document.getElementById("resErr").textContent = ""; });
document.getElementById("resVoltar").addEventListener("click", function () { document.getElementById("resModal").classList.remove("show"); resAtual = null; });
document.getElementById("resConfirmar").addEventListener("click", function () {
  var o = resAtual; if (!o) return;
  var err = document.getElementById("resErr");
  var s = document.getElementById("resSolucao").value;
  if (!s) { err.textContent = "Escolha a solução."; return; }
  if (s === "cancelar_pedido") { document.getElementById("resModal").classList.remove("show"); abrirCancelamento(o.pedido_id); return; }
  var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
  var detalhe = val("resDetalhe");
  if (s === "outro" && detalhe.length < 3) { err.textContent = "Escreva o que foi feito."; return; }
  var dados = {};
  if (s === "encontrado_outro_endereco") {
    dados = { endereco: val("resEndereco") };
    var cbx = document.getElementById("resCorrigir");
    if (cbx && cbx.checked) {
      var real = parseInt(val("resReal") || "0", 10);
      if (!(real >= 0)) { err.textContent = "Informe quantas unidades tem no endereço (0 se não tem nenhuma)."; return; }
      dados.corrigir_estoque = true; dados.qtd_real = real;
    }
  }
  if (s === "sku_substituto") {
    dados = { item_id: val("resItem"), sku_novo: val("resSku"), autorizado_via: val("resVia"), contato_por: val("resContato") };
    if (!dados.sku_novo) { err.textContent = "Informe o SKU que vai no lugar."; return; }
    if (!dados.autorizado_via) { err.textContent = "Informe como o cliente autorizou."; return; }
  }
  if (s === "envio_parcial") {
    dados = { item_id: val("resItem"), qtd_enviar: parseInt(val("resQtdEnviar"), 10), autorizado_via: val("resVia"), contato_por: val("resContato") };
    if (!(dados.qtd_enviar >= 0)) { err.textContent = "Informe quantas unidades vão (0 tira o item)."; return; }
    if (!dados.autorizado_via) { err.textContent = "Informe como o cliente autorizou."; return; }
  }
  if (s === "trocar_unidade") dados = { onde: val("resOnde") };
  if (s === "aguardar_reposicao") dados = { previsao: val("resPrev") || null };
  var b = document.getElementById("resConfirmar");
  b.disabled = true;
  sb.rpc("resolver_ocorrencia", { p_id: o.id, p_solucao: s, p_detalhe: detalhe || null, p_dados: dados, p_devolver_para: val("resDevolver") || null }).then(function (r) {
    b.disabled = false;
    if (r.error) { err.textContent = erroOc(r.error); return; }
    document.getElementById("resModal").classList.remove("show");
    resAtual = null;
    toast(r.data === "aguardando" ? "Pedido " + o.pedidos.id_externo + " aguardando reposição." : "Pedido " + o.pedidos.id_externo + " voltou para a fila ✓", "ok");
    carregarProblemas();
    carregarContadores();
  });
});

// ---------- painel: resumo ----------
function resumoProblemasPainel() {
  var card = document.getElementById("alertasCard");
  if (!meu || meu.papel !== "admin") { card.style.display = "none"; return; }
  card.style.display = "";
  sb.from("ocorrencias").select("id,etapa,motivo,status,aberta_em,pedidos(id_externo)").neq("status", "resolvida").order("aberta_em").limit(5).then(function (r) {
    var el = document.getElementById("listaAlertas");
    var l = r.data || [];
    if (!l.length) { el.innerHTML = '<div class="empty">Nenhum problema em aberto.</div>'; return; }
    el.innerHTML = l.map(function (o) {
      return '<div class="order-row" style="cursor:default"><div><div class="oid">' + escapeHtml(o.pedidos ? o.pedidos.id_externo : "?") + '</div><div class="meta">' + ETAPA_NOME[o.etapa] + ' · ' + escapeHtml(rotuloOc(o.motivo)) + (o.status === "aguardando" ? ' · aguardando reposição' : '') + '</div></div><span class="badge ' + (minDesde(o.aberta_em) >= 60 ? "cancel" : "wait") + '">' + tempoOc(o.aberta_em) + '</span></div>';
    }).join("");
  });
}

// ================= ADMIN: passar a reserva =================
var trPedido = null;
function abrirTransferencia(pedido) {
  if (!meu || meu.papel !== "admin") return;
  trPedido = pedido;
  carregarPerfisAtivos().then(function (lista) {
    document.getElementById("trTitulo").textContent = "Passar o pedido " + pedido.id_externo;
    document.getElementById("trSub").textContent = "Quem receber vê o pedido reservado por 15 min, com o aviso de onde parou.";
    document.getElementById("trPara").innerHTML = '<option value="">Ninguém: liberar para todos</option>' + lista.filter(function (u) { return u.id !== pedido.reservado_por; }).map(function (u) {
      return '<option value="' + u.id + '">' + escapeHtml(u.nome) + '</option>';
    }).join("");
    document.getElementById("trErr").textContent = "";
    document.getElementById("trModal").classList.add("show");
  });
}
document.getElementById("trVoltar").addEventListener("click", function () { document.getElementById("trModal").classList.remove("show"); trPedido = null; });
document.getElementById("trConfirmar").addEventListener("click", function () {
  if (!trPedido) return;
  var para = document.getElementById("trPara").value || null;
  var b = document.getElementById("trConfirmar"); b.disabled = true;
  sb.rpc("transferir_reserva", { p_pedido_id: trPedido.id, p_usuario: para }).then(function (r) {
    b.disabled = false;
    if (r.error) { document.getElementById("trErr").textContent = erroOc(r.error); return; }
    document.getElementById("trModal").classList.remove("show");
    toast(para ? "Pedido " + trPedido.id_externo + " passado para " + nomePerfil(para) : "Pedido " + trPedido.id_externo + " liberado para todos", "ok");
    trPedido = null;
    if (typeof atualizarTelaAtual === "function") atualizarTelaAtual();
  });
});

// nome de quem está com a reserva (admin vê o nome; operador vê "outra pessoa")
function textoReserva(o) {
  if (!o.reservado_por) return "";
  if (meu && o.reservado_por === meu.id) return "reservado para você";
  if (meu && meu.papel === "admin" && probPerfis) return "com " + nomePerfil(o.reservado_por);
  return "com outra pessoa";
}
