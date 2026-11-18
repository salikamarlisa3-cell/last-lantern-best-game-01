// The screenshot scenes behind ?shot=title|play|choice|over. Each one plays the real rules
// forward from a fresh world, steered by an autopilot, so the frame is what a real game
// looks like and the same seed always gives the same frame. The choice scene uses a
// competent pilot that guards the lantern the way a careful player does; the play scene
// uses a patient one that lets a swarm gather before opening fire, so the frame catches
// the fight at full density; the over scene uses a reckless one that stands in the swarm
// and is overrun, as a hurried player is.

import { LANTERN_POS, STEP } from './config.js';
import { KIND_SPITTER, PHASE_CHOICE, PHASE_LOST, PHASE_WON } from './world.js';
import { SCREEN_CHOICE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** Boons the pilot takes when offered, best first: it plays to survive, not to experiment. */
const BOON_PREFERENCE = ['tempo', 'bright', 'twin', 'pierce', 'charm', 'ward', 'swift', 'wind', 'cache'];

function aliveEnemies(state) {
  const alive = [];
  for (const e of state.enemies) if (e.active && !e.ambient) alive.push(e);
  return alive;
}

/** The foe that most threatens the lantern right now: a latched Cinderback above all. */
function priorityTarget(state) {
  let best = null;
  let bestScore = Infinity;
  for (const e of state.enemies) {
    if (!e.active || e.ambient) continue;
    if (e.latched) return e;
    const toLantern = Math.hypot(e.x - state.lantern.x, e.y - state.lantern.y);
    const score = e.kind === KIND_SPITTER
      ? toLantern + Math.hypot(e.x - state.keeper.x, e.y - state.keeper.y) * 0.4
      : toLantern;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/**
 * One step of the competent pilot: it orbits the lantern on the threat's side, keeps its
 * distance from the swarm, dashes out of a closing ring, and shoots the priority foe.
 */
function skilledControl(state) {
  const keeper = state.keeper;
  const target = priorityTarget(state);
  let moveX = 0;
  let moveY = 0;
  // Stand on the line between the lantern and the worst threat, a bowshot out.
  const anchorAngle = target === null
    ? Math.atan2(keeper.y - LANTERN_POS.y, keeper.x - LANTERN_POS.x)
    : Math.atan2(target.y - LANTERN_POS.y, target.x - LANTERN_POS.x);
  const anchorX = LANTERN_POS.x + Math.cos(anchorAngle) * 178;
  const anchorY = LANTERN_POS.y + Math.sin(anchorAngle) * 178;
  moveX = anchorX - keeper.x;
  moveY = anchorY - keeper.y;
  // Repulsion from anything close enough to touch.
  let nearest = Infinity;
  for (const e of state.enemies) {
    if (!e.active || e.ambient) continue;
    const dx = keeper.x - e.x;
    const dy = keeper.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    nearest = Math.min(nearest, dist);
    if (dist < 110) {
      const push = (110 - dist) / 110 * 260;
      moveX += (dx / dist) * push;
      moveY += (dy / dist) * push;
    }
  }
  const len = Math.hypot(moveX, moveY);
  if (len > 26) {
    moveX /= len;
    moveY /= len;
  } else {
    moveX = 0;
    moveY = 0;
  }
  return {
    moveX,
    moveY,
    aimX: target === null ? keeper.x + Math.cos(keeper.aim) * 60 : target.x,
    aimY: target === null ? keeper.y + Math.sin(keeper.aim) * 60 : target.y,
    firing: target !== null,
    dash: nearest < 62 && keeper.dashCdT <= 0,
  };
}

/**
 * The patient pilot for the play scene: it moves exactly like the competent one but holds
 * its fire while the Gloam is still gathering, shooting only at a latched Cinderback or a
 * foe about to reach the lantern. Once the field is crowded it opens up — so the staged
 * frame holds a real swarm mid-attack, not the empty field a crack shot leaves behind.
 */
function playControl(state) {
  const control = skilledControl(state);
  if (control.firing) {
    const target = priorityTarget(state);
    const targetAtLantern = target !== null && !target.latched &&
      Math.hypot(target.x - LANTERN_POS.x, target.y - LANTERN_POS.y) < 130;
    if (target !== null && !target.latched && !targetAtLantern && aliveEnemies(state).length < 8) {
      control.firing = false;
    }
  }
  return control;
}

/** The reckless pilot: rooted beside the lantern, firing in bursts, never dodging. */
function recklessControl(state, stepCount) {
  const keeper = state.keeper;
  let target = null;
  let best = Infinity;
  for (const e of state.enemies) {
    if (!e.active || e.ambient) continue;
    const dist = Math.hypot(e.x - keeper.x, e.y - keeper.y);
    if (dist < best) {
      best = dist;
      target = e;
    }
  }
  return {
    moveX: 0,
    moveY: 0,
    aimX: target === null ? keeper.x + 40 : target.x,
    aimY: target === null ? keeper.y - 40 : target.y,
    firing: target !== null && stepCount % 3 !== 0,
    dash: false,
  };
}

function pickBoonByPreference(world) {
  const choices = world.state.choices;
  for (const id of BOON_PREFERENCE) {
    const index = choices.indexOf(id);
    if (index !== -1) {
      world.chooseBoon(index);
      return;
    }
  }
  world.chooseBoon(0);
}

function runPilot(world, controlFor, stopWhen, maxSeconds) {
  let stepCount = 0;
  const maxSteps = Math.floor(maxSeconds / STEP);
  while (stepCount < maxSteps) {
    if (world.state.phase === PHASE_CHOICE) pickBoonByPreference(world);
    world.step(STEP, controlFor(world.state, stepCount));
    stepCount += 1;
    if (stopWhen(world.state)) break;
    // A run that ended early can never reach its scene; stop instead of idling to the cap.
    if (world.state.phase === PHASE_LOST || world.state.phase === PHASE_WON) break;
  }
  return stepCount;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best score
 * to show. Any other name is the title.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    world.beginNight();
    // A busy third-night moment: a gathered swarm on the field and light already in flight.
    const busyThirdNight = (state) => state.night >= 3 && aliveEnemies(state).length >= 8 &&
      state.bolts.some((b) => b.active);
    runPilot(world, playControl, busyThirdNight, 900);
    if (!busyThirdNight(world.state)) {
      // Fallback: the competent pilot on a looser brief, a crowded second night onward.
      world.reset();
      world.beginNight();
      runPilot(world, skilledControl, (state) => state.night >= 2 &&
        aliveEnemies(state).length >= 5 && state.kills >= 8, 900);
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'choice') {
    world.beginNight();
    runPilot(world, skilledControl, (state) => state.phase === PHASE_CHOICE, 600);
    return { screen: SCREEN_CHOICE, best: world.state.score };
  }
  if (name === 'over') {
    world.beginNight();
    // Put the reckless keeper in the moths' road, a short step from the lantern.
    world.state.keeper.x = LANTERN_POS.x + 96;
    world.state.keeper.y = LANTERN_POS.y + 44;
    runPilot(world, recklessControl, (state) => state.phase === PHASE_LOST, 1800);
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  for (let i = 0; i < 6 / STEP; i += 1) world.stepAmbient(STEP);
  return { screen: SCREEN_TITLE, best: 0 };
}
