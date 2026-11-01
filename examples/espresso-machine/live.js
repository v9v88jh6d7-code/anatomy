const D = __DATA__;
const P = D.P;
const M = MODEL;
const stage = document.querySelector(".em-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const status = stage.querySelector("[data-status]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const at = (p) => iso(p, P);
const f2 = (v) => Math.round(v * 100) / 100;
const pathOf3 = (points, closed) => "M" + points.map((p) => at(p).map(f2).join(" ")).join("L") + (closed ? "Z" : "");

const needle = svg.querySelector('[data-part="needle"]');
const streams = [...svg.querySelectorAll('[data-part="streams"] path')];
const water = svg.querySelector('[data-part="water"]');
const hot = (selector) => [...svg.querySelectorAll(selector)].map((el) => el.closest(".it") ?? el);
const feed = hot('[data-flow="feed"], [data-flow="brew"], [data-pump], [data-valve], [data-name="hose.in"], [data-name^="hose.in:"]');
const back = hot('[data-flow="return"], [data-opv]');
const brewSwitch = svg.querySelector('[data-switch="1"]');
const lamps = [0, 1, 2].map((i) => svg.querySelector(`[data-lamp="${i}"]`));

// Shot glass: inner radius tapers up from the floor; 1 unit is 2 mm, so 1 unit³ is 0.008 ml.
const C = D.cup;
const rIn = (z) => C.rOut0 + ((z - C.z0) * (C.rOut1 - C.rOut0)) / (C.z1 - C.z0) - C.wall;
const ML_PER_UNIT3 = 0.008;
function levelOf(ml) {
  let z = C.floor;
  let left = ml;
  const dz = 0.05;
  while (left > 0 && z < C.z1 - 0.4) {
    left -= Math.PI * rIn(z) ** 2 * dz * ML_PER_UNIT3;
    z += dz;
  }
  return z;
}
const cupF = G.frameOf([C.x, C.y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const ringAt = (z, r, n = 48) => Array.from({ length: n }, (_, i) => at([C.x + r * Math.cos((i / n) * 2 * Math.PI), C.y + r * Math.sin((i / n) * 2 * Math.PI), z]));
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
const flat = (pts) => "M" + pts.map((q) => q.map(f2).join(" ")).join("L") + "Z";
const coffee = svg.querySelector('[data-part="coffee"]');
const crema = svg.querySelector('[data-part="crema"]');

const TANK_FULL = 118;
const TANK_ML_PER_UNIT = D.tank.area * ML_PER_UNIT3;

const shot = { brewing: false, bar: 0, t: 0, inMl: 0, outG: 0, flow: 0, bypass: 0, done: false };
let grind = M.GRIND_DEFAULT;
let drawn = 0;
let tankLevel = TANK_FULL;
let needleBar = 0;
let needleRate = 0;

function needlePath(bar) {
  const theta = ((Math.min(M.GAUGE_MAX, Math.max(0, bar)) / M.GAUGE_MAX) * 2 - 1) * M.GAUGE_SWEEP;
  const face = (r) => [D.gauge.face + 0.12, D.gauge.y - r * Math.sin(theta), D.gauge.z + r * Math.cos(theta)];
  return pathOf3([face(-1.8), face(8.4)]);
}

function drawTank() {
  const { x0, x1, y0, y1, z0 } = D.tank;
  const z = tankLevel;
  const near = [[x0, y1, z0], [x1, y1, z0], [x1, y1, z], [x0, y1, z]];
  const front = [[x1, y0, z0], [x1, y1, z0], [x1, y1, z], [x1, y0, z]];
  water.innerHTML =
    `<path class="em-water" d="${pathOf3(near, true)}"/><path class="em-water" d="${pathOf3(front, true)}"/>` +
    `<path class="em-level" d="${pathOf3([[x0, y1, z], [x1, y1, z], [x1, y0, z]])}"/>`;
}

function draw() {
  needle.setAttribute("d", needlePath(needleBar));
  const level = levelOf(shot.outG);
  const wet = shot.outG > 0.05;
  coffee.setAttribute("d", wet ? flat(hull([...ringAt(C.floor, rIn(C.floor)), ...ringAt(level, rIn(level))])) : "");
  crema.setAttribute("d", wet ? G.circleOf(cupF, level, rIn(level), P, 64) : "");
  const flowing = shot.brewing && shot.flow > 0.01;
  streams.forEach((el, i) => {
    if (!flowing) {
      el.setAttribute("d", "");
      return;
    }
    const [x, y, z] = D.spouts[i];
    const top = at([x, y, z]);
    const bottom = at([x, y * 0.5, level]);
    el.setAttribute("d", `M${f2(top[0])} ${f2(top[1])}L${f2(bottom[0])} ${f2(bottom[1])}`);
    el.style.strokeWidth = (0.35 + 0.55 * Math.sqrt(shot.flow / 2)).toFixed(2);
  });
  feed.forEach((el) => el.toggleAttribute("data-hot", shot.brewing));
  back.forEach((el) => el.toggleAttribute("data-hot", shot.bypass > 0.05));
  brewSwitch?.closest(".it")?.toggleAttribute("data-on", shot.brewing);
  lamps[0]?.closest(".it")?.toggleAttribute("data-on", true);
  lamps[1]?.closest(".it")?.toggleAttribute("data-on", shot.brewing);
  lamps[2]?.closest(".it")?.toggleAttribute("data-on", !shot.brewing);
  drawTank();
  const microns = grindMicrons(grind);
  let text;
  if (shot.brewing) text = `${shot.bar.toFixed(1)} bar · ${shot.t.toFixed(0)} s · ${shot.outG.toFixed(1)} g`;
  else if (shot.done && shot.outG < 0.1) text = `stopped · no coffee yet · grind ${grind}`;
  else if (shot.done) text = `${shot.outG.toFixed(1)} g in ${shot.t.toFixed(0)} s · grind ${grind}`;
  else text = `ready · ${M.BREW_C} °C · grind ${grind} · ${microns} µm`;
  if (readout.textContent !== text) readout.textContent = text;
}

function say(text) {
  status.textContent = text;
}
function start() {
  if (shot.brewing) return;
  Object.assign(shot, { brewing: true, t: 0, inMl: 0, outG: 0, flow: 0, bypass: 0, done: false });
  drawn = 0;
  if (tankLevel < 60) tankLevel = TANK_FULL;
  say(`Brewing at grind ${grind}.`);
  if (still.matches) {
    const result = simulate(grind);
    Object.assign(shot, { brewing: false, t: result.seconds, outG: result.grams, inMl: result.grams + M.WET_ML, bar: 0, done: true });
    needleBar = 0;
    tankLevel -= (result.grams + M.WET_ML) / TANK_ML_PER_UNIT;
    say(`${result.grams.toFixed(1)} grams in ${result.seconds.toFixed(0)} seconds at ${result.bar.toFixed(1)} bar.`);
    draw();
    return;
  }
  run();
}
function stop(reason) {
  if (!shot.brewing) return;
  shot.brewing = false;
  shot.done = true;
  say(reason ?? `Stopped: ${shot.outG.toFixed(1)} grams in ${shot.t.toFixed(0)} seconds.`);
  run();
}
function setGrind(next) {
  grind = Math.max(M.GRIND_MIN, Math.min(M.GRIND_MAX, next));
  say(`Grind ${grind}, ${grindMicrons(grind)} micrometres.`);
  draw();
  run();
}

// Idle tour: a good shot, a gusher, a choker, again.
const TOUR = [
  { wait: 1.4, grind: 4, cap: 40 },
  { wait: 3.5, grind: 9, cap: 40 },
  { wait: 3.5, grind: 1, cap: 18 },
];
let touring = !still.matches;
let tourStep = 0;
let tourClock = 0;
let idleTimer = 0;
function tour(dt) {
  if (!touring) return;
  const step = TOUR[tourStep % TOUR.length];
  if (shot.brewing) {
    if (shot.t >= step.cap) stop();
    if (!shot.brewing) {
      tourStep++;
      tourClock = 0;
    }
    return;
  }
  tourClock += dt;
  if (tourClock >= step.wait) {
    grind = step.grind;
    start();
  }
}
function interrupt() {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (still.matches) return;
    touring = true;
    tourClock = 0;
    run();
  }, 3600);
}

let frame = 0;
let last = 0;
let visible = false;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  tour(dt);
  const before = shot.inMl;
  stepShot(shot, grind, dt);
  if (shot.brewing) {
    tankLevel -= (shot.inMl - before) / TANK_ML_PER_UNIT;
    if (shot.outG >= M.YIELD_G) stop(`Done: ${shot.outG.toFixed(1)} grams in ${shot.t.toFixed(0)} seconds.`);
    else if (shot.t >= M.GIVE_UP_S) stop(`Choked: only ${shot.outG.toFixed(1)} grams after ${M.GIVE_UP_S} seconds.`);
  }
  // The needle is a damped mass on a Bourdon tube: it follows the pressure with a slight lag.
  for (let i = 0; i < 4; i++) {
    needleRate += ((shot.bar - needleBar) * 300 - needleRate * 30) * (dt / 4);
    needleBar += needleRate * (dt / 4);
  }
  draw();
  const settled = !touring && !shot.brewing && shot.bar === 0 && Math.abs(needleBar) < 1e-3 && Math.abs(needleRate) < 1e-3;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

stage.addEventListener("click", () => {
  interrupt();
  shot.brewing ? stop() : start();
});
stage.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 2 : 1;
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    interrupt();
    shot.brewing ? stop() : start();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
    event.preventDefault();
    interrupt();
    setGrind(grind - step);
  } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
    event.preventDefault();
    interrupt();
    setGrind(grind + step);
  } else if (event.key === "Home") {
    interrupt();
    setGrind(M.GRIND_MIN);
  } else if (event.key === "End") {
    interrupt();
    setGrind(M.GRIND_MAX);
  } else if (event.key === "Escape") {
    interrupt();
    stop();
  } else if (/^[1-9]$/.test(event.key)) {
    interrupt();
    setGrind(Number(event.key));
  }
});
draw();
