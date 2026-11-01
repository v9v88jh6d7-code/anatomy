// The shot, as a small pure model shared by the build and the page.
//
// Pump: a vibratory pump's flow falls roughly linearly with the pressure it works against,
// from about 650 ml/min open (10.8 ml/s) to nothing at its 15 bar shut-off.
// Puck: ground coffee resists flow like a packed filter (Darcy's law): flow = k * pressure,
// and its permeability k grows with the square of the particle size (Kozeny-Carman).
// Over-pressure valve: cracks at 9 bar and returns whatever the puck can't take to the tank.
export const MODEL = {
  PUMP_MAX_BAR: 15,
  PUMP_OPEN_MLS: 10.8,
  OPV_BAR: 9,
  RISE_S: 1.0,
  VENT_S: 0.25,
  WET_ML: 8,
  DOSE_G: 18,
  YIELD_G: 36,
  GIVE_UP_S: 60,
  BREW_C: 93,
  GRIND_DEFAULT: 4,
  GRIND_MIN: 1,
  GRIND_MAX: 9,
  K_REF: 0.2,
  D_REF_UM: 360,
  GAUGE_MAX: 16,
  GAUGE_SWEEP: (135 * Math.PI) / 180,
};

// Particle size of a grind setting, in micrometres.
export const grindMicrons = (grind) => 160 + 50 * grind;

// Puck permeability in ml/s per bar.
export const puckK = (grind) => MODEL.K_REF * (grindMicrons(grind) / MODEL.D_REF_UM) ** 2;

// Pump flow at a pressure.
export const pumpFlow = (bar) => Math.max(0, MODEL.PUMP_OPEN_MLS * (1 - bar / MODEL.PUMP_MAX_BAR));

// Pressure the system settles at: where pump flow meets puck flow, capped by the OPV.
export const settlePressure = (grind) => Math.min(MODEL.OPV_BAR, MODEL.PUMP_OPEN_MLS / (puckK(grind) + MODEL.PUMP_OPEN_MLS / MODEL.PUMP_MAX_BAR));

// One step of the shot. state: { brewing, bar, t, inMl, outG }.
export function stepShot(state, grind, dt) {
  const target = state.brewing ? settlePressure(grind) : 0;
  const tau = state.brewing ? MODEL.RISE_S : MODEL.VENT_S;
  state.bar += (target - state.bar) * (1 - Math.exp(-dt / tau));
  if (Math.abs(target - state.bar) < 1e-4) state.bar = target;
  const flow = state.brewing ? puckK(grind) * state.bar : 0;
  if (state.brewing) {
    state.t += dt;
    state.inMl += flow * dt;
    state.outG = Math.max(0, state.inMl - MODEL.WET_ML);
  }
  state.flow = state.outG > 0 ? flow : 0;
  state.bypass = state.brewing && state.bar >= MODEL.OPV_BAR - 0.02 ? Math.max(0, pumpFlow(state.bar) - flow) : 0;
  return state;
}

// Time and pressure of a whole shot at a grind, for the caption and the checks.
export function simulate(grind, dt = 1 / 240) {
  const s = { brewing: true, bar: 0, t: 0, inMl: 0, outG: 0 };
  while (s.outG < MODEL.YIELD_G && s.t < MODEL.GIVE_UP_S) stepShot(s, grind, dt);
  return { seconds: s.t, grams: s.outG, bar: s.bar };
}
