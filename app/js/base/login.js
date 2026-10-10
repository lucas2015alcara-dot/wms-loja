"use strict";
// WMS Pilchs — js/base/login.js
// Parte do antigo index.html (arquivo único). Carregado por app/index.html, nesta ordem.

// ---------------- LOGIN ----------------
document.getElementById("btnLogin").addEventListener("click", fazerLogin);
document.getElementById("loginSenha").addEventListener("keydown", function (e) { if (e.key === "Enter") fazerLogin(); });
document.getElementById("loginEmail").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); document.getElementById("loginSenha").focus(); } });
document.getElementById("loginVer").addEventListener("click", function () {
  var i = document.getElementById("loginSenha"), ver = i.type === "password";
  i.type = ver ? "text" : "password";
  this.textContent = ver ? "esconder" : "mostrar";
  this.setAttribute("aria-label", ver ? "Esconder senha" : "Mostrar senha");
});

function fazerLogin() {
  var email = document.getElementById("loginEmail").value.trim();
  var senha = document.getElementById("loginSenha").value;
  var errEl = document.getElementById("loginErr");
  errEl.textContent = "";
  if (!email || !senha) { errEl.textContent = "Preencha e-mail e senha."; return; }
  var bt = document.getElementById("btnLogin");
  bt.disabled = true; bt.textContent = "Entrando…";
  sb.auth.signInWithPassword({ email: email, password: senha }).then(function (res) {
    bt.disabled = false; bt.textContent = "Entrar";
    if (res.error) { errEl.textContent = "Login inválido. Confira e-mail e senha."; return; }
    carregarPerfilEIniciar();
  });
}

// ---------- tema claro/escuro: vale só para este aparelho ----------
function aplicarTema(claro) {
  if (claro) document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  var bt = document.getElementById("btnTema");
  bt.textContent = claro ? "🌙" : "☀️";
  bt.title = claro ? "Mudar para o modo escuro" : "Mudar para o modo claro";
}
aplicarTema(document.documentElement.getAttribute("data-theme") === "light");
document.getElementById("btnTema").addEventListener("click", function () {
  var claro = document.documentElement.getAttribute("data-theme") !== "light";
  aplicarTema(claro);
  try { localStorage.setItem("wms-tema", claro ? "claro" : "escuro"); } catch (e) {}
});

document.getElementById("btnLogout").addEventListener("click", function () {
  sb.auth.signOut().then(function () { location.reload(); });
});

function carregarPerfilEIniciar() {
  sb.auth.getUser().then(function (r) {
    var user = r.data.user;
    if (!user) return;
    sb.from("perfis").select("id,nome,papel,ativo").eq("id", user.id).single().then(function (res) {
      if (res.error || !res.data) { toast("Não foi possível carregar seu perfil.", "err"); return; }
      if (res.data.ativo === false) {
        sb.auth.signOut();
        document.getElementById("loginErr").textContent = "Este login está desativado. Fale com o admin.";
        return;
      }
      meu = res.data;
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("appShell").style.display = "flex";
      document.getElementById("hUser").textContent = meu.nome;
      document.getElementById("hPapel").textContent = { admin: "Admin", operador: "Operador", separador: "Separador", embalador: "Embalador", expedicao: "Expedição" }[meu.papel] || meu.papel;
      document.getElementById("cardSyncOlist").style.display = meu.papel === "admin" ? "" : "none";
      // operador usa Endereços e Devoluções, mas criar endereço e decidir devolução é do admin
      document.getElementById("cardNovoEndereco").style.display = meu.papel === "admin" ? "" : "none";
      document.getElementById("cardDevPendentes").style.display = meu.papel === "admin" ? "" : "none";
      document.getElementById("cardEnderecamento").style.display = meu.papel === "admin" ? "" : "none";
      lerConfigEnderecamento();
      montarNav();
      carregarContadores();
    });
  });
}
