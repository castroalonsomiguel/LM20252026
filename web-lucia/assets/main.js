(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Datos de contacto y portfolio desde config.js ---------- */
  document.querySelectorAll("[data-portfolio]").forEach(function (a) {
    if (cfg.portfolioUrl) a.href = cfg.portfolioUrl;
    a.target = "_blank";
    a.rel = "noopener";
  });
  document.querySelectorAll("[data-email]").forEach(function (a) {
    a.href = "mailto:" + cfg.email;
    if (a.hasAttribute("data-label")) a.textContent = cfg.email;
  });
  document.querySelectorAll("[data-phone]").forEach(function (a) {
    a.href = "tel:" + cfg.phone;
    if (a.hasAttribute("data-label")) a.textContent = cfg.phoneLabel;
  });
  document.querySelectorAll("[data-instagram]").forEach(function (a) {
    a.href = "https://www.instagram.com/" + cfg.instagram + "/";
    a.target = "_blank";
    a.rel = "noopener";
    if (a.hasAttribute("data-label")) a.textContent = "@" + cfg.instagram;
  });
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---------- Animación de entrada (solo portada) ---------- */
  var intro = document.getElementById("intro");
  if (intro) {
    var seen = false;
    try { seen = sessionStorage.getItem("lc-intro") === "1"; } catch (e) {}

    var finish = function () {
      if (intro.classList.contains("is-done")) return;
      intro.classList.add("is-done");
      document.body.classList.remove("is-locked");
      document.body.classList.add("is-ready");
      try { sessionStorage.setItem("lc-intro", "1"); } catch (e) {}
      setTimeout(function () { intro.remove(); }, 1200);
    };

    if (reduceMotion || seen) {
      intro.remove();
      document.body.classList.remove("is-locked");
      document.body.classList.add("is-ready");
    } else {
      setTimeout(finish, 3000);
      intro.addEventListener("click", finish);
      document.addEventListener("keydown", finish, { once: true });
    }
  } else {
    document.body.classList.add("is-ready");
  }

  /* ---------- Menú móvil ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var header = document.querySelector(".site-header");
  if (toggle && header) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    header.querySelectorAll(".nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        header.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Cabecera al hacer scroll ---------- */
  var onScroll = function () {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Aparición suave al hacer scroll ---------- */
  var items = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Cuadros: si no existe la imagen, se muestra el lienzo abstracto ---------- */
  document.querySelectorAll(".artwork img").forEach(function (img) {
    var fail = function () { img.remove(); };
    if (img.complete && img.naturalWidth === 0) fail();
    else img.addEventListener("error", fail);
  });
})();
