"use strict";
// WMS Pilchs — js/base/camera.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- CÂMERA (leitor de código de barras pelo celular) ----------------
var camInstance = null;
var camOnDetect = null;
var camLastCode = "";
var camLastTime = 0;

// Decide se uma leitura da câmera conta. Todas as unidades de um SKU têm o mesmo código de
// barras, então a mesma caixa parada na frente da câmera não pode contar de novo: um código
// só é aceito outra vez depois de ficar CAM_AUSENCIA_MS sem aparecer em nenhuma imagem.
// (Antes era "ignora por 1,5 s" — uma caixa parada por 4 s contava 3 vezes.)
var CAM_AUSENCIA_MS = 1000;
function camAceitaLeitura(codigo, agora) {
  var repetido = codigo === camLastCode && (agora - camLastTime) < CAM_AUSENCIA_MS;
  camLastCode = codigo;
  camLastTime = agora; // renova a cada imagem em que o código aparece, aceita ou não
  return !repetido;
}

function abrirCamera(onDetect) {
  destravarAudio();
  if (typeof Html5Qrcode === "undefined") { toast("Leitor de câmera não carregou. Verifique a internet.", "err"); return; }
  camOnDetect = onDetect;
  camLastCode = ""; camLastTime = 0;
  document.getElementById("cameraModal").classList.add("show");
  document.getElementById("camStatus").textContent = "Abrindo câmera…";
  camInstance = new Html5Qrcode("camReader");
  var config = { fps: 12, qrbox: { width: 260, height: 140 }, formatsToSupport: [
    Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E, Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.QR_CODE
  ] };
  camInstance.start({ facingMode: "environment" }, config, function (decodedText) {
    if (!camAceitaLeitura(decodedText, Date.now())) return;
    if (navigator.vibrate) navigator.vibrate(80);
    document.getElementById("camStatus").textContent = "Lido: " + decodedText + " — afaste o item para ler o próximo";
    if (camOnDetect) camOnDetect(decodedText);
  }, function () { /* erro de leitura de frame, ignora — é contínuo */ }).catch(function (err) {
    document.getElementById("camStatus").textContent = "Não foi possível abrir a câmera. Verifique a permissão do navegador.";
    toast("Erro ao abrir câmera: " + (err.message || err), "err");
  });
}

function fecharCamera() {
  document.getElementById("cameraModal").classList.remove("show");
  if (camInstance) {
    camInstance.stop().then(function () { camInstance.clear(); }).catch(function () {});
    camInstance = null;
  }
}
document.getElementById("camClose").addEventListener("click", fecharCamera);

var meu = null; // { id, nome, papel }
