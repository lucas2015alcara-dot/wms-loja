"use strict";
// WMS Pilchs — js/modulos/operacao/expedicao.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- EXPEDIÇÃO ----------------
var expInputWired = false;
function horaCurta(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function setExpUltimo(tipo, titulo, sub) {
  var el = document.getElementById("expUltimo");
  if (!el) return;
  el.className = "exp-ultimo " + tipo;
  el.innerHTML = '<span class="rot">Última leitura</span><b>' + escapeHtml(titulo) + '</b>' + (sub ? '<small>' + escapeHtml(sub) + '</small>' : '');
}
var expProntosQtd = 0;
function atualizarBarraExp(hojeQtd) {
  var barra = document.getElementById("expHojeBarra");
  if (!barra) return;
  var total = hojeQtd + expProntosQtd;
  barra.style.width = (total ? Math.round(hojeQtd * 100 / total) : 0) + "%";
}
function carregarExpedidosHoje() {
  var ini = new Date(); ini.setHours(0, 0, 0, 0);
  sb.from("pedidos").select("id,id_externo,canal,expedido_em,expedido_manual_por").eq("status", "expedido").gte("expedido_em", ini.toISOString()).order("expedido_em", { ascending: false }).limit(200).then(function (res) {
    var el = document.getElementById("expHoje");
    var lista = res.data || [];
    document.getElementById("expHojeQtd").textContent = lista.length;
    atualizarBarraExp(lista.length);
    if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhum pacote expedido hoje.</div>'; return; }
    el.innerHTML = lista.slice(0, 30).map(function (o) {
      return '<div class="exp-lin"><i class="ponto"></i><b>' + escapeHtml(o.id_externo) + '</b><span>' + canalLabel(o.canal) + '</span>' + (o.expedido_manual_por ? '<i class="manual" title="Expedido sem bipe por um ADM">sem bipe</i>' : '') + '<time>' + horaCurta(o.expedido_em) + '</time></div>';
    }).join("") + (lista.length > 30 ? '<div class="pn-obs" style="margin-top:8px">Mostrando os 30 mais recentes.</div>' : '');
  });
}
function carregarFilaExpedicao() {
  sb.from("pedidos").select("id,id_externo,canal,itens_pedido(qtd)").eq("status", "embalado").order("criado_em").then(function (res) {
    var el = document.getElementById("expFila");
    el.innerHTML = "";
    var lista = res.data || [];
    expProntosQtd = lista.length;
    document.getElementById("expFilaQtd").textContent = lista.length;
    carregarExpedidosHoje();
    if (lista.length === 0) { el.innerHTML = '<div class="empty">Nenhum pedido embalado aguardando expedição.</div>'; return; }
    lista.forEach(function (o) {
      var qtdTotal = (o.itens_pedido || []).reduce(function (s, i) { return s + i.qtd; }, 0);
      var row = document.createElement("div");
      row.className = "order-row";
      row.style.cursor = "default";
      row.innerHTML = '<div><div class="oid">' + escapeHtml(o.id_externo) + '</div><div class="meta">' + canalLabel(o.canal) + ' · ' + qtdTotal + ' un.</div></div><div style="display:flex; gap:6px; flex:none"><button class="btn ghost small" data-reimp="' + o.id + '" title="Reimprimir etiqueta + nota" aria-label="Reimprimir etiqueta e nota">🖨️</button>' + (meu && meu.papel === "admin" ? '<button class="btn small" data-exp="' + o.id + '" data-num="' + escapeHtml(o.id_externo) + '">expedir</button>' : '') + '</div>';
      el.appendChild(row);
    });
    el.querySelectorAll("[data-exp]").forEach(function (btn) {
      btn.addEventListener("click", function () { abrirExpedicaoManual(btn.dataset.exp, btn.dataset.num); });
    });
    el.querySelectorAll("[data-reimp]").forEach(function (btn) {
      btn.addEventListener("click", function () { reimprimirPedido(btn.dataset.reimp); });
    });
  });

  if (!expInputWired) {
    expInputWired = true;
    var input = document.getElementById("scanInputExp");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        destravarAudio();
        handleScanExpedicao(input.value.trim());
        input.value = "";
      }
    });
    document.getElementById("btnCamExp").addEventListener("click", function () {
      abrirCamera(function (code) { handleScanExpedicao(code); });
    });
  }
  var focusInput = document.getElementById("scanInputExp");
  if (focusInput) focusInput.focus();
}

// expedição sem bipe: só ADM, com a senha dele; fica gravado quem fez e o motivo
var expManualId = null;
function abrirExpedicaoManual(pedidoId, numero) {
  if (!meu || meu.papel !== "admin") { toast("Só um ADM pode expedir sem bipar.", "err"); return; }
  expManualId = pedidoId;
  document.getElementById("expManualSub").textContent = "Pedido " + (numero || "") + ". O normal é expedir bipando o pacote. Use isto só quando não der para bipar.";
  document.getElementById("expManualMotivo").value = "";
  document.getElementById("expManualSenha").value = "";
  msg(document.getElementById("expManualMsg"), "");
  document.getElementById("expManualConfirmar").disabled = false;
  document.getElementById("expManualModal").classList.add("show");
  setTimeout(function () { document.getElementById("expManualMotivo").focus(); }, 50);
}
function fecharExpedicaoManual() { expManualId = null; document.getElementById("expManualSenha").value = ""; document.getElementById("expManualModal").classList.remove("show"); }
document.getElementById("expManualCancelar").addEventListener("click", fecharExpedicaoManual);
document.getElementById("expManualSenha").addEventListener("keydown", function (e) { if (e.key === "Enter") confirmarExpedicaoManual(); });
document.getElementById("expManualConfirmar").addEventListener("click", confirmarExpedicaoManual);
function confirmarExpedicaoManual() {
  var m = document.getElementById("expManualMsg");
  var motivo = document.getElementById("expManualMotivo").value;
  var senha = document.getElementById("expManualSenha").value;
  if (!motivo) { msg(m, "Escolha o motivo.", "err"); return; }
  if (!senha) { msg(m, "Digite sua senha.", "err"); return; }
  var btn = document.getElementById("expManualConfirmar");
  btn.disabled = true;
  msg(m, "Conferindo a senha…");
  sb.auth.getUser().then(function (u) {
    var email = u && u.data && u.data.user && u.data.user.email;
    if (!email) throw new Error("sessão");
    return sb.auth.signInWithPassword({ email: email, password: senha });
  }).then(function (res) {
    if (res.error) { btn.disabled = false; msg(m, "Senha incorreta.", "err"); return; }
    var id = expManualId;
    sb.from("pedidos").update({ status: "expedido", expedido_manual_por: meu.id, expedido_manual_motivo: motivo }).eq("id", id).eq("status", "embalado").select("id_externo").then(function (r) {
      btn.disabled = false;
      if (r.error) { msg(m, "Erro: " + r.error.message, "err"); return; }
      if (!r.data || !r.data.length) { msg(m, "Esse pedido não está mais na fila (já expedido ou cancelado).", "err"); carregarFilaExpedicao(); return; }
      fecharExpedicaoManual();
      toast("Pedido " + r.data[0].id_externo + " expedido (sem bipe) ✓", "ok");
      setExpUltimo("aviso", "Pedido " + r.data[0].id_externo + " expedido sem bipe", "Liberado por " + meu.nome + ": " + motivo + ".");
      carregarFilaExpedicao();
      carregarContadores();
    });
  }).catch(function () { btn.disabled = false; msg(m, "Não consegui conferir a senha. Tente de novo.", "err"); });
}

function handleScanExpedicao(code) {
  if (!code) return;
  // tenta o código exato primeiro; se não achar e for numérico, busca na fila toda e compara sem zeros à esquerda
  // (evita falha quando a câmera lê um EAN-13/UPC-A com ou sem o zero inicial)
  sb.from("pedidos").select("id,id_externo").eq("status", "embalado").ilike("id_externo", code).maybeSingle().then(function (res) {
    if (!res.error && res.data) return res.data;
    return sb.from("pedidos").select("id,id_externo").eq("status", "embalado").then(function (res2) {
      var alvo = normalizarCodigo(code);
      var rastreio = String(code).trim().toUpperCase();
      // aceita também o código de rastreio da etiqueta simulada (SIM...BR)
      var achado = (res2.data || []).find(function (p) { return normalizarCodigo(p.id_externo) === alvo || rastreioSimulado(p.id_externo) === rastreio; });
      return achado || null;
    });
  }).then(function (pedido) {
    if (!pedido) { explicarScanForaDaFila(code); return; }
    fecharCamera();
    toastScan("Pedido " + pedido.id_externo + " expedido ✓", "ok");
    setExpUltimo("ok", "Pedido " + pedido.id_externo + " expedido", "Pode colocar na coleta.");
    sb.from("pedidos").update({ status: "expedido" }).eq("id", pedido.id).then(function (r) {
      if (r.error) { setExpUltimo("err", "Erro ao expedir " + pedido.id_externo, r.error.message); toast("Erro: " + r.error.message, "err"); return; }
      carregarFilaExpedicao();
      carregarContadores();
    });
  });
}

// quando o código não está entre os embalados: descobre se foi cancelado, já expedido ou ainda está em outra etapa
function explicarScanForaDaFila(code) {
  var NOMES = { a_separar: "na separação", separado: "esperando embalagem" };
  sb.rpc("situacao_pedido_por_codigo", { p_codigo: code }).then(function (r) {
    var p = (r && r.data && r.data[0]) || null;
    if (p && p.status === "cancelado") {
      fecharCamera();
      toastScan("Pedido " + p.id_externo + " CANCELADO: não envie", "err");
      setExpUltimo("err", "Não envie: pedido " + p.id_externo + " cancelado", "Separe o pacote para devolução ao estoque.");
    } else if (p && p.status === "expedido") {
      toastScan("Pedido " + p.id_externo + " já foi expedido", "err");
      setExpUltimo("aviso", "Pedido " + p.id_externo + " já foi expedido", p.expedido_em ? "Saiu às " + horaCurta(p.expedido_em) + (new Date(p.expedido_em).toDateString() === new Date().toDateString() ? "" : " de " + new Date(p.expedido_em).toLocaleDateString("pt-BR")) + ". Confira se não é etiqueta repetida." : "Confira se não é etiqueta repetida.");
    } else if (p && NOMES[p.status]) {
      toastScan("Pedido " + p.id_externo + " ainda não foi embalado", "err");
      setExpUltimo("aviso", "Pedido " + p.id_externo + " ainda não foi embalado", "Ele está " + NOMES[p.status] + ". Volte com o pacote para a bancada.");
    } else {
      toastScan("Pedido \"" + code + "\" não está na fila de expedição", "err");
      setExpUltimo("err", "Código não encontrado", "\"" + code + "\" não é de nenhum pedido embalado. Confira a etiqueta.");
    }
  });
}
