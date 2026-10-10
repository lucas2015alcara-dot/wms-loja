"use strict";
// WMS Pilchs — js/base/utilidades.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

var toastEl = document.getElementById("toast");
var toastTimer = null;
function toast(msg, kind) {
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.className = "toast"; }, 1900);
  // se a câmera estiver aberta, o toast fica coberto pelo modal — espelha a mensagem lá também
  var camModal = document.getElementById("cameraModal");
  var camStatusEl = document.getElementById("camStatus");
  if (camModal && camModal.classList.contains("show") && camStatusEl) {
    camStatusEl.textContent = (kind === "err" ? "✗ " : kind === "ok" ? "✓ " : "") + msg;
    camStatusEl.style.color = kind === "err" ? "#e2544f" : kind === "ok" ? "#4caf6d" : "";
  }
}
// ---------------- SOM DE BIPE (feedback sonoro enquanto não temos leitor/coletora dedicados) ----------------
var beepCtx = null;
// Navegadores só deixam tocar áudio se ele começar dentro de um toque do usuário.
// Como a câmera detecta o código sozinha (sem toque naquele instante), "destravamos"
// o áudio assim que o usuário toca em algo que vai levar a uma leitura (botão da câmera,
// foco no campo de bipagem). Depois disso, o navegador deixa tocar som mesmo em
// callbacks assíncronos, como o da câmera.
function destravarAudio() {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!beepCtx) beepCtx = new Ctx();
    if (beepCtx.state === "suspended") beepCtx.resume();
  } catch (e) { /* ignora */ }
}
// toca um tom: freq (Hz), inicio e duração (s, relativos a agora), volume 0–1
function tocarTom(freq, inicio, duracao, volume) {
  var t0 = beepCtx.currentTime + inicio;
  var osc = beepCtx.createOscillator();
  var gain = beepCtx.createGain();
  osc.type = "square"; // onda quadrada = timbre de leitor de código de barras, soa mais alto
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.setValueAtTime(volume, t0 + duracao - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);
  osc.connect(gain).connect(beepCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duracao + 0.01);
}
var ultimoSomEm = 0;
function prepararSom() {
  var Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  if (!beepCtx) beepCtx = new Ctx();
  if (beepCtx.state === "suspended") beepCtx.resume();
  // evita dois sons encavalados (ex.: "último item ✓" logo seguido de "pedido concluído ✓")
  var agora = Date.now();
  if (agora - ultimoSomEm < 300) return false;
  ultimoSomEm = agora;
  return true;
}
// leitura certa: bipe curto e agudo, estilo leitor de supermercado
function somOk() {
  try { if (prepararSom()) tocarTom(2400, 0, 0.11, 0.5); } catch (e) { /* áudio bloqueado — ignora */ }
}
// erro: "bu-bu" grave, dois pulsos
function somErro() {
  try {
    if (!prepararSom()) return;
    tocarTom(330, 0, 0.16, 0.6);
    tocarTom(330, 0.24, 0.16, 0.6);
  } catch (e) { /* áudio bloqueado — ignora */ }
}
// mensagem de bipagem: mostra o aviso e toca o som correspondente
function toastScan(msg, kind) {
  toast(msg, kind);
  if (kind === "err") somErro(); else if (kind === "ok") somOk();
}
// SKU sempre com a sigla na frente: "SKU 0653969769473"
function skuTxt(sku) { return "SKU " + escapeHtml(sku); }
function escapeHtml(s) {
  return (s || "").toString().replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function statusLabel(s) { return { a_separar: "A separar", separado: "Separado", embalado: "Embalado", expedido: "Expedido", cancelado: "Cancelado" }[s] || s; }
function statusBadge(s) { return { a_separar: "wait", separado: "sep", embalado: "emb", expedido: "exp", cancelado: "cancel" }[s] || ""; }
function canalLabel(c) { return { mercado_livre: "Mercado Livre", shopee: "Shopee", olist: "Olist", site_proprio: "Site próprio", outro: "Outro" }[c] || c; }
