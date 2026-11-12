import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, formatClock, normDeg } from '../app/calc.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const h = (hours) => hours * 30; // часы → градусы

test('12 ч, 20 м, хотим 10 м → назад 10, вбок ничего', () => {
  const r = solve({ clockDeg: h(12), distance: 20, target: 10 });
  assert.equal(r.long.dir, 'back');
  assert.equal(r.long.presses, 10);
  assert.equal(r.side.presses, 0);
  assert.equal(r.side.dir, null);
});

test('2 ч, 20 м → вдоль 0, вбок 17,3 м = 12 нажатий ВЛЕВО по носу', () => {
  const r = solve({ clockDeg: h(2), distance: 20, target: 10 });
  near(r.fish.aft, 10);
  near(r.fish.right, 17.320508075688775);
  assert.equal(r.long.presses, 0);
  assert.equal(r.side.dir, 'left');
  assert.equal(r.side.presses, 12); // 17,32 / 1,5 = 11,55 → 12
  near(r.after.right, 17.320508075688775 - 18);
  near(r.after.miss, 18 - 17.320508075688775);
});

test('3 ч → вперёд 10 и влево 13; 9 ч → вперёд 10 и вправо 13', () => {
  const r3 = solve({ clockDeg: h(3), distance: 20, target: 10 });
  assert.deepEqual([r3.long.dir, r3.long.presses, r3.side.dir, r3.side.presses], ['forward', 10, 'left', 13]);
  const r9 = solve({ clockDeg: h(9), distance: 20, target: 10 });
  assert.deepEqual([r9.long.dir, r9.long.presses, r9.side.dir, r9.side.presses], ['forward', 10, 'right', 13]);
});

test('6 ч (у носа), 20 м → вперёд 30', () => {
  const r = solve({ clockDeg: h(6), distance: 20, target: 10 });
  assert.equal(r.long.dir, 'forward');
  assert.equal(r.long.presses, 30);
  assert.equal(r.side.presses, 0);
});

test('рыба ближе нужного → вперёд; ровно на месте → ничего', () => {
  const r = solve({ clockDeg: 0, distance: 5, target: 10 });
  assert.deepEqual([r.long.dir, r.long.presses], ['forward', 5]);
  const ok = solve({ clockDeg: 0, distance: 10, target: 10 });
  assert.equal(ok.aligned, true);
});

test('желаемое расстояние задаётся: 12 ч, 20 м, хотим 5 / 20 м', () => {
  assert.equal(solve({ clockDeg: 0, distance: 20, target: 5 }).long.presses, 15);
  assert.equal(solve({ clockDeg: 0, distance: 20, target: 20 }).aligned, true);
});

test('шаги якоря настраиваются', () => {
  const r = solve({ clockDeg: h(3), distance: 20, target: 10, stepLong: 2, stepSide: 2 });
  assert.equal(r.long.presses, 5);
  assert.equal(r.side.presses, 10);
});

test('поворот датчика: 12 ч на экране + датчик на 90° = 3 ч лодки', () => {
  const a = solve({ clockDeg: 0, distance: 20, target: 10, mountDeg: 90 });
  const b = solve({ clockDeg: h(3), distance: 20, target: 10 });
  assert.deepEqual([a.long, a.side], [b.long, b.side]);
});

test('датчик ближе к носу на 3 м: 12 ч, 20 м → рыба в 17 м от кормы → назад 7', () => {
  const r = solve({ clockDeg: 0, distance: 20, target: 10, sensorFwd: 3 });
  near(r.fish.aft, 17);
  assert.equal(r.long.presses, 7);
});

test('после нажатий промах не больше половины шага по каждой оси', () => {
  for (let deg = 0; deg < 360; deg += 1) {
    for (const d of [0, 3, 7.5, 12, 20, 29.9, 45]) {
      for (const target of [0, 5, 10, 20]) {
        const r = solve({ clockDeg: deg, distance: d, target });
        assert.ok(Math.abs(r.after.aft - target) <= 0.5 + 1e-9);
        assert.ok(Math.abs(r.after.right) <= 0.75 + 1e-9);
      }
    }
  }
});

test('неверный ввод отклоняется', () => {
  assert.throws(() => solve({ clockDeg: 0, distance: -1, target: 10 }), RangeError);
  assert.throws(() => solve({ clockDeg: 0, distance: NaN, target: 10 }), RangeError);
  assert.throws(() => solve({ clockDeg: 0, distance: 10, target: 10, stepSide: 0 }), RangeError);
});

test('формат часов', () => {
  assert.equal(formatClock(0), '12:00');
  assert.equal(formatClock(15), '12:30');
  assert.equal(formatClock(75), '2:30');
  assert.equal(formatClock(355), '11:50');
  assert.equal(formatClock(-4), '11:52');
  assert.equal(formatClock(359.9), '12:00');
  assert.equal(normDeg(-90), 270);
});
