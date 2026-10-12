"use strict";
// WMS Pilchs — js/base/config.js
// Escolhe o banco (Supabase) conforme o endereço do site.
// REGRA DE SEGURANÇA: só os endereços da lista PRODUCAO usam o banco de produção.
// Qualquer outro endereço (site de teste, prévias do Cloudflare, localhost, um endereço novo
// que alguém esqueceu de cadastrar) cai no banco de TESTE e mostra a faixa vermelha.
// Endereço novo de produção (ex.: domínio próprio) → acrescentar na lista abaixo.
// As chaves abaixo são "publicáveis": feitas para ficar no navegador. A proteção dos
// dados está nas regras do banco (RLS), não em esconder estas chaves.

var PRODUCAO = [
  "wms-loja.onrender.com",      // Render (antigo, fica de reserva)
  "wms-pilchs-info.pages.dev",  // Cloudflare Pages (projeto ligado a pilchs-info/wms-loja)
  "wms-pilchs.pages.dev",       // Cloudflare Pages antigo (desligar depois)
  "wms.pilchs.com",             // domínio próprio da Pilchs (GoDaddy) — escolhido
  "wms.pilchs.com.br",          // reserva, caso a empresa prefira o .com.br
];

var AMBIENTES = {
  producao: {
    url: "https://levnxrjcvqubfowvvurd.supabase.co",
    chave: "sb_publishable_8Zox-r5ttwflMRl5MxtIqw_vXp9rEch",
  },
  teste: {
    url: "https://hzijegkbfgxtgzucuaqm.supabase.co",
    chave: "sb_publishable_KOP4aXGVIicLTVx_Tyv0LQ_3bm7ZA7L",
  },
};

var AMBIENTE = (function () {
  if (/[?&]ambiente=teste\b/.test(location.search)) return "teste";
  return PRODUCAO.indexOf(location.hostname.toLowerCase()) >= 0 ? "producao" : "teste";
})();

var SUPABASE_URL = AMBIENTES[AMBIENTE].url;
var SUPABASE_KEY = AMBIENTES[AMBIENTE].chave;
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
