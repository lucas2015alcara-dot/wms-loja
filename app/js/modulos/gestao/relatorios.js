"use strict";
// WMS Pilchs — js/modulos/gestao/relatorios.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- RELATÓRIOS ----------------
var repWired = false;
var repDataPedidos = null, repDataProdutividade = null, repDataEstoque = null, repDataContagens = null, repDataProblemas = null;

function carregarRelatorios() {
  if (!repWired) {
    repWired = true;
    var hoje = new Date();
    var trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById("repDe").value = trintaDiasAtras.toISOString().slice(0, 10);
    document.getElementById("repAte").value = hoje.toISOString().slice(0, 10);
    document.getElementById("repAplicar").addEventListener("click", rodarRelatorios);
    document.getElementById("repExpPedidos").addEventListener("click", function () { exportarCSV("pedidos_por_status.csv", repDataPedidos); });
    document.getElementById("repExpProdutividade").addEventListener("click", function () { exportarCSV("produtividade_equipe.csv", repDataProdutividade); });
    document.getElementById("repExpEstoque").addEventListener("click", function () { exportarCSV("estoque_por_endereco.csv", repDataEstoque); });
    document.getElementById("repExpContagens").addEventListener("click", function () { exportarCSV("historico_contagens.csv", repDataContagens); });
    document.getElementById("repExpProblemas").addEventListener("click", function () { exportarCSV("problemas_no_periodo.csv", repDataProblemas); });
  }
  rodarRelatorios();
}

function periodoISO() {
  var de = document.getElementById("repDe").value;
  var ate = document.getElementById("repAte").value;
  return {
    de: de ? de + "T00:00:00" : "1970-01-01T00:00:00",
    ate: ate ? ate + "T23:59:59" : "2999-12-31T23:59:59"
  };
}

function rodarRelatorios() {
  relatorioProblemas();
  relatorioPedidos();
  relatorioProdutividade();
  relatorioEstoque();
  relatorioContagens();
}

function relatorioPedidos() {
  var p = periodoISO();
  var el = document.getElementById("repPedidos");
  el.innerHTML = '<div class="empty">Carregando...</div>';
  sb.from("pedidos").select("status").gte("criado_em", p.de).lte("criado_em", p.ate).then(function (res) {
    var lista = res.data || [];
    var kv = { a_separar: 0, separado: 0, embalado: 0, expedido: 0 };
    lista.forEach(function (o) { kv[o.status] = (kv[o.status] || 0) + 1; });
    repDataPedidos = { headers: ["status", "quantidade"], rows: Object.keys(kv).map(function (k) { return [statusLabel(k), kv[k]]; }) };
    if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhum pedido nesse período.</div>'; return; }
    el.innerHTML =
      '<div class="row" style="flex-wrap:wrap; gap:6px">' +
      Object.keys(kv).map(function (k) { return '<div class="counter" style="min-width:90px"><div class="n mono">' + kv[k] + '</div><div class="l">' + statusLabel(k) + '</div></div>'; }).join("") +
      '</div><div class="scan-hint" style="margin-top:8px">Total no período: ' + lista.length + ' pedido(s)</div>';
  });
}

function relatorioProdutividade() {
  var p = periodoISO();
  var el = document.getElementById("repProdutividade");
  el.innerHTML = '<div class="empty">Carregando...</div>';
  sb.from("eventos_tarefa").select("tipo,iniciado_em,finalizado_em,perfis(nome)").not("finalizado_em", "is", null)
    .gte("finalizado_em", p.de).lte("finalizado_em", p.ate).then(function (res) {
      var lista = res.data || [];
      if (lista.length === 0) {
        repDataProdutividade = { headers: ["usuario", "tipo", "itens_concluidos", "tempo_medio_seg"], rows: [] };
        el.innerHTML = '<div class="empty">Nenhuma tarefa concluída nesse período.</div>';
        return;
      }
      var agrup = {}; // chave "nome|tipo" -> {count, somaSeg}
      lista.forEach(function (ev) {
        var nome = (ev.perfis && ev.perfis.nome) || "—";
        var chave = nome + "|" + ev.tipo;
        if (!agrup[chave]) agrup[chave] = { nome: nome, tipo: ev.tipo, count: 0, somaSeg: 0 };
        agrup[chave].count++;
        agrup[chave].somaSeg += (new Date(ev.finalizado_em) - new Date(ev.iniciado_em)) / 1000;
      });
      var linhas = Object.keys(agrup).map(function (k) { return agrup[k]; });
      linhas.sort(function (a, b) { return b.count - a.count; });
      repDataProdutividade = {
        headers: ["usuario", "tipo", "itens_concluidos", "tempo_medio_seg"],
        rows: linhas.map(function (l) { return [l.nome, l.tipo === "separacao" ? "Separação" : "Embalagem", l.count, Math.round(l.somaSeg / l.count)]; })
      };
      el.innerHTML = "";
      linhas.forEach(function (l) {
        var row = document.createElement("div");
        row.className = "order-row";
        row.style.cursor = "default";
        var tempoMedio = Math.round(l.somaSeg / l.count);
        row.innerHTML = '<div><div class="oid">' + escapeHtml(l.nome) + '</div><div class="meta">' + (l.tipo === "separacao" ? "Separação" : "Embalagem") + ' · tempo médio ' + tempoMedio + 's</div></div><span class="badge ' + (l.tipo === "separacao" ? "sep" : "emb") + '">' + l.count + ' item(ns)</span>';
        el.appendChild(row);
      });
    });
}

function relatorioEstoque() {
  var el = document.getElementById("repEstoque");
  el.innerHTML = '<div class="empty">Carregando...</div>';
  sb.from("estoque_enderecos").select("quantidade,produtos(sku,nome),enderecos(codigo)").gt("quantidade", 0).order("atualizado_em", { ascending: false }).then(function (res) {
    var lista = res.data || [];
    repDataEstoque = {
      headers: ["endereco", "sku", "produto", "quantidade"],
      rows: lista.map(function (r) { return [r.enderecos.codigo, r.produtos.sku, r.produtos.nome, r.quantidade]; })
    };
    if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhum estoque endereçado.</div>'; return; }
    el.innerHTML = "";
    lista.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "order-row";
      row.style.cursor = "default";
      row.innerHTML = '<div><div class="oid">' + escapeHtml(r.produtos.nome) + '</div><div class="meta mono">' + skuTxt(r.produtos.sku) + '</div><div class="meta" style="white-space:nowrap">📍 ' + escapeHtml(r.enderecos.codigo) + '</div></div><span class="badge sep">' + r.quantidade + ' un.</span>';
      el.appendChild(row);
    });
  });
}

function relatorioContagens() {
  var p = periodoISO();
  var el = document.getElementById("repContagens");
  el.innerHTML = '<div class="empty">Carregando...</div>';
  sb.from("inventario_contagens").select("qtd_sistema,qtd_contada,diferenca,criado_em,produtos(sku,nome),enderecos(codigo),perfis(nome)")
    .gte("criado_em", p.de).lte("criado_em", p.ate).order("criado_em", { ascending: false }).then(function (res) {
      var lista = res.data || [];
      repDataContagens = {
        headers: ["data", "endereco", "sku", "produto", "sistema", "contado", "diferenca", "usuario"],
        rows: lista.map(function (r) {
          return [new Date(r.criado_em).toLocaleString("pt-BR"), r.enderecos.codigo, r.produtos.sku, r.produtos.nome, r.qtd_sistema, r.qtd_contada, r.diferenca, (r.perfis && r.perfis.nome) || "—"];
        })
      };
      if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhuma contagem registrada nesse período.</div>'; return; }
      el.innerHTML = "";
      lista.forEach(function (r) {
        var row = document.createElement("div");
        row.className = "order-row";
        row.style.cursor = "default";
        var difTxt = r.diferenca === 0 ? "sem diferença" : (r.diferenca > 0 ? "+" + r.diferenca : r.diferenca);
        row.innerHTML = '<div><div class="oid">' + escapeHtml(r.produtos.nome) + '</div><div class="meta mono">' + skuTxt(r.produtos.sku) + ' · ' + escapeHtml(r.enderecos.codigo) + ' · ' + ((r.perfis && r.perfis.nome) || "—") + '</div></div><span class="badge ' + (r.diferenca === 0 ? "exp" : "wait") + '">' + difTxt + '</span>';
        el.appendChild(row);
      });
    });
}

// ---------- Problemas no período (ocorrências) ----------
function duracaoTxt(min) {
  if (min < 60) return Math.round(min) + " min";
  var h = Math.floor(min / 60);
  return h < 24 ? h + " h " + Math.round(min % 60) + " min" : Math.floor(h / 24) + " d " + (h % 24) + " h";
}
function repContar(lista, chaveFn) {
  var m = {};
  lista.forEach(function (o) { var k = chaveFn(o); if (k) m[k] = (m[k] || 0) + 1; });
  return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
}
function repBarras(titulo, pares, rotFn, max) {
  if (!pares.length) return "";
  var topo = pares[0][1] || 1;
  return '<div class="rp-bloco"><h3>' + titulo + '</h3>' + pares.slice(0, max || 8).map(function (p) {
    var rot = rotFn ? rotFn(p[0]) : p[0];
    return '<div class="rp-linha"><span class="rp-rot" title="' + escapeHtml(rot) + '">' + escapeHtml(rot) + '</span><span class="rp-n">' + p[1] + '</span>' +
      '<span class="rp-barra"><i style="width:' + Math.max(4, Math.round(p[1] / topo * 100)) + '%"></i></span></div>';
  }).join("") + '</div>';
}
function relatorioProblemas() {
  var card = document.getElementById("repProblemasCard");
  if (!meu || meu.papel !== "admin") { if (card) card.style.display = "none"; return; }
  card.style.display = "";
  var p = periodoISO();
  var el = document.getElementById("repProblemas");
  el.innerHTML = '<div class="empty">Carregando...</div>';
  var nomes = {};
  sb.from("perfis").select("id,nome").then(function (rp) {
    (rp.data || []).forEach(function (u) { nomes[u.id] = u.nome; });
    return sb.from("ocorrencias")
      .select("id,etapa,motivo,detalhe,qtd_afetada,status,aberta_por,aberta_em,solucao,solucao_detalhe,solucao_dados,resolvida_por,resolvida_em,item_id,pedidos(id_externo,canal),itens_pedido(produtos(sku,nome)),enderecos(codigo)")
      .gte("aberta_em", new Date(p.de).toISOString()).lte("aberta_em", new Date(p.ate).toISOString())
      .order("aberta_em", { ascending: false }).limit(2000);
  }).then(function (res) {
    if (res.error) { el.innerHTML = '<div class="empty">Erro: ' + escapeHtml(res.error.message) + '</div>'; return; }
    var lista = res.data || [];
    var skuDe = function (o) {
      if (o.itens_pedido && o.itens_pedido.produtos) return o.itens_pedido.produtos.sku;
      return (o.solucao_dados && o.solucao_dados.sku_removido) || "";
    };
    var nomeDe = function (id) { return nomes[id] || (id ? "—" : ""); };
    var fmt = function (iso) { return iso ? new Date(iso).toLocaleString("pt-BR") : ""; };
    repDataProblemas = {
      headers: ["aberta_em", "pedido", "canal", "etapa", "motivo", "sku", "endereco", "qtd", "detalhe", "reportado_por", "status", "solucao", "solucao_detalhe", "resolvida_em", "resolvida_por", "minutos_ate_resolver"],
      rows: lista.map(function (o) {
        var min = o.resolvida_em ? Math.round((new Date(o.resolvida_em) - new Date(o.aberta_em)) / 60000) : "";
        return [fmt(o.aberta_em), o.pedidos ? o.pedidos.id_externo : "", o.pedidos ? canalLabel(o.pedidos.canal) : "", ETAPA_NOME[o.etapa] || o.etapa,
          rotuloOc(o.motivo), skuDe(o), o.enderecos ? o.enderecos.codigo : "", o.qtd_afetada || "", o.detalhe || "", nomeDe(o.aberta_por),
          o.status === "resolvida" ? "Resolvido" : (o.status === "aguardando" ? "Aguardando reposição" : "Em aberto"),
          o.solucao ? rotuloOc(o.solucao) : "", o.solucao_detalhe || "", fmt(o.resolvida_em), nomeDe(o.resolvida_por), min];
      })
    };
    if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum problema reportado nesse período. 👏</div>'; return; }
    var resolvidas = lista.filter(function (o) { return o.status === "resolvida" && o.resolvida_em; });
    var abertas = lista.filter(function (o) { return o.status === "aberta"; }).length;
    var aguard = lista.filter(function (o) { return o.status === "aguardando"; }).length;
    var media = resolvidas.length ? resolvidas.reduce(function (s, o) { return s + (new Date(o.resolvida_em) - new Date(o.aberta_em)) / 60000; }, 0) / resolvidas.length : null;
    var estoqueCorrigido = lista.filter(function (o) { return o.solucao_dados && o.solucao_dados.estoque_antes !== undefined; }).length;
    var num = function (n, l) { return '<div class="counter"><div class="n mono">' + n + '</div><div class="l">' + l + '</div></div>'; };
    el.innerHTML =
      '<div class="rp-numeros">' + num(lista.length, "Reportados") + num(abertas, "Em aberto") + num(aguard, "Aguardando reposição") +
      num(resolvidas.length, "Resolvidos") + num(media === null ? "—" : duracaoTxt(media), "Tempo médio p/ resolver") + '</div>' +
      (estoqueCorrigido ? '<div class="scan-hint" style="margin-top:8px">' + estoqueCorrigido + ' correção(ões) de estoque feitas ao resolver (aparecem também no histórico de contagens).</div>' : '') +
      '<div class="rp-grade">' +
      repBarras("Por motivo", repContar(lista, function (o) { return o.motivo; }), rotuloOc) +
      repBarras("Por etapa", repContar(lista, function (o) { return o.etapa; }), function (k) { return ETAPA_NOME[k] || k; }) +
      repBarras("SKUs com mais problemas", repContar(lista, skuDe), function (k) { return "SKU " + k; }) +
      repBarras("Endereços com mais problemas", repContar(lista, function (o) { return o.enderecos ? o.enderecos.codigo : ""; })) +
      repBarras("Soluções usadas", repContar(resolvidas, function (o) { return o.solucao; }), rotuloOc) +
      repBarras("Quem reportou", repContar(lista, function (o) { return o.aberta_por; }), nomeDe) +
      repBarras("Por canal", repContar(lista, function (o) { return o.pedidos ? o.pedidos.canal : ""; }), canalLabel) +
      '</div>';
  });
}

function exportarCSV(nomeArquivo, dados) {
  if (!dados || dados.rows.length === 0) { toast("Nada pra exportar nesse período", "err"); return; }
  var linhas = [dados.headers.join(";")].concat(dados.rows.map(function (r) {
    return r.map(function (v) { return ('"' + String(v).replace(/"/g, '""') + '"'); }).join(";");
  }));
  var csv = "﻿" + linhas.join("\r\n");
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
