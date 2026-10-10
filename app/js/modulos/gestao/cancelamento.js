"use strict";
// WMS Pilchs — js/modulos/gestao/cancelamento.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- CANCELAR PEDIDO (só admin, com senha) ----------------
var cancelPedido = null;
var cancelModal = document.getElementById("cancelModal");

function abrirCancelamento(pedidoId) {
  if (!meu || meu.papel !== "admin") return;
  sb.from("pedidos").select("id,id_externo,canal,status,itens_pedido(qtd,qtd_separada,produtos(sku,nome))").eq("id", pedidoId).single().then(function (res) {
    if (res.error || !res.data) { toast("Não foi possível abrir o pedido.", "err"); return; }
    var p = res.data;
    if (p.status === "cancelado" || p.status === "expedido") { toast("Esse pedido não pode mais ser cancelado.", "err"); carregarPainel(); return; }
    cancelPedido = p;
    var itens = p.itens_pedido || [];
    var separadas = itens.reduce(function (s, i) { return s + Math.max(0, i.qtd_separada || 0); }, 0);
    document.getElementById("cancelTitulo").textContent = "Cancelar pedido " + p.id_externo;
    document.getElementById("cancelSub").textContent = canalLabel(p.canal) + " · situação atual: " + statusLabel(p.status);
    document.getElementById("cancelItens").innerHTML = itens.map(function (i) {
      var pr = i.produtos || {};
      return '<div class="item-line"><div style="flex:1">' + i.qtd + '× ' + escapeHtml(pr.nome || "") + ' <span class="mono" style="color:var(--text-dim)">' + skuTxt(pr.sku || "") + '</span></div>' +
        (i.qtd_separada > 0 ? '<span class="badge sep">' + i.qtd_separada + ' separada(s)</span>' : '') + '</div>';
    }).join("");
    var aviso = document.getElementById("cancelAvisoSep");
    var endWrap = document.getElementById("cancelEndWrap");
    if (separadas > 0 && ENDERECAMENTO) {
      aviso.style.display = "block";
      aviso.textContent = "⚠️ " + separadas + " unidade(s) já saíram da prateleira. Devolva fisicamente ao endereço escolhido abaixo — o sistema soma de volta ao estoque.";
      endWrap.style.display = "block";
      sb.from("enderecos").select("id,codigo").eq("ativo", true).order("codigo").then(function (r) {
        var sel = document.getElementById("cancelEndereco");
        sel.innerHTML = '<option value="">Escolha o endereço…</option>' + (r.data || []).map(function (e) { return '<option value="' + e.id + '">' + escapeHtml(e.codigo) + '</option>'; }).join("");
      });
    } else if (separadas > 0) {
      aviso.style.display = "block";
      aviso.textContent = "⚠️ " + separadas + " unidade(s) já foram separadas. Devolva os produtos à prateleira.";
      endWrap.style.display = "none";
    } else {
      aviso.style.display = "none";
      endWrap.style.display = "none";
    }
    document.getElementById("cancelMotivo").value = "";
    document.getElementById("cancelObs").value = "";
    document.getElementById("cancelSenha").value = "";
    document.getElementById("cancelErr").textContent = "";
    document.getElementById("cancelConfirmar").disabled = false;
    cancelModal.classList.add("show");
    document.getElementById("cancelMotivo").focus();
  });
}

function fecharCancelamento() {
  cancelModal.classList.remove("show");
  document.getElementById("cancelSenha").value = "";
  cancelPedido = null;
}

document.getElementById("cancelVoltar").addEventListener("click", fecharCancelamento);
cancelModal.addEventListener("click", function (e) { if (e.target === cancelModal) fecharCancelamento(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && cancelModal.classList.contains("show")) fecharCancelamento(); });
document.getElementById("cancelSenha").addEventListener("keydown", function (e) { if (e.key === "Enter") confirmarCancelamento(); });
document.getElementById("cancelConfirmar").addEventListener("click", confirmarCancelamento);

var CANCEL_ERROS = {
  senha_incorreta: "Senha incorreta.",
  motivo_obrigatorio: "Informe o motivo.",
  apenas_admin: "Só o admin pode cancelar pedidos.",
  ja_cancelado: "Esse pedido já estava cancelado.",
  ja_expedido: "Pedido já expedido — use Devoluções.",
  informe_endereco_devolucao: "Escolha o endereço para devolver as unidades separadas.",
  endereco_invalido: "Endereço inválido.",
  pedido_nao_encontrado: "Pedido não encontrado."
};

function confirmarCancelamento() {
  if (!cancelPedido) return;
  var errEl = document.getElementById("cancelErr");
  var motivoSel = document.getElementById("cancelMotivo").value;
  var obs = document.getElementById("cancelObs").value.trim();
  var senha = document.getElementById("cancelSenha").value;
  var endWrap = document.getElementById("cancelEndWrap");
  var endereco = endWrap.style.display !== "none" ? document.getElementById("cancelEndereco").value : "";
  errEl.textContent = "";
  if (!motivoSel) { errEl.textContent = "Escolha o motivo."; return; }
  if (motivoSel === "Outro" && obs.length < 3) { errEl.textContent = "Descreva o motivo na observação."; return; }
  if (endWrap.style.display !== "none" && !endereco) { errEl.textContent = "Escolha o endereço de devolução."; return; }
  if (!senha) { errEl.textContent = "Digite sua senha para confirmar."; return; }
  var motivo = motivoSel === "Outro" ? obs : (obs ? motivoSel + " — " + obs : motivoSel);
  var btn = document.getElementById("cancelConfirmar");
  btn.disabled = true;
  var idExt = cancelPedido.id_externo;
  sb.rpc("cancelar_pedido", { p_pedido_id: cancelPedido.id, p_motivo: motivo, p_senha: senha, p_endereco_devolucao: endereco || null }).then(function (res) {
    btn.disabled = false;
    if (res.error) {
      var msg = res.error.message || "";
      var chave = Object.keys(CANCEL_ERROS).filter(function (k) { return msg.indexOf(k) >= 0; })[0];
      errEl.textContent = chave ? CANCEL_ERROS[chave] : "Não foi possível cancelar: " + msg;
      if (chave === "senha_incorreta") { document.getElementById("cancelSenha").value = ""; document.getElementById("cancelSenha").focus(); }
      return;
    }
    fecharCancelamento();
    var d = res.data || {};
    toast("Pedido " + idExt + " cancelado" + (d.unidades_devolvidas ? " · " + d.unidades_devolvidas + " un. devolvidas ao estoque" : "") + ".", "ok");
    carregarPainel();
    carregarContadores();
  });
}
