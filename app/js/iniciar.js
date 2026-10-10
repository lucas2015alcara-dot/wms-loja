"use strict";
// WMS Pilchs — js/iniciar.js
// Último arquivo a carregar: só começa depois que todas as telas já existem.

// faixa de aviso quando o site está usando o banco de TESTE
if (AMBIENTE === "teste") {
  var faixaTeste = document.createElement("div");
  faixaTeste.className = "faixa-ambiente-teste";
  faixaTeste.textContent = "AMBIENTE DE TESTE — dados de mentira";
  document.body.appendChild(faixaTeste);
}

// checa sessão já existente ao abrir
sb.auth.getSession().then(function (r) { if (r.data.session) carregarPerfilEIniciar(); });
