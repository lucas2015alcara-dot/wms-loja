"use strict";
// WMS Pilchs — js/modulos/gestao/usuarios.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- USUÁRIOS (só admin) ----------------
var usrWired = false;
var USR_PALAVRAS = ["Caixa", "Palete", "Etiqueta", "Galpao", "Lote", "Rua", "Fita", "Volume", "Pedido", "Doca"];

function gerarSenha() {
  var n = new Uint32Array(3);
  (window.crypto || window.msCrypto).getRandomValues(n);
  return USR_PALAVRAS[n[0] % USR_PALAVRAS.length] + "-" + (1000 + (n[1] % 9000)) + "-" + USR_PALAVRAS[n[2] % USR_PALAVRAS.length];
}



function chamarUsuarios(payload) {
  return sb.functions.invoke("gerenciar-usuarios", { method: "POST", body: payload }).then(function (res) {
    if (!res.error) return res.data || {};
    var ctx = res.error.context;
    if (ctx && typeof ctx.json === "function") {
      return ctx.json().then(function (j) { return { error: (j && j.error) || res.error.message }; }, function () { return { error: res.error.message }; });
    }
    return { error: res.error.message || "Falha na comunicação." };
  });
}

function msg(el, texto, tipo) {
  el.textContent = texto || "";
  el.style.color = tipo === "err" ? "var(--red)" : tipo === "ok" ? "var(--green)" : "var(--text-dim)";
}

function carregarUsuarios() {
  if (!meu || meu.papel !== "admin") return;
  if (!usrWired) {
    usrWired = true;
    document.getElementById("usrGerar").addEventListener("click", function () { document.getElementById("usrSenha").value = gerarSenha(); });
    document.getElementById("usrCriar").addEventListener("click", criarUsuario);
  }
  var lista = document.getElementById("usrLista");
  lista.innerHTML = '<div class="empty">Carregando…</div>';
  chamarUsuarios({ acao: "listar" }).then(function (d) {
    if (d.error) { lista.innerHTML = '<div class="empty">Erro: ' + escapeHtml(d.error) + '</div>'; return; }
    var us = d.usuarios || [];
    us.sort(function (a, b) { return (b.ativo === a.ativo ? 0 : (a.ativo ? -1 : 1)) || (a.papel === b.papel ? 0 : (a.papel === "admin" ? -1 : 1)) || a.nome.localeCompare(b.nome); });
    lista.innerHTML = "";
    us.forEach(function (u) { lista.appendChild(linhaUsuario(u, d.eu)); });
    if (!us.length) lista.innerHTML = '<div class="empty">Nenhum login.</div>';
  });
}

function linhaUsuario(u, eu) {
  var souEu = u.id === eu;
  var row = document.createElement("div");
  row.className = "usr-row" + (u.ativo === false ? " inativo" : "");
  var papelLbl = u.papel === "admin" ? "Admin" : (u.papel === "operador" ? "Operador" : u.papel);
  var acesso = u.ultimo_acesso ? "último acesso " + new Date(u.ultimo_acesso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca entrou";
  row.innerHTML =
    '<div class="usr-head"><div><div class="oid">' + escapeHtml(u.nome) + (souEu ? ' <span style="font-weight:500; color:var(--text-dim); font-size:13.5px">(você)</span>' : '') + '</div>' +
    '<div class="meta mono">' + escapeHtml(u.email) + '</div><div class="meta">' + acesso + '</div></div>' +
    '<div class="acoes" style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end">' +
    (u.ativo === false ? '<span class="badge off">Desativado</span>' : '') +
    '<span class="badge ' + (u.papel === "admin" ? "admin" : "oper") + '">' + papelLbl + '</span></div></div>' +
    '<div class="usr-edit">' +
      '<label>Nome</label><div class="row"><input type="text" data-f="nome" value="' + escapeHtml(u.nome) + '"><button class="btn ghost" data-a="nome" style="flex:0 0 auto">Salvar</button></div>' +
      (souEu ? '' :
        '<label>Papel</label><div class="row"><select class="usr-select" data-f="papel"><option value="operador"' + (u.papel === "operador" ? " selected" : "") + '>Operador</option><option value="admin"' + (u.papel === "admin" ? " selected" : "") + '>Admin</option></select><button class="btn ghost" data-a="papel" style="flex:0 0 auto">Salvar</button></div>') +
      '<label>Nova senha</label><div class="row"><input type="text" class="mono" data-f="senha" autocomplete="off" autocapitalize="off" placeholder="mínimo 8 caracteres"><button class="btn ghost" data-a="gerar" style="flex:0 0 auto">Gerar</button><button class="btn primary" data-a="senha" style="flex:0 0 auto">Definir</button></div>' +
      (souEu ? '' : '<button class="btn ' + (u.ativo === false ? 'ghost' : 'danger') + '" data-a="ativo" style="margin-top:12px; width:100%">' + (u.ativo === false ? 'Reativar login' : 'Desativar login') + '</button>') +
      '<div class="usr-msg"></div>' +
    '</div>';
  var head = row.querySelector(".usr-head");
  var m = row.querySelector(".usr-msg");
  head.addEventListener("click", function () { row.classList.toggle("aberto"); });
  row.querySelectorAll("[data-a]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var a = btn.dataset.a;
      if (a === "gerar") { row.querySelector('[data-f="senha"]').value = gerarSenha(); return; }
      var payload = { acao: a, id: u.id };
      if (a === "nome") payload.nome = row.querySelector('[data-f="nome"]').value.trim();
      if (a === "papel") payload.papel = row.querySelector('[data-f="papel"]').value;
      if (a === "senha") {
        payload.senha = row.querySelector('[data-f="senha"]').value;
        if (payload.senha.length < 8) { msg(m, "A senha precisa ter pelo menos 8 caracteres.", "err"); return; }
      }
      if (a === "ativo") {
        payload.ativo = u.ativo === false;
        if (!payload.ativo && btn.dataset.confirmar !== "1") {
          btn.dataset.confirmar = "1";
          btn.textContent = "Toque de novo para confirmar a desativação";
          return;
        }
      }
      btn.disabled = true;
      msg(m, "Salvando…");
      chamarUsuarios(payload).then(function (d) {
        btn.disabled = false;
        if (d.error) { msg(m, d.error, "err"); return; }
        if (a === "senha") {
          msg(m, "Senha definida: " + payload.senha + " — anote no gerenciador de senhas.", "ok");
          toast("Senha de " + u.nome + " trocada.", "ok");
          return;
        }
        toast(a === "ativo" ? (payload.ativo ? "Login reativado." : "Login desativado.") : "Alteração salva.", "ok");
        carregarUsuarios();
      });
    });
  });
  return row;
}

function criarUsuario() {
  var el = document.getElementById("usrMsgNovo");
  var nome = document.getElementById("usrNome").value.trim();
  var email = document.getElementById("usrEmail").value.trim();
  var papel = document.getElementById("usrPapel").value;
  var senha = document.getElementById("usrSenha").value;
  if (nome.length < 2) { msg(el, "Informe o nome.", "err"); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg(el, "E-mail inválido.", "err"); return; }
  if (senha.length < 8) { msg(el, "A senha precisa ter pelo menos 8 caracteres (use Gerar).", "err"); return; }
  var btn = document.getElementById("usrCriar");
  btn.disabled = true;
  msg(el, "Criando…");
  chamarUsuarios({ acao: "criar", nome: nome, email: email, papel: papel, senha: senha }).then(function (d) {
    btn.disabled = false;
    if (d.error) { msg(el, d.error, "err"); return; }
    msg(el, "Login criado: " + email + " / " + senha + " — anote no gerenciador de senhas.", "ok");
    toast("Login de " + nome + " criado.", "ok");
    document.getElementById("usrNome").value = "";
    document.getElementById("usrEmail").value = "";
    document.getElementById("usrSenha").value = "";
    document.getElementById("usrPapel").value = "operador";
    carregarUsuarios();
  });
}
