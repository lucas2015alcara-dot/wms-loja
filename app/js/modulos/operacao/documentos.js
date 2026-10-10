"use strict";
// WMS Pilchs — js/modulos/operacao/documentos.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- DOCUMENTOS SIMULADOS DA EMBALAGEM (etiqueta + nota) ----------------
// Só demonstração: nada aqui tem valor fiscal. Na integração real, etiqueta e NF vêm do marketplace/ERP.
var docsModal = document.getElementById("docsModal");

function rastreioSimulado(idExterno) {
  var h = 0;
  for (var i = 0; i < idExterno.length; i++) h = (h * 31 + idExterno.charCodeAt(i)) % 1000000000;
  return "SIM" + String(h).padStart(9, "0") + "BR";
}

function mostrarDocumentosSimulados(pedido) {
  var itens = pedido.itens_pedido || [];
  var volumes = 1;
  var totalUn = itens.reduce(function (s, i) { return s + i.qtd; }, 0);
  var agora = new Date();
  var dataTxt = agora.toLocaleDateString("pt-BR") + " " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  var rastreio = rastreioSimulado(pedido.id_externo);
  var operador = meu ? meu.nome : "";
  var linhas = itens.map(function (i) {
    var p = i.produtos || {};
    return '<tr><td>' + escapeHtml(p.sku || "") + '</td><td>' + escapeHtml(p.nome || "") + '</td><td class="q">' + i.qtd + '</td></tr>';
  }).join("");

  var etiqueta =
    '<div class="doc">' +
      '<div class="marca">SIMULAÇÃO</div>' +
      '<div class="faixa">ETIQUETA DE ENVIO — SIMULAÇÃO</div>' +
      '<div class="bloco"><div class="rot">Transportadora</div><div class="grande">Definida pelo canal (' + escapeHtml(canalLabel(pedido.canal)) + ')</div></div>' +
      '<div class="bloco cb"><div class="rot">Código de rastreio (fictício)</div><svg id="docCbRastreio"></svg></div>' +
      '<div class="bloco"><div class="rot">Destinatário</div><div style="font-size:13px; font-weight:700">Cliente do pedido ' + escapeHtml(pedido.id_externo) + '</div>' +
        '<div>Nome, endereço e CEP vêm da integração com o marketplace.</div></div>' +
      '<div class="bloco"><div class="rot">Remetente</div><div style="font-weight:700">PILCHS INFO</div><div>Expedição — galpão</div></div>' +
      '<div class="bloco cb"><div class="rot">Pedido — bipe este código na expedição</div><svg id="docCbPedido"></svg></div>' +
      '<div class="bloco" style="display:flex; justify-content:space-between">' +
        '<div><div class="rot">Pedido</div><div class="grande">' + escapeHtml(pedido.id_externo) + '</div></div>' +
        '<div><div class="rot">Volume</div><div class="grande">' + volumes + '/' + volumes + '</div></div>' +
        '<div><div class="rot">Itens</div><div class="grande">' + totalUn + ' un.</div></div>' +
      '</div>' +
      '<div class="rodape">Conferido por ' + escapeHtml(operador) + ' em ' + dataTxt + ' · documento de demonstração, sem validade para envio.</div>' +
    '</div>';

  // nota: primeiro com os dados do WMS; quando o Olist responder, é refeita com os dados da nota
  var nota = renderDanfe(danfeDoPedido(pedido));

  document.getElementById("docsTitulo").textContent = "Documentos do pedido " + pedido.id_externo;
  document.getElementById("docsPrint").innerHTML = etiqueta + nota;
  desenharCodigoChave();
  try {
    if (!window.JsBarcode) throw new Error("sem JsBarcode");
    JsBarcode("#docCbPedido", pedido.id_externo, { format: "CODE128", width: 2, height: 70, fontSize: 16, margin: 0 });
    JsBarcode("#docCbRastreio", rastreio, { format: "CODE128", width: 1.6, height: 45, fontSize: 12, margin: 0 });
  } catch (e) {
    var cp = document.getElementById("docCbPedido"), cr = document.getElementById("docCbRastreio");
    if (cp) cp.outerHTML = '<div class="grande" style="font-family:monospace">' + escapeHtml(pedido.id_externo) + '</div>';
    if (cr) cr.outerHTML = '<div class="grande" style="font-family:monospace">' + rastreio + '</div>';
  }
  docsModal.classList.add("show");
  buscarNotaReal(pedido);
  docsModal.scrollTop = 0;
}

document.getElementById("docsFechar").addEventListener("click", function () { docsModal.classList.remove("show"); });
document.getElementById("docsImprimir").addEventListener("click", function () { window.print(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && docsModal.classList.contains("show")) docsModal.classList.remove("show"); });


// ---------------- NOTA FISCAL REAL (Olist) NO FIM DA EMBALAGEM ----------------
function buscarNotaReal(pedido) {
  var box = document.getElementById("docsNotaReal");
  box.className = "nf-real";
  box.innerHTML = "";
  if (pedido.canal && pedido.canal !== "olist") return;
  var status = document.querySelector("#docsModal .sub");
  if (status) status.textContent = "Buscando os dados da nota no Olist…";
  sb.functions.invoke("nota-pedido", { method: "POST", body: { pedido_id: pedido.id } }).then(function (res) {
    var d = res.data || {};
    if (res.error || d.error || d.status !== "ok") {
      if (status) status.textContent = d.status === "sem_nota" ? "Este pedido ainda não tem nota no Olist: a nota abaixo usa os dados do WMS." : "Não foi possível ler a nota no Olist: a nota abaixo usa os dados do WMS.";
      if (NF_AVISO_ATIVO && d.status === "sem_nota") { box.className = "nf-real alerta"; box.innerHTML = "<b>Este pedido ainda não tem nota fiscal no Olist.</b>"; }
      return;
    }
    d.fonte = "olist";
    trocarDanfe(d);
    if (status) status.textContent = "Nota fiscal nº " + d.numero + " lida do Olist" + (d.autorizada ? " — autorizada." : " — situação: " + (d.situacao || "não autorizada") + ".") + " A etiqueta ainda é simulação.";
    if (d.autorizada && d.link) {
      box.className = "nf-real ok";
      box.innerHTML = '<div class="nf-acoes" style="margin-top:0"><button class="btn ghost" id="nfAbrir">Abrir PDF oficial do Olist</button></div>';
      document.getElementById("nfAbrir").addEventListener("click", function () { window.open(d.link, "_blank", "noopener"); });
    } else if (NF_AVISO_ATIVO) {
      box.className = "nf-real alerta";
      box.innerHTML = "<b>⚠️ Nota nº " + escapeHtml(d.numero) + " — " + escapeHtml(d.situacao || "não autorizada") + "</b><br>Não despache sem a nota autorizada: avise o financeiro.";
    }
  });
}


// ---------------- DANFE SIMPLIFICADO (nota na embalagem) ----------------
var NF_AVISO_ATIVO = false; // aviso amarelo de nota rejeitada/sem nota: desligado nesta fase de testes
var EMITENTE = { nome: "PILCH INFORMATICA LTDA", local: "83324000 PINHAIS - PR", cnpj: "39.303.825/0001-10", ie: "9086414500" };
var danfeChaveAtual = "";

function moeda(v) { var n = Number(String(v).replace(",", ".")); return isNaN(n) ? (v || "") : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function qtdTxt(v) { var n = Number(String(v).replace(",", ".")); return isNaN(n) ? (v || "") : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function numeroNf(v) { var d = String(v || "").replace(/\D/g, ""); if (!d) return "—"; d = d.padStart(6, "0"); return d.replace(/\B(?=(\d{3})+(?!\d))/g, "."); }

function danfeDoPedido(pedido) {
  return {
    fonte: "wms", autorizada: false, situacao: "", numero: "", serie: "", data_emissao: new Date().toLocaleDateString("pt-BR"),
    chave: "", protocolo: "", data_protocolo: "",
    cliente: { nome: "Cliente do pedido " + pedido.id_externo, endereco: "(dados vêm da nota no Olist)" }, entrega: null,
    itens: (pedido.itens_pedido || []).map(function (i) { var p = i.produtos || {}; return { codigo: p.sku || "", descricao: p.nome || "", unidade: "UN", quantidade: i.qtd, valor_unitario: "", valor_total: "" }; }),
    valor: "", obs: ""
  };
}

function blocoEndereco(c) {
  if (!c) return "";
  var l1 = [c.endereco, c.numero].filter(Boolean).join(", ") + (c.complemento ? " - " + c.complemento : "") + (c.bairro ? ". BAIRRO " + c.bairro : "");
  var l2 = [c.cep, [c.cidade, c.uf].filter(Boolean).join(" - ")].filter(Boolean).join(" ");
  return '<div>' + escapeHtml(c.nome || "") + '</div>' +
    (l1.trim() ? '<div>' + escapeHtml(l1) + (l2 ? ". " + escapeHtml(l2) : "") + '</div>' : "") +
    (c.cpf_cnpj !== undefined ? '<div class="lin2"><span>CPF/CNPJ ' + escapeHtml(c.cpf_cnpj || "") + '</span><span>IE: ' + escapeHtml(c.ie || "") + '</span></div>' : "");
}

function renderDanfe(d) {
  danfeChaveAtual = d.autorizada ? d.chave : "";
  var prot = "";
  if (d.protocolo) {
    var dp = d.data_protocolo ? new Date(d.data_protocolo) : null;
    prot = d.protocolo + (dp && !isNaN(dp) ? " - " + dp.toLocaleDateString("pt-BR") + " " + dp.toLocaleTimeString("pt-BR") : "");
  }
  var linhas = (d.itens || []).map(function (i) {
    return '<tr><td>' + escapeHtml(i.codigo) + '</td><td>' + escapeHtml(i.descricao) + '</td><td>' + escapeHtml(i.unidade) + '</td><td class="q">' + qtdTxt(i.quantidade) + '</td><td class="q">' + moeda(i.valor_unitario) + '</td><td class="q">' + moeda(i.valor_total) + '</td></tr>';
  }).join("");
  var naoAut = !d.autorizada;
  return '<div class="doc danfe" id="docNotaSim">' +
    (naoAut ? '<div class="marca">SEM VALOR FISCAL</div>' : "") +
    '<div class="c tit">DANFE SIMPLIFICADO</div>' +
    '<div class="c b tit">CHAVE DE ACESSO</div>' +
    '<div class="c chave">' + (d.chave ? escapeHtml(d.chave) : "— gerada na autorização da SEFAZ —") + '</div>' +
    '<div class="c b tit">PROTOCOLO DE AUTORIZAÇÃO DE USO</div>' +
    '<div class="c">' + (prot ? escapeHtml(prot) : "—") + '</div>' +
    (d.chave ? '<div class="cb-chave"><svg id="docCbChave"></svg></div>'
             : '<div class="cb-vazio">Código de barras da chave de acesso<br>(aparece quando a nota é autorizada)</div>') +
    (naoAut ? '<div class="aviso-nf">' + (d.fonte === "olist" ? "NOTA NÃO AUTORIZADA" + (d.situacao ? " — " + escapeHtml(d.situacao.toUpperCase()) : "") : "SIMULAÇÃO — DADOS DO PEDIDO NO WMS") + '</div>' : "") +
    '<div class="c">1 - Saída <b>NÚMERO</b> ' + numeroNf(d.numero) + ' <b>SÉRIE</b> ' + escapeHtml(d.serie || "—") + ' <b>EMISSÃO:</b> ' + escapeHtml(d.data_emissao || "") + '</div>' +
    '<div class="sec"><div class="sec-t">EMITENTE</div><div>' + EMITENTE.nome + '</div><div>' + EMITENTE.local + '</div>' +
      '<div class="lin2"><span>CPF/CNPJ ' + EMITENTE.cnpj + '</span><span>IE: ' + EMITENTE.ie + '</span></div></div><hr>' +
    '<div class="sec-t">DESTINATÁRIO</div>' + blocoEndereco(d.cliente) +
    (d.entrega ? '<div class="sec-t" style="margin-top:1mm">LOCAL DE ENTREGA</div>' + blocoEndereco(d.entrega) : "") + '<hr>' +
    '<table><thead><tr><th>CÓD.</th><th>DESCRIÇÃO</th><th>UN</th><th class="q">QTD</th><th class="q">V.UNIT</th><th class="q">V.TOTAL</th></tr></thead><tbody>' + linhas + '</tbody></table><hr>' +
    '<div class="tot">TOTAL DA NFE: ' + (d.valor !== "" ? moeda(d.valor) : "—") + '</div>' +
    (d.obs ? '<div class="adic-t">DADOS ADICIONAIS</div><div class="adic">' + escapeHtml(d.obs) + '</div>' : "") +
  '</div>';
}

function desenharCodigoChave() {
  var el = document.getElementById("docCbChave");
  if (!el || !danfeChaveAtual) return;
  try {
    if (!window.JsBarcode) throw new Error("sem JsBarcode");
    JsBarcode("#docCbChave", danfeChaveAtual, { format: "CODE128C", width: 1.2, height: 60, displayValue: false, margin: 0 });
  } catch (e) { el.outerHTML = '<div class="chave">' + escapeHtml(danfeChaveAtual) + '</div>'; }
}

function trocarDanfe(d) {
  var atual = document.getElementById("docNotaSim");
  if (!atual) return;
  var tmp = document.createElement("div");
  tmp.innerHTML = renderDanfe(d);
  atual.replaceWith(tmp.firstChild);
  desenharCodigoChave();
}
