"use strict";
// WMS Pilchs — js/base/config.js
// Escolhe o banco (Supabase) conforme o endereço do site:
//   wms-loja-teste.onrender.com, localhost ou ?ambiente=teste  → banco de TESTE
//   qualquer outro (wms-loja.onrender.com)                     → banco de PRODUÇÃO
// As chaves abaixo são "publicáveis": feitas para ficar no navegador. A proteção dos
// dados está nas regras do banco (RLS), não em esconder estas chaves.

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
  var host = location.hostname;
  if (/wms-loja-teste/.test(host) || host === "localhost" || host === "127.0.0.1" || host === "") return "teste";
  if (/[?&]ambiente=teste\b/.test(location.search)) return "teste";
  return "producao";
})();

var SUPABASE_URL = AMBIENTES[AMBIENTE].url;
var SUPABASE_KEY = AMBIENTES[AMBIENTE].chave;
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
