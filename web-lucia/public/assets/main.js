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

/* ==========================================================
   Conexión con el servidor (API + MongoDB)
   ========================================================== */
(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var base = (cfg.apiUrl || "").replace(/\/$/, "");
  var online = location.protocol === "http:" || location.protocol === "https:";

  function api(path, options) {
    return fetch(base + "/api" + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "Error " + res.status);
        return data;
      });
    });
  }

  function absUrl(url) {
    return url && url.charAt(0) === "/" ? base + url : url;
  }

  function esc(text) {
    var d = document.createElement("div");
    d.textContent = text == null ? "" : String(text);
    return d.innerHTML;
  }

  function meta(obra) {
    return [obra.tecnica, obra.medidas, obra.anio].filter(Boolean).join(" · ");
  }

  /* ---------- Formulario de contacto ---------- */
  var form = document.getElementById("contact-form");
  if (form) {
    var status = form.querySelector(".form-status");
    var button = form.querySelector("button[type=submit]");
    var area = form.elements.area;
    var b = document.body.classList;
    var areaInicial = b.contains("theme-pin") ? "pintura" : b.contains("theme-esc") ? "escenografia" : "arquitectura";
    area.value = areaInicial;

    var setStatus = function (text, kind) {
      status.textContent = text;
      status.className = "form-status" + (kind ? " is-" + kind : "");
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        var first = form.querySelector(":invalid");
        setStatus(first && first.id === "cf-privacidad"
          ? "Acepta el uso de tus datos para poder enviar el mensaje."
          : "Revisa los campos marcados: faltan datos o no son válidos.", "error");
        form.classList.add("was-validated");
        if (first) first.focus();
        return;
      }
      var payload = {
        nombre: form.elements.nombre.value,
        email: form.elements.email.value,
        telefono: form.elements.telefono.value,
        area: form.elements.area.value,
        mensaje: form.elements.mensaje.value,
        web: form.elements.web.value,
        privacidad: form.elements.privacidad.checked,
        pagina: location.pathname
      };
      button.disabled = true;
      setStatus("Enviando…");
      api("/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function () {
        form.reset();
        area.value = areaInicial;
        form.classList.remove("was-validated");
        setStatus("Mensaje enviado. ¡Gracias! Te responderé lo antes posible.", "ok");
      }).catch(function (err) {
        var msg = err instanceof TypeError ? "No se pudo conectar con el servidor." : err.message;
        setStatus(msg + " También puedes escribirme a " + cfg.email + ".", "error");
      }).then(function () {
        button.disabled = false;
      });
    });
  }

  /* ---------- Obras desde la base de datos ---------- */
  var gallery = document.querySelector("[data-obras]");
  var featured = document.querySelector("[data-obra-destacada]");
  if ((gallery || featured) && (online || base)) {
    api("/obras").then(function (obras) {
      if (!Array.isArray(obras) || !obras.length) return;

      if (featured) {
        var d = obras.filter(function (o) { return o.destacada; })[0] || obras[0];
        featured.innerHTML = artwork(d, 1, false);
      }
      if (gallery) {
        var lista = obras.filter(function (o) { return !o.destacada; });
        if (!lista.length) lista = obras;
        gallery.innerHTML = lista.map(function (o, i) {
          return '<div class="item reveal is-visible">' + artwork(o, (i % 6) + 1, true) + "</div>";
        }).join("");
      }
      document.querySelectorAll(".artwork img").forEach(function (img) {
        img.addEventListener("error", function () { img.remove(); });
      });
    }).catch(function () { /* sin servidor: se mantiene la galería de ejemplo */ });
  }

  function artwork(o, n, lazy) {
    var img = o.imagen
      ? '<img src="' + esc(absUrl(o.imagen)) + '" alt="' + esc(o.titulo) + ' — obra de Lucía Castro"' + (lazy ? ' loading="lazy"' : "") + ">"
      : "";
    var estado = o.disponible ? "" : ' <span class="sold">Vendida</span>';
    return '<figure class="artwork"><div class="artwork-canvas"><div class="abstract abstract--' + n + '"></div>' + img +
      "</div></figure>" +
      '<div class="art-caption"><em>' + esc(o.titulo) + "</em><span>" + esc(meta(o)) + estado + "</span></div>";
  }
})();
