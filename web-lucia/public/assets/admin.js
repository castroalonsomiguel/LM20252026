(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var base = (cfg.apiUrl || "").replace(/\/$/, "");
  var KEY = "lc-admin-token";
  var token = "";
  try { token = sessionStorage.getItem(KEY) || ""; } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var AREAS = { arquitectura: "Arquitectura", pintura: "Pintura", escenografia: "Escenografía", otro: "Otro" };

  function esc(text) {
    var d = document.createElement("div");
    d.textContent = text == null ? "" : String(text);
    return d.innerHTML;
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ Authorization: "Bearer " + token }, options.headers || {});
    return fetch(base + "/api" + path, options).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) { logout(); throw new Error("La sesión ha caducado. Vuelve a entrar."); }
        if (!res.ok) throw new Error(data.error || "Error " + res.status);
        return data;
      });
    });
  }

  function json(method, body) {
    return { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }

  function setStatus(el, text, kind) {
    el.textContent = text || "";
    el.className = "form-status" + (kind ? " is-" + kind : "");
  }

  function imgUrl(url) {
    return url && url.charAt(0) === "/" ? base + url : url;
  }

  function fecha(iso) {
    try {
      return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
    } catch (e) { return iso; }
  }

  // Botón de borrar con confirmación en dos pulsaciones (sin diálogos del navegador).
  function confirmButton(btn, action) {
    if (btn.classList.contains("confirm")) return action();
    btn.classList.add("confirm");
    btn.dataset.label = btn.textContent;
    btn.textContent = "¿Seguro? Pulsa otra vez";
    setTimeout(function () {
      btn.classList.remove("confirm");
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }, 3500);
  }

  /* ---------- Sesión ---------- */
  function showApp() {
    $("login").hidden = true;
    document.querySelector(".admin-tabs").hidden = false;
    showTab("mensajes");
  }

  function logout() {
    token = "";
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    $("login").hidden = false;
    $("tab-mensajes").hidden = true;
    $("tab-obras").hidden = true;
    document.querySelector(".admin-tabs").hidden = true;
  }

  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    token = $("token").value.trim();
    setStatus($("login-status"), "Comprobando…");
    api("/admin/comprobar").then(function () {
      try { sessionStorage.setItem(KEY, token); } catch (e) {}
      $("token").value = "";
      setStatus($("login-status"), "");
      showApp();
    }).catch(function (err) {
      setStatus($("login-status"), err instanceof TypeError ? "No se pudo conectar con el servidor." : "Clave incorrecta.", "error");
    });
  });

  $("logout").addEventListener("click", logout);

  /* ---------- Pestañas ---------- */
  function showTab(name) {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.tab === name);
    });
    $("tab-mensajes").hidden = name !== "mensajes";
    $("tab-obras").hidden = name !== "obras";
    if (name === "mensajes") cargarMensajes(); else cargarObras();
  }
  document.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.tab); });
  });

  /* ---------- Mensajes ---------- */
  var filtro = "";
  document.querySelectorAll("[data-filtro]").forEach(function (b) {
    b.addEventListener("click", function () {
      filtro = b.dataset.filtro;
      document.querySelectorAll("[data-filtro]").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      cargarMensajes();
    });
  });

  function cargarMensajes() {
    setStatus($("mensajes-status"), "Cargando…");
    api("/admin/mensajes" + (filtro ? "?leido=" + filtro : "")).then(function (data) {
      setStatus($("mensajes-status"), "");
      var badge = $("unread");
      badge.hidden = !data.sinLeer;
      badge.textContent = data.sinLeer;
      if (!data.mensajes.length) {
        $("mensajes").innerHTML = '<p class="empty">No hay mensajes.</p>';
        return;
      }
      $("mensajes").innerHTML = data.mensajes.map(function (m) {
        var asunto = encodeURIComponent("Re: tu mensaje en la web de Lucía Castro");
        return '<article class="msg' + (m.leido ? "" : " is-unread") + '" data-id="' + esc(m.id) + '">' +
          '<div class="msg-top"><strong>' + esc(m.nombre) + '</strong><span class="tag">' + esc(AREAS[m.area] || m.area) + "</span></div>" +
          '<div class="msg-meta"><a href="mailto:' + esc(m.email) + "?subject=" + asunto + '">' + esc(m.email) + "</a>" +
          (m.telefono ? '<a href="tel:' + esc(m.telefono) + '">' + esc(m.telefono) + "</a>" : "") +
          "<span>" + esc(fecha(m.createdAt)) + "</span></div>" +
          '<p class="msg-body">' + esc(m.mensaje) + "</p>" +
          '<div class="actions">' +
          '<a href="mailto:' + esc(m.email) + "?subject=" + asunto + '">Responder</a>' +
          '<button type="button" data-accion="leido">' + (m.leido ? "Marcar como no leído" : "Marcar como leído") + "</button>" +
          '<button type="button" class="danger" data-accion="borrar">Borrar</button>' +
          "</div></article>";
      }).join("");
      data.mensajes.forEach(function (m) {
        var card = document.querySelector('.msg[data-id="' + m.id + '"]');
        card.querySelector('[data-accion="leido"]').addEventListener("click", function () {
          api("/admin/mensajes/" + m.id, json("PATCH", { leido: !m.leido })).then(cargarMensajes)
            .catch(function (err) { setStatus($("mensajes-status"), err.message, "error"); });
        });
        var del = card.querySelector('[data-accion="borrar"]');
        del.addEventListener("click", function () {
          confirmButton(del, function () {
            api("/admin/mensajes/" + m.id, { method: "DELETE" }).then(cargarMensajes)
              .catch(function (err) { setStatus($("mensajes-status"), err.message, "error"); });
          });
        });
      });
    }).catch(function (err) {
      setStatus($("mensajes-status"), err.message, "error");
    });
  }

  /* ---------- Obras ---------- */
  var obras = [];
  var form = $("obra-form");
  var imagenActual = "";

  function abrirFormulario(obra) {
    obra = obra || {};
    form.hidden = false;
    $("obra-form-title").textContent = obra.id ? "Editar obra" : "Nueva obra";
    $("o-id").value = obra.id || "";
    $("o-titulo").value = obra.titulo || "";
    $("o-tecnica").value = obra.tecnica || "";
    $("o-medidas").value = obra.medidas || "";
    $("o-anio").value = obra.anio || "";
    $("o-descripcion").value = obra.descripcion || "";
    $("o-orden").value = obra.orden || 0;
    $("o-publicada").checked = obra.publicada !== false;
    $("o-disponible").checked = obra.disponible !== false;
    $("o-destacada").checked = !!obra.destacada;
    $("o-imagen").value = "";
    imagenActual = obra.imagen || "";
    var prev = $("o-preview");
    prev.hidden = !imagenActual;
    if (imagenActual) prev.src = imgUrl(imagenActual);
    setStatus($("obra-status"), "");
    $("o-titulo").focus();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("nueva-obra").addEventListener("click", function () { abrirFormulario(); });
  $("cancelar-obra").addEventListener("click", function () { form.hidden = true; });

  $("o-imagen").addEventListener("change", function () {
    var f = this.files[0];
    var prev = $("o-preview");
    if (f) { prev.src = URL.createObjectURL(f); prev.hidden = false; }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { setStatus($("obra-status"), "El título es obligatorio.", "error"); return; }
    var id = $("o-id").value;
    var file = $("o-imagen").files[0];
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    setStatus($("obra-status"), file ? "Subiendo imagen…" : "Guardando…");

    var subir = file
      ? (function () {
          var fd = new FormData();
          fd.append("imagen", file);
          return api("/admin/imagenes", { method: "POST", body: fd }).then(function (r) { return r.url; });
        })()
      : Promise.resolve(imagenActual);

    subir.then(function (url) {
      var anio = $("o-anio").value;
      var datos = {
        titulo: $("o-titulo").value,
        tecnica: $("o-tecnica").value,
        medidas: $("o-medidas").value,
        anio: anio ? Number(anio) : null,
        descripcion: $("o-descripcion").value,
        orden: Number($("o-orden").value) || 0,
        publicada: $("o-publicada").checked,
        disponible: $("o-disponible").checked,
        destacada: $("o-destacada").checked,
        imagen: url || ""
      };
      return id ? api("/admin/obras/" + id, json("PATCH", datos)) : api("/admin/obras", json("POST", datos));
    }).then(function () {
      form.hidden = true;
      setStatus($("obras-status"), "Obra guardada.", "ok");
      cargarObras();
    }).catch(function (err) {
      setStatus($("obra-status"), err.message, "error");
    }).then(function () {
      button.disabled = false;
    });
  });

  function cargarObras() {
    api("/admin/obras").then(function (lista) {
      obras = lista;
      if (!lista.length) {
        $("obras").innerHTML = '<p class="empty">Todavía no hay obras. Pulsa «Añadir obra» para subir la primera.</p>';
        return;
      }
      $("obras").innerHTML = lista.map(function (o) {
        var tags = [];
        if (o.destacada) tags.push("Destacada");
        if (!o.publicada) tags.push("Oculta");
        if (!o.disponible) tags.push("Vendida");
        return '<article class="obra" data-id="' + esc(o.id) + '">' +
          (o.imagen ? '<img class="obra-thumb" src="' + esc(imgUrl(o.imagen)) + '" alt="">' : '<div class="obra-thumb"></div>') +
          '<div class="obra-info"><strong>' + esc(o.titulo) + "</strong>" +
          '<span class="muted">' + esc([o.tecnica, o.medidas, o.anio].filter(Boolean).join(" · ")) + "</span>" +
          '<div class="tags">' + tags.map(function (t) { return '<span class="tag">' + t + "</span>"; }).join("") + "</div></div>" +
          '<div class="actions"><button type="button" data-accion="editar">Editar</button>' +
          '<button type="button" class="danger" data-accion="borrar">Borrar</button></div></article>';
      }).join("");
      lista.forEach(function (o) {
        var card = document.querySelector('.obra[data-id="' + o.id + '"]');
        card.querySelector('[data-accion="editar"]').addEventListener("click", function () { abrirFormulario(o); });
        var del = card.querySelector('[data-accion="borrar"]');
        del.addEventListener("click", function () {
          confirmButton(del, function () {
            api("/admin/obras/" + o.id, { method: "DELETE" }).then(function () {
              setStatus($("obras-status"), "Obra borrada.", "ok");
              cargarObras();
            }).catch(function (err) { setStatus($("obras-status"), err.message, "error"); });
          });
        });
      });
    }).catch(function (err) {
      setStatus($("obras-status"), err.message, "error");
    });
  }

  if (token) {
    api("/admin/comprobar").then(showApp).catch(logout);
  }
})();
