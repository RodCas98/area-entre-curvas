(function () {
  'use strict';
  const M = window.AreaMath;
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
  let uid = 0;

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function niceStep(span) {
    const raw = span / 8, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  const fmtTick = v => String(parseFloat(v.toFixed(6)));
  const clamp = v => Math.max(-1e5, Math.min(1e5, v));

  /**
   * Dibuja un plano cartesiano con curvas, regiones sombreadas y rectángulos.
   * o.curves:  [{fn, v:'x'|'y', color}]   (v='y' dibuja x = fn(y))
   * o.regions: [{up, lo, a, b, v, color}] (para v='x': up/lo son y; para v='y': derecha/izquierda)
   * o.rects:   [{x0, x1, top, bottom}]
   */
  function makePlot(host, o) {
    const W = 640, H = 400, m = { l: 38, r: 14, t: 12, b: 26 };
    const [x0, x1] = o.xr, [y0, y1] = o.yr;
    const sx = x => m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r);
    const sy = y => H - m.b - (y - y0) / (y1 - y0) * (H - m.t - m.b);
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'plot', role: 'img', 'aria-label': o.alt || 'Gráfica de las curvas y la región' });
    const clipId = 'clip' + (++uid);
    const cp = el('clipPath', { id: clipId }, el('defs', {}, svg));
    el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, cp);

    // cuadrícula y marcas
    const stx = niceStep(x1 - x0), sty = niceStep(y1 - y0);
    for (let v = Math.ceil(x0 / stx) * stx; v <= x1 + 1e-9; v += stx) {
      el('line', { class: 'gridline', x1: sx(v), x2: sx(v), y1: m.t, y2: H - m.b }, svg);
      const t = el('text', { class: 'tick', x: sx(v), y: H - m.b + 15, 'text-anchor': 'middle' }, svg);
      t.textContent = fmtTick(v);
    }
    for (let v = Math.ceil(y0 / sty) * sty; v <= y1 + 1e-9; v += sty) {
      el('line', { class: 'gridline', x1: m.l, x2: W - m.r, y1: sy(v), y2: sy(v) }, svg);
      const t = el('text', { class: 'tick', x: m.l - 5, y: sy(v) + 4, 'text-anchor': 'end' }, svg);
      t.textContent = fmtTick(v);
    }
    if (y0 < 0 && y1 > 0) el('line', { class: 'axis', x1: m.l, x2: W - m.r, y1: sy(0), y2: sy(0) }, svg);
    if (x0 < 0 && x1 > 0) el('line', { class: 'axis', x1: sx(0), x2: sx(0), y1: m.t, y2: H - m.b }, svg);
    el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'none', stroke: 'var(--border)' }, svg);

    const g = el('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
    const pt = (v, t, u) => (v === 'y' ? [sx(u), sy(t)] : [sx(t), sy(u)]);
    const poly = pts => 'M' + pts.map(p => clamp(p[0]).toFixed(1) + ',' + clamp(p[1]).toFixed(1)).join('L') + 'Z';

    (o.regions || []).forEach((r, i) => {
      const N = 260, up = [], lo = [];
      for (let k = 0; k <= N; k++) {
        const t = r.a + (r.b - r.a) * k / N, U = r.up(t), L = r.lo(t);
        if (isFinite(U) && isFinite(L)) { up.push(pt(r.v, t, U)); lo.push(pt(r.v, t, L)); }
      }
      if (up.length < 2) return;
      el('path', { class: 'region', d: poly(up.concat(lo.reverse())), fill: r.color || COLORS[i % COLORS.length], 'fill-opacity': '.38' }, g);
    });

    (o.rects || []).forEach(r => {
      const xa = sx(r.x0), xb = sx(r.x1), ya = sy(r.top), yb = sy(r.bottom);
      el('rect', {
        class: 'rect', x: Math.min(xa, xb), y: Math.min(ya, yb),
        width: Math.abs(xb - xa), height: Math.abs(yb - ya),
        fill: 'var(--c1)', 'fill-opacity': '.28', stroke: 'var(--c1)'
      }, g);
    });

    (o.curves || []).forEach((c, i) => {
      const lo = c.v === 'y' ? y0 : x0, hi = c.v === 'y' ? y1 : x1, N = 500;
      const span = (c.v === 'y' ? x1 - x0 : y1 - y0);
      let d = '', pen = false, prev = null;
      for (let k = 0; k <= N; k++) {
        const t = lo + (hi - lo) * k / N, u = c.fn(t);
        if (!isFinite(u) || Math.abs(u) > 1e3 * span || (prev !== null && Math.abs(u - prev) > 4 * span)) {
          pen = false; prev = isFinite(u) ? u : null; continue;
        }
        const p = pt(c.v, t, u);
        d += (pen ? 'L' : 'M') + clamp(p[0]).toFixed(1) + ',' + clamp(p[1]).toFixed(1);
        pen = true; prev = u;
      }
      el('path', { class: 'curve', d: d, style: 'stroke:' + (c.color || COLORS[i % COLORS.length]) }, g);
    });

    host.textContent = '';
    host.appendChild(svg);
    return svg;
  }

  function typeset(node) {
    if (window.renderMathInElement) {
      window.renderMathInElement(node || document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    }
  }

  const fmt = (v, d) => v.toFixed(d == null ? 4 : d);

  /* ---------- figuras de los ejemplos ---------- */
  function buildFigure(host) {
    const cfg = JSON.parse(host.dataset.cfg);
    let regs;
    if (cfg.auto) {
      const a = cfg.auto, v = a.var || 'x';
      regs = M.autoRegions(M.compile(a.f, v), M.compile(a.g, v), M.constant(a.a), M.constant(a.b))
        .map(r => ({ up: r.up, lo: r.lo, a: r.a, b: r.b, v: v }));
    } else {
      regs = cfg.regions.map(r => {
        const v = r.var || 'x';
        return { up: M.compile(r.upper, v), lo: M.compile(r.lower, v), a: M.constant(r.a), b: M.constant(r.b), v: v };
      });
    }
    const curves = (cfg.curves || []).map(c => ({ fn: M.compile(c.f, c.var || 'x'), v: c.var || 'x' }));
    makePlot(host, { xr: cfg.xr, yr: cfg.yr, curves: curves, regions: regs, alt: 'Región entre las curvas: ' + (cfg.curves || []).map(c => c.label).join(' y ') });

    const legend = document.createElement('div');
    legend.className = 'legend';
    (cfg.curves || []).forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'item';
      s.innerHTML = '<span class="sw" style="background:' + COLORS[i % COLORS.length] + '"></span>';
      s.appendChild(document.createTextNode(c.label));
      legend.appendChild(s);
    });
    host.appendChild(legend);

    if (cfg.table) {
      const fs = cfg.table.fns.map(s => M.compile(s, 'x'));
      const tw = document.createElement('div');
      tw.className = 'tablewrap vals';
      let html = '<table><thead><tr><th>x</th>' + cfg.table.heads.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>';
      cfg.table.xs.forEach(x => {
        html += '<tr><td>' + x + '</td>' + fs.map(f => '<td>' + parseFloat(f(x).toFixed(3)) + '</td>').join('') + '</tr>';
      });
      tw.innerHTML = html + '</tbody></table>';
      host.appendChild(tw);
    }

    const area = regs.reduce((s, r) => s + M.regionArea(r), 0);
    const cap = document.createElement('figcaption');
    cap.className = 'verify';
    if (cfg.val != null && Math.abs(area - cfg.val) > 5e-4) {
      cap.classList.add('bad');
      cap.textContent = '⚠ Integración numérica: ' + fmt(area) + ' (se esperaba ' + fmt(cfg.val) + ')';
    } else {
      cap.classList.add('ok');
      cap.textContent = '✓ Integración numérica: A ≈ ' + fmt(area) + ' u²';
    }
    host.appendChild(cap);
  }

  /* ---------- demostración de rectángulos de Riemann ---------- */
  function initRiemann() {
    const f = M.compile('x+2'), g = M.compile('x^2'), a = -1, b = 2, exact = 4.5;
    const nIn = document.getElementById('rn'), nOut = document.getElementById('rn-out'),
      mSel = document.getElementById('rm'), box = document.getElementById('riemann-plot'),
      read = document.getElementById('riemann-read');
    function draw() {
      const n = +nIn.value, t = +mSel.value, dx = (b - a) / n;
      nOut.textContent = n;
      const rects = [];
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const xl = a + i * dx, xs = xl + t * dx, top = f(xs), bottom = g(xs);
        sum += (top - bottom) * dx;
        rects.push({ x0: xl, x1: xl + dx, top: top, bottom: bottom });
      }
      makePlot(box, {
        xr: [-2, 3], yr: [-1, 5], rects: rects,
        curves: [{ fn: f }, { fn: g }],
        alt: 'Rectángulos de Riemann entre y=x+2 y y=x²'
      });
      read.innerHTML = 'Suma de Riemann con <b>' + n + '</b> rectángulos: <b>' + fmt(sum) +
        '</b> &nbsp;·&nbsp; Área exacta: <b>' + exact + '</b> &nbsp;·&nbsp; Error: <b>' + fmt(Math.abs(exact - sum)) + '</b>';
    }
    nIn.addEventListener('input', draw);
    mSel.addEventListener('change', draw);
    draw();
  }

  /* ---------- laboratorio ---------- */
  const PRESETS = [
    { name: 'Cuaderno A: 2x²+x−3 y 2x−2', mode: 'x', f: '2*x-2', g: '2*x^2+x-3', a: '-0.5', b: '1' },
    { name: 'Cuaderno B: x³ y x²+x', mode: 'x', f: 'x^3', g: 'x^2+x', a: '-0.618034', b: '1.618034' },
    { name: 'Cuaderno C: x² y −x²+18x', mode: 'x', f: '-x^2+18*x', g: 'x^2', a: '0', b: '9' },
    { name: 'x+2 y x²', mode: 'x', f: 'x+2', g: 'x^2', a: '-1', b: '2' },
    { name: 'sen x y cos x en [0, π]', mode: 'x', f: 'cos(x)', g: 'sin(x)', a: '0', b: 'pi' },
    { name: 'x·e^(x²) y x en [0, 1]', mode: 'x', f: 'x*exp(x^2)', g: 'x', a: '0', b: '1' },
    { name: '1/x y x en [1, 2]', mode: 'x', f: 'x', g: '1/x', a: '1', b: '2' },
    { name: '2x/(x²+1) y x/2', mode: 'x', f: '2*x/(x^2+1)', g: 'x/2', a: '0', b: 'sqrt(3)' },
    { name: '1/(x²+1) y x²/2', mode: 'x', f: '1/(x^2+1)', g: 'x^2/2', a: '-1', b: '1' },
    { name: 'x³ y x (varios cruces)', mode: 'x', f: 'x^3', g: 'x', a: '-1', b: '1' },
    { name: 'x = y+2 y x = y² (en y)', mode: 'y', f: 'y+2', g: 'y^2', a: '-1', b: '2' },
    { name: 'x = 4−y² y x = y²−4 (en y)', mode: 'y', f: '4-y^2', g: 'y^2-4', a: '-2', b: '2' }
  ];

  function initLab() {
    const $ = id => document.getElementById(id);
    const mode = $('lab-mode'), preset = $('lab-preset'), fI = $('lab-f'), gI = $('lab-g'),
      aI = $('lab-a'), bI = $('lab-b'), err = $('lab-error'), plot = $('lab-plot'),
      legend = $('lab-legend'), out = $('lab-out');

    PRESETS.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = p.name;
      preset.appendChild(o);
    });

    function labels() {
      const v = mode.value, h = v === 'x' ? ['f(x)', 'g(x)'] : ['x_1(y)', 'x_2(y)'];
      $('lab-fl').textContent = '$' + h[0] + '=$';
      $('lab-gl').textContent = '$' + h[1] + '=$';
      typeset($('lab-fl').parentNode.parentNode);
    }

    function fail(msg) {
      err.textContent = msg; err.hidden = false;
      plot.textContent = ''; legend.textContent = ''; out.textContent = '';
    }

    function range(vals, lo, hi) {
      let mn = Infinity, mx = -Infinity;
      vals.forEach(fn => {
        for (let i = 0; i <= 300; i++) {
          const v = fn(lo + (hi - lo) * i / 300);
          if (isFinite(v) && Math.abs(v) < 1e3) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
        }
      });
      if (!isFinite(mn)) { mn = -1; mx = 1; }
      if (mn > 0 && mn < (mx - mn)) mn = 0;
      if (mx < 0 && -mx < (mx - mn)) mx = 0;
      let pad = (mx - mn) * 0.15;
      if (pad === 0) pad = 1;
      return [mn - pad, mx + pad];
    }

    function calc() {
      err.hidden = true;
      let v = mode.value, f, g, a, b;
      try {
        f = M.compile(fI.value, v); g = M.compile(gI.value, v);
        a = M.constant(aI.value); b = M.constant(bI.value);
      } catch (e) { return fail(e.message); }
      if (!(a < b)) return fail('El límite inferior debe ser menor que el superior.');

      const regs = M.autoRegions(f, g, a, b).map(r => Object.assign(r, { v: v }));
      const cuts = M.crossings(f, g, a, b);
      const pad = Math.max((b - a) * 0.25, 0.5);
      const ind = [a - pad, b + pad], dep = range([f, g], a, b);
      let xr = v === 'x' ? ind : dep, yr = v === 'x' ? dep : ind;
      if (v === 'x' && !(dep[0] <= 0 && dep[1] >= 0)) { /* eje x fuera de vista: ok */ }

      makePlot(plot, {
        xr: xr, yr: yr, regions: regs,
        curves: [{ fn: f, v: v }, { fn: g, v: v }],
        alt: 'Región entre las dos curvas ingresadas'
      });

      const nm = v === 'x' ? ['f(x)', 'g(x)', 'x', 'dx'] : ['x₁(y)', 'x₂(y)', 'y', 'dy'];
      legend.innerHTML = '';
      [fI.value, gI.value].forEach((txt, i) => {
        const s = document.createElement('span');
        s.className = 'item';
        s.innerHTML = '<span class="sw" style="background:' + COLORS[i] + '"></span>';
        s.appendChild(document.createTextNode(nm[i] + ' = ' + txt));
        legend.appendChild(s);
      });

      let total = 0;
      const rows = regs.map((r, i) => {
        const A = M.regionArea(r);
        total += A;
        const who = r.up === f ? nm[0] : nm[1], low = r.up === f ? nm[1] : nm[0];
        return '<li>Tramo ' + (i + 1) + ': ' + nm[2] + ' de ' + fmt(r.a) + ' a ' + fmt(r.b) +
          ' · arriba/derecha: <code>' + who + '</code>, abajo/izquierda: <code>' + low + '</code> → <b>' + fmt(A) + '</b></li>';
      }).join('');
      if (!isFinite(total) || total > 1e6) {
        out.innerHTML = '<p class="error">El área no es finita en este intervalo: alguna función tiene una asíntota vertical (integral impropia). Ajusta los límites para que no la incluyan.</p>';
        return;
      }
      const inside = cuts.filter(c => c > a + 1e-9 && c < b - 1e-9);
      out.innerHTML =
        '<p>Área total: <b>A ≈ ' + fmt(total) + ' u²</b></p>' +
        '<ul class="steps">' + rows + '</ul>' +
        '<p class="muted">' + (inside.length
          ? 'Cruces dentro del intervalo (' + nm[2] + '): ' + inside.map(c => fmt(c)).join(', ') + '. Se dividió en ' + regs.length + ' tramos.'
          : 'Las curvas no se cruzan dentro del intervalo: una sola integral.') + '</p>';
    }

    function autoLimits() {
      err.hidden = true;
      let f, g;
      try { f = M.compile(fI.value, mode.value); g = M.compile(gI.value, mode.value); }
      catch (e) { return fail(e.message); }
      const c = M.crossings(f, g, -10, 10, 8000);
      if (c.length < 2) return fail('No encontré al menos dos intersecciones en [−10, 10]. Escribe los límites a mano.');
      aI.value = String(parseFloat(c[0].toFixed(6)));
      bI.value = String(parseFloat(c[c.length - 1].toFixed(6)));
      calc();
    }

    preset.addEventListener('change', () => {
      const p = PRESETS[+preset.value];
      mode.value = p.mode; labels();
      fI.value = p.f; gI.value = p.g; aI.value = p.a; bI.value = p.b;
      calc();
    });
    mode.addEventListener('change', () => { labels(); calc(); });
    $('lab-go').addEventListener('click', calc);
    $('lab-auto').addEventListener('click', autoLimits);
    [fI, gI, aI, bI].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') calc(); }));
    preset.value = '0';
    preset.dispatchEvent(new Event('change'));
  }

  function start() {
    document.querySelectorAll('figure.fig').forEach(f => {
      try { buildFigure(f); } catch (e) { f.textContent = 'No se pudo dibujar la figura: ' + e.message; }
    });
    initRiemann();
    initLab();
    typeset(document.body);
  }

  if (window.renderMathInElement) start();
  else window.addEventListener('load', start);
})();
