(() => {
  "use strict";

  const STORE_KEY = "amigo-invisible:v1";
  const XOR_KEY = "amigo-invisible-shh";
  const $ = (s) => document.querySelector(s);

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------
  const blank = () => ({
    event: { name: "", budget: "", date: "", msg: "" },
    people: [],          // [{ id, name, wish }]
    exclusions: [],      // [[idA, idB]]  (simétricas)
    noMutual: false,
    draw: null,          // { assign: {giverId: recipientId}, at, sent: {id: true}, seen: {id: true} }
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(blank(), JSON.parse(raw));
    } catch (_) { /* storage bloqueado o JSON roto */ }
    return blank();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  const uid = () => Math.random().toString(36).slice(2, 9);
  const byId = (id) => state.people.find((p) => p.id === id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------------------------------------------------------------------------
  // Codificación de links (ofuscado, no es cifrado: evita spoilers accidentales)
  // ---------------------------------------------------------------------------
  function xor(bytes) {
    const k = new TextEncoder().encode(XOR_KEY);
    return bytes.map((b, i) => b ^ k[i % k.length]);
  }
  function encode(obj) {
    const bytes = xor(new TextEncoder().encode(JSON.stringify(obj)));
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(str) {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(xor(bytes)));
  }

  function payloadFor(giverId) {
    const g = byId(giverId);
    const r = byId(state.draw.assign[giverId]);
    const e = state.event;
    return { v: 1, g: g.name, r: r.name, w: r.wish || "", e: e.name, b: e.budget, d: e.date, m: e.msg };
  }
  function linkFor(giverId) {
    const base = location.href.split("#")[0];
    return `${base}#r=${encode(payloadFor(giverId))}`;
  }

  // ---------------------------------------------------------------------------
  // Sorteo
  // ---------------------------------------------------------------------------
  function rand(n) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function forbiddenSet() {
    const set = new Set();
    state.exclusions.forEach(([a, b]) => { set.add(a + ">" + b); set.add(b + ">" + a); });
    return set;
  }

  function valid(ids, perm, forb, noMutual) {
    const map = {};
    ids.forEach((id, i) => (map[id] = perm[i]));
    for (const g of ids) {
      const r = map[g];
      if (r === g || forb.has(g + ">" + r)) return null;
      if (noMutual && map[r] === g) return null;
    }
    return map;
  }

  /** Devuelve {giver: recipient} o null si es imposible con las restricciones. */
  function runDraw() {
    const ids = state.people.map((p) => p.id);
    const forb = forbiddenSet();
    const noMutual = state.noMutual;

    // 1) Muestreo por rechazo: uniforme entre todas las combinaciones válidas.
    for (let t = 0; t < 20000; t++) {
      const m = valid(ids, shuffle(ids), forb, noMutual);
      if (m) return m;
    }

    // 2) Backtracking exhaustivo (casos muy restringidos).
    const allowed = (g, r) => g !== r && !forb.has(g + ">" + r);
    const givers = shuffle(ids).sort(
      (a, b) => ids.filter((r) => allowed(a, r)).length - ids.filter((r) => allowed(b, r)).length
    );
    const assign = {}, used = new Set();
    let nodes = 0;
    const bt = (i) => {
      if (i === givers.length) return true;
      if (++nodes > 2e6) return false;
      const g = givers[i];
      for (const r of shuffle(ids)) {
        if (used.has(r) || !allowed(g, r)) continue;
        if (noMutual && assign[r] === g) continue;
        assign[g] = r; used.add(r);
        if (bt(i + 1)) return true;
        delete assign[g]; used.delete(r);
      }
      return false;
    };
    return bt(0) ? assign : null;
  }

  // ---------------------------------------------------------------------------
  // UI: utilidades
  // ---------------------------------------------------------------------------
  const COLORS = ["#c8342f", "#1f6b52", "#d08a2c", "#7a3e8e", "#2c6aa0", "#a34d6d", "#4f7a28", "#b4572c"];
  function avatar(name) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return `<span class="avatar" style="background:${COLORS[h % COLORS.length]}">${esc(initials)}</span>`;
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  }

  // Modal genérico. actions: [{label, cls, value}] → Promise con el value elegido.
  function modal(title, bodyHTML, actions) {
    return new Promise((resolve) => {
      const m = $("#modal");
      $("#modal-title").textContent = title;
      $("#modal-body").innerHTML = bodyHTML;
      const box = $("#modal-actions");
      box.innerHTML = "";
      const close = (v) => { m.hidden = true; document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") close(null); };
      actions.forEach((a) => {
        const b = document.createElement("button");
        b.className = "btn " + (a.cls || "");
        b.textContent = a.label;
        b.onclick = () => close(a.value);
        box.appendChild(b);
      });
      m.hidden = false;
      document.addEventListener("keydown", onKey);
      (box.querySelector(".btn-primary") || box.lastChild).focus();
    });
  }
  const confirmBox = (title, body, ok = "Dale", cls = "btn-primary") =>
    modal(title, `<p>${body}</p>`, [{ label: "Cancelar", value: false }, { label: ok, cls, value: true }]);

  // Si ya hay sorteo y se cambia algo que lo afecta, hay que avisar.
  async function guardDraw() {
    if (!state.draw) return true;
    const ok = await confirmBox(
      "Ya sortearon",
      "Si cambiás participantes o restricciones, el sorteo actual se borra y hay que volver a mandar los links. ¿Seguimos?",
      "Sí, borrar sorteo", "btn-primary"
    );
    if (ok) { state.draw = null; save(); renderDraw(); }
    return ok;
  }

  // ---------------------------------------------------------------------------
  // Render organizador
  // ---------------------------------------------------------------------------
  function renderEvent() {
    $("#ev-name").value = state.event.name;
    $("#ev-budget").value = state.event.budget;
    $("#ev-date").value = state.event.date;
    $("#ev-msg").value = state.event.msg;
  }

  function renderPeople() {
    const list = $("#people-list");
    list.innerHTML = state.people.map((p) => `
      <li class="person" data-id="${p.id}">
        ${avatar(p.name)}
        <div class="person-main">
          <div class="person-name">${esc(p.name)}</div>
          <input class="person-wish" type="text" maxlength="80" value="${esc(p.wish || "")}"
                 placeholder="+ Pista de regalo (opcional)" aria-label="Pista de regalo para ${esc(p.name)}">
        </div>
        <button class="icon-btn" data-del="${p.id}" aria-label="Sacar a ${esc(p.name)}" title="Sacar">✕</button>
      </li>`).join("");
    $("#people-count").textContent = state.people.length;
    $("#people-empty").hidden = state.people.length > 0;
    renderRules();
    renderDraw();
  }

  function renderRules() {
    const opts = state.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    const empty = `<option value="">—</option>`;
    $("#ex-a").innerHTML = empty + opts;
    $("#ex-b").innerHTML = empty + opts;
    $("#ex-list").innerHTML = state.exclusions.map(([a, b], i) => `
      <li class="chip">${esc(byId(a).name)} <span aria-hidden="true">↮</span> ${esc(byId(b).name)}
        <button data-ex="${i}" aria-label="Quitar restricción">×</button></li>`).join("");
    $("#no-mutual").checked = state.noMutual;
  }

  function renderDraw() {
    const has = !!state.draw;
    $("#pre-draw").hidden = has;
    $("#post-draw").hidden = !has;

    const n = state.people.length;
    const btn = $("#do-draw");
    btn.disabled = n < 3;
    $("#draw-status").textContent = n < 3
      ? `Faltan ${3 - n} participante${3 - n === 1 ? "" : "s"} para poder sortear.`
      : `${n} participantes listos. Cuando estén todos, dale.`;

    if (!has) return;
    const d = new Date(state.draw.at);
    $("#draw-meta").textContent = `${n} participantes · ${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
    $("#file-warn").hidden = location.protocol !== "file:";

    const sent = state.draw.sent || {};
    $("#links-list").innerHTML = state.people.map((p) => `
      <li class="link-row">
        ${avatar(p.name)}
        <span class="person-name">${esc(p.name)} ${sent[p.id] ? '<span class="sent">✓ enviado</span>' : ""}</span>
        <span class="link-actions">
          <button class="btn btn-sm" data-copy="${p.id}">Copiar link</button>
          <button class="btn btn-sm btn-wa" data-wa="${p.id}">WhatsApp</button>
        </span>
      </li>`).join("");

    const seen = state.draw.seen || {};
    $("#phone-grid").innerHTML = state.people.map((p) => `
      <button class="phone-btn ${seen[p.id] ? "seen" : ""}" data-phone="${p.id}">
        ${avatar(p.name)}
        <span>${esc(p.name)}</span>
        <small>${seen[p.id] ? "Ya lo vio" : "Tocá para ver"}</small>
      </button>`).join("");
  }

  // ---------------------------------------------------------------------------
  // Eventos organizador
  // ---------------------------------------------------------------------------
  function bindOrganizer() {
    // Evento
    [["#ev-name", "name"], ["#ev-budget", "budget"], ["#ev-date", "date"], ["#ev-msg", "msg"]].forEach(([sel, key]) => {
      $(sel).addEventListener("input", (e) => { state.event[key] = e.target.value; save(); });
    });

    // Agregar personas (soporta pegar varias)
    $("#add-person").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#person-name");
      const names = input.value.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
      if (!names.length) return;
      if (!(await guardDraw())) return;
      const existing = new Set(state.people.map((p) => p.name.toLowerCase()));
      const dupes = [];
      names.forEach((name) => {
        if (existing.has(name.toLowerCase())) { dupes.push(name); return; }
        existing.add(name.toLowerCase());
        state.people.push({ id: uid(), name, wish: "" });
      });
      if (dupes.length) toast(`Ya estaba${dupes.length > 1 ? "n" : ""}: ${dupes.join(", ")}. Usá apellido o apodo.`);
      input.value = "";
      input.focus();
      save(); renderPeople();
    });
    $("#person-name").addEventListener("paste", (e) => {
      const text = (e.clipboardData || window.clipboardData).getData("text");
      if (/[\n,;]/.test(text)) {
        e.preventDefault();
        $("#person-name").value = text;
        $("#add-person").requestSubmit();
      }
    });

    // Lista de personas: borrar / pista
    $("#people-list").addEventListener("click", async (e) => {
      const id = e.target.closest("[data-del]")?.dataset.del;
      if (!id) return;
      if (!(await guardDraw())) return;
      state.people = state.people.filter((p) => p.id !== id);
      state.exclusions = state.exclusions.filter(([a, b]) => a !== id && b !== id);
      save(); renderPeople();
    });
    $("#people-list").addEventListener("change", (e) => {
      if (!e.target.classList.contains("person-wish")) return;
      const p = byId(e.target.closest(".person").dataset.id);
      p.wish = e.target.value.trim();
      save();
      if (state.draw) toast("Pista guardada. Los links ya se actualizaron.");
    });

    // Restricciones
    $("#add-ex").addEventListener("click", async () => {
      const a = $("#ex-a").value, b = $("#ex-b").value;
      if (!a || !b) return toast("Elegí dos personas.");
      if (a === b) return toast("Tienen que ser dos personas distintas.");
      if (state.exclusions.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return toast("Esa ya está.");
      if (!(await guardDraw())) return;
      state.exclusions.push([a, b]);
      save(); renderRules();
    });
    $("#ex-list").addEventListener("click", async (e) => {
      const i = e.target.closest("[data-ex]")?.dataset.ex;
      if (i == null) return;
      if (!(await guardDraw())) return;
      state.exclusions.splice(+i, 1);
      save(); renderRules();
    });
    $("#no-mutual").addEventListener("change", async (e) => {
      const v = e.target.checked;
      if (!(await guardDraw())) { e.target.checked = !v; return; }
      state.noMutual = v; save();
    });

    // Sortear
    const doDraw = () => {
      const assign = runDraw();
      if (!assign) {
        modal("No hay forma 😬", "<p>Con estas restricciones no existe ningún sorteo posible. Sacá alguna restricción o destildá lo de “mutuamente”.</p>",
          [{ label: "Entendido", cls: "btn-primary", value: true }]);
        return false;
      }
      state.draw = { assign, at: Date.now(), sent: {}, seen: {} };
      save(); renderDraw();
      confetti();
      return true;
    };
    $("#do-draw").addEventListener("click", () => {
      if (doDraw()) $("#step-draw").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("#redo-draw").addEventListener("click", async () => {
      if (await confirmBox("¿Volver a sortear?", "Los links que ya mandaste dejan de valer (van a mostrar el resultado viejo). Vas a tener que mandar todos de nuevo.", "Sí, re-sortear")) doDraw();
    });
    $("#reset-all").addEventListener("click", async () => {
      if (await confirmBox("¿Borrar todo?", "Se borran el evento, los participantes, las restricciones y el sorteo.", "Borrar todo")) {
        state = blank(); save(); renderEvent(); renderPeople();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    $("#spoil").addEventListener("click", async () => {
      const ok = await confirmBox("¿Seguro?", "Vas a ver a quién le toca a cada uno. Se pierde la gracia si participás vos también.", "Ver igual");
      if (!ok) return;
      const rows = state.people.map((p) => `<li><span>${esc(p.name)}</span><span>→ ${esc(byId(state.draw.assign[p.id]).name)}</span></li>`).join("");
      modal("Resultado completo", `<ul class="spoil-list">${rows}</ul>`, [{ label: "Cerrar", cls: "btn-primary", value: true }]);
    });

    // Tabs
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => { x.classList.toggle("active", x === t); x.setAttribute("aria-selected", x === t); });
      $("#tab-links").hidden = t.dataset.tab !== "links";
      $("#tab-phone").hidden = t.dataset.tab !== "phone";
    }));

    // Links
    $("#links-list").addEventListener("click", async (e) => {
      const copyId = e.target.closest("[data-copy]")?.dataset.copy;
      const waId = e.target.closest("[data-wa]")?.dataset.wa;
      const id = copyId || waId;
      if (!id) return;
      const p = byId(id);
      const url = linkFor(id);
      const ev = state.event.name ? ` de *${state.event.name}*` : "";
      const text = `🎁 ¡Hola ${p.name}! Ya salió el sorteo del Amigo Invisible${ev}.\nAbrí tu link secreto (es solo para vos, no lo compartas):\n${url}`;
      if (copyId) {
        try { await navigator.clipboard.writeText(text); toast(`Copiado el mensaje para ${p.name}`); }
        catch (_) { prompt("Copiá este mensaje:", text); }
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      }
      state.draw.sent[id] = true; save(); renderDraw();
    });

    // Pasar el celu
    $("#phone-grid").addEventListener("click", async (e) => {
      const id = e.target.closest("[data-phone]")?.dataset.phone;
      if (!id) return;
      const p = byId(id);
      const again = state.draw.seen[id];
      const ok = await modal(
        `¿Sos ${p.name}?`,
        `<p>${again ? "⚠️ Este resultado ya se miró una vez. " : ""}Fijate que nadie esté espiando la pantalla.</p>`,
        [{ label: "No soy yo", value: false }, { label: "Sí, soy yo", cls: "btn-primary", value: true }]
      );
      if (!ok) return;
      await phoneReveal(payloadFor(id));
      state.draw.seen[id] = true; save(); renderDraw();
    });
  }

  function phoneReveal(data) {
    return new Promise((resolve) => {
      const m = $("#modal");
      $("#modal-title").textContent = `Hola, ${data.g}`;
      $("#modal-body").innerHTML = `
        <p class="reveal-sub">Tocá el regalo.</p>
        <button class="gift" id="m-gift" type="button" aria-label="Abrir el regalo">
          <span class="gift-lid"></span><span class="gift-box"></span><span class="gift-ribbon"></span>
        </button>
        <div id="m-result" hidden>${resultHTML(data)}</div>`;
      const actions = $("#modal-actions");
      actions.innerHTML = "";
      m.hidden = false;
      const gift = $("#m-gift");
      gift.focus();
      gift.onclick = () => {
        openGift(gift, () => {
          $("#m-result").hidden = false;
          const b = document.createElement("button");
          b.className = "btn btn-primary";
          b.textContent = "Listo, ocultar y pasar el celu";
          b.onclick = () => { m.hidden = true; $("#modal-body").innerHTML = ""; resolve(); };
          actions.appendChild(b);
          b.focus();
        });
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Revelación (compartida)
  // ---------------------------------------------------------------------------
  function resultHTML(d) {
    const info = [];
    if (d.b) info.push(`<div><dt>Presupuesto</dt><dd>${esc(d.b)}</dd></div>`);
    if (d.d) info.push(`<div><dt>Fecha</dt><dd>${esc(fmtDate(d.d))}</dd></div>`);
    return `
      <p class="result-label">Te tocó regalarle a</p>
      <p class="result-name">${esc(d.r)}</p>
      ${d.w ? `<p class="result-wish">💡 Pista: ${esc(d.w)}</p>` : ""}
      ${info.length ? `<dl class="result-info">${info.join("")}</dl>` : ""}
      ${d.m ? `<p class="result-msg">“${esc(d.m)}”</p>` : ""}
      <p class="secret">🤫 Shh… que no se entere nadie.</p>`;
  }

  function openGift(gift, done) {
    if (gift.classList.contains("open")) return;
    gift.classList.add("open");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => { gift.classList.add("gone"); done(); confetti(); }, reduce ? 0 : 650);
  }

  function showReveal(code) {
    $("#organizer").hidden = true;
    $("#reveal").hidden = false;
    let d;
    try {
      d = decode(code);
      if (!d || !d.g || !d.r) throw new Error("payload");
    } catch (_) {
      document.querySelector(".reveal-card").hidden = true;
      $("#rv-error").hidden = false;
      return;
    }
    document.title = `Amigo Invisible · ${d.g}`;
    $("#rv-event").textContent = d.e || "Amigo Invisible";
    $("#rv-giver").textContent = d.g;
    const result = $("#rv-result");
    const gift = $("#gift");
    gift.onclick = () => openGift(gift, () => {
      $("#rv-sub").hidden = true;
      result.innerHTML = resultHTML(d) + `<button class="btn btn-primary" id="rv-done" type="button">Listo, ocultar</button>`;
      result.hidden = false;
      $("#rv-done").onclick = () => {
        result.hidden = true;
        gift.classList.remove("open", "gone");
        $("#rv-sub").hidden = false;
        $("#rv-sub").textContent = "Oculto. Tocá el regalo si lo querés ver de nuevo.";
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Efectos: nieve + confeti
  // ---------------------------------------------------------------------------
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function snow() {
    if (reduceMotion) return;
    const c = $("#snow"), ctx = c.getContext("2d");
    let w, h, flakes;
    const resize = () => {
      w = c.width = innerWidth * devicePixelRatio;
      h = c.height = innerHeight * devicePixelRatio;
      flakes = Array.from({ length: Math.min(90, Math.floor(innerWidth / 12)) }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: (Math.random() * 2 + 0.8) * devicePixelRatio,
        s: (Math.random() * 0.6 + 0.3) * devicePixelRatio,
        d: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    addEventListener("resize", resize);
    (function tick() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      for (const f of flakes) {
        f.y += f.s; f.d += 0.01; f.x += Math.sin(f.d) * 0.4;
        if (f.y > h) { f.y = -5; f.x = Math.random() * w; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(tick);
    })();
  }

  let confettiRunning = false;
  function confetti() {
    if (reduceMotion || confettiRunning) return;
    confettiRunning = true;
    const c = $("#confetti"), ctx = c.getContext("2d");
    const dpr = devicePixelRatio;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const cols = ["#c8342f", "#e0b15a", "#1f6b52", "#ffffff", "#f08a5d"];
    const parts = Array.from({ length: 160 }, () => ({
      x: c.width / 2, y: c.height * 0.45,
      vx: (Math.random() - 0.5) * 18 * dpr, vy: (Math.random() * -16 - 4) * dpr,
      w: (Math.random() * 6 + 4) * dpr, h: (Math.random() * 10 + 6) * dpr,
      a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
      c: cols[Math.floor(Math.random() * cols.length)],
    }));
    const start = performance.now();
    (function tick(now) {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.vy += 0.45 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (now - start < 2600) requestAnimationFrame(tick);
      else { ctx.clearRect(0, 0, c.width, c.height); confettiRunning = false; }
    })(start);
  }

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------
  function route() {
    const m = location.hash.match(/^#r=(.+)$/);
    if (m) return showReveal(m[1]);
    $("#reveal").hidden = true;
    $("#organizer").hidden = false;
    renderEvent();
    renderPeople();
  }

  bindOrganizer();
  snow();
  route();
  addEventListener("hashchange", () => location.reload());

  // Expuesto para tests
  window.__amigo = { runDraw, encode, decode, get state() { return state; } };
})();
