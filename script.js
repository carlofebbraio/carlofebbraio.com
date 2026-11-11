/* =========================================================================
   CARLOFEBBRAIO.COM · interazioni (nessuna libreria esterna)
   ========================================================================= */
(() => {
  'use strict';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };

  /* ---------- 1. Il nome entra lettera per lettera ---------- */
  $$('[data-split]').forEach((el) => {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    let delay = Number(el.dataset.delay) || 180;
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    text.split(' ').forEach((word, i) => {
      if (i) { visual.append(' '); delay += 30; }
      const w = document.createElement('span');
      w.className = 'w';
      for (const ch of word) {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = ch;
        s.style.setProperty('--d', delay);
        delay += 30;
        w.append(s);
      }
      visual.append(w);
    });
    const label = document.createElement('span');
    label.className = 'sr-only';
    label.textContent = text;
    el.replaceChildren(label, visual);
    el.classList.add('is-split');
  });

  /* ---------- 2. Data di oggi nell'icona calendario, anno nel footer ---------- */
  const now = new Date();
  $$('[data-weekday]').forEach((el) => {
    el.textContent = now.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '').slice(0, 3).toUpperCase();
  });
  $$('[data-day]').forEach((el) => { el.textContent = String(now.getDate()); });
  $$('[data-year]').forEach((el) => { el.textContent = String(now.getFullYear()); });

  /* ---------- 3. Foto in vetro bombato (WebGL) ---------- */
  // Il bordo della foto rifrange come un vetro spesso: ingrandisce ciò che c'è appena dentro,
  // separa un filo i colori e prende un riflesso bianco dal lato della luce.
  // La luce segue il puntatore; su telefono gira piano da sola.
  const VERT = `
    attribute vec2 a;
    varying vec2 v;
    void main() { v = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }`;
  const FRAG = `
    precision highp float;
    varying vec2 v;
    uniform sampler2D img;
    uniform vec2 res;
    uniform float rad;
    uniform float bev;
    uniform vec2 light;
    uniform float shine;
    float box(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
    }
    void main() {
      vec2 hb = res * .5;
      vec2 p = (v - .5) * res;
      float d = box(p, hb, rad);
      float a = clamp(.5 - d, 0., 1.);
      if (a <= 0.) discard;
      vec2 e = vec2(1., 0.);
      vec2 n = vec2(box(p + e.xy, hb, rad) - box(p - e.xy, hb, rad),
                    box(p + e.yx, hb, rad) - box(p - e.yx, hb, rad));
      n = n / max(length(n), 1e-4);
      float t = clamp(1. + d / bev, 0., 1.);
      float k = t * t;
      vec2 uv = (p - n * k * bev * .55) / res + .5;
      vec2 c = uv - .5;
      uv = .5 + c * (.955 + .09 * dot(c, c));
      vec2 ca = n * k * 2.4 / res;
      vec3 col = vec3(texture2D(img, uv - ca).r, texture2D(img, uv).g, texture2D(img, uv + ca).b);
      float lit = max(dot(n, light), 0.);
      float back = max(dot(n, -light), 0.);
      col *= 1. - .2 * smoothstep(.15, 1., t) * (1. - lit);
      col += pow(lit, 3.) * smoothstep(.68, 1., t) * .85 * shine;
      col += pow(lit, 1.5) * smoothstep(.93, 1., t) * .35 * shine;
      col += pow(back, 3.) * smoothstep(.86, 1., t) * .14 * shine;
      col += .04 * smoothstep(.2, 1., v.y) * shine;
      gl_FragColor = vec4(col * a, a);
    }`;

  function initGlass() {
    const box = document.querySelector('.avatar');
    const canvas = box && box.querySelector('.avatar__gl');
    const photo = box && box.querySelector('.avatar__photo');
    if (!canvas || !photo) return;
    let gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false }); } catch (_) { gl = null; }
    if (!gl) return;   // resta la versione CSS

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (name) => gl.getUniformLocation(prog, name);
    const uRes = u('res'), uRad = u('rad'), uBev = u('bev'), uLight = u('light'), uShine = u('shine');

    let ready = false;
    // luce: angolo in radianti (y verso l'alto); parte da in basso a destra e sale in alto a sinistra
    let ang = -.6;
    let target = 2.25;
    let shine = 0;
    let shineTarget = .95;
    let hoverAng = null;
    let raf = 0;
    let visible = true;
    let last = 0;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(box.clientWidth * dpr);
      if (w && canvas.width !== w) { canvas.width = w; canvas.height = w; }
      return w;
    };

    const draw = () => {
      const w = size();
      if (!w || !ready) return;
      gl.viewport(0, 0, w, w);
      gl.uniform2f(uRes, w, w);
      gl.uniform1f(uRad, w * .225);
      gl.uniform1f(uBev, w * .11);
      gl.uniform2f(uLight, Math.cos(ang), Math.sin(ang));
      gl.uniform1f(uShine, shine);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // differenza tra due angoli, sempre lungo la via più corta
    const delta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

    const idle = !finePointer && !reduceMotion;   // telefono: la luce oscilla piano da sola
    const tick = (t) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (idle && t > 2800 && t - last < 33) { raf = requestAnimationFrame(tick); return; }   // ~30 fps a riposo
      last = t;
      let goal = hoverAng !== null ? hoverAng : target;
      if (idle && t > 2800) goal = 2.0 + Math.sin(t * .00045) * 1.1;
      const da = delta(ang, goal);
      ang += da * (hoverAng !== null ? .14 : .05);
      shine += (shineTarget - shine) * .05;
      draw();
      const moving = Math.abs(da) > .002 || Math.abs(shineTarget - shine) > .002 || idle;
      if (moving) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf && ready) raf = requestAnimationFrame(tick); };

    const start = () => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // aperta come file dal disco (file://) il browser blocca la foto in WebGL: resta la versione CSS
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo); } catch (_) { return; }
      const pow2 = (n) => (n & (n - 1)) === 0;
      if (pow2(photo.naturalWidth) && pow2(photo.naturalHeight)) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true;
      if (reduceMotion) { ang = target; shine = shineTarget; } else { shine = .25; }
      draw();
      box.classList.add('has-gl');
      setTimeout(kick, reduceMotion ? 0 : 650);   // il riflesso parte quando la foto è a fuoco
    };

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      ready = false;
      box.classList.remove('has-gl');
    });

    if (finePointer && !reduceMotion) {
      let frame = 0;
      addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const r = box.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          hoverAng = Math.atan2(-dy, dx);
          const x = clamp(dx / (innerWidth * .5), -1, 1);
          const y = clamp(dy / (innerHeight * .5), -1, 1);
          box.style.setProperty('--ry', (x * 6).toFixed(2) + 'deg');
          box.style.setProperty('--rx', (-y * 6).toFixed(2) + 'deg');
          kick();
        });
      }, { passive: true });
      document.documentElement.addEventListener('mouseleave', () => {
        hoverAng = null;
        box.style.removeProperty('--rx');
        box.style.removeProperty('--ry');
        kick();
      });
    }

    if ('ResizeObserver' in window) new ResizeObserver(() => { draw(); }).observe(box);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }).observe(box);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

    if (photo.complete && photo.naturalWidth) start();
    else photo.addEventListener('load', start, { once: true });
  }
  initGlass();

  /* ---------- 4. Card inclinabili e righe con alone ---------- */
  if (finePointer && !reduceMotion) {
    $$('[data-tilt]').forEach((el) => {
      const max = Number(el.dataset.tilt) || 6;
      let raf = 0;
      el.addEventListener('pointermove', (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const x = clamp((e.clientX - r.left) / r.width, 0, 1);
          const y = clamp((e.clientY - r.top) / r.height, 0, 1);
          el.classList.add('is-tilting');
          el.style.setProperty('--ry', ((x - .5) * 2 * max).toFixed(2) + 'deg');
          el.style.setProperty('--rx', ((.5 - y) * 2 * max).toFixed(2) + 'deg');
          el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
          el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        });
      });
      el.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        el.classList.remove('is-tilting');
        ['--rx', '--ry', '--gx', '--gy'].forEach((p) => el.style.removeProperty(p));
      });
    });

    $$('.row').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', Math.round(e.clientX - r.left) + 'px');
        el.style.setProperty('--my', Math.round(e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---------- 5. Carosello dei progetti (telefono) ---------- */
  const track = document.querySelector('[data-track]');
  const [prevBtn, nextBtn] = $$('[data-dir]');
  if (track && prevBtn && nextBtn) {
    const step = () => {
      const item = track.firstElementChild;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return item ? item.getBoundingClientRect().width + gap : track.clientWidth;
    };
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      prevBtn.disabled = track.scrollLeft <= 4;
      nextBtn.disabled = track.scrollLeft >= max - 4;
    };
    [prevBtn, nextBtn].forEach((btn) => btn.addEventListener('click', () => {
      track.scrollBy({ left: step() * Number(btn.dataset.dir), behavior: reduceMotion ? 'auto' : 'smooth' });
    }));
    track.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ---------- 6. Schede progetto ---------- */
  const sheets = $$('dialog.sheet');
  const canMorph = typeof document.startViewTransition === 'function' && !reduceMotion;
  const cardFor = (id) => document.querySelector(`.projects [data-project="${id}"]`);
  const clearHash = () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  };
  // loghi e scritte della scheda già decodificati: niente immagini che compaiono a metà animazione
  const decodeImages = (sheet) => Promise.all($$('img', sheet).map((img) => (img.decode ? img.decode().catch(() => {}) : null)));

  const opening = new Set();
  async function openSheet(id, { push = true, animate = true } = {}) {
    const sheet = document.getElementById(id);
    if (!(sheet instanceof HTMLElement) || sheet.tagName !== 'DIALOG' || typeof sheet.showModal !== 'function') return false;
    if (sheet.open || opening.has(id)) return true;
    opening.add(id);
    sheets.forEach((s) => { if (s.open) s.close(); });
    const from = cardFor(id);
    const big = sheet.querySelector('.pcard');
    if (push) history.pushState({ sheet: id }, '', '#' + id);
    await decodeImages(sheet);
    opening.delete(id);
    if (sheet.open) return true;

    const show = () => {
      sheet.showModal();
      sheet.scrollTop = 0;
    };

    if (animate && canMorph && from && big && inView(from)) {
      sheet.classList.remove('pop');
      from.style.viewTransitionName = 'project';
      const vt = document.startViewTransition(() => {
        from.style.viewTransitionName = '';
        big.style.viewTransitionName = 'project';
        show();
      });
      quiet(vt);
      vt.finished.finally(() => { big.style.viewTransitionName = ''; });
    } else {
      sheet.classList.toggle('pop', animate && !reduceMotion);
      show();
    }
    return true;
  }

  // una transizione interrotta da un'altra non è un errore: niente avvisi in console
  function quiet(vt) {
    vt.ready.catch(() => {});
    vt.updateCallbackDone.catch(() => {});
    vt.finished.catch(() => {});
  }

  function closeSheet(sheet, { animate = true } = {}) {
    if (!sheet || !sheet.open) return;
    const to = cardFor(sheet.id);
    const big = sheet.querySelector('.pcard');
    if (animate && canMorph && to && big && inView(to)) {
      big.style.viewTransitionName = 'project';
      const vt = document.startViewTransition(() => {
        big.style.viewTransitionName = '';
        to.style.viewTransitionName = 'project';
        sheet.close();
      });
      quiet(vt);
      vt.finished.finally(() => { to.style.viewTransitionName = ''; });
    } else if (animate && !reduceMotion) {
      sheet.classList.add('is-closing');
      setTimeout(() => {
        sheet.classList.remove('is-closing');
        sheet.close();
      }, 220);
    } else {
      sheet.close();
    }
  }

  // Chiusura da pulsante, Esc o clic fuori: passa dalla cronologia,
  // così anche il tasto "indietro" del telefono chiude la scheda.
  function requestClose(sheet) {
    if (history.state && history.state.sheet === sheet.id) history.back();
    else { closeSheet(sheet); clearHash(); }
  }

  sheets.forEach((sheet) => {
    sheet.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => requestClose(sheet)));
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet || e.target.classList.contains('sheet__inner')) requestClose(sheet);
    });
    sheet.addEventListener('cancel', (e) => {
      if (e.cancelable) { e.preventDefault(); requestClose(sheet); }
    });
    sheet.addEventListener('close', () => {
      if (history.state && history.state.sheet === sheet.id) history.back();
      else if (location.hash === '#' + sheet.id) clearHash();
    });
  });

  $$('.projects [data-project]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const id = card.dataset.project;
      if (!document.getElementById(id)) return;
      e.preventDefault();
      openSheet(id);
    });
  });

  addEventListener('popstate', () => {
    const id = location.hash.slice(1);
    const open = sheets.find((s) => s.open);
    if (open && open.id !== id) closeSheet(open);
    if (id && (!open || open.id !== id) && sheets.some((s) => s.id === id)) openSheet(id, { push: false });
  });

  const initial = location.hash.slice(1);
  if (initial && sheets.some((s) => s.id === initial)) openSheet(initial, { push: false, animate: false });

  /* ---------- 7. Statistiche dei click (si attivano solo se aggiungi uno strumento) ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (!el) return;
    const name = el.dataset.track;
    try {
      if (typeof window.plausible === 'function') window.plausible('Link', { props: { link: name } });
      if (window.umami && typeof window.umami.track === 'function') window.umami.track('link', { link: name });
      if (typeof window.gtag === 'function') window.gtag('event', 'click_link', { link_name: name });
    } catch (_) { /* nessuno strumento installato */ }
  });
})();
