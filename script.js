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

  /* ---------- 3. Foto: vetro bombato (WebGL) ed effetto bolla al tocco ---------- */
  // Il bordo della foto rifrange come un vetro spesso: ingrandisce ciò che c'è appena dentro,
  // separa un filo i colori e prende un riflesso bianco dal lato della luce.
  // Quando la tocchi si schiaccia sotto il dito e al rilascio rimbalza come una bolla.
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
    uniform float press;
    uniform vec2 touch;
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
      float k = t * t * (1. + press * .6);
      vec2 dp = p - touch * res;
      float fall = exp(-dot(dp, dp) / (res.x * res.x * .07));
      vec2 q = p - dp * fall * press * .24;
      vec2 uv = (q - n * k * bev * .55) / res + .5;
      vec2 c = uv - .5;
      uv = .5 + c * (.955 + .09 * dot(c, c));
      vec2 ca = n * k * 2.4 / res;
      vec3 col = vec3(texture2D(img, uv - ca).r, texture2D(img, uv).g, texture2D(img, uv + ca).b);
      float lit = max(dot(n, light), 0.);
      float back = max(dot(n, -light), 0.);
      float s = shine * (1. + press * .35);
      col *= 1. - .2 * smoothstep(.15, 1., t) * (1. - lit);
      col += pow(lit, 3.) * smoothstep(.68, 1., t) * .85 * s;
      col += pow(lit, 1.5) * smoothstep(.93, 1., t) * .35 * s;
      col += pow(back, 3.) * smoothstep(.86, 1., t) * .14 * s;
      col += .04 * smoothstep(.2, 1., v.y) * s;
      col += fall * press * .06;
      gl_FragColor = vec4(col * a, a);
    }`;

  function initAvatar() {
    const box = document.querySelector('.avatar');
    if (!box) return;
    const canvas = box.querySelector('.avatar__gl');
    const photo = box.querySelector('.avatar__photo');

    // stato: luce (angolo, y verso l'alto), riflesso, molla della bolla, pressione del dito
    const S = {
      ang: -.6, target: 2.25, hoverAng: null, shine: reduceMotion ? .95 : .25, shineTarget: .95,
      sx: 1, sy: 1, vx: 0, vy: 0, tx: 1, ty: 1, pressed: false, press: 0, touchX: 0, touchY: 0,
    };
    if (reduceMotion) S.ang = S.target;
    let draw = () => {};
    let raf = 0;
    let last = 0;
    let visible = true;
    const delta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

    const tick = (t) => {
      raf = 0;
      const dt = last ? Math.min(.034, (t - last) / 1000) : .016;
      last = t;

      const goal = S.hoverAng !== null ? S.hoverAng : S.target;
      const da = delta(S.ang, goal);
      S.ang += da * (S.hoverAng !== null ? .14 : .05);
      S.shine += (S.shineTarget - S.shine) * .05;

      // molla smorzata: rimbalza un paio di volte e si ferma in circa mezzo secondo
      const K = 520;
      const C = 15;
      S.vx += (-K * (S.sx - S.tx) - C * S.vx) * dt;
      S.sx += S.vx * dt;
      S.vy += (-K * (S.sy - S.ty) - C * S.vy) * dt;
      S.sy += S.vy * dt;
      S.press += ((S.pressed ? 1 : 0) - S.press) * .2;

      const springing = S.pressed || S.press > .01
        || Math.abs(S.sx - S.tx) + Math.abs(S.sy - S.ty) + Math.abs(S.vx) + Math.abs(S.vy) > .002;
      if (!springing) { S.sx = S.tx; S.sy = S.ty; S.vx = 0; S.vy = 0; S.press = 0; }
      box.style.setProperty('--sx', S.sx.toFixed(4));
      box.style.setProperty('--sy', S.sy.toFixed(4));
      draw();

      const lighting = Math.abs(da) > .002 || Math.abs(S.shineTarget - S.shine) > .002;
      if ((springing || lighting) && visible && !document.hidden) {
        raf = requestAnimationFrame(tick);
      } else {
        last = 0;
        if (!springing) box.classList.remove('is-squishing');
      }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

    // --- effetto bolla (funziona anche senza WebGL: è una trasformazione CSS)
    if (!reduceMotion) {
      box.addEventListener('pointerdown', (e) => {
        const r = box.getBoundingClientRect();
        S.touchX = clamp((e.clientX - r.left) / r.width, 0, 1) - .5;
        S.touchY = .5 - clamp((e.clientY - r.top) / r.height, 0, 1);
        S.pressed = true;
        S.tx = .92;
        S.ty = .92;
        S.vx += 1.4;   // si allarga e si abbassa sotto il dito
        S.vy -= 1.4;
        box.classList.add('is-squishing');
        kick();
      });
      const release = () => {
        if (!S.pressed) return;
        S.pressed = false;
        S.tx = 1;
        S.ty = 1;
        S.vx -= 2.4;   // al rilascio si allunga e rimbalza
        S.vy += 2.4;
        kick();
      };
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => box.addEventListener(ev, release));
      box.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // --- su desktop la luce e l'inclinazione seguono il mouse
    if (finePointer && !reduceMotion) {
      let frame = 0;
      addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const r = box.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          S.hoverAng = Math.atan2(-dy, dx);
          box.style.setProperty('--ry', (clamp(dx / (innerWidth * .5), -1, 1) * 6).toFixed(2) + 'deg');
          box.style.setProperty('--rx', (-clamp(dy / (innerHeight * .5), -1, 1) * 6).toFixed(2) + 'deg');
          kick();
        });
      }, { passive: true });
      document.documentElement.addEventListener('mouseleave', () => {
        S.hoverAng = null;
        box.style.removeProperty('--rx');
        box.style.removeProperty('--ry');
        kick();
      });
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }).observe(box);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

    // --- vetro in WebGL (se il browser non lo permette resta la versione CSS)
    if (!canvas || !photo) return;
    let gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false }); } catch (_) { gl = null; }
    if (!gl) return;

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
    const U = {
      res: u('res'), rad: u('rad'), bev: u('bev'), light: u('light'),
      shine: u('shine'), press: u('press'), touch: u('touch'),
    };

    let ready = false;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(box.clientWidth * dpr);
      if (w && canvas.width !== w) { canvas.width = w; canvas.height = w; }
      return w;
    };

    draw = () => {
      const w = size();
      if (!w || !ready) return;
      gl.viewport(0, 0, w, w);
      gl.uniform2f(U.res, w, w);
      gl.uniform1f(U.rad, w * .225);
      gl.uniform1f(U.bev, w * .11);
      gl.uniform2f(U.light, Math.cos(S.ang), Math.sin(S.ang));
      gl.uniform1f(U.shine, S.shine);
      gl.uniform1f(U.press, S.press);
      gl.uniform2f(U.touch, S.touchX, S.touchY);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

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
      draw();
      box.classList.add('has-gl');
      setTimeout(kick, reduceMotion ? 0 : 650);   // il riflesso gira quando la foto è a fuoco
    };

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      ready = false;
      box.classList.remove('has-gl');
    });
    if ('ResizeObserver' in window) new ResizeObserver(() => { draw(); }).observe(box);

    if (photo.complete && photo.naturalWidth) start();
    else photo.addEventListener('load', start, { once: true });
  }
  initAvatar();

  /* ---------- 4. Card inclinabili e righe con alone (solo mouse) ---------- */
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
  // La card "vola" dalla sua posizione alla scheda (e ritorno): si animano solo posizione e scala,
  // che anche il telefono muove in modo fluido.
  const canFly = !reduceMotion && typeof Element.prototype.animate === 'function';
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const cardFor = (id) => document.querySelector(`.projects [data-project="${id}"]`);
  const clearHash = () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  };
  // loghi e scritte della scheda già decodificati: niente immagini che compaiono a metà animazione
  const decodeImages = (sheet) => Promise.all($$('img', sheet).map((img) => (img.decode ? img.decode().catch(() => {}) : null)));

  // porta visivamente `card` nel rettangolo `rect` (andata: da rect alla sua posizione; ritorno: il contrario)
  function fly(card, rect, back) {
    card.getAnimations().forEach((a) => a.cancel());
    const to = card.getBoundingClientRect();
    if (!rect || !rect.width || !to.width) return null;
    const at = `translate(${rect.left - to.left}px, ${rect.top - to.top}px) scale(${rect.width / to.width}, ${rect.height / to.height})`;
    const frames = [{ transform: at }, { transform: 'translate(0, 0) scale(1, 1)' }];
    card.style.transformOrigin = '0 0';
    const anim = card.animate(back ? frames.reverse() : frames, {
      duration: back ? 420 : 600,
      delay: back ? 60 : 0,   // al ritorno parte quando il testo della scheda è già sparito
      easing: EASE,
      fill: back ? 'forwards' : 'none',
    });
    if (!back) anim.finished.then(() => { card.style.transformOrigin = ''; }, () => {});
    return anim;
  }

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

    const fromRect = animate && canFly && from && big && inView(from) ? from.getBoundingClientRect() : null;
    sheet.classList.remove('is-closing');
    sheet.classList.toggle('pop', animate && !reduceMotion && !fromRect);   // senza card di partenza entra da sola
    sheet.showModal();
    sheet.scrollTop = 0;
    if (fromRect) {
      from.style.visibility = 'hidden';   // la card "parte" dalla griglia: niente doppione sotto
      fly(big, fromRect, false);
    }
    return true;
  }

  function closeSheet(sheet, { animate = true } = {}) {
    if (!sheet || !sheet.open || sheet.classList.contains('is-closing')) return;
    const to = cardFor(sheet.id);
    const big = sheet.querySelector('.pcard');
    const finish = () => {
      sheet.close();
      sheet.classList.remove('is-closing', 'pop');
      if (big) {
        big.getAnimations().forEach((a) => a.cancel());
        big.style.transformOrigin = '';
      }
      if (to) to.style.visibility = '';
    };
    if (!animate || reduceMotion) { finish(); return; }
    sheet.classList.add('is-closing');   // sfumano sfondo e testo, la card torna al suo posto
    if (canFly && to && big && inView(to)) {
      to.style.visibility = 'hidden';
      const anim = fly(big, to.getBoundingClientRect(), true);
      if (anim) { anim.finished.then(finish, finish); return; }
    }
    setTimeout(finish, 240);
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
      // chiusa in qualsiasi modo (anche Esc diretto): la card della griglia torna visibile
      const card = cardFor(sheet.id);
      if (card) card.style.visibility = '';
      sheet.classList.remove('is-closing', 'pop');
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
