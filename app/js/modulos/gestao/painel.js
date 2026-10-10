"use strict";
// WMS Pilchs — js/modulos/gestao/painel.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- PAINEL ----------------
// ---------- PAINEL NOVO: dados extras (só leitura) ----------
var pnWired = false;
function painelExtras() {
  if (!pnWired) {
    pnWired = true;
    document.getElementById("pnAtualizar").addEventListener("click", carregarPainel);
  }
  var agora = new Date();
  document.getElementById("pnData").textContent = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) + " · atualizado às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  var inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString();
  // expedidos hoje + gráfico por hora
  sb.from("pedidos").select("expedido_em").eq("status", "expedido").gte("expedido_em", inicioDia).then(function (res) {
    var lista = res.data || [];
    document.getElementById("pnExpHoje").textContent = lista.length;
    document.getElementById("pnExpHoje2").textContent = lista.length;
    var horas = [];
    for (var h = 6; h <= 23; h++) horas.push(0);
    lista.forEach(function (p) { var hh = new Date(p.expedido_em).getHours(); if (hh >= 6) horas[hh - 6]++; });
    var max = Math.max.apply(null, horas.concat([1]));
    document.getElementById("pnHoras").innerHTML = horas.map(function (q, i) {
      var cls = (i + 6) === agora.getHours() ? 'agora' : (q ? '' : 'zero');
      return '<div class="' + cls + '" style="height:' + Math.max(5, Math.round(q / max * 100)) + '%" title="' + (i + 6) + 'h: ' + q + '"></div>';
    }).join("");
  });
  // fluxo e resumo a partir da contagem por situação
  sb.rpc("contagem_pedidos").then(function (res) {
    var kv = { a_separar: 0, separado: 0, embalado: 0, expedido: 0, cancelado: 0 };
    (res.data || []).forEach(function (r) { kv[r.status] = Number(r.total) || 0; });
    var ativos = kv.a_separar + kv.separado + kv.embalado;
    document.getElementById("pnExpTotal").textContent = kv.expedido + " no total";
    var partes = [["b1", kv.a_separar, "Esperando separar", "var(--accent)"], ["b2", kv.separado, "Esperando embalar", "var(--ink)"], ["b3", kv.embalado, "Esperando envio", "#8E8E89"]];
    var barra = ativos === 0 ? '<div class="pn-barra"></div>' : '<div class="pn-barra">' + partes.filter(function (p) { return p[1] > 0; }).map(function (p) {
      return '<div class="' + p[0] + '" style="flex:' + p[1] + ' 1 0">' + p[1] + '</div>';
    }).join("") + '</div>';
    document.getElementById("pnFluxo").innerHTML = barra + '<div class="pn-leg">' + partes.map(function (p) {
      return '<div style="border-top-color:' + p[3] + '"><b>' + p[2] + '</b><span class="pn-obs">' + p[1] + ' pedido' + (p[1] === 1 ? '' : 's') + '</span></div>';
    }).join("") + '</div>' + (ativos === 0 ? '<div class="pn-obs" style="margin-top:10px">Nenhum pedido em andamento agora.</div>' : '');
    var linhas = [["Pedidos em andamento", ativos], ["Expedidos no total", kv.expedido], ["Cancelados", kv.cancelado]];
    var el = document.getElementById("pnResumo");
    function desenhar() {
      el.innerHTML = linhas.map(function (l) { return '<div class="pn-lin"><span>' + l[0] + '</span><b>' + l[1] + '</b></div>'; }).join("");
    }
    desenhar();
    sb.from("retiradas_loja").select("id", { count: "exact", head: true }).eq("status", "aberta").then(function (r) {
      if (!r.error) { linhas.push(["Retiradas da loja abertas", r.count || 0]); desenhar(); }
    });
    if (meu.papel === "admin") {
      sb.from("devolucoes").select("id", { count: "exact", head: true }).is("decidido_em", null).then(function (r) {
        if (!r.error) { linhas.push(["Devoluções aguardando decisão", r.count || 0]); desenhar(); }
      });
    }
  });
  // mapa de endereços (só faz sentido com o endereçamento ligado)
  var mapa = document.getElementById("pnMapaWrap");
  if (!ENDERECAMENTO) {
    mapa.innerHTML = '<div class="empty">O endereçamento está desligado. Quando for ligado, este mapa mostra quais endereços têm produto e quais estão vazios.</div>';
  } else {
    sb.from("enderecos").select("id,codigo,estoque_enderecos(quantidade)").eq("ativo", true).order("codigo").then(function (r) {
      var ends = r.data || [];
      if (!ends.length) { mapa.innerHTML = '<div class="empty">Nenhum endereço cadastrado.</div>'; return; }
      mapa.innerHTML = '<div class="pn-legenda"><span><i style="background:var(--accent)"></i>Com produto</span><span><i style="background:var(--surface-2);border:1px solid var(--line)"></i>Vazio</span></div><div class="pn-mapa">' +
        ends.map(function (e) {
          var q = (e.estoque_enderecos || []).reduce(function (s, x) { return s + (x.quantidade || 0); }, 0);
          return '<div class="' + (q > 0 ? 'ocupado' : '') + '" title="' + escapeHtml(e.codigo) + ': ' + q + ' un.">' + escapeHtml(e.codigo) + '</div>';
        }).join("") + '</div>';
    });
  }
}

function carregarPainel() {
  carregarContadores();
  painelExtras();
  if (meu.papel === "admin") {
    document.getElementById("alertasCard").style.display = "";
    sb.from("alertas_estoque").select("id,resolvido,criado_em,item_id,origem,itens_pedido(produtos(sku,nome),pedido_id,pedidos(id_externo))").eq("resolvido", false).then(function (res) {
      var el = document.getElementById("listaAlertas");
      el.innerHTML = "";
      var lista = res.data || [];
      if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhuma pendência em aberto.</div>'; return; }
      lista.forEach(function (a) {
        var prod = a.itens_pedido && a.itens_pedido.produtos ? a.itens_pedido.produtos : { sku: "?", nome: "?" };
        var ped = a.itens_pedido && a.itens_pedido.pedidos ? a.itens_pedido.pedidos.id_externo : "?";
        var origemLabel = a.origem === "embalagem" ? "embalagem" : "separação";
        var row = document.createElement("div");
        row.className = "order-row";
        row.style.cursor = "default";
        row.innerHTML = '<div><div class="oid">' + escapeHtml(prod.nome) + ' <span class="badge wait" style="margin-left:6px">' + origemLabel + '</span></div><div class="meta mono">' + skuTxt(prod.sku) + ' · pedido ' + escapeHtml(ped) + '</div></div><button class="btn small" data-res="' + a.id + '">resolver</button>';
        el.appendChild(row);
      });
      el.querySelectorAll("[data-res]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          sb.from("alertas_estoque").update({ resolvido: true }).eq("id", btn.dataset.res).then(function () { carregarPainel(); });
        });
      });
    });
  } else {
    document.getElementById("alertasCard").style.display = "none";
  }

  if (meu.papel === "admin") {
    sb.from("pedidos").select("id,id_externo,canal,status,criado_em,motivo_cancelamento,cancelado_em,itens_pedido(qtd)").order("criado_em", { ascending: false }).limit(50).then(function (res) {
      var el = document.getElementById("painelLista");
      el.innerHTML = "";
      var lista = res.data || [];
      if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhum pedido cadastrado ainda.</div>'; return; }
      lista.forEach(function (o) {
        var qtdTotal = (o.itens_pedido || []).reduce(function (s, i) { return s + i.qtd; }, 0);
        var row = document.createElement("div");
        row.className = "order-row";
        row.style.cursor = "default";
        var meta = canalLabel(o.canal) + ' · ' + qtdTotal + ' un.';
        if (o.status === "cancelado") {
          meta += ' · ' + escapeHtml(o.motivo_cancelamento || "") + (o.cancelado_em ? ' (' + new Date(o.cancelado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + ')' : '');
        }
        var podeCancelar = o.status !== "cancelado" && o.status !== "expedido";
        row.innerHTML = '<div><div class="oid">' + escapeHtml(o.id_externo) + '</div><div class="meta">' + meta + '</div></div>' +
          '<div class="acoes">' + (podeCancelar ? '<button class="btn danger small" data-cancelar="' + o.id + '">Cancelar</button>' : '') +
          '<span class="badge ' + statusBadge(o.status) + '">' + statusLabel(o.status) + '</span></div>';
        el.appendChild(row);
      });
      el.querySelectorAll("[data-cancelar]").forEach(function (btn) {
        btn.addEventListener("click", function () { abrirCancelamento(btn.dataset.cancelar); });
      });
    });
  } else {
    document.getElementById("painelLista").innerHTML = '<div class="empty">Detalhes de todos os pedidos são visíveis só pro admin.</div>';
  }
}
