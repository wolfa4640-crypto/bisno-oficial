"use strict";
(() => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .catch(error => console.warn("Não foi possível preparar a instalação do Bisno:", error));
  });
  let promptInstalacao = null;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    promptInstalacao = event;
    document.dispatchEvent(new CustomEvent("bisno:instalacao-disponivel"));
  });
  window.addEventListener("appinstalled", () => {
    promptInstalacao = null;
    document.dispatchEvent(new CustomEvent("bisno:instalado"));
  });
  window.bisnoInstalarAplicacao = async () => {
    if (!promptInstalacao) return false;
    promptInstalacao.prompt();
    const resultado = await promptInstalacao.userChoice;
    promptInstalacao = null;
    return resultado?.outcome === "accepted";
  };
})();