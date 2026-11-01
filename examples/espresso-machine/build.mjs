import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../../kit/tube.mjs";
import * as A from "../../kit/audit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";
import { MODEL } from "./model.mjs";

// A single-boiler espresso machine with its left side panel off, about 2 mm to the unit.
// x runs back to front (the front panel faces +x), y runs right to left (the open side is +y), z is up.

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

const W = 600;
const H = 620;
const AZIMUTH = 58;
const ELEVATION = 28;

const PLATE = { x: -90, y: -72, w: 216, d: 146, r: 10 };
const PLATE_H = 10;
const FOOT_H = 5;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-72, -57, 188.4], [62, 57, 188.4], [-72, 57, 188.4], [134, 0, 72]],
  W,
  H,
  { pad: 28, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const f2 = (v) => Math.round(v * 100) / 100;

const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "em", ...rest });
}

const ZF = (x, y) => G.frameOf([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const XF = (y, z) => G.frameOf([0, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.4, steps = 2, bevel = 0, extra = "", inner = "", bias = 0, attrs } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name }, steps));
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, smooth, steps, rims, bevel = 0, owner, attrs } = {}) {
  const opts = { bevel, ...(smooth !== undefined ? { smooth } : {}), ...(steps ? { steps } : {}), ...(rims ? { rims } : {}) };
  const paths = G.solidOf(profile, F, P, opts);
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(A.solid(F, profile, { name, owner }));
  put(name, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
const disc = (name, F, s0, s1, r, style = {}, options = {}) => turned(name, F, [[s0, r], [s1, r]], style, options);
function ball(name, c, r, style = {}, { bias = 0, extra = "", attrs } = {}) {
  const shape = record(A.ball(c, r, { name }));
  put(name, c, S(G.sphereOf(c, r, P, { steps: 32 }), { tone: "mid", ...style }) + extra, [shape], { bias, attrs });
  return shape;
}

// Pipes, hoses and cables: a few straight legs, filleted, cut into depth-sorted chunks.
const LINES = [];
function line(name, points, r, { tone = "mid", bend = 0, ends = [false, false], maxLength = 14, bias = 0.05, limp = false, rings, attrs = "" } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6, 3), 10, { P, tube: r });
  R.route(name, route, r, { limp, piece: "em" });
  LINES.push(name);
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.6, Math.min(1.6, r)), ...(rings ? { rings } : {}) }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { bias, attrs: ` data-line="${name}"${attrs}` }),
  );
  [0, 1].forEach((index) => {
    if (!ends[index]) return;
    const end = index ? route[route.length - 1] : route[0];
    const size = Math.max(0.5, r * KS * 0.9);
    put(`${name}.end${index}`, end, Dots([at(end)], { size, tone: "hi" }), [A.ball(end, size / KS, { name: `${name}.end${index}`, owner: name })], { bias: bias + 0.15 });
  });
  return route;
}

// ---------------------------------------------------------------- the bench
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
  back.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
back.push(Ln(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
const plateScrews = k.corners(PLATE, 10);
back.push(Ln(plateScrews.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(plateScrews.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
const STRIP = { x: PLATE.x + 16, y: PLATE.y + PLATE.d - 12, w: PLATE.w - 32, d: 6, r: 1 };
back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
const ticks = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 4, 5, STRIP.y, 0.6, [1.8, 3.4], P);
back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
back.push(Dots([at([STRIP.x + 2, STRIP.y + 3, 0.6]), at([STRIP.x + STRIP.w - 2, STRIP.y + 3, 0.6])], { size: 0.45 }));
const LABEL = { x: PLATE.x + 14, y: PLATE.y + 12, w: 34, d: 14, r: 1.2 };
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 4), { tone: "faint" }));
back.push(Ln([4, 7, 10].map((dy, i) => k.lineOnTop([LABEL.x + 5, LABEL.y + dy], [LABEL.x + 5 + [22, 15, 18][i], LABEL.y + dy], 0.8, P)).join(""), { tone: "lo", free: true }));
back.push(Dots([at([LABEL.x + 2.6, LABEL.y + 2.6, 0.8]), at([LABEL.x + LABEL.w - 2.6, LABEL.y + LABEL.d - 2.6, 0.8])], { size: 0.4 }));

// ---------------------------------------------------------------- the case
for (const [x, y] of [[-62, -46], [-62, 46], [52, -46], [52, 46]]) {
  const shape = record(A.cylinder(x, y, 5, 0, 4, { name: "case.foot" }));
  put("case.foot", [x, y, 2], S(k.cylinder(x, y, 5, 0, 4, P, 24), { tone: "lo" }), [shape]);
}
const PAN_DOTS = [-58, -24, 10, 44].map((x) => at([x, 55, 7]));
box("case.pan", [-70, -55, 4], [60, 55, 10], { tone: "mid" }, { r: 1, steps: 3, bevel: 0.6, extra: Dots(PAN_DOTS, { size: 0.45 }) });
box("case.back", [-70, -55, 10], [-66, 55, 170], { tone: "lo" }, { extra: Dots([40, 90, 140].map((z) => at([-68, 55, z])), { size: 0.45 }) });
box("case.far", [-66, -55, 10], [54, -52, 170], { tone: "lo" }, { inner: "" });
box("case.front", [54, -55, 10], [60, 55, 170], { tone: "mid" }, { extra: Dots([40, 90, 140].map((z) => at([57, 55, z])), { size: 0.45 }) });
const TOP_DOTS = [-56, -16, 24].map((x) => at([x, 57, 172.5]));
const VENTS = Array.from({ length: 7 }, (_, i) => k.planOutline({ x: 2 + i * 6.4, y: -34, w: 2.2, d: 68, r: 1.1 }, 175, P, 3)).join("");
box("case.top", [-72, -57, 170], [62, 57, 175], { tone: "mid" }, { r: 2, steps: 4, bevel: 0.8, extra: Ln(VENTS, { tone: "lo" }) + Dots(TOP_DOTS, { size: 0.45 }) });

// Cup warmer rail: four posts, two long rails along x, two short ones between them.
for (const [x, y] of [[-66, -52], [-66, 52], [56, -52], [56, 52]]) {
  const shape = record(A.cylinder(x, y, 1.6, 175, 11, { name: "rail.post" }));
  put("rail.post", [x, y, 180], S(k.cylinder(x, y, 1.6, 175, 11, P, 16), { tone: "mid" }), [shape]);
}
box("rail.x", [-67.8, -53.8, 186], [57.8, -50.2, 188.4], { tone: "mid" }, { r: 1.2, steps: 3 });
box("rail.x", [-67.8, 50.2, 186], [57.8, 53.8, 188.4], { tone: "mid" }, { r: 1.2, steps: 3 });
box("rail.y", [-67.8, -50.2, 186], [-64.2, 50.2, 188.4], { tone: "mid" }, { r: 0.4 });
box("rail.y", [54.2, -50.2, 186], [57.8, 50.2, 188.4], { tone: "mid" }, { r: 0.4 });
box("tank.lid", [-64, -30, 175], [-42, 30, 176.6], { tone: "mid" }, { r: 2, steps: 3, bevel: 0.4 });
box("tank.grip", [-55, -9, 176.6], [-51, 9, 179], { tone: "mid" }, { r: 1.4, steps: 3 });

// ---------------------------------------------------------------- water tank
const TANK = { x: -64, y: -50, w: 26, d: 98, r: 3 };
const TANK_Z = [10, 162];
{
  const shape = record(A.slab(TANK, TANK_Z[0], TANK_Z[1] - TANK_Z[0], { name: "tank" }, 4));
  const seams = [40, 120].map((z) => Ln(k.sideSeam(TANK, z, P, 4), { tone: "faint" })).join("");
  const marks = [
    Ln(path3([[-38, 26, 150], [-38, 30, 150]]) + path3([[-38, 26, 60], [-38, 30, 60]]), { tone: "faint", free: true }),
  ].join("");
  put("tank", [-51, -1, 86], S(k.slabOf(TANK, TANK_Z[0], TANK_Z[1] - TANK_Z[0], P, 4, 0.6), { tone: "faint", className: "em-tank", inner: seams }) + `<g data-part="water"></g>` + marks, [shape]);
}
box("tank.neck", [-62, -28, 162], [-44, 28, 170], { tone: "lo" }, { r: 2, steps: 3 });
disc("tank.outlet", XF(34, 22), -38, -35, 3.6, { tone: "mid" });
disc("tank.return", XF(34, 80), -38, -35, 3, { tone: "mid" });

// ---------------------------------------------------------------- vibratory pump
const PY = 34;
const PZ = 22;
line("hose.in", [[-35, PY, PZ], [-20, PY, PZ]], 2.4, { tone: "lo", rings: { pitch: 2.2, tone: "faint" } });
disc("pump.cap", XF(PY, PZ), -20, -16, 4.6, { tone: "mid" }, { attrs: ' data-pump=""' });
{
  const F = XF(PY, PZ);
  turned("pump.coil", F, [[-16, 9], [-4, 9]], { tone: "mid" }, { inner: Ln(G.arcOf(F, -10, 9, P), { tone: "faint" }), attrs: ' data-pump=""' });
  turned("pump.strap", F, [[-4, 9.8], [-1.4, 9.8]], { tone: "lo" }, { attrs: ' data-pump=""' });
  turned("pump.coil", F, [[-1.4, 9], [10, 9]], { tone: "mid" }, { inner: Ln(G.arcOf(F, 5, 9, P), { tone: "faint" }), attrs: ' data-pump=""' });
  box("pump.strap.foot", [-4, PY - 8, 10], [-1.4, PY + 8, PZ - 9.8], { tone: "lo" }, { r: 0.3, extra: Dots([at([-2.7, PY + 6, PZ - 9.8])], { size: 0.45 }) });
}
disc("pump.valve", XF(PY, PZ), 10, 16, 5.4, { tone: "mid" }, { attrs: ' data-pump=""' });
disc("pump.outlet", XF(PY, PZ), 16, 20, 3.2, { tone: "mid" }, { attrs: ' data-pump=""' });
for (const x of [-8, 4]) {
  const shape = record(A.cylinder(x, PY, 3, 10, 3, { name: "pump.mount" }));
  put("pump.mount", [x, PY, 11.5], S(k.cylinder(x, PY, 3, 10, 3, P, 20), { tone: "lo" }), [shape]);
}
box("pump.terminals", [1, PY - 3, PZ + 9], [9, PY + 3, PZ + 11.6], { tone: "lo" }, { r: 0.8, steps: 2, extra: Dots([at([3, PY, PZ + 11.6]), at([7, PY, PZ + 11.6])], { size: 0.5, tone: "hi" }), attrs: ' data-pump=""' });

// Tee after the pump: one way to the boiler, one up through the over-pressure valve.
const TEE = [30, PY, PZ];
const TEE_R = 3.4;
const NECK = Math.sqrt(TEE_R ** 2 - 1.6 ** 2);
line("pipe.feed", [[20, PY, PZ], [TEE[0] - NECK, PY, PZ]], 1.6, { tone: "hi", attrs: ' data-flow="feed"' });
ball("tee", TEE, TEE_R, { tone: "mid" });
{
  const F = ZF(TEE[0], TEE[1]);
  const knurl = G.ribsOf(F, 40, 46, 3.4, 28, P, { fade: [0.1, 0.55], seams: true });
  turned("opv", F, [[PZ + NECK, 1.6], [28, 1.6], [28, 3.8], [40, 3.8], [40, 3.4], [46, 3.4], [46, 1.6], [48, 1.6]], { tone: "mid" }, { inner: Faded(knurl, { tone: "lo" }), attrs: ' data-opv=""' });
}
line("hose.return", [[TEE[0], PY, 48], [TEE[0], PY, 80], [-35, PY, 80]], 1.3, { tone: "lo", bend: 6, maxLength: 12, attrs: ' data-flow="return"' });
const INLET = [30, 18];
line("pipe.riser", [[TEE[0], PY - NECK, PZ], [TEE[0], INLET[1], PZ], [INLET[0], INLET[1], 108]], 1.6, { tone: "hi", bend: 5, attrs: ' data-flow="feed"' });

// ---------------------------------------------------------------- boiler
const BOILER = [16, 8];
const BZ = [108, 154];
{
  const F = ZF(...BOILER);
  const bolts = G.dotsOf(F, 132, 21.6, 12, P, { all: true });
  const hot = { attrs: ' data-boiler=""', owner: "boiler" };
  disc("boiler.cap", F, BZ[0], 111, 22, { tone: "hi" }, hot);
  turned("boiler.lower", F, [[111, 20], [128, 20]], { tone: "hi" }, { ...hot, inner: Ln(G.arcOf(F, 120, 20, P), { tone: "faint" }) });
  disc("boiler.flange", F, 128, 132, 23, { tone: "hi" }, { ...hot, extra: Dots(bolts, { size: 0.5, tone: "mid" }) });
  turned("boiler.upper", F, [[132, 20], [152, 20], [BZ[1], 18.5]], { tone: "hi" }, { ...hot, inner: Ln(G.arcOf(F, 142, 20, P), { tone: "faint" }), bevel: 0.6 });
}
for (const [x, y] of [[6, 10], [16, -4]]) {
  const F = ZF(x, y);
  turned("thermostat", F, [[BZ[1], 4.2], [BZ[1] + 5, 4.2], [BZ[1] + 5, 2.6], [BZ[1] + 7, 2.6]], { tone: "mid" }, { bevel: 0.3, extra: Dots([at([x - 1.2, y, BZ[1] + 7]), at([x + 1.2, y, BZ[1] + 7])], { size: 0.45, tone: "hi" }) });
}
turned("safety", ZF(8, 20), [[BZ[1], 2.6], [BZ[1] + 4, 2.6], [BZ[1] + 4, 3.4], [BZ[1] + 8, 3.4], [BZ[1] + 9, 2]], { tone: "mid" }, { bevel: 0.3 });
disc("gauge.tap", ZF(24, 14), BZ[1], BZ[1] + 2, 2.2, { tone: "mid" });
line("pipe.gauge", [[24, 14, BZ[1] + 2], [24, 14, 163], [44, 14, 163], [44, 14, 150], [51, 14, 150]], 1, { tone: "mid", bend: 3 });
disc("gauge.nut", XF(14, 150), 51, 54, 2.4, { tone: "mid" });

// ---------------------------------------------------------------- brew valve and group
const BREW = [20, 0];
line("pipe.brew.in", [[BREW[0], BREW[1], BZ[0]], [BREW[0], BREW[1], 106]], 1.6, { tone: "hi", attrs: ' data-flow="brew"' });
{
  const F = ZF(...BREW);
  turned("solenoid.body", F, [[92, 2.2], [93, 4.5], [105, 4.5], [106, 2.2]], { tone: "mid" }, { bevel: 0.3, attrs: ' data-valve=""' });
}
box("solenoid.coil", [6, -5, 91], [15.5, 5, 106], { tone: "mid" }, { r: 1, steps: 3, bevel: 0.4, inner: Ln(k.sideSeam({ x: 6, y: -5, w: 9.5, d: 10, r: 1 }, 102, P, 3), { tone: "faint" }), attrs: ' data-valve=""' });
line("pipe.brew", [[BREW[0], BREW[1], 92], [BREW[0], BREW[1], 84], [51, 0, 84]], 1.6, { tone: "hi", bend: 5, attrs: ' data-flow="brew"' });
disc("brew.nut", XF(0, 84), 51, 54, 2.8, { tone: "mid" });

// Switch block behind the front panel and two cables out of it.
box("switches.block", [48, -46, 138], [54, -18, 158], { tone: "lo" }, { r: 0.8 });
line("cable.pump", [[48, -40, 144], [40, -40, 144], [40, -40, 42], [5, -40, 42], [5, PY, 42], [5, PY, PZ + 11.6]], 0.6, { tone: "lo", limp: true, ends: [false, true], bend: 4 });
line("cable.valve", [[48, -30, 140], [0, -30, 140], [0, -30, 98], [0, 0, 98], [6, 0, 98]], 0.6, { tone: "lo", limp: true, ends: [false, true], bend: 4 });

// Group head on the front, portafilter under it, cup on the drip tray.
const GX = 76;
box("group.block", [60, -16, 82], [90, 16, 98], { tone: "mid" }, { r: 8, steps: 6, bevel: 0.6, extra: Dots([[66, -10], [66, 10], [84, -10], [84, 10]].map(([x, y]) => at([x, y, 98])), { size: 0.5 }) });
disc("group.shower", ZF(GX, 0), 72, 82, 14, { tone: "mid" }, { inner: Ln(G.arcOf(ZF(GX, 0), 77, 14, P), { tone: "faint" }) });
{
  const F = ZF(GX, 0);
  turned("pf.basket", F, [[54, 10], [58, 12.6, 1], [62, 14.4, 1], [66, 15], [72, 15]], { tone: "hi" }, { inner: Ln(G.arcOf(F, 66, 15, P), { tone: "faint" }) });
  disc("pf.spouts", F, 50, 54, 5, { tone: "hi" });
}
for (const y of [-3.2, 3.2]) disc("pf.spout", ZF(GX, y), 45, 50, 1.3, { tone: "hi" });
box("pf.neck", [91, -3, 66], [97, 3, 71], { tone: "hi" }, { r: 0.8, steps: 2 });
turned("pf.handle", G.frameOf([97, 0, 68.5], [1, 0, 0], [0, 1, 0], [0, 0, 1]), [[0, 2.4], [3, 2.8, 1], [26, 3.8, 1], [33, 3.5, 1], [36, 2, 1], [36.6, 0.2]], { tone: "mid" });

const TRAY = [60, -38, 4];
{
  const pull = [[110.05, -12, 7], [110.05, 12, 7], [110.05, 12, 10], [110.05, -12, 10]];
  box("tray", TRAY, [110, 38, 16], { tone: "mid" }, { r: 3, steps: 4, bevel: 0.6, inner: Ln(k.sideSeam({ x: 60, y: -38, w: 50, d: 76, r: 3 }, 12, P, 4), { tone: "faint" }), extra: `<path class="em-void" d="${path3(pull, true)}"/>` + Ln(path3(pull, true), { tone: "lo" }) });
}
{
  const slots = Array.from({ length: 9 }, (_, i) => k.planOutline({ x: 64.5 + i * 4.8, y: -32, w: 1.6, d: 64, r: 0.8 }, 17.2, P, 3)).join("");
  box("tray.grate", [62, -36, 16], [108, 36, 17.2], { tone: "lo" }, { r: 2, steps: 3, extra: Ln(slots, { tone: "faint" }) });
}
// A 1.5 oz shot glass on the grate: thick base, thin tapered wall, a 1 oz mark.
const CUP = { x: GX, y: 0, z0: 17.2, floor: 20.2, z1: 43, rOut0: 8.6, rOut1: 10.6, wall: 0.8 };
const glassOut = (z) => CUP.rOut0 + ((z - CUP.z0) * (CUP.rOut1 - CUP.rOut0)) / (CUP.z1 - CUP.z0);
const glassIn = (z) => glassOut(z) - CUP.wall;
const GLASS_SLOPE = (CUP.rOut1 - CUP.rOut0) / (CUP.z1 - CUP.z0);
const ML_PER_UNIT3 = 0.008;
function zForMl(ml) {
  let z = CUP.floor;
  let left = ml;
  while (left > 0) {
    left -= Math.PI * glassIn(z) ** 2 * 0.01 * ML_PER_UNIT3;
    z += 0.01;
  }
  return z;
}
const OZ1 = zForMl(29.57);
{
  const F = ZF(GX, 0);
  const marks = [Ln(G.arcOf(F, CUP.floor, glassOut(CUP.floor), P, { slope: GLASS_SLOPE }), { tone: "faint" }), Ln(G.arcOf(F, OZ1, glassOut(OZ1), P, { slope: GLASS_SLOPE }), { tone: "lo" })].join("");
  turned("glass", F, [[CUP.z0, CUP.rOut0], [CUP.z1, CUP.rOut1]], { tone: "hi", className: "em-glass" }, { inner: marks, extra: Ln(G.circleOf(F, CUP.z1, glassIn(CUP.z1), P, 96), { tone: "faint" }) });
}

// Front panel: pressure gauge and three rocker switches.
const GAUGE = { y: 14, z: 150, r: 11, face: 63.4 };
{
  const F = XF(GAUGE.y, GAUGE.z);
  const face = (theta, r) => [GAUGE.face + 0.05, GAUGE.y - r * Math.sin(theta), GAUGE.z + r * Math.cos(theta)];
  const tick = (bar, r0) => {
    const theta = ((bar / MODEL.GAUGE_MAX) * 2 - 1) * MODEL.GAUGE_SWEEP;
    return path3([face(theta, r0), face(theta, 9.4)]);
  };
  const minor = Array.from({ length: MODEL.GAUGE_MAX + 1 }, (_, bar) => (bar % 4 ? tick(bar, 8.2) : "")).join("");
  const major = [0, 4, 8, 12, 16].map((bar) => tick(bar, 7)).join("");
  const zone = [];
  const a0 = ((8 / MODEL.GAUGE_MAX) * 2 - 1) * MODEL.GAUGE_SWEEP;
  const a1 = ((10 / MODEL.GAUGE_MAX) * 2 - 1) * MODEL.GAUGE_SWEEP;
  for (let i = 0; i <= 12; i++) zone.push(face(a0 + ((a1 - a0) * i) / 12, 9.4));
  for (let i = 12; i >= 0; i--) zone.push(face(a0 + ((a1 - a0) * i) / 12, 8.4));
  const faceArt = [
    Ln(G.circleOf(F, GAUGE.face, 9.4, P, 72), { tone: "lo" }),
    Ln(minor, { tone: "lo" }),
    Ln(major, { tone: "mid" }),
    `<path class="em-zone" d="${path3(zone, true)}"/>`,
  ].join("");
  disc("gauge", F, 60, GAUGE.face, GAUGE.r, { tone: "mid" }, { bevel: 0.6, extra: faceArt });
}
const SWITCHES = [-40, -30, -20];
SWITCHES.forEach((y, index) => {
  box("switch.base", [60, y - 3.6, 145], [61.4, y + 3.6, 157], { tone: "lo" }, { r: 0.6 });
  box("switch.rocker", [61.4, y - 2.6, 146.5], [63, y + 2.6, 155.5], { tone: "mid" }, { r: 0.6, attrs: ` data-switch="${index}"` });
  disc("switch.lamp", XF(y, 162), 60, 61, 1.4, { tone: "mid" }, { attrs: ` data-lamp="${index}"` });
});

// Steam valve and wand, on the open side of the front.
{
  const knurl = G.ribsOf(XF(40, 130), 63, 69, 4.6, 30, P, { fade: [0.1, 0.55], seams: true });
  disc("steam.stem", XF(40, 130), 60, 63, 2.2, { tone: "mid" });
  turned("steam.knob", XF(40, 130), [[63, 4.6], [69, 4.6], [70, 3.8]], { tone: "mid" }, { inner: Faded(knurl, { tone: "lo" }), extra: Ln(G.circleOf(XF(40, 130), 70, 1.4, P, 24), { tone: "faint" }) });
  disc("steam.boss", XF(40, 112), 60, 63.4, 3.4, { tone: "mid" }, { bevel: 0.3 });
  line("steam.wand", [[63.4, 40, 112], [72, 40, 112], [80, 46, 72], [80, 46, 62]], 1.5, { tone: "mid", bend: 6, maxLength: 10 });
  turned("steam.tip", ZF(80, 46), [[57, 1.2], [58, 2], [62, 2]], { tone: "mid" });
}

// Terminal block on the far wall, wired to the switch block.
{
  const screws = Array.from({ length: 5 }, (_, i) => at([-32.4 + i * 4.4, -42, 50.6]));
  box("terminals", [-36, -50.6, 44], [-12, -42, 56], { tone: "lo" }, { r: 0.8, steps: 2, bevel: 0.3, inner: Ln(k.sideSeam({ x: -36, y: -50.6, w: 24, d: 8.6, r: 0.8 }, 50, P, 2), { tone: "faint" }), extra: Dots(screws, { size: 0.55, tone: "mid" }) });
  box("terminals.rail", [-38, -52, 47], [-10, -50.6, 53], { tone: "mid" }, { r: 0.3, extra: Dots([at([-37, -50.6, 50]), at([-11, -50.6, 50])], { size: 0.4 }) });
  line("cable.mains", [[-16, -44, 56], [-16, -44, 146], [48, -44, 146]], 0.6, { tone: "lo", limp: true, bend: 4 });
  const lug = record(A.cylinder(24, -6, 1.6, 101, 7, { name: "boiler.lug" }));
  put("boiler.lug", [24, -6, 104.5], S(k.cylinder(24, -6, 1.6, 101, 7, P, 16), { tone: "mid" }), [lug]);
  line("cable.heater", [[-30, -44, 56], [-30, -44, 94], [24, -6, 94], [24, -6, 101]], 0.6, { tone: "lo", limp: true, bend: 4 });
}

// Label plate under the switches and the drip tray's pull slot.
{
  const rules = [[134.6, 26], [137.4, 18]].map(([z, w]) => path3([[60.85, -44 + 3, z], [60.85, -44 + 3 + w, z]])).join("");
  box("label", [60, -44, 131], [60.8, -16, 141], { tone: "lo" }, { r: 0.4, extra: Ln(rules, { tone: "lo", free: true }) + Dots([at([60.8, -42, 132.4]), at([60.8, -18, 139.6])], { size: 0.4 }) });
}

// ---------------------------------------------------------------- order, slots, page
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const indexOf = (name) => R.items.findIndex((item) => item.name === name);
const lastOf = (prefix) => R.items.reduce((best, item, index) => (item.name.startsWith(prefix) ? index : best), -1);

const slots = new Map();
const add = (index, svg) => slots.set(index, (slots.get(index) ?? "") + svg);
const spoutTips = [-3.2, 3.2].map((y) => [GX, y, 45]);
add(indexOf("glass") - 1, [
  `<path class="em-coffee" data-part="coffee" d=""/>`,
  `<path class="em-crema" data-part="crema" d=""/>`,
  `<g data-part="streams">${spoutTips.map(() => `<path class="em-stream" d=""/>`).join("")}</g>`,
].join(""));
const hub = [GAUGE.face + 0.1, GAUGE.y, GAUGE.z];
add(indexOf("gauge"), `<path data-part="needle" class="iso-line" data-tone="lit" data-free="" style="stroke-width:1.1" d=""/>` + Dots([at(hub)], { size: 1.1, tone: "hi" }));

const groups = R.items.map((item, index) => `<g class="it" data-name="${item.name}"${item.attrs ?? ""}>${item.svg}</g>${slots.get(index) ?? ""}`);

const LABEL_TEXT =
  "A single-boiler espresso machine on a bench with its left side panel off. At the back is the water tank; on the floor a vibratory pump draws from it and pushes through a tee, where an over-pressure valve returns any excess to the tank, up a riser into the boiler. From the boiler a solenoid brew valve feeds the group head on the front, where the portafilter holds the coffee over a shot glass on the drip tray. A pressure gauge, a steam valve and wand, and three rocker switches sit on the front panel.";
const svg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, body: [...back, `<g class="em-machine">${groups.join("")}</g>`] });

const DATA = {
  P,
  gauge: GAUGE,
  hub,
  cup: CUP,
  oz1: OZ1,
  spouts: spoutTips,
  tank: { x0: TANK.x, x1: TANK.x + TANK.w, y0: TANK.y, y1: TANK.y + TANK.d, z0: TANK_Z[0] + 1, area: TANK.w * TANK.d },
  model: MODEL,
};

const CSS = readFileSync(join(HERE, "espresso.css"), "utf8");
const latheSource = readFileSync(join(HERE, "..", "..", "kit", "lathe.mjs"), "utf8").replace(/^import .*$/m, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {${latheSource}\nreturn { frameOf, circleOf };})();\n`;
const modelScript = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const body =
  `<style>${CSS}</style>` +
  k.plateHtml({
    fig: "Fig 5",
    title: "Espresso machine, side off",
    hint: "Space or click: pull a shot · ← → grind",
    readout: `ready · ${MODEL.BREW_C} °C · grind ${MODEL.GRIND_DEFAULT}`,
    keys: [
      { mark: "lit", label: "Gauge needle: pressure at the puck, from the same model as the flow" },
      { mark: "raised", label: "Water path: tank, pump, tee, boiler, brew valve, group, puck, glass" },
      { mark: "edge", label: "Over-pressure valve and return hose: the pump's surplus goes back to the tank" },
    ],
    caption:
      "A single-boiler machine in the style of a home espresso maker, about 33 cm tall, drawn at 2 mm to the unit with the left side panel off. Press the brew switch and the vibratory pump (rated 15 bar shut-off, about 650 ml a minute open) pushes water from the tank through the boiler, held at 93 °C, and the opened brew valve to the group. The coffee puck resists the flow like a filter (Darcy's law: flow is proportional to pressure, and to the square of the grind size), so the pressure climbs until the over-pressure valve cracks at 9 bar and sends the pump's surplus back to the tank. An 18 g dose at grind 4 gives 36 g of espresso, just over the shot glass's 1 oz line, in about 25 s. Grind finer and the shot chokes; grind coarse enough and the puck takes everything the pump can give before 9 bar, the gauge reads low and the shot gushes. When the shot stops, the three-way brew valve vents the group to the drip tray and the needle falls.",
    body: `<div class="iso-stage em-stage" tabindex="0" role="group" aria-label="Espresso machine. Press space or click to start or stop a shot; left and right arrows set the grind from 1, fine, to 9, coarse.">${svg}<span class="em-sr" role="status" aria-live="polite" data-status></span></div>`,
  });

const page = k.pageHtml({ title: "Espresso machine", theme: THEME, body, script: kitScript() + latheScript + modelScript + LIVE, width: 650 });
const name = THEME === "light" ? "espresso-machine-light.html" : "espresso-machine.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `${LINES.length} lines`, `scale ${KS.toFixed(3)}`);

A.auditOrExit(R, P, {});
