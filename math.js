/* Motor matemático: intérprete de expresiones e integración numérica.
   Sin dependencias; funciona en el navegador (window.AreaMath) y en Node (pruebas). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AreaMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, arctan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    exp: Math.exp, ln: Math.log, log: Math.log10,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs
  };
  const CONSTS = { pi: Math.PI, e: Math.E };
  const NAMES = Object.keys(FUNCS).concat(Object.keys(CONSTS), ['x', 'y'])
    .sort((a, b) => b.length - a.length);

  function tokenize(src) {
    const s = String(src).replace(/\s+/g, '').replace(/π/g, 'pi').replace(/\*\*/g, '^')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/,/g, '.').toLowerCase();
    if (!s) throw new Error('Escribe una función.');
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const v = parseFloat(s.slice(i, j));
        if (isNaN(v)) throw new Error('Número no válido.');
        out.push({ t: 'num', v });
        i = j;
      } else if (/[a-z]/.test(c)) {
        let j = i;
        while (j < s.length && /[a-z]/.test(s[j])) j++;
        let rest = s.slice(i, j);
        while (rest) {
          const name = NAMES.find(n => rest.startsWith(n));
          if (!name) throw new Error('No reconozco "' + rest + '".');
          out.push({ t: 'id', v: name });
          rest = rest.slice(name.length);
        }
        i = j;
      } else if ('+-*/^()'.includes(c)) {
        out.push({ t: c });
        i++;
      } else {
        throw new Error('Carácter no válido: "' + c + '".');
      }
    }
    // multiplicación implícita: 2x, 3(x+1), (x+1)(x-1), x sin(x)
    const res = [];
    for (let k = 0; k < out.length; k++) {
      const a = res[res.length - 1], b = out[k];
      if (a) {
        const aValue = a.t === 'num' || a.t === ')' || (a.t === 'id' && !FUNCS[a.v]);
        const bStart = b.t === 'num' || b.t === 'id' || b.t === '(';
        if (aValue && bStart) res.push({ t: '*' });
      }
      res.push(b);
    }
    return res;
  }

  /** Compila una expresión en una función JS de una variable (x o y). */
  function compile(src, varName) {
    varName = varName || 'x';
    const toks = tokenize(src);
    let p = 0;
    const peek = () => (p < toks.length ? toks[p].t : null);
    const need = (t) => {
      if (peek() !== t) throw new Error('Se esperaba "' + t + '".');
      p++;
    };
    function expr() {
      let l = term();
      while (peek() === '+' || peek() === '-') {
        const op = toks[p++].t, a = l, b = term();
        l = op === '+' ? v => a(v) + b(v) : v => a(v) - b(v);
      }
      return l;
    }
    function term() {
      let l = unary();
      while (peek() === '*' || peek() === '/') {
        const op = toks[p++].t, a = l, b = unary();
        l = op === '*' ? v => a(v) * b(v) : v => a(v) / b(v);
      }
      return l;
    }
    function unary() {
      if (peek() === '-') { p++; const a = unary(); return v => -a(v); }
      if (peek() === '+') { p++; return unary(); }
      return power();
    }
    function power() {
      const base = atom();
      if (peek() === '^') { p++; const ex = unary(); return v => Math.pow(base(v), ex(v)); }
      return base;
    }
    function atom() {
      const t = toks[p];
      if (!t) throw new Error('La expresión está incompleta.');
      if (t.t === 'num') { p++; const c = t.v; return () => c; }
      if (t.t === '(') { p++; const e = expr(); need(')'); return e; }
      if (t.t === 'id') {
        p++;
        if (FUNCS[t.v]) {
          need('(');
          const a = expr();
          need(')');
          const f = FUNCS[t.v];
          return v => f(a(v));
        }
        if (t.v in CONSTS) { const c = CONSTS[t.v]; return () => c; }
        if (t.v === varName) return v => v;
        throw new Error('Usa la variable "' + varName + '" (no "' + t.v + '").');
      }
      throw new Error('Símbolo inesperado: "' + t.t + '".');
    }
    const f = expr();
    if (p < toks.length) throw new Error('Sobran símbolos al final de la expresión.');
    return f;
  }

  /** Evalúa una constante: número o texto como "pi/2", "sqrt(3)". */
  function constant(v) {
    if (typeof v === 'number') return v;
    const r = compile(v, 'x')(0);
    if (!isFinite(r)) throw new Error('Límite no válido.');
    return r;
  }

  /** Regla de Simpson compuesta. */
  function simpson(h, a, b, n) {
    n = n || 20000;
    if (n % 2) n++;
    const dx = (b - a) / n;
    let s = h(a) + h(b);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * h(a + i * dx);
    return s * dx / 3;
  }

  /** Puntos donde f(t) = g(t) dentro de [a,b] (cambios de signo y ceros exactos). */
  function crossings(f, g, a, b, N) {
    N = N || 3000;
    const d = t => f(t) - g(t);
    const xs = [];
    let t0 = a, d0 = d(a);
    if (d0 === 0) xs.push(a);
    for (let i = 1; i <= N; i++) {
      const t1 = a + (b - a) * i / N, d1 = d(t1);
      if (isFinite(d0) && isFinite(d1)) {
        if (d1 === 0) xs.push(t1);
        else if (d0 * d1 < 0) {
          let lo = t0, hi = t1, dl = d0;
          for (let k = 0; k < 80; k++) {
            const mid = (lo + hi) / 2, dm = d(mid);
            if (dm === 0) { lo = hi = mid; break; }
            if (dl * dm < 0) hi = mid; else { lo = mid; dl = dm; }
          }
          const r = (lo + hi) / 2;
          // descarta asíntotas (el signo cambia pero la diferencia no se anula)
          if (Math.abs(d(r)) < 1e-4) xs.push(r);
        }
      }
      t0 = t1; d0 = d1;
    }
    return xs;
  }

  /** Parte [a,b] en tramos donde una de las curvas siempre está arriba. */
  function autoRegions(f, g, a, b) {
    const cuts = crossings(f, g, a, b).filter(c => c > a + 1e-9 && c < b - 1e-9);
    const pts = [a].concat(cuts, [b]);
    const regs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const lo = pts[i], hi = pts[i + 1];
      if (hi - lo < 1e-12) continue;
      const m = (lo + hi) / 2;
      const fUp = f(m) >= g(m);
      regs.push({ up: fUp ? f : g, lo: fUp ? g : f, a: lo, b: hi, topIsF: fUp });
    }
    return regs;
  }

  function regionArea(r) {
    return simpson(t => r.up(t) - r.lo(t), r.a, r.b);
  }

  return { compile, constant, simpson, crossings, autoRegions, regionArea };
});
