"use strict";
// WMS Pilchs — js/modulos/estoque/devolucoes.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- DEVOLUÇÕES ----------------
var devWired = false;

function motivoDevolucaoLabel(m) {
  return { defeito: "Defeito/avaria", arrependimento: "Arrependimento", item_errado: "Item errado enviado", outro: "Outro" }[m] || m;
}

function carregarDevolucoes() {
  if (!devWired) {
    devWired = true;
    document.getElementById("devRegistrar").addEventListener("click", registrarDevolucao);
  }
  carregarListaDevolucoes();
}

function registrarDevolucao() {
  var idExterno = document.getElementById("devIdExterno").value.trim();
  var sku = document.getElementById("devSku").value.trim();
  var qtd = parseInt(document.getElementById("devQtd").value, 10) || 0;
  var motivo = document.getElementById("devMotivo").value;
  var obs = document.getElementById("devObs").value.trim();
  if (!sku) { toast("Informe o SKU do produto", "err"); return; }
  if (qtd <= 0) { toast("Quantidade inválida", "err"); return; }
  var btn = document.getElementById("devRegistrar");
  btn.disabled = true;

  buscarProdutoPorCodigo(sku).then(function (res) {
    if (res.error || !res.data) throw new Error("SKU \"" + sku + "\" não encontrado nos produtos cadastrados");
    var produtoId = res.data.id;
    var achaPedido = idExterno
      ? sb.from("pedidos").select("id").ilike("id_externo", idExterno).maybeSingle()
      : Promise.resolve({ data: null });
    return achaPedido.then(function (pedRes) {
      return sb.from("devolucoes").insert({
        pedido_id: pedRes.data ? pedRes.data.id : null,
        id_externo_pedido: idExterno || null,
        produto_id: produtoId,
        quantidade: qtd,
        motivo: motivo,
        motivo_obs: obs || null,
        registrado_por: meu.id
      });
    });
  }).then(function (res) {
    if (res && res.error) throw new Error(res.error.message);
    toast("Devolução registrada ✓", "ok");
    document.getElementById("devIdExterno").value = "";
    document.getElementById("devSku").value = "";
    document.getElementById("devQtd").value = "1";
    document.getElementById("devObs").value = "";
    carregarListaDevolucoes();
  }).catch(function (err) {
    toast("Erro: " + (err.message || err), "err");
  }).finally(function () { btn.disabled = false; });
}

function carregarListaDevolucoes() {
  sb.from("enderecos").select("id,codigo").eq("ativo", true).order("codigo").then(function (endRes) {
    var enderecosLista = endRes.data || [];
    sb.from("devolucoes").select("id,id_externo_pedido,quantidade,motivo,motivo_obs,status,criado_em,produtos(sku,nome)")
      .eq("status", "pendente").order("criado_em").then(function (res) {
        renderDevPendentes(res.data || [], enderecosLista);
      });
    sb.from("devolucoes").select("id,id_externo_pedido,quantidade,motivo,status,decidido_em,produtos(sku,nome),enderecos!devolucoes_endereco_destino_id_fkey(codigo)")
      .neq("status", "pendente").order("decidido_em", { ascending: false }).limit(20).then(function (res) {
        renderDevHistorico(res.data || []);
      });
  });
}

function renderDevPendentes(lista, enderecosLista) {
  var el = document.getElementById("devPendentes");
  el.innerHTML = "";
  if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhuma devolução pendente.</div>'; return; }
  var opcoesEndereco = '<option value="">endereço de destino</option>' + enderecosLista.map(function (e) { return '<option value="' + e.id + '">' + escapeHtml(e.codigo) + '</option>'; }).join("");
  lista.forEach(function (d) {
    var card = document.createElement("div");
    card.className = "pick-item";
    card.innerHTML =
      '<div class="top"><div><div class="name">' + escapeHtml(d.produtos.nome) + '</div><div class="sku mono">' + skuTxt(d.produtos.sku) + (d.id_externo_pedido ? " · pedido " + escapeHtml(d.id_externo_pedido) : " · sem pedido vinculado") + '</div></div><div class="qty">' + d.quantidade + ' un.</div></div>' +
      '<div class="sku" style="margin-top:6px">' + motivoDevolucaoLabel(d.motivo) + (d.motivo_obs ? " — " + escapeHtml(d.motivo_obs) : "") + '</div>' +
      '<div class="row" style="margin-top:10px"><select data-dev-end="' + d.id + '" style="background:var(--surface-2); border:1px solid var(--line); color:var(--text); border-radius:8px; padding:8px; font-family:inherit; font-size:13px">' + opcoesEndereco + '</select></div>' +
      '<div class="row" style="margin-top:8px">' +
      '<button class="btn primary small" data-dev-aprovar="' + d.id + '">✓ aprovar p/ estoque</button>' +
      '<button class="btn ghost small" data-dev-descarte="' + d.id + '">descartar</button>' +
      '<button class="btn danger small" data-dev-rejeitar="' + d.id + '">rejeitar</button>' +
      '</div>';
    el.appendChild(card);
  });
  el.querySelectorAll("[data-dev-aprovar]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.dataset.devAprovar;
      var sel = el.querySelector('[data-dev-end="' + id + '"]');
      if (!sel.value) { toast("Escolha o endereço de destino", "err"); return; }
      decidirDevolucao(id, "aprovada_estoque", sel.value);
    });
  });
  el.querySelectorAll("[data-dev-descarte]").forEach(function (btn) {
    btn.addEventListener("click", function () { decidirDevolucao(btn.dataset.devDescarte, "aprovada_descarte", null); });
  });
  el.querySelectorAll("[data-dev-rejeitar]").forEach(function (btn) {
    btn.addEventListener("click", function () { decidirDevolucao(btn.dataset.devRejeitar, "rejeitada", null); });
  });
}

function decidirDevolucao(id, decisao, enderecoId) {
  sb.rpc("decidir_devolucao", { p_devolucao_id: id, p_decisao: decisao, p_endereco_id: enderecoId }).then(function (res) {
    if (res.error) { toast("Erro: " + res.error.message, "err"); return; }
    toast("Devolução atualizada ✓", "ok");
    carregarListaDevolucoes();
  });
}

function devStatusLabel(s) {
  return { aprovada_estoque: "voltou pro estoque", aprovada_descarte: "descartada", rejeitada: "rejeitada" }[s] || s;
}

function renderDevHistorico(lista) {
  var el = document.getElementById("devHistorico");
  el.innerHTML = "";
  if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhuma devolução decidida ainda.</div>'; return; }
  lista.forEach(function (d) {
    var row = document.createElement("div");
    row.className = "order-row";
    row.style.cursor = "default";
    var badgeClass = d.status === "aprovada_estoque" ? "sep" : (d.status === "aprovada_descarte" ? "exp" : "wait");
    var meta = skuTxt(d.produtos.sku) + (d.id_externo_pedido ? " · pedido " + escapeHtml(d.id_externo_pedido) : "") + (d.enderecos ? " · " + escapeHtml(d.enderecos.codigo) : "");
    row.innerHTML = '<div><div class="oid">' + escapeHtml(d.produtos.nome) + ' (' + d.quantidade + ' un.)</div><div class="meta mono">' + meta + '</div></div><span class="badge ' + badgeClass + '">' + devStatusLabel(d.status) + '</span>';
    el.appendChild(row);
  });
}
