/* Animações do cryptos.json Studio (GSAP + ScrollTrigger).
   Regras: nada aqui é essencial para usar o app — se o GSAP não carregar, ou se
   a pessoa pedir menos movimento, a página continua completa e estática. */
(() => {
  "use strict";

  const gsap = globalThis.gsap;
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!gsap || reduceMotion?.matches) return;

  const scrollTrigger = globalThis.ScrollTrigger;
  if (scrollTrigger) gsap.registerPlugin(scrollTrigger);

  const $ = (selector) => document.querySelector(selector);
  const all = (selector) => Array.from(document.querySelectorAll(selector));

  /* Entrada do topo e do hero ------------------------------------------- */
  function animateIntro() {
    const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

    timeline
      .from(".topbar", { duration: 0.6, y: -22, opacity: 0 })
      .from(".brand-mark", { duration: 0.7, scale: 0.6, rotate: -20, opacity: 0 }, "-=0.35")
      .from("[data-reveal]", { duration: 0.8, y: 26, opacity: 0, stagger: 0.09 }, "-=0.4")
      .from(
        ".hero-chips li",
        { duration: 0.5, y: 12, opacity: 0, stagger: 0.07, clearProps: "all" },
        "-=0.55",
      )
      .from(
        ".features li",
        { duration: 0.5, y: 16, opacity: 0, stagger: 0.08, clearProps: "all" },
        "-=0.4",
      );

    return timeline;
  }

  /* Profundidade no scroll ------------------------------------------------
     Só camadas decorativas entram aqui: os painéis de resultado nascem com
     `display:none` e posições medidas em elemento oculto não são confiáveis. */
  function parallaxOnScroll() {
    if (!scrollTrigger) return;

    const scrub = { scrub: 0.6, start: "top top", end: "bottom top" };

    gsap.to(".ambient-a", { y: 120, ease: "none", scrollTrigger: { trigger: "body", ...scrub } });
    gsap.to(".ambient-b", { y: -90, ease: "none", scrollTrigger: { trigger: "body", ...scrub } });

    const hero = $(".hero");
    if (hero) {
      gsap.to(hero, {
        y: 36,
        opacity: 0.55,
        ease: "none",
        scrollTrigger: { trigger: hero, start: "bottom 75%", end: "bottom 20%", scrub: 0.4 },
      });
    }
  }

  /* Microinterações ------------------------------------------------------ */
  function hoverLift() {
    all(".primary, .ghost-button").forEach((button) => {
      const lift = (scale) => () => {
        if (button.disabled) return;
        gsap.to(button, { scale, duration: 0.25, ease: "power2.out" });
      };
      button.addEventListener("pointerenter", lift(1.02));
      button.addEventListener("pointerleave", lift(1));
      button.addEventListener("pointerdown", lift(0.98));
      button.addEventListener("pointerup", lift(1.02));
    });
  }

  /* Números que contam até o valor final --------------------------------- */
  const numberFormat = new Intl.NumberFormat("pt-BR");

  function countUp(element) {
    const target = Number(String(element.textContent).replace(/\D/g, ""));
    if (!Number.isFinite(target) || target < 2) return;

    const counter = { value: 0 };
    gsap.to(counter, {
      value: target,
      duration: 1.1,
      ease: "power2.out",
      onUpdate: () => {
        element.textContent = numberFormat.format(Math.round(counter.value));
      },
    });
  }

  /* Observa as trocas de painel feitas pelo app.js ------------------------ */
  function watchPanels() {
    const results = $("#results");
    const progressCard = $("#progressCard");
    if (!results) return;

    let wasHidden = results.classList.contains("hidden");

    const observer = new MutationObserver(() => {
      const isHidden = results.classList.contains("hidden");
      if (wasHidden && !isHidden) {
        gsap.from(".metrics .metric", {
          duration: 0.55,
          y: 18,
          opacity: 0,
          stagger: 0.06,
          ease: "power3.out",
          clearProps: "all",
        });
        gsap.from(".table-panel", {
          duration: 0.6,
          y: 22,
          opacity: 0,
          delay: 0.12,
          ease: "power3.out",
          clearProps: "all",
        });
        const total = $("#totalMetric");
        if (total) countUp(total);
        scrollTrigger?.refresh();
      }
      wasHidden = isHidden;
    });

    observer.observe(results, { attributes: true, attributeFilter: ["class"] });

    if (progressCard) {
      new MutationObserver(() => {
        if (!progressCard.classList.contains("hidden")) {
          gsap.from(progressCard, { duration: 0.5, y: 16, opacity: 0, ease: "power3.out" });
        }
      }).observe(progressCard, { attributes: true, attributeFilter: ["class"] });
    }
  }

  animateIntro();
  parallaxOnScroll();
  hoverLift();
  watchPanels();
})();
