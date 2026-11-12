// Расчёт постановки лодки. Чистая математика без DOM: её используют приложение и тесты.
//
// Система отсчёта — человек сидит у кормы и смотрит за корму:
//   12 часов — прямо за кормой, 6 часов — нос, 3 часа — справа от него.
//   aft   (+) — расстояние за кормой, вдоль линии нос→корма;
//   right (+) — вправо от сидящего у кормы (это ЛЕВЫЙ борт, если смотреть от носа).
// Команды якоря (вперёд/назад/влево/вправо) считаются от носа лодки.

export const DEFAULTS = Object.freeze({
  stepLong: 1,   // м за одно нажатие вперёд/назад
  stepSide: 1.5, // м за одно нажатие влево/вправо
  mountDeg: 0,   // куда смотрит датчик, ° от линии 12 часов (по часовой +)
  sensorFwd: 0,  // на сколько метров датчик ближе к носу, чем корма
});

const RAD = Math.PI / 180;
const ZERO = 1e-9;

export function normDeg(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** 75° → "2:30", 0° → "12:00". 1° циферблата = 2 минуты. */
export function formatClock(deg) {
  const total = Math.round(normDeg(deg) * 2) % 720;
  const h = Math.floor(total / 60) || 12;
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

const clean = (x) => (Math.abs(x) < ZERO ? 0 : x);

function check(name, v, min, max) {
  if (!Number.isFinite(v) || v < min || v > max) {
    throw new RangeError(`${name} вне диапазона ${min}…${max}: ${v}`);
  }
}

function move(need, step, posDir, negDir) {
  const presses = Math.round(Math.abs(need) / step);
  const sign = Math.sign(need);
  return {
    need,                                  // сколько метров нужно сдвинуться (со знаком)
    presses,                               // целое число нажатий
    dir: presses === 0 ? null : sign > 0 ? posDir : negDir,
    meters: presses * step,                // сколько реально пройдём
    shift: clean(sign * presses * step),   // реальный сдвиг лодки (со знаком)
  };
}

/**
 * @param {object} p
 * @param {number} p.clockDeg  направление на рыбу, ° (12 ч = 0, 3 ч = 90)
 * @param {number} p.distance  расстояние до рыбы по эхолоту, м (по горизонтали)
 * @param {number} p.target    желаемое расстояние от кормы до рыбы, м
 */
export function solve({
  clockDeg,
  distance,
  target,
  stepLong = DEFAULTS.stepLong,
  stepSide = DEFAULTS.stepSide,
  mountDeg = DEFAULTS.mountDeg,
  sensorFwd = DEFAULTS.sensorFwd,
}) {
  check('clockDeg', clockDeg, -720, 720);
  check('distance', distance, 0, 1000);
  check('target', target, 0, 1000);
  check('stepLong', stepLong, 0.01, 100);
  check('stepSide', stepSide, 0.01, 100);
  check('mountDeg', mountDeg, -360, 360);
  check('sensorFwd', sensorFwd, -100, 100);

  const a = (clockDeg + mountDeg) * RAD;
  const fishRight = clean(distance * Math.sin(a));
  const fishAft = clean(distance * Math.cos(a) - sensorFwd);

  // Лодка сохраняет курс и двигается по прямым. Рыба неподвижна,
  // поэтому сдвиг лодки = (где рыба сейчас) − (где она должна быть: target за кормой).
  const long = move(clean(fishAft - target), stepLong, 'back', 'forward');
  const side = move(fishRight, stepSide, 'left', 'right');

  const afterAft = clean(fishAft - long.shift);
  const afterRight = clean(fishRight - side.shift);

  return {
    fish: { aft: fishAft, right: fishRight },
    long,
    side,
    boatShift: { aft: long.shift, right: side.shift },
    after: {
      aft: afterAft,
      right: afterRight,
      distance: Math.hypot(afterAft, afterRight),
      clockDeg: normDeg(Math.atan2(afterRight, afterAft) / RAD),
      miss: Math.hypot(afterAft - target, afterRight), // промах от нужной точки из‑за целых нажатий
    },
    aligned: long.presses === 0 && side.presses === 0,
  };
}
