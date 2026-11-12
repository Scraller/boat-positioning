import { DEFAULTS, solve, formatClock, normDeg } from './calc.js';

const VERSION = '1.1.1';
const STORE_KEY = 'boatpos.v1';
const START = { clockDeg: 60, distance: 20, target: 10, ...DEFAULTS };
const RAD = Math.PI / 180;

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const state = loadState();
const invalid = new Set();

// ---------- хранение (только удобство: без него всё работает) ----------
function loadState() {
  const s = { ...START };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    for (const k of Object.keys(START)) if (Number.isFinite(saved[k])) s[k] = saved[k];
  } catch { /* приватный режим и т.п. */ }
  s.clockDeg = normDeg(s.clockDeg);
  return s;
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* не критично */ }
}

// ---------- числа ----------
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, useGrouping: false });
const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });
const tidy = (v) => { const r = Math.round(v * 10) / 10; return r === 0 ? 0 : r; };
const fmt = (v) => nf.format(tidy(v));
const fmt1 = (v) => nf1.format(tidy(v));

function parseNum(text) {
  const t = String(text).trim().replace(',', '.').replace(/[−–]/g, '-');
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
}

function plural(n, one, few, many) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

// Кнопка, которая повторяет действие, пока её держат.
function holdRepeat(btn, fn) {
  let delay, timer;
  const stop = () => { clearTimeout(delay); clearInterval(timer); };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    stop();
    fn();
    delay = setTimeout(() => { timer = setInterval(fn, 90); }, 450);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
  btn.addEventListener('click', (e) => { if (e.detail === 0) fn(); }); // клавиатура
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------- числовые поля (границы берутся из data-min / data-max) ----------
const fields = new Map();

function setupFields() {
  for (const el of document.querySelectorAll('.field[data-key]')) {
    const key = el.dataset.key;
    const f = {
      el,
      input: $('input', el),
      label: $('label', el).textContent,
      step: Number(el.dataset.step),
      min: Number(el.dataset.min),
      max: Number(el.dataset.max),
    };
    fields.set(key, f);
    state[key] = clamp(state[key], f.min, f.max);
    f.input.value = fmt(state[key]);
    f.input.addEventListener('input', () => onFieldInput(key));
    f.input.addEventListener('focus', () => f.input.select());
    f.input.addEventListener('blur', () => { if (!invalid.has(key)) f.input.value = fmt(state[key]); });
    f.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') f.input.blur(); });
    for (const btn of el.querySelectorAll('.step')) {
      holdRepeat(btn, () => stepField(key, Number(btn.dataset.delta)));
    }
  }
}

function onFieldInput(key) {
  const f = fields.get(key);
  const v = parseNum(f.input.value);
  const ok = Number.isFinite(v) && v >= f.min && v <= f.max;
  f.input.setAttribute('aria-invalid', String(!ok));
  if (ok) {
    invalid.delete(key);
    state[key] = v;
    saveState();
  } else {
    invalid.add(key);
  }
  render();
}

function setField(key, v) {
  const f = fields.get(key);
  state[key] = v;
  invalid.delete(key);
  f.input.value = fmt(v);
  f.input.setAttribute('aria-invalid', 'false');
}

function stepField(key, dir) {
  const f = fields.get(key);
  const v = Math.round((state[key] + dir * f.step) * 100) / 100;
  setField(key, clamp(v, f.min, f.max));
  saveState();
  render();
}

// ---------- «радар»: вид сверху, центр — датчик, кольца дальности ----------
const dial = $('#dial');
const MAX_D = 30;              // дальше 30 м эхолот рыбу не показывает
const RR = 120;                // радиус кольца 30 м в координатах рисунка
const K = RR / MAX_D;          // точек рисунка на метр
const BOAT_L = 7, BOAT_W = 3;  // условная лодка на схеме, м

const polar = (r, deg) => [r * Math.sin(deg * RAD), -r * Math.cos(deg * RAD)];
const f1 = (v) => v.toFixed(1);

function buildDial() {
  let s = '<circle class="face" r="158"/>';
  s += `<circle class="range" r="${RR}"/>`;
  for (let h = 0; h < 12; h++) {
    const [x, y] = polar(RR, h * 30);
    s += `<line class="spoke" x1="0" y1="0" x2="${f1(x)}" y2="${f1(y)}"/>`;
  }
  for (let m = 5; m < MAX_D; m += 5) s += `<circle class="ring${m % 10 ? '' : ' ten'}" r="${f1(m * K)}"/>`;
  s += `<circle class="ring outer" r="${RR}"/>`;
  for (let deg = 0; deg < 360; deg += 5) {
    const len = deg % 30 === 0 ? 9 : deg % 15 === 0 ? 6 : 3;
    const [x1, y1] = polar(RR, deg), [x2, y2] = polar(RR + len, deg);
    s += `<line class="tick${deg % 30 === 0 ? ' major' : ''}" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`;
  }
  for (let h = 1; h <= 12; h++) {
    const [x, y] = polar(141, h * 30);
    s += `<text class="hour${h % 3 === 0 ? ' main' : ''}" x="${f1(x)}" y="${f1(y)}">${h}</text>`;
  }
  for (const m of [10, 20, 30]) {
    const [x, y] = polar(m * K - 5, 150); // подписи колец вдоль 5 часов
    s += `<text class="ring-label" x="${f1(x)}" y="${f1(y)}">${m}${m === 30 ? ' м' : ''}</text>`;
  }
  s += '<g id="dial-dyn"></g>';
  dial.innerHTML = s;
}

// Точка в системе лодки (вправо, за корму — метры от датчика) → координаты рисунка.
// Учитывает поворот датчика: рисунок показывает часы так, как их вводят.
function boatToDial(right, aft) {
  const m = state.mountDeg * RAD;
  return [K * (right * Math.cos(m) - aft * Math.sin(m)), -K * (aft * Math.cos(m) + right * Math.sin(m))];
}

function renderDial() {
  const fromStern = (right, aft) => boatToDial(right, aft + state.sensorFwd); // корма за датчиком на sensorFwd
  const pt = ([x, y]) => `${f1(x)},${f1(y)}`;
  const hw = BOAT_W / 2;
  const boat = [fromStern(-hw, 0), fromStern(hw, 0), fromStern(hw, -BOAT_L * 0.6), fromStern(0, -BOAT_L), fromStern(-hw, -BOAT_L * 0.6)];
  const [sx, sy] = fromStern(0, 0);
  const [ax, ay] = fromStern(0, MAX_D - Math.max(0, state.sensorFwd));
  const [tx, ty] = fromStern(0, state.target);
  const [fx, fy] = polar(state.distance * K, state.clockDeg);

  let s = '';
  s += `<line class="release-axis" x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(ax)}" y2="${f1(ay)}"/>`;
  s += `<polygon class="boat" points="${boat.map(pt).join(' ')}"/>`;
  s += `<line class="link" x1="${f1(fx)}" y1="${f1(fy)}" x2="${f1(tx)}" y2="${f1(ty)}"/>`;
  s += `<line class="ray" x1="0" y1="0" x2="${f1(fx)}" y2="${f1(fy)}"/>`;
  s += '<circle class="sonar" r="2.5"/>';
  s += `<g class="target" transform="translate(${f1(tx)},${f1(ty)})"><circle r="8"/><circle class="dot" r="2.5"/></g>`;
  const leftSide = fx > tx + 1; // подпись — с той стороны, где нет рыбы
  s += `<text class="target-label" x="${f1(leftSide ? tx - 13 : tx + 13)}" y="${f1(ty)}" text-anchor="${leftSide ? 'end' : 'start'}">спуск ${fmt(state.target)} м</text>`;
  s += `<circle class="fish-dot" r="9" cx="${f1(fx)}" cy="${f1(fy)}"/>`;
  $('#dial-dyn').innerHTML = s;

  const text = formatClock(state.clockDeg);
  $('#clock-out').textContent = text;
  dial.setAttribute('aria-valuenow', String(state.clockDeg));
  dial.setAttribute('aria-valuetext', `${text} по часам, ${fmt(state.distance)} м`);
}

function dialPoint(e) {
  const b = dial.getBoundingClientRect();
  return {
    x: ((e.clientX - b.left - b.width / 2) / (b.width / 2)) * 160,
    y: ((e.clientY - b.top - b.height / 2) / (b.height / 2)) * 160,
  };
}
const angleOf = (p) => normDeg(Math.atan2(p.x, -p.y) / RAD);
const snap = (deg, step) => Math.round(deg / step) * step;

function setClock(deg) {
  state.clockDeg = normDeg(snap(deg, 5)); // точность 5° = 10 минут
  saveState();
  render();
}

function setupDial() {
  buildDial();
  let drag = null;

  // Внутри кольца 30 м — ставим и направление, и расстояние; по цифрам снаружи — только направление.
  const pick = (p, fine, withDistance) => {
    state.clockDeg = normDeg(snap(angleOf(p), fine ? 5 : 15)); // тап — к получасу, ведёшь пальцем — по 10 минут
    if (withDistance) setField('distance', clamp(Math.round(Math.hypot(p.x, p.y) / K), 1, MAX_D));
    saveState();
    render();
  };

  dial.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const p = dialPoint(e);
    const r = Math.hypot(p.x, p.y);
    if (r < K * 0.75) return; // в самом центре направление не определить
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, fine: false, inside: r <= RR + 6 };
    pick(p, false, drag.inside);
    try { dial.setPointerCapture(e.pointerId); } catch { /* без захвата тоже работает */ }
  });
  dial.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.fine && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    drag.fine = true;
    const p = dialPoint(e);
    if (Math.hypot(p.x, p.y) >= K * 0.75) pick(p, true, drag.inside);
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  dial.addEventListener('pointerup', end);
  dial.addEventListener('pointercancel', end);
  dial.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 5, ArrowLeft: -5, PageUp: 30, PageDown: -30 }[e.key];
    if (d) { e.preventDefault(); setClock(state.clockDeg + d); return; }
    const m = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    if (m) { e.preventDefault(); stepField('distance', m); }
  });
  holdRepeat($('#clock-minus'), () => setClock(state.clockDeg - 5));
  holdRepeat($('#clock-plus'), () => setClock(state.clockDeg + 5));
}

// ---------- спуск лески ----------
function setupRelease() {
  const range = $('#r-target');
  range.addEventListener('input', () => {
    setField('target', Number(range.value));
    saveState();
    render();
  });
}

// ---------- результат ----------
const WORDS = { forward: 'ВПЕРЁД', back: 'НАЗАД', left: 'ВЛЕВО', right: 'ВПРАВО' };

function renderCmd(el, mv, idleWord) {
  const idle = mv.presses === 0;
  el.classList.toggle('idle', idle);
  $('[data-dir]', el).textContent = idle ? idleWord : WORDS[mv.dir];
  $('[data-num]', el).textContent = String(mv.presses);
  $('[data-sub]', el).textContent = idle
    ? 'не нужно'
    : `${plural(mv.presses, 'нажатие', 'нажатия', 'нажатий')} · ${fmt1(mv.meters)} м`;
}

function render() {
  renderDial();
  if (!invalid.has('target')) $('#r-target').value = String(state.target);
  const box = $('.result'), err = $('#error'), after = $('#after');

  let r = null, problem = '';
  if (invalid.size) {
    problem = 'Проверьте: ' + [...invalid].map((k) => `«${fields.get(k).label}»`).join(', ');
  } else {
    try { r = solve(state); } catch { problem = 'Проверьте введённые числа'; }
  }

  box.classList.toggle('invalid', !r);
  err.hidden = !!r;
  err.textContent = problem;
  if (!r) {
    // Никаких старых цифр на экране, пока ввод неверный.
    box.classList.remove('done');
    for (const el of [$('#cmd-long'), $('#cmd-side')]) {
      el.classList.add('idle');
      $('[data-dir]', el).textContent = '—';
      $('[data-num]', el).textContent = '?';
      $('[data-sub]', el).textContent = 'нет расчёта';
    }
    after.innerHTML = '&nbsp;';
    return;
  }

  box.classList.toggle('done', r.aligned);
  renderCmd($('#cmd-long'), r.long, 'ВДОЛЬ');
  renderCmd($('#cmd-side'), r.side, 'ВБОК');

  const clock = formatClock(r.after.clockDeg);
  const dist = fmt1(r.after.distance);
  if (r.aligned && r.after.miss < 0.05) {
    after.innerHTML = `✓ Рыба на <b>${clock}</b>, в <b>${dist} м</b> от кормы — можно спускать леску`;
  } else if (r.aligned) {
    after.innerHTML = `✓ Ближе не встать целыми нажатиями: рыба на <b>${clock}</b>, в <b>${dist} м</b> (промах ${fmt1(r.after.miss)} м)`;
  } else {
    after.innerHTML = `После: рыба на <b>${clock}</b>, в <b>${dist} м</b> от кормы`
      + (r.after.miss >= 0.05 ? ` · промах ${fmt1(r.after.miss)} м` : '');
  }
  renderPlan(r);
}

// ---------- схема перестановки (вверх = за корму, 12 ч) ----------
function renderPlan(r) {
  const svg = $('#plan');
  const L = 5, B = 2.2; // условные длина и ширина лодки, м (только для рисунка)
  const sh = { x: r.boatShift.right, y: r.boatShift.aft };
  const fish = { x: r.fish.right, y: r.fish.aft };

  const xs = [fish.x, -B, B, sh.x - B, sh.x + B];
  const ys = [fish.y, 0, -L, sh.y, sh.y - L];
  const widen = (lo, hi, min) => (hi - lo >= min ? [lo, hi] : [(lo + hi) / 2 - min / 2, (lo + hi) / 2 + min / 2]);
  const [minX, maxX] = widen(Math.min(...xs) - 2, Math.max(...xs) + 2, 14);
  const [minY, maxY] = widen(Math.min(...ys) - 1.5, Math.max(...ys) + 2.5, 14);

  const W = 360, P = 20, HMAX = 420;
  let k = (W - 2 * P) / (maxX - minX);
  let H = (maxY - minY) * k + 2 * P;
  if (H > HMAX) { k = (HMAX - 2 * P) / (maxY - minY); H = HMAX; }
  const ox = W / 2 - ((minX + maxX) / 2) * k;
  const X = (x) => +(ox + x * k).toFixed(1);
  const Y = (y) => +(P + (maxY - y) * k).toFixed(1);

  // сетка
  const g = [1, 2, 5, 10, 20, 50, 100].find((s) => s * k >= 22) || 100;
  const wx0 = -ox / k, wx1 = (W - ox) / k, wyTop = maxY + P / k, wyBot = maxY - (H - P) / k;
  let s = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10 Z"/></marker></defs>';
  for (let x = Math.ceil(wx0 / g) * g; x <= wx1; x += g) s += `<line class="grid" x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}"/>`;
  for (let y = Math.ceil(wyBot / g) * g; y <= wyTop; y += g) s += `<line class="grid" x1="0" y1="${Y(y)}" x2="${W}" y2="${Y(y)}"/>`;

  const boat = (sx, sy) => {
    const xl = X(sx - B / 2), xr = X(sx + B / 2), xc = X(sx);
    return `M${xl},${Y(sy)} L${xr},${Y(sy)} L${xr},${Y(sy - L * 0.6)} Q${xr},${Y(sy - L * 0.9)} ${xc},${Y(sy - L)} Q${xl},${Y(sy - L * 0.9)} ${xl},${Y(sy - L * 0.6)} Z`;
  };

  // линия «корма → рыба» после перестановки
  s += `<line class="aim" x1="${X(sh.x)}" y1="${Y(sh.y)}" x2="${X(fish.x)}" y2="${Y(fish.y)}"/>`;

  // путь лодки: сначала вдоль, потом вбок
  if (!r.aligned) {
    const pts = [[0, 0]];
    if (sh.y !== 0) pts.push([0, sh.y]);
    if (sh.x !== 0) pts.push([sh.x, sh.y]);
    s += `<polyline class="move" marker-end="url(#arrow)" points="${pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}"/>`;
  }

  s += `<path class="boat-after" d="${boat(sh.x, sh.y)}"/>`;
  if (!r.aligned) s += `<path class="boat-now" d="${boat(0, 0)}"/>`;

  // рыба
  s += `<g class="fish" transform="translate(${X(fish.x)},${Y(fish.y)})"><ellipse rx="9" ry="5.5"/><path d="M7,0 L15,-6 L15,6 Z"/></g>`;

  // подписи
  const label = (x, y, text, cls = '') => `<text class="halo ${cls}" x="${x}" y="${y}">${text}</text>`;
  s += label(6, 15, '↑ за корму, 12 ч', 'muted');
  if (!r.aligned) s += label(X(B / 2) + 5, Y(-L / 2), 'сейчас', 'muted');
  s += label(X(sh.x + B / 2) + 5, Y(sh.y - L * 0.75), r.aligned ? 'лодка' : 'после');
  const mx = (X(sh.x) + X(fish.x)) / 2, my = (Y(sh.y) + Y(fish.y)) / 2;
  s += label(mx + 8, my, `${fmt1(r.after.distance)} м`);

  svg.setAttribute('viewBox', `0 0 ${W} ${H.toFixed(1)}`);
  svg.innerHTML = s;
  $('#grid-note').textContent = `клетка ${g} м`;
}

// ---------- настройки ----------
function setupReset() {
  $('#reset').addEventListener('click', () => {
    for (const k of Object.keys(DEFAULTS)) setField(k, DEFAULTS[k]);
    saveState();
    render();
  });
}

// ---------- офлайн и установка ----------
function setupOffline() {
  const out = $('#offline-status');
  const set = (text, cls = '') => { out.textContent = text; out.className = cls; };
  if (!('serviceWorker' in navigator)) return set('Браузер не умеет работать без интернета', 'warn');
  if (!window.isSecureContext) return set('Без интернета не заработает: нужен https или localhost', 'warn');
  // Пришла новая версия — один раз перезагружаемся (введённые числа сохранены).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => set('✓ Работает без интернета', 'ok'))
    .catch(() => set('Не удалось включить работу без интернета', 'warn'));
}

function setupInstall() {
  const box = $('#install'), btn = $('#install-btn');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) { box.hidden = true; return; }
  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = false; });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* отказ — не страшно */ }
    deferred = null;
    btn.hidden = true;
  });
  addEventListener('appinstalled', () => { box.hidden = true; });
}

// ---------- старт ----------
$('#version').textContent = `v${VERSION}`;
setupFields();
setupDial();
setupRelease();
setupReset();
setupInstall();
render();
setupOffline();
