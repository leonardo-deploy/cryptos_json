/* Instalação do app e service worker.
   O manifesto aponta os ícones da marca, então o atalho criado no celular
   aparece com o logo do cryptos.json Studio. */
(() => {
  "use strict";

  const installButton = document.getElementById("install");
  let deferredPrompt = null;

  const isStandalone = () =>
    globalThis.matchMedia?.("(display-mode: standalone)").matches === true ||
    globalThis.navigator?.standalone === true;

  /* iOS não expõe beforeinstallprompt: lá o caminho é Compartilhar > Adicionar
     à Tela de Início, e o apple-touch-icon é o que vira o ícone do atalho. */
  const isIos = () =>
    /iphone|ipad|ipod/i.test(globalThis.navigator?.userAgent || "") ||
    (globalThis.navigator?.platform === "MacIntel" && globalThis.navigator?.maxTouchPoints > 1);

  function showButton(label) {
    if (!installButton || isStandalone()) return;
    const text = installButton.querySelector("span");
    if (text && label) text.textContent = label;
    installButton.hidden = false;
    installButton.classList.remove("hidden");
  }

  function hideButton() {
    if (!installButton) return;
    installButton.hidden = true;
    installButton.classList.add("hidden");
  }

  function showIosHint() {
    const existing = document.getElementById("iosHint");
    if (existing) {
      existing.remove();
      return;
    }
    const hint = document.createElement("p");
    hint.id = "iosHint";
    hint.className = "install-hint";
    hint.setAttribute("role", "status");
    hint.textContent = "No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.";
    installButton?.insertAdjacentElement("afterend", hint);
    setTimeout(() => hint.remove(), 9000);
  }

  globalThis.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showButton("Instalar app");
  });

  installButton?.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      if (choice?.outcome === "accepted") hideButton();
      return;
    }
    showIosHint();
  });

  globalThis.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideButton();
  });

  if (isIos() && !isStandalone()) showButton("Instalar app");

  const secureContext = location.protocol === "https:" || location.hostname === "localhost";
  if ("serviceWorker" in navigator && secureContext) {
    globalThis.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Sem service worker o app continua funcionando online. */
      });
    });
  }
})();
