(() => {
  'use strict';

  window.__build = 'figures-line-1';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Неровная окружность для разомкнутого круга в hero
  function roughCircle(cx, cy, r, seed) {
    const pts = [];
    for (let a = 0; a <= 360; a += 3) {
      const t = (a * Math.PI) / 180;
      const rr = r + Math.sin(t * 3 + seed) * r * 0.006 + Math.sin(t * 7 + seed * 2) * r * 0.003;
      pts.push(`${(cx + rr * Math.cos(t)).toFixed(1)} ${(cy + rr * Math.sin(t)).toFixed(1)}`);
    }
    return 'M' + pts.join(' L');
  }

  /* ------------------------------------------------------------------
     Hero: имя, собранное из графитовой пыли (WebGL)

     Настоящий <h1> остаётся в разметке, но становится прозрачным.
     Canvas рисует имя тем же шрифтом в тех же координатах и собирает
     его из пыли. Курсор раздувает буквы, прокрутка уносит их ветром.
     ------------------------------------------------------------------ */
  const hero = document.querySelector('[data-hero]');

  function initHeroDust() {
    const title = hero.querySelector('.hero__title');
    const lines = title ? [...title.querySelectorAll('.hero__line')] : [];
    const canvas = document.createElement('canvas');
    canvas.className = 'hero__dust';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl || !lines.length) return false;

    const VERT = `
      attribute vec2 aTo; attribute vec2 aFrom; attribute vec3 aSeed;
      uniform vec2 uRes, uMouse;
      uniform float uIntro, uScatter, uTime, uPx, uMouseForce;
      varying float vA; varying float vAccent;
      void main() {
        float s = aSeed.x;
        float r2 = aSeed.y;
        float t = clamp(uIntro * 1.6 - s * 0.6, 0.0, 1.0);
        t = t * t * (3.0 - 2.0 * t);
        vec2 p = mix(aFrom, aTo, t);
        float sw = sin(3.14159 * t);
        p += sw * vec2(sin(r2 * 6.283 + uTime * 0.8) * 110.0, cos(s * 9.0 + uTime * 0.7) * 70.0);
        p += vec2(sin(uTime * 0.9 + s * 70.0), cos(uTime * 0.8 + r2 * 60.0)) * 0.7;

        vec2 d = p - uMouse;
        float dist = length(d);
        p += (d / max(dist, 1.0)) * uMouseForce * 42.0 * exp(-dist * dist / 9800.0);

        float k = clamp(uScatter * 1.7 - s * 0.7, 0.0, 1.0);
        k *= k;
        p += vec2(k * (180.0 + r2 * 640.0), -k * (40.0 + s * 300.0) + k * sin(r2 * 23.0 + uTime * 0.6) * 140.0);

        vA = (0.3 + 0.7 * t) * (1.0 - k) * (0.82 + 0.18 * r2);
        vAccent = aSeed.z;
        vec2 clip = p / uRes * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        gl_PointSize = uPx * (0.8 + r2 * 0.6) * (1.0 + sw * 0.9);
      }`;
    const FRAG = `
      precision mediump float;
      varying float vA; varying float vAccent;
      uniform vec3 uInk, uAccent;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float r = dot(q, q);
        if (r > 0.25) discard;
        gl_FragColor = vec4(mix(uInk, uAccent, vAccent), vA * smoothstep(0.25, 0.04, r));
      }`;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    const U = {};
    ['uRes', 'uMouse', 'uIntro', 'uScatter', 'uTime', 'uPx', 'uMouseForce', 'uInk', 'uAccent']
      .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    const A = {};
    ['aTo', 'aFrom', 'aSeed'].forEach((n) => { A[n] = gl.getAttribLocation(prog, n); });

    const css = getComputedStyle(document.documentElement);
    const hex = (v) => { const m = v.trim().replace('#', ''); return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255); };
    gl.uniform3fv(U.uInk, hex(css.getPropertyValue('--ink')));
    gl.uniform3fv(U.uAccent, hex(css.getPropertyValue('--accent-deep')));

    hero.insertBefore(canvas, hero.firstChild);
    hero.classList.add('has-dust');

    const bufTo = gl.createBuffer();
    const bufFrom = gl.createBuffer();
    const bufSeed = gl.createBuffer();
    let count = 0;
    let W = 1;
    let H = 1;

    // рисуем строки заголовка во вспомогательный canvas и собираем пиксели букв
    function sampleName() {
      const hr = hero.getBoundingClientRect();
      W = Math.max(1, Math.round(hr.width));
      H = Math.max(1, Math.round(hr.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uPx, (W < 900 ? 1.9 : 1.8) * dpr);

      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      const ctx = off.getContext('2d', { willReadFrequently: true });
      const perLine = [];

      lines.forEach((line) => {
        const st = getComputedStyle(line);
        ctx.clearRect(0, 0, W, H);
        ctx.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = st.letterSpacing;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#000';
        const text = line.textContent.trim();
        const m = ctx.measureText(text);
        const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
        const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
        const lr = line.getBoundingClientRect();
        const lineH = parseFloat(st.lineHeight) || parseFloat(st.fontSize);
        const top = lr.top - hr.top + parseFloat(st.paddingTop);
        const baseline = top + (lineH - (asc + desc)) / 2 + asc;
        const x = lr.left - hr.left + parseFloat(st.paddingLeft);
        ctx.fillText(text, x, baseline);

        const data = ctx.getImageData(0, 0, W, H).data;
        const px = [];
        for (let i = 3, n = 0; i < data.length; i += 4, n++) if (data[i] > 110) px.push(n);
        perLine.push({ px, accent: line.classList.contains('hero__line--indent') ? 1 : 0 });
      });

      const totalPx = perLine.reduce((a, l) => a + l.px.length, 0);
      if (!totalPx) return false;
      const N = Math.min(W < 900 ? 20000 : 36000, Math.round(totalPx * 1.05));
      const to = new Float32Array(N * 2);
      const from = new Float32Array(N * 2);
      const seed = new Float32Array(N * 3);
      let i = 0;
      perLine.forEach((l, li) => {
        const share = li === perLine.length - 1 ? N - i : Math.round((N * l.px.length) / totalPx);
        for (let k = 0; k < share && i < N; k++, i++) {
          const p = l.px[(Math.random() * l.px.length) | 0];
          to[i * 2] = (p % W) + Math.random();
          to[i * 2 + 1] = ((p / W) | 0) + Math.random();
          // пыль прилетает с разных сторон
          from[i * 2] = W * (Math.random() * 1.4 - 0.2);
          from[i * 2 + 1] = H * (0.2 + Math.random() * 1.0);
          seed[i * 3] = Math.random();
          seed[i * 3 + 1] = Math.random();
          seed[i * 3 + 2] = l.accent;
        }
      });
      count = i;

      [[bufTo, to, A.aTo, 2], [bufFrom, from, A.aFrom, 2], [bufSeed, seed, A.aSeed, 3]].forEach(([buf, arr, loc, size]) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      });
      return true;
    }

    let introStart = 0;
    let visible = true;
    let raf = null;
    const mouse = { x: -9999, y: -9999, f: 0, tf: 0 };
    let scatter = 0;
    const t0 = performance.now();

    function frameDust(now) {
      raf = null;
      if (!visible || !count) return;
      raf = requestAnimationFrame(frameDust);
      const intro = introStart ? clamp((now - introStart) / 2800) : 0;
      scatter = lerp(scatter, clamp(window.scrollY / (H * 0.8)), 0.1);
      mouse.f = lerp(mouse.f, mouse.tf, 0.08);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(U.uTime, (now - t0) / 1000);
      gl.uniform1f(U.uIntro, intro);
      gl.uniform1f(U.uScatter, scatter);
      gl.uniform2f(U.uMouse, mouse.x, mouse.y);
      gl.uniform1f(U.uMouseForce, mouse.f);
      gl.drawArrays(gl.POINTS, 0, count);
    }
    const startDust = () => { if (!raf && visible) raf = requestAnimationFrame(frameDust); };

    new IntersectionObserver(([e]) => { visible = e.isIntersecting; startDust(); }).observe(hero);

    if (finePointer) {
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        mouse.x = e.clientX - r.left;
        mouse.y = e.clientY - r.top;
        mouse.tf = 1;
      });
      hero.addEventListener('pointerleave', () => { mouse.tf = 0; });
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { sampleName(); startDust(); }, 200);
    });

    const giveUp = () => { hero.classList.remove('has-dust'); canvas.remove(); };

    // ждём шрифт, иначе буквы разойдутся с настоящим заголовком
    const fontsReady = Promise.race([
      Promise.all([
        document.fonts.load('300 100px "Spectral"'),
        document.fonts.load('italic 300 100px "Spectral"'),
      ]).then(() => document.fonts.ready),
      new Promise((res) => setTimeout(res, 2500)),
    ]);
    function bootDust(tries) {
      if (hero.getBoundingClientRect().width < 2) {
        if (tries < 40) { setTimeout(() => bootDust(tries + 1), 250); return; }
        giveUp();
        return;
      }
      try {
        if (!sampleName()) throw new Error('empty');
        introStart = performance.now() + 150;
        startDust();
      } catch (e) {
        giveUp();
      }
    }
    fontsReady.then(() => bootDust(0));

    return true;
  }

  let heroDust = false;
  if (hero && !reduceMotion && document.fonts) {
    try { heroDust = initHeroDust(); } catch (e) { heroDust = false; hero.classList.remove('has-dust'); }
  }

  /* ------------------------------------------------------------------
     Первый экран: появление по буквам и словам
     ------------------------------------------------------------------ */
  const splitBase = [0, 350, 650, 1150];

  document.querySelectorAll('[data-split]').forEach((el, n) => {
    // имя собирается из пыли — посимвольная анимация ему не нужна
    if (heroDust && el.closest('.hero__title')) return;
    const mode = el.dataset.split;
    const base = splitBase[n] ?? 0;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    el.textContent = '';

    let i = 0;
    text.split(' ').forEach((word, wi, words) => {
      const wordEl = document.createElement('span');
      wordEl.className = 'split-word';

      if (mode === 'chars') {
        [...word].forEach((ch) => {
          const c = document.createElement('span');
          c.className = 'split-unit';
          c.textContent = ch;
          c.style.setProperty('--i', i++);
          c.style.setProperty('--base', base + 'ms');
          wordEl.appendChild(c);
        });
      } else {
        wordEl.classList.add('split-unit');
        wordEl.textContent = word;
        wordEl.style.setProperty('--i', (i++ * 0.6).toFixed(2));
        wordEl.style.setProperty('--base', base + 'ms');
      }

      el.appendChild(wordEl);
      if (wi < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  });

  /* ------------------------------------------------------------------
     Заголовки секций: разбиваем на слова для «подъёма» при появлении
     ------------------------------------------------------------------ */
  document.querySelectorAll('[data-words]').forEach((title) => {
    let wi = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          // делим только по обычным пробелам — неразрывные остаются внутри слова
          child.textContent.split(/([ \n\t]+)/).forEach((part) => {
            if (!part) return;
            if (/^[ \n\t]+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const outer = document.createElement('span');
            const inner = document.createElement('span');
            outer.className = 'w';
            inner.textContent = part;
            inner.style.setProperty('--wi', wi++);
            outer.appendChild(inner);
            frag.appendChild(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    };
    walk(title);
  });

  /* ------------------------------------------------------------------
     Разомкнутый круг в hero: реагирует на курсор и прокрутку
     ------------------------------------------------------------------ */
  const gestalt = document.querySelector('[data-gestalt]');

  if (hero && gestalt) {
    gestalt.querySelectorAll('[data-r]').forEach((path, i) => path.setAttribute('d', roughCircle(200, 200, +path.dataset.r, i * 2.3 + 1)));
    const target = { x: 0, y: 0, arc: 0, arc2: 0 };
    const cur = { x: 0, y: 0, arc: 0, arc2: 0 };
    let raf = null;
    let introDone = reduceMotion;

    const scrollTarget = () => {
      const hp = clamp(window.scrollY / (window.innerHeight * 0.75));
      target.arc = introDone ? 74 + 26 * hp : 0;
      target.arc2 = introDone ? 56 + 44 * hp : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

    function tick() {
      raf = null;
      const k = reduceMotion ? 1 : 0.07;
      cur.x = lerp(cur.x, target.x, k);
      cur.y = lerp(cur.y, target.y, k);
      cur.arc = lerp(cur.arc, target.arc, reduceMotion ? 1 : 0.045);
      cur.arc2 = lerp(cur.arc2, target.arc2, reduceMotion ? 1 : 0.035);

      gestalt.style.setProperty('--gx', (cur.x * 36).toFixed(1) + 'px');
      gestalt.style.setProperty('--gy', (cur.y * 24).toFixed(1) + 'px');
      gestalt.style.setProperty('--arc', cur.arc.toFixed(2));
      gestalt.style.setProperty('--arc2', cur.arc2.toFixed(2));

      const moving =
        Math.abs(cur.x - target.x) > 0.001 || Math.abs(cur.y - target.y) > 0.001 ||
        Math.abs(cur.arc - target.arc) > 0.05 || Math.abs(cur.arc2 - target.arc2) > 0.05;
      if (moving) kick();
    }

    if (finePointer && !reduceMotion) {
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        target.x = (e.clientX - r.left) / r.width - 0.5;
        target.y = (e.clientY - r.top) / r.height - 0.5;
        kick();
      });
      hero.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; kick(); });
    }

    window.addEventListener('scroll', () => {
      if (window.scrollY < window.innerHeight * 1.2) { scrollTarget(); kick(); }
    }, { passive: true });

    setTimeout(() => { introDone = true; scrollTarget(); kick(); }, reduceMotion ? 0 : 1100);
    scrollTarget();
    kick();
  }

  /* ------------------------------------------------------------------
     Появление блоков при прокрутке
     ------------------------------------------------------------------ */
  document.querySelectorAll('.services__list, .timeline, .messengers, .reviews__list, .method__list').forEach((list) => {
    [...list.children].forEach((child, idx) => {
      if (child.classList.contains('reveal')) child.style.setProperty('--delay', idx * 0.1 + 's');
    });
  });

  const revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && !reduceMotion) {
    // прячем блоки только сейчас: если бы скрипт упал раньше, текст остался бы виден
    document.documentElement.classList.add('reveal-ready');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        // показываем и те элементы, которые «проскочили» при переходе по якорю
        const passed = entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !passed) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ------------------------------------------------------------------
     Фигуры из частиц: рисунок собирается из точек и расходится под курсором

     Пиксели рисунка читаются один раз. Если браузер это запрещает
     (страница открыта как файл), остаётся обычная картинка.
     ------------------------------------------------------------------ */
  function buildFigure(el) {
    const img = el.querySelector('img');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || !img) return;

    let dots = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let visible = false;
    let raf = null;
    let started = false;
    const mouse = { x: -999, y: -999, on: 0 };

    function sample() {
      const box = el.getBoundingClientRect();
      if (box.width < 10) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.round(box.width);
      h = Math.round(box.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const sw = Math.max(1, Math.round(img.naturalWidth * scale * 0.96));
      const sh = Math.max(1, Math.round(img.naturalHeight * scale * 0.96));
      const off = document.createElement('canvas');
      off.width = sw;
      off.height = sh;
      const octx = off.getContext('2d', { willReadFrequently: true });
      octx.drawImage(img, 0, 0, sw, sh);

      let px;
      try {
        px = octx.getImageData(0, 0, sw, sh).data;
      } catch (e) {
        return false;                        // file:// — пиксели читать нельзя
      }

      const lum = new Float32Array(sw * sh);
      for (let i = 0, n = 0; n < lum.length; i += 4, n++) {
        lum[n] = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
      }

      // локальная яркость: у рисунков пером берём штрих, а не фон
      const R = Math.max(2, Math.round(sh / 26));
      const integ = new Float64Array((sw + 1) * (sh + 1));
      for (let y = 0; y < sh; y++) {
        let row = 0;
        for (let x = 0; x < sw; x++) {
          row += lum[y * sw + x];
          integ[(y + 1) * (sw + 1) + x + 1] = integ[y * (sw + 1) + x + 1] + row;
        }
      }
      const meanAt = (x, y) => {
        const x0 = Math.max(0, x - R), x1 = Math.min(sw, x + R + 1);
        const y0 = Math.max(0, y - R), y1 = Math.min(sh, y + R + 1);
        const sum = integ[y1 * (sw + 1) + x1] - integ[y0 * (sw + 1) + x1] - integ[y1 * (sw + 1) + x0] + integ[y0 * (sw + 1) + x0];
        return sum / ((x1 - x0) * (y1 - y0));
      };

      // solid — сплошной силуэт, line — то, что темнее своей округи
      const mode = el.dataset.ink || 'line';
      // область, которую оставляем: многоугольник в долях от картинки
      const keep = (el.dataset.keep || '').trim().split(/\s+/).filter(Boolean)
        .map((pair) => pair.split(',').map(Number));
      const inside = (x, y) => {
        if (keep.length < 3) return true;
        const nx = x / sw;
        const ny = y / sh;
        let hit = false;
        for (let i = 0, j = keep.length - 1; i < keep.length; j = i++) {
          const [xi, yi] = keep[i];
          const [xj, yj] = keep[j];
          if ((yi > ny) !== (yj > ny) && nx < ((xj - xi) * (ny - yi)) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
      };

      const offX = (w - sw) / 2;
      const offY = (h - sh) / 2;

      // делим картинку на краску и фон по сглаженной яркости,
      // затем берём только границу пятна: контур фигуры и линии росписи.
      // Сплошная заливка на маленьком размере читалась бы как клякса.
      const blurR = Math.max(1, Math.round(sh / 120));
      const mask = new Uint8Array(sw * sh);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const x0 = Math.max(0, x - blurR), x1 = Math.min(sw, x + blurR + 1);
          const y0 = Math.max(0, y - blurR), y1 = Math.min(sh, y + blurR + 1);
          const sum = integ[y1 * (sw + 1) + x1] - integ[y0 * (sw + 1) + x1] - integ[y1 * (sw + 1) + x0] + integ[y0 * (sw + 1) + x0];
          mask[y * sw + x] = sum / ((x1 - x0) * (y1 - y0)) < 0.45 ? 1 : 0;
        }
      }

      const candidates = [];
      for (let y = 1; y < sh - 1; y++) {
        for (let x = 1; x < sw - 1; x++) {
          if (!inside(x, y)) continue;
          const i = y * sw + x;
          const m = mask[i];
          const border = m !== mask[i - 1] || m !== mask[i + 1] || m !== mask[i - sw] || m !== mask[i + sw];
          if (border) candidates.push([x + offX, y + offY, 1]);
          // внутренность силуэта тоже набираем точками, но реже и светлее —
          // так фигура читается целиком, а контур остаётся чётким
          else if (m && Math.random() < 0.05) candidates.push([x + offX, y + offY, 0.35]);
        }
      }
      if (candidates.length < 50) return false;

      // точки чаще садятся на плотные штрихи, а не на случайные пятна
      const cdf = new Float64Array(candidates.length);
      let acc = 0;
      for (let i = 0; i < candidates.length; i++) {
        acc += Math.pow(candidates[i][2], 1.6);
        cdf[i] = acc;
      }
      const pick = () => {
        const r = Math.random() * acc;
        let lo = 0, hi = cdf.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cdf[mid] < r) lo = mid + 1; else hi = mid;
        }
        return candidates[lo];
      };

      const want = Math.min(Math.max(5000, Math.round((w * h) / 14)), 12000);
      dots = [];
      for (let i = 0; i < want; i++) {
        const c = pick();
        dots.push({
          hx: c[0], hy: c[1], d: c[2],
          x: w / 2 + (Math.random() - 0.5) * w * 1.6,
          y: h / 2 + (Math.random() - 0.5) * h * 1.6,
          vx: 0, vy: 0,
          k: 0.012 + Math.random() * 0.02,
        });
      }
      el.classList.add('is-live');
      return true;
    }

    let painted = false;

    function render() {
      painted = true;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let moving = false;
      for (let i = 0; i < dots.length; i++) {
        const p = dots[i];
        // пружина к своему месту
        p.vx += (p.hx - p.x) * p.k;
        p.vy += (p.hy - p.y) * p.k;

        // курсор расталкивает точки
        if (mouse.on) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 7000) {
            const f = (1 - dist2 / 7000) * 2.6;
            const dist = Math.sqrt(dist2) || 1;
            p.vx += (dx / dist) * f;
            p.vy += (dy / dist) * f;
          }
        }

        p.vx *= 0.88;
        p.vy *= 0.88;
        p.x += p.vx;
        p.y += p.vy;
        if (Math.abs(p.vx) + Math.abs(p.vy) > 0.02) moving = true;

        ctx.fillStyle = `rgba(35, 33, 29, ${(0.2 + p.d * 0.55).toFixed(3)})`;
        ctx.fillRect(p.x, p.y, 1.3, 1.3);
      }

      return moving;
    }

    function frame() {
      raf = null;
      if (!visible) return;
      const moving = render();
      if (moving || mouse.on) raf = requestAnimationFrame(frame);
    }

    const start = () => { if (!raf && visible && dots.length) raf = requestAnimationFrame(frame); };

    // если браузер заморозил анимацию (вкладка в фоне, экономия энергии),
    // просто ставим точки по местам и рисуем один кадр
    function ensurePainted() {
      if (painted || !dots.length) return;
      dots.forEach((p) => { p.x = p.hx; p.y = p.hy; p.vx = 0; p.vy = 0; });
      render();
    }

    function init() {
      if (started || !sample()) return;
      started = true;
      el.insertBefore(canvas, el.firstChild);

      // видимость считаем сами: так анимация стартует в любом окружении
      const inView = () => {
        const r = el.getBoundingClientRect();
        return r.bottom > -120 && r.top < window.innerHeight + 120;
      };
      visible = inView();
      start();
      setTimeout(ensurePainted, 1600);
      window.addEventListener('scroll', () => {
        const now = inView();
        if (now !== visible) { visible = now; start(); }
      }, { passive: true });
      el.addEventListener('pointermove', (ev) => {
        const r = el.getBoundingClientRect();
        mouse.x = ev.clientX - r.left;
        mouse.y = ev.clientY - r.top;
        mouse.on = 1;
        start();
      });
      el.addEventListener('pointerleave', () => { mouse.on = 0; start(); });
      let t = null;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(() => { if (sample()) start(); }, 250);
      });
    }

    // ждём и загрузку картинки, и реальные размеры блока
    let tries = 0;
    function boot() {
      if (started) return;
      if (!(img.complete && img.naturalWidth) || el.getBoundingClientRect().width < 10) {
        if (tries++ < 40) setTimeout(boot, 250);
        return;
      }
      init();
    }
    if (img.complete && img.naturalWidth) boot();
    else img.addEventListener('load', boot, { once: true });
    setTimeout(boot, 600);
  }

  if (!reduceMotion) document.querySelectorAll('[data-figure]').forEach(buildFigure);

  /* ------------------------------------------------------------------
     Просмотр документов об образовании
     ------------------------------------------------------------------ */
  const lightbox = document.querySelector('[data-lightbox]');
  if (lightbox && typeof lightbox.showModal === 'function') {
    const lbImg = lightbox.querySelector('[data-lightbox-img]');
    const lbCaption = lightbox.querySelector('[data-lightbox-caption]');

    document.querySelectorAll('[data-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        lbImg.src = btn.dataset.doc;
        lbImg.alt = btn.dataset.docTitle || '';
        lbCaption.textContent = btn.dataset.docTitle || '';
        lightbox.showModal();
      });
    });

    lightbox.querySelector('[data-lightbox-close]').addEventListener('click', () => lightbox.close());
    // клик по затемнению — тоже закрывает
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
  } else {
    // старый браузер без <dialog>: просто открываем файл
    document.querySelectorAll('[data-doc]').forEach((btn) => {
      btn.addEventListener('click', () => window.open(btn.dataset.doc, '_blank', 'noopener'));
    });
  }

  /* ------------------------------------------------------------------
     Прокрутка: шапка, линия шагов, активный пункт меню
     ------------------------------------------------------------------ */
  const header = document.querySelector('[data-header]');
  const timeline = document.querySelector('[data-timeline]');
  const steps = timeline ? [...timeline.children] : [];
  let scrollTicking = false;

  function onScroll() {
    scrollTicking = false;
    header?.classList.toggle('is-scrolled', window.scrollY > 24);

    if (timeline) {
      const r = timeline.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.top > vh || r.bottom < 0) return;
      const start = vh * 0.85;
      const end = vh * 0.45;
      const total = r.height + (start - end);
      const p = clamp((start - r.top) / total);
      timeline.style.setProperty('--progress', reduceMotion ? 1 : p.toFixed(3));

      const horizontal = window.matchMedia('(min-width: 760px)').matches;
      steps.forEach((step, idx) => {
        const reached = horizontal
          ? p >= idx / steps.length + 0.02
          : step.getBoundingClientRect().top < start - (start - end) * 0.5;
        step.classList.toggle('is-reached', reached || reduceMotion);
      });
    }
  }

  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  const navLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (hero) sections.push(hero);

  if ('IntersectionObserver' in window) {
    const navIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = '#' + entry.target.id;
        navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => navIO.observe(s));
  }

  /* ------------------------------------------------------------------
     Мобильное меню
     ------------------------------------------------------------------ */
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');

  function closeNav() {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) nav.querySelector('a')?.focus({ preventScroll: true });
  });

  nav?.addEventListener('click', (e) => { if (e.target.closest('a')) closeNav(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') {
      closeNav();
      toggle.focus();
    }
  });

  /* ------------------------------------------------------------------
     Форма записи
     ------------------------------------------------------------------ */
  const form = document.querySelector('[data-form]');
  const status = document.querySelector('[data-form-status]');

  function setError(input, message) {
    const field = input.closest('.field');
    const err = document.getElementById(input.id + '-err');
    field.classList.toggle('is-invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    const described = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (err && !described.includes(err.id)) {
      input.setAttribute('aria-describedby', [...described, err.id].join(' '));
    }
    if (err) err.textContent = message || '';
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name;
    const contact = form.elements.contact;

    const nameMsg = name.value.trim() ? '' : 'Напишите, как к вам обращаться';
    const contactVal = contact.value.trim();
    const contactMsg = !contactVal
      ? 'Оставьте контакт для ответа'
      : contactVal.length < 4 ? 'Кажется, контакт указан не полностью' : '';

    setError(name, nameMsg);
    setError(contact, contactMsg);
    const firstInvalid = nameMsg ? name : contactMsg ? contact : null;
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Отправляю…';

    try {
      const action = form.getAttribute('action');
      if (action && action !== '#') {
        const res = await fetch(action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(res.statusText);
      } else {
        // обработчик ещё не подключён — имитируем отправку
        await new Promise((r) => setTimeout(r, 900));
      }
      form.reset();
      status.textContent = 'Спасибо. Я отвечу в течение дня.';
    } catch (err) {
      status.textContent = 'Не получилось отправить. Напишите, пожалуйста, в Telegram.';
    } finally {
      button.disabled = false;
    }
  });

  /* ------------------------------------------------------------------ */
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
