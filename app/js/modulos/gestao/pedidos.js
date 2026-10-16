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

// ---------------- SINCRONIZAÇÃO COM O OLIST ----------------
// Botão "Sincronizar agora" (admin) + sincronização automática a cada 5 min (agendamento no banco,
// liga/desliga em config_wms.sync_auto_olist). Cada rodada fica registrada em "sincronizacoes".
var SYNC_HORARIO = "a cada 5 min, de segunda a sábado, das 7h às 21h";
var syncAutoLigada = false;

function chamarSincronizacao() {
  return sb.functions.invoke("sincronizar-olist", { method: "POST" }).then(function (res) {
    if (!res.error) return res.data || {};
    var ctx = res.error.context;
    if (ctx && typeof ctx.json === "function") return ctx.json().then(function (j) { return j || { error: res.error.message }; }, function () { return { error: res.error.message }; });
    return { error: res.error.message || "Falha na comunicação." };
  }, function (e) { return { error: String(e) }; });
}

function horaSync(iso) {
  var d = new Date(iso), hoje = new Date();
  var h = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === hoje.toDateString() ? "hoje às " + h : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + h;
}

function carregarStatusSync() {
  var card = document.getElementById("cardSyncOlist");
  if (!card || card.style.display === "none") return;
  sb.from("config_wms").select("valor").eq("chave", "sync_auto_olist").maybeSingle().then(function (r) {
    syncAutoLigada = !!(r.data && r.data.valor === "ligada");
    var est = document.getElementById("syncAutoEstado"), sub = document.getElementById("syncAutoSub"), bt = document.getElementById("syncAutoBtn");
    document.getElementById("syncAuto").classList.toggle("ligada", syncAutoLigada);
    est.innerHTML = "<b>Sincronização automática: " + (syncAutoLigada ? "ligada" : "desligada") + "</b>";
    sub.textContent = syncAutoLigada ? SYNC_HORARIO + "." : "Os pedidos só entram quando alguém clica em Sincronizar agora.";
    bt.textContent = syncAutoLigada ? "Desligar" : "Ligar";
    bt.className = "btn small " + (syncAutoLigada ? "ghost" : "primary");
  });
  sb.from("sincronizacoes").select("origem,iniciado_em,terminado_em,importados,cancelados_no_wms,erros,erro,resumo").order("iniciado_em", { ascending: false }).limit(1).then(function (r) {
    var el = document.getElementById("syncUltima");
    var s = r.data && r.data[0];
    if (!s) { el.innerHTML = '<span class="pn-obs">Nenhuma sincronização registrada ainda.</span>'; el.className = "sync-ultima"; return; }
    var quem = s.origem === "auto" ? "automática" : "pelo botão";
    var txt;
    if (!s.terminado_em) txt = "Sincronizando agora (" + quem + ", começou " + horaSync(s.iniciado_em) + ")…";
    else if (s.erro) txt = "Última sincronização " + horaSync(s.iniciado_em) + " (" + quem + ") <b>falhou</b>: " + escapeHtml(s.erro);
    else {
      var partes = [(s.importados || 0) + " novo" + (s.importados === 1 ? "" : "s")];
      if (s.cancelados_no_wms) partes.push(s.cancelados_no_wms + " cancelado" + (s.cancelados_no_wms === 1 ? "" : "s"));
      if (s.erros) partes.push(s.erros + " com erro");
      var pend = s.resumo && s.resumo.pendentes;
      if (pend) partes.push(pend + " na próxima rodada");
      var rv = s.resumo && s.resumo.a_revisar_novos;
      if (rv) partes.push(rv + " a revisar");
      var fora = s.resumo ? (s.resumo.balcao || 0) + (s.resumo.ignorados_regra || 0) : 0;
      if (fora) partes.push(fora + " fora do e-commerce");
      txt = "Última sincronização " + horaSync(s.iniciado_em) + " (" + quem + "): " + partes.join(", ") + ".";
    }
    el.innerHTML = txt;
    el.className = "sync-ultima" + (s.erro ? " erro" : (!s.terminado_em ? " rodando" : ""));
  });
}

// ---------- filtro de canais: regras e lista "A revisar" ----------
var CANAIS_REVISAR = [["mercado_livre", "Mercado Livre"], ["shopee", "Shopee"], ["site_proprio", "Site próprio"], ["outro", "Outro"]];
function textoRegras(r) {
  var sit = (r.situacoes || []).join(", ");
  return "<b>Entram na fila:</b> pedidos de marketplace (com número de e-commerce e canal identificado) nas situações " + escapeHtml(sit) + ".<br>" +
    "<b>Ficam fora:</b> vendas de balcão (sem número de e-commerce), marcadores " + escapeHtml((r.excluir_marcadores || []).join(", ")) +
    ", clientes " + escapeHtml((r.excluir_clientes || []).join(", ")) + " e envio " + escapeHtml((r.excluir_envio || []).join(", ")) + ".<br>" +
    "<b>Na dúvida:</b> " + (r.sem_canal === "fila" ? "entram como canal \"Outro\"." : "vão para \"A revisar\".");
}
function carregarRevisar() {
  var card = document.getElementById("cardRevisar");
  if (!card) return;
  if (!meu || meu.papel !== "admin") { card.style.display = "none"; return; }
  sb.from("config_wms").select("valor").eq("chave", "sync_regras").maybeSingle().then(function (r) {
    var el = document.getElementById("syncRegrasTexto");
    try { el.innerHTML = textoRegras(JSON.parse((r.data && r.data.valor) || "{}")); } catch (e) { el.textContent = "Regras padrão."; }
  });
  sb.from("sync_triagem").select("olist_id,numero,numero_ecommerce,cliente,situacao,motivo,status,canal_sugerido,detectado_em")
    .in("status", ["revisar", "ignorado_regra"]).order("detectado_em", { ascending: false }).limit(100).then(function (r) {
      var lista = r.data || [];
      var rev = lista.filter(function (t) { return t.status === "revisar"; });
      var ign = lista.filter(function (t) { return t.status === "ignorado_regra"; });
      card.style.display = (rev.length || ign.length) ? "" : "none";
      document.getElementById("revisarQtd").textContent = rev.length || "";
      document.getElementById("ignoradosQtd").textContent = ign.length ? "(" + ign.length + ")" : "";
      document.getElementById("ignoradosBox").style.display = ign.length ? "" : "none";
      var el = document.getElementById("revisarLista");
      el.innerHTML = rev.length ? "" : '<div class="empty" style="padding:10px">Nada para revisar.</div>';
      rev.forEach(function (t) {
        var row = document.createElement("div");
        row.className = "rev-item";
        row.innerHTML = '<div class="rev-tx"><div class="oid">' + escapeHtml(t.numero_ecommerce || t.numero) + ' <span class="pn-obs">· Olist nº ' + escapeHtml(t.numero) + '</span></div>' +
          '<div class="meta">' + escapeHtml(t.cliente || "") + ' · ' + escapeHtml(t.situacao || "") + '</div>' +
          '<div class="rev-motivo">' + escapeHtml(t.motivo) + '</div></div>' +
          '<div class="rev-acoes"><select class="usr-select" aria-label="Canal">' + CANAIS_REVISAR.map(function (c) {
            return '<option value="' + c[0] + '"' + (t.canal_sugerido === c[0] ? " selected" : "") + '>' + c[1] + '</option>';
          }).join("") + '</select><button class="btn primary small" data-a="fila">Mandar para a fila</button><button class="btn ghost small" data-a="ignorar">Ignorar</button></div>';
        var sel = row.querySelector("select");
        row.querySelector('[data-a="fila"]').addEventListener("click", function (ev) {
          var b = ev.currentTarget; b.disabled = true; b.textContent = "Enviando…";
          sb.functions.invoke("sincronizar-olist", { method: "POST", body: { acao: "importar", olist_id: t.olist_id, canal: sel.value } }).then(function (res) {
            var falha = res.error ? (res.error.context && typeof res.error.context.json === "function" ? res.error.context.json() : Promise.resolve({ error: res.error.message })) : Promise.resolve(res.data || {});
            return falha;
          }).then(function (d) {
            if (!d || d.error) { b.disabled = false; b.textContent = "Mandar para a fila"; toast("Não foi possível: " + ((d && d.error) || "erro"), "err"); return; }
            toast("Pedido " + d.id_externo + (d.ja_existia ? " já estava no WMS" : " foi para a fila ✓"), "ok");
            carregarRevisar(); carregarFilaPedidos(); carregarContadores();
          });
        });
        row.querySelector('[data-a="ignorar"]').addEventListener("click", function (ev) {
          var b = ev.currentTarget;
          if (b.dataset.conf !== "1") { b.dataset.conf = "1"; b.textContent = "Confirmar ignorar"; return; }
          b.disabled = true;
          sb.from("sync_triagem").update({ status: "ignorado_admin", decidido_por: meu.id, decidido_em: new Date().toISOString() }).eq("olist_id", t.olist_id).then(function (res) {
            if (res.error) { b.disabled = false; toast("Não foi possível: " + res.error.message, "err"); return; }
            toast("Pedido ignorado: não entra no WMS.", "ok");
            carregarRevisar();
          });
        });
        el.appendChild(row);
      });
      document.getElementById("ignoradosLista").innerHTML = ign.map(function (t) {
        return '<div class="rev-ign"><b>' + escapeHtml(t.numero_ecommerce || t.numero) + '</b> · ' + escapeHtml(t.cliente || "") + '<br><span class="pn-obs">' + escapeHtml(t.motivo) + '</span></div>';
      }).join("");
    });
}

var syncAutoBtn = document.getElementById("syncAutoBtn");
if (syncAutoBtn) syncAutoBtn.addEventListener("click", function () {
  if (!meu || meu.papel !== "admin") return;
  var novo = !syncAutoLigada;
  syncAutoBtn.disabled = true;
  sb.from("config_wms").upsert({ chave: "sync_auto_olist", valor: novo ? "ligada" : "desligada", atualizado_em: new Date().toISOString(), atualizado_por: meu.id }).then(function (res) {
    syncAutoBtn.disabled = false;
    if (res.error) { toast("Não foi possível alterar: " + res.error.message, "err"); return; }
    toast(novo ? "Sincronização automática ligada." : "Sincronização automática desligada.", "ok");
    carregarStatusSync();
  });
});

var btnSyncOlist = document.getElementById("btnSyncOlist");
if (btnSyncOlist) {
  btnSyncOlist.addEventListener("click", function () {
    var out = document.getElementById("syncOlistResultado");
    btnSyncOlist.disabled = true;
    btnSyncOlist.textContent = "Sincronizando…";
    out.textContent = "";
    chamarSincronizacao().then(function (d) {
      btnSyncOlist.disabled = false;
      btnSyncOlist.textContent = "Sincronizar agora";
      carregarStatusSync();
      if (d.ocupado) {
        out.textContent = "Já tem uma sincronização rodando (provavelmente a automática). Os pedidos novos aparecem sozinhos em instantes.";
        toast("Sincronização já em andamento.", "ok");
        return;
      }
      if (d.error) {
        out.textContent = "Erro: " + d.error + (d.detalhe ? " — " + JSON.stringify(d.detalhe) : "");
        toast("Falha ao sincronizar com o Olist.", "err");
        return;
      }
      var linhas = [];
      linhas.push(d.importados + " pedido(s) importado(s)");
      linhas.push(d.ja_existentes + " já existiam");
      if (d.paginas > 1) linhas.push(d.paginas + " páginas lidas no Olist");
      if (d.sem_itens_reconhecidos) linhas.push(d.sem_itens_reconhecidos + " sem item válido");
      if (d.a_revisar_novos) linhas.push(d.a_revisar_novos + " foram para \"A revisar\"");
      if (d.vendas_balcao || d.ignorados_por_regra) linhas.push(((d.vendas_balcao || 0) + (d.ignorados_por_regra || 0)) + " ficaram fora (balcão, retirada ou Full)");
      if (d.cancelados_no_wms && d.cancelados_no_wms.length) linhas.push("cancelados no WMS (cancelados no Olist): " + d.cancelados_no_wms.join(", "));
      if (d.avisos && d.avisos.length) linhas.push(d.avisos.join(" · "));
      if (d.erros && d.erros.length) linhas.push("erros: " + d.erros.join(" · "));
      if (d.produtos_cadastrados_automaticamente && d.produtos_cadastrados_automaticamente.length) linhas.push("produtos novos cadastrados: " + d.produtos_cadastrados_automaticamente.join("; "));
      out.textContent = linhas.join(" · ");
      toast(d.importados + " pedido(s) importado(s) do Olist.", "ok");
      carregarFilaPedidos();
      carregarContadores();
    });
  });
}

function carregarFilaPedidos() {
  carregarStatusSync();
  carregarRevisar();
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
