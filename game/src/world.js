// Last Lantern's rules and state, with no drawing and no browser in it: the keeper, the
// lantern, the Gloam that come for its flame, the waves of the ten nights, the boons chosen
// between them, pickups, particles and floating score text. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react with sound and screen
// changes without the world knowing about either. Pools are allocated once, at boot.

import {
  BEETLE, FIELD, KEEPER, LANTERN, LANTERN_POS, MOTH, NIGHTS, PICKUP, POOLS, SPITTER, UPGRADES, WAVE,
} from './config.js';
import { range } from './random.js';

export const KIND_MOTH = 0;
export const KIND_BEETLE = 1;
export const KIND_SPITTER = 2;

export const PICK_KINDLING = 0;
export const PICK_HEART = 1;
export const PICK_FROST = 2;

export const EV_SHOOT = 1;
export const EV_HIT = 2;
export const EV_KILL = 4;
export const EV_BEETLE_DOWN = 8;
export const EV_KEEPER_HURT = 16;
export const EV_LANTERN_HURT = 32;
export const EV_PICKUP = 64;
export const EV_FROST = 128;
export const EV_DASH = 256;
export const EV_WAVE_CLEAR = 512;
export const EV_WON = 1024;
export const EV_LOST = 2048;
export const EV_NIGHT_START = 4096;

export const PHASE_READY = 'ready';
export const PHASE_FIGHTING = 'fighting';
export const PHASE_CHOICE = 'choice';
export const PHASE_INTERMISSION = 'intermission';
export const PHASE_WON = 'won';
export const PHASE_LOST = 'lost';

function makePool(size, make) {
  const pool = [];
  for (let i = 0; i < size; i += 1) pool.push(make());
  return pool;
}

function freeOf(pool) {
  for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
  return null;
}

function distance2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** The spawn list of a night: how many of each kind of Gloam come for the flame. */
export function composeNight(night) {
  return {
    moth: 5 + night * 3,
    beetle: night >= 2 ? Math.min(night - 1, 6) : 0,
    spitter: night >= 3 ? Math.min(night - 2, 5) : 0,
  };
}

export function createWorld(random) {
  let serial = 0;
  const keeper = {
    x: LANTERN_POS.x - 170, y: LANTERN_POS.y + 96, radius: KEEPER.radius,
    hearts: KEEPER.hearts, maxHearts: KEEPER.hearts, aim: -Math.PI / 2,
    fireT: 0, dashT: 0, dashCdT: 0, dashX: 1, dashY: 0, invulnT: 0, moving: false,
  };
  const lantern = { x: LANTERN_POS.x, y: LANTERN_POS.y, radius: LANTERN.radius, flame: LANTERN.maxFlame, maxFlame: LANTERN.maxFlame };
  const enemies = makePool(POOLS.enemies, () => ({
    active: false, serial: 0, kind: KIND_MOTH, x: 0, y: 0, hp: 1, maxHp: 1, radius: 12,
    speed: 60, phase: 0, shootT: 0, windupT: 0, latched: false, latchAngle: 0,
    flashT: 0, knockX: 0, knockY: 0, ambient: false, orbit: 0,
  }));
  const bolts = makePool(POOLS.bolts, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, pierceLeft: 0, h0: -1, h1: -1, h2: -1,
  }));
  const gloom = makePool(POOLS.gloomBolts, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  const pickups = makePool(POOLS.pickups, () => ({ active: false, kind: PICK_KINDLING, x: 0, y: 0, vx: 0, vy: 0, life: 0, bob: 0 }));
  const particles = makePool(POOLS.particles, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#ffffff', gravity: 0, drag: 1,
  }));
  const floaters = makePool(POOLS.floaters, () => ({ active: false, x: 0, y: 0, life: 0, text: '', color: '#ffffff' }));

  const state = {
    phase: PHASE_READY,
    keeper, lantern, enemies, bolts, gloom, pickups, particles, floaters,
    score: 0, night: 1, kills: 0, time: 0, bonus: 0,
    upgrades: {}, choices: [], endless: false, lostCause: null,
    spawnQueue: [], spawned: 0, spawnTotal: 0, spawnTimer: 0, interT: 0,
    slowT: 0, shake: 0, emberT: 0,
  };

  // ---- derived stats: what the boons taken so far make of the keeper and the lantern ----
  const stacks = (id) => state.upgrades[id] ?? 0;
  const fireInterval = () => KEEPER.fireInterval * 0.85 ** stacks('tempo');
  const boltCount = () => 1 + stacks('twin');
  const boltDamage = () => 1 + stacks('bright');
  const boltPierce = () => stacks('pierce');
  const keeperSpeed = () => KEEPER.speed * 1.12 ** stacks('swift');
  const dashCooldown = () => KEEPER.dashCooldown * 0.7 ** stacks('wind');
  const flameRegen = () => 0.6 * stacks('charm');
  state.derived = { fireInterval, boltCount, boltDamage, boltPierce, keeperSpeed, dashCooldown, flameRegen, stacks };

  function burst(x, y, count, color, speed, life, size, gravity = 0) {
    for (let i = 0; i < count; i += 1) {
      const p = freeOf(particles);
      if (p === null) return;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * v; p.vy = Math.sin(angle) * v;
      p.maxLife = life * (0.6 + random() * 0.7);
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.8);
      p.color = color;
      p.gravity = gravity;
      p.drag = 0.9;
    }
  }

  function addFloater(x, y, text, color) {
    const f = freeOf(floaters);
    if (f === null) return;
    f.active = true;
    f.x = x; f.y = y;
    f.life = 0.9;
    f.text = text;
    f.color = color;
  }

  function reset() {
    for (const pool of [enemies, bolts, gloom, pickups, particles, floaters]) {
      for (const item of pool) item.active = false;
    }
    keeper.x = LANTERN_POS.x - 170;
    keeper.y = LANTERN_POS.y + 96;
    keeper.hearts = KEEPER.hearts;
    keeper.maxHearts = KEEPER.hearts;
    keeper.aim = -Math.PI / 2;
    keeper.fireT = 0; keeper.dashT = 0; keeper.dashCdT = 0; keeper.invulnT = 0;
    lantern.flame = lantern.maxFlame;
    state.phase = PHASE_READY;
    state.score = 0;
    state.night = 1;
    state.kills = 0;
    state.time = 0;
    state.bonus = 0;
    state.upgrades = {};
    state.choices = [];
    state.endless = false;
    state.lostCause = null;
    state.spawnQueue = [];
    state.spawned = 0;
    state.spawnTotal = 0;
    state.slowT = 0;
    state.shake = 0;
  }

  /** Lay out the night's spawn queue and start it. */
  function beginNight() {
    const mix = composeNight(state.night);
    const queue = [];
    for (let i = 0; i < mix.moth; i += 1) queue.push(KIND_MOTH);
    for (let i = 0; i < mix.beetle; i += 1) queue.push(KIND_BEETLE);
    for (let i = 0; i < mix.spitter; i += 1) queue.push(KIND_SPITTER);
    // Shuffle so kinds interleave through the night instead of arriving in blocks.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const swap = queue[i];
      queue[i] = queue[j];
      queue[j] = swap;
    }
    state.spawnQueue = queue;
    state.spawnTotal = queue.length;
    state.spawned = 0;
    state.spawnTimer = 0.9;
    state.phase = PHASE_FIGHTING;
  }

  function spawnPoint() {
    // A point just outside a random edge, retried until it is not on top of the keeper.
    for (let tries = 0; tries < 6; tries += 1) {
      const edge = Math.floor(random() * 4);
      let x = 0;
      let y = 0;
      if (edge === 0) { x = random() * FIELD.width; y = -36; }
      else if (edge === 1) { x = random() * FIELD.width; y = FIELD.height + 36; }
      else if (edge === 2) { x = -36; y = random() * FIELD.height; }
      else { x = FIELD.width + 36; y = random() * FIELD.height; }
      if (distance2(x, y, keeper.x, keeper.y) > 150 * 150) return { x, y };
    }
    return { x: -36, y: -36 };
  }

  function spawnEnemy(kind) {
    const e = freeOf(enemies);
    if (e === null) return;
    const at = spawnPoint();
    const hpScale = 1 + WAVE.hpPerNight * (state.night - 1);
    const speedScale = 1 + WAVE.speedPerNight * (state.night - 1);
    serial += 1;
    e.active = true;
    e.serial = serial;
    e.kind = kind;
    e.x = at.x; e.y = at.y;
    e.latched = false;
    e.flashT = 0;
    e.knockX = 0; e.knockY = 0;
    e.ambient = false;
    e.windupT = 0;
    e.phase = random() * Math.PI * 2;
    if (kind === KIND_MOTH) {
      e.hp = e.maxHp = MOTH.hp;
      e.radius = MOTH.radius;
      e.speed = range(random, MOTH.speedMin, MOTH.speedMax) * speedScale;
    } else if (kind === KIND_BEETLE) {
      e.hp = e.maxHp = Math.round(BEETLE.hp * hpScale);
      e.radius = BEETLE.radius;
      e.speed = BEETLE.speed * speedScale;
    } else {
      e.hp = e.maxHp = Math.round(SPITTER.hp * hpScale);
      e.radius = SPITTER.radius;
      e.speed = SPITTER.speed * speedScale;
      e.shootT = range(random, SPITTER.spitIntervalMin, SPITTER.spitIntervalMax);
    }
    state.spawned += 1;
  }

  function spawnAmbientMoth() {
    const e = freeOf(enemies);
    if (e === null) return;
    serial += 1;
    e.active = true;
    e.serial = serial;
    e.kind = KIND_MOTH;
    e.ambient = true;
    e.hp = e.maxHp = MOTH.hp;
    e.radius = MOTH.radius;
    e.speed = range(random, 26, 44);
    e.orbit = range(random, 90, 210);
    e.phase = random() * Math.PI * 2;
    const angle = random() * Math.PI * 2;
    e.x = lantern.x + Math.cos(angle) * e.orbit;
    e.y = lantern.y + Math.sin(angle) * e.orbit * 0.72;
    e.latched = false;
    e.flashT = 0;
    e.knockX = 0; e.knockY = 0;
    e.windupT = 0;
  }

  function dropPickup(x, y) {
    const roll = random();
    let kind = -1;
    if (roll < PICKUP.heartChance) kind = keeper.hearts < keeper.maxHearts ? PICK_HEART : PICK_KINDLING;
    else if (roll < PICKUP.heartChance + PICKUP.kindlingChance) kind = PICK_KINDLING;
    else if (roll < PICKUP.heartChance + PICKUP.kindlingChance + PICKUP.frostChance) kind = PICK_FROST;
    if (kind === -1) return;
    const p = freeOf(pickups);
    if (p === null) return;
    p.active = true;
    p.kind = kind;
    p.x = x; p.y = y;
    p.vx = range(random, -24, 24);
    p.vy = range(random, -24, 24);
    p.life = PICKUP.life;
    p.bob = random() * Math.PI * 2;
  }

  function killEnemy(e, events) {
    e.active = false;
    state.kills += 1;
    const gained = e.kind === KIND_MOTH ? MOTH.score : e.kind === KIND_BEETLE ? BEETLE.score : SPITTER.score;
    state.score += gained;
    addFloater(e.x, e.y - 10, `+${gained}`, '#ffc95e');
    if (e.kind === KIND_BEETLE) {
      burst(e.x, e.y, 26, '#ff7a3c', 260, 0.6, 4, 300);
      burst(e.x, e.y, 12, '#5a2e22', 160, 0.7, 6, 200);
      events |= EV_BEETLE_DOWN;
    } else if (e.kind === KIND_SPITTER) {
      burst(e.x, e.y, 18, '#c77dff', 220, 0.5, 3.5);
      events |= EV_KILL;
    } else {
      burst(e.x, e.y, 12, '#b9a7d9', 170, 0.45, 3);
      events |= EV_KILL;
    }
    dropPickup(e.x, e.y);
    return events;
  }

  function hurtKeeper(fromX, fromY, events) {
    if (keeper.invulnT > 0 || keeper.dashT > 0 || state.phase === PHASE_LOST) return events;
    keeper.hearts -= 1;
    keeper.invulnT = KEEPER.invulnerable;
    const dx = keeper.x - fromX;
    const dy = keeper.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    keeper.x += (dx / len) * (KEEPER.knockback * 0.14);
    keeper.y += (dy / len) * (KEEPER.knockback * 0.14);
    state.shake = Math.max(state.shake, 7);
    burst(keeper.x, keeper.y, 14, '#ff6b81', 200, 0.5, 3.5);
    events |= EV_KEEPER_HURT;
    if (keeper.hearts <= 0) {
      state.phase = PHASE_LOST;
      state.lostCause = 'keeper';
      events |= EV_LOST;
    }
    return events;
  }

  /** `quiet` is for the Cinderback's steady drain: no burst and no hurt flag every frame. */
  function hurtLantern(amount, x, y, events, quiet = false) {
    if (state.phase === PHASE_LOST) return events;
    lantern.flame -= amount;
    if (!quiet) {
      burst(x, y, 8, '#ffb347', 150, 0.4, 3);
      events |= EV_LANTERN_HURT;
    }
    if (lantern.flame <= 0) {
      lantern.flame = 0;
      state.phase = PHASE_LOST;
      state.lostCause = 'lantern';
      burst(lantern.x, lantern.y, 40, '#8b93a3', 200, 0.9, 4, -60);
      events |= EV_LOST;
    }
    return events;
  }

  function rollChoices() {
    const available = UPGRADES.filter((u) => stacks(u.id) < u.max);
    const chosen = [];
    const pool = [...available];
    while (chosen.length < 3 && pool.length > 0) {
      const index = Math.floor(random() * pool.length);
      chosen.push(pool.splice(index, 1)[0].id);
    }
    while (chosen.length < 3) chosen.push('cache');
    state.choices = chosen;
  }

  /** Take the boon at `index` of the current choices and move to the next night. */
  function chooseBoon(index) {
    const id = state.choices[index];
    if (id === undefined || state.phase !== PHASE_CHOICE) return;
    state.upgrades[id] = stacks(id) + 1;
    if (id === 'ward') {
      keeper.maxHearts = Math.min(KEEPER.maxHeartsCap, keeper.maxHearts + 1);
      keeper.hearts = Math.min(keeper.maxHearts, keeper.hearts + 1);
    } else if (id === 'charm') {
      lantern.flame = Math.min(lantern.maxFlame, lantern.flame + 20);
    } else if (id === 'cache') {
      state.score += 250;
      lantern.flame = Math.min(lantern.maxFlame, lantern.flame + 20);
    }
    state.choices = [];
    state.night += 1;
    state.phase = PHASE_INTERMISSION;
    state.interT = 1.4;
  }

  function fireBolts(events) {
    const count = boltCount();
    const base = keeper.aim;
    for (let i = 0; i < count; i += 1) {
      const b = freeOf(bolts);
      if (b === null) break;
      const offset = (i - (count - 1) / 2) * 0.07;
      const angle = base + offset;
      b.active = true;
      b.x = keeper.x + Math.cos(base) * (keeper.radius + 8);
      b.y = keeper.y + Math.sin(base) * (keeper.radius + 8);
      b.vx = Math.cos(angle) * KEEPER.boltSpeed;
      b.vy = Math.sin(angle) * KEEPER.boltSpeed;
      b.life = KEEPER.boltLife;
      b.pierceLeft = boltPierce();
      b.h0 = -1; b.h1 = -1; b.h2 = -1;
    }
    burst(keeper.x + Math.cos(base) * 26, keeper.y + Math.sin(base) * 26, 2, '#ffe9a8', 60, 0.18, 2.5);
    return events | EV_SHOOT;
  }

  function updateKeeper(dt, control, events) {
    if (keeper.invulnT > 0) keeper.invulnT = Math.max(0, keeper.invulnT - dt);
    if (keeper.dashCdT > 0) keeper.dashCdT = Math.max(0, keeper.dashCdT - dt);
    keeper.aim = Math.atan2(control.aimY - keeper.y, control.aimX - keeper.x);

    if (control.dash && keeper.dashCdT <= 0 && keeper.dashT <= 0) {
      keeper.dashT = KEEPER.dashTime;
      keeper.dashCdT = dashCooldown();
      const mx = control.moveX !== 0 || control.moveY !== 0 ? control.moveX : Math.cos(keeper.aim);
      const my = control.moveX !== 0 || control.moveY !== 0 ? control.moveY : Math.sin(keeper.aim);
      const len = Math.hypot(mx, my) || 1;
      keeper.dashX = mx / len;
      keeper.dashY = my / len;
      events |= EV_DASH;
    }

    let vx = 0;
    let vy = 0;
    if (keeper.dashT > 0) {
      keeper.dashT = Math.max(0, keeper.dashT - dt);
      vx = keeper.dashX * keeperSpeed() * KEEPER.dashSpeedScale;
      vy = keeper.dashY * keeperSpeed() * KEEPER.dashSpeedScale;
      const p = freeOf(particles);
      if (p !== null) {
        p.active = true;
        p.x = keeper.x; p.y = keeper.y;
        p.vx = 0; p.vy = 0;
        p.maxLife = 0.3; p.life = 0.3;
        p.size = keeper.radius; p.color = 'rgba(127, 231, 210, 0.35)';
        p.gravity = 0; p.drag = 1;
      }
    } else {
      vx = control.moveX * keeperSpeed();
      vy = control.moveY * keeperSpeed();
    }
    keeper.moving = vx !== 0 || vy !== 0;
    keeper.x += vx * dt;
    keeper.y += vy * dt;
    // The lantern is solid: the keeper walks around its stone ring, never through it.
    const dx = keeper.x - lantern.x;
    const dy = keeper.y - lantern.y;
    const dist = Math.hypot(dx, dy);
    const minDist = lantern.radius + keeper.radius + 4;
    if (dist < minDist && dist > 0.01) {
      keeper.x = lantern.x + (dx / dist) * minDist;
      keeper.y = lantern.y + (dy / dist) * minDist;
    }
    keeper.x = Math.min(FIELD.width - keeper.radius, Math.max(keeper.radius, keeper.x));
    keeper.y = Math.min(FIELD.height - keeper.radius, Math.max(keeper.radius, keeper.y));

    keeper.fireT -= dt;
    if (control.firing && keeper.fireT <= 0 && state.phase !== PHASE_CHOICE) {
      keeper.fireT = fireInterval();
      events = fireBolts(events);
    }
    return events;
  }

  function updateSpawning(dt) {
    if (state.phase !== PHASE_FIGHTING) return;
    state.spawnTimer -= dt;
    const interval = Math.max(WAVE.intervalMin, WAVE.intervalStart - WAVE.intervalPerNight * (state.night - 1));
    while (state.spawnTimer <= 0 && state.spawned < state.spawnTotal) {
      spawnEnemy(state.spawnQueue[state.spawned]);
      state.spawnTimer += interval;
    }
  }

  function updateEnemies(dt, events, harmless) {
    const slowScale = state.slowT > 0 ? PICKUP.frostSlowScale : 1;
    let alive = 0;
    for (const e of enemies) {
      if (!e.active) continue;
      alive += 1;
      if (e.flashT > 0) e.flashT = Math.max(0, e.flashT - dt);
      const speed = e.speed * slowScale;
      e.x += e.knockX * dt;
      e.y += e.knockY * dt;
      e.knockX *= 0.82;
      e.knockY *= 0.82;

      if (e.ambient) {
        e.phase += dt * 0.7;
        const tx = lantern.x + Math.cos(e.phase) * e.orbit;
        const ty = lantern.y + Math.sin(e.phase) * e.orbit * 0.72;
        e.x += (tx - e.x) * Math.min(1, dt * 1.4);
        e.y += (ty - e.y) * Math.min(1, dt * 1.4);
        continue;
      }

      if (e.kind === KIND_MOTH) {
        const dx = lantern.x - e.x;
        const dy = lantern.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        const wob = Math.sin(state.time * MOTH.wobble + e.phase) * 0.55;
        const px = -dy / dist;
        const py = dx / dist;
        e.x += ((dx / dist) + px * wob) * speed * dt;
        e.y += ((dy / dist) + py * wob) * speed * dt;
        if (!harmless && dist < lantern.radius + e.radius - 2) {
          e.active = false;
          burst(e.x, e.y, 10, '#6f5b93', 140, 0.4, 3);
          events = hurtLantern(LANTERN.mothBite, e.x, e.y, events);
          state.shake = Math.max(state.shake, 3);
        }
      } else if (e.kind === KIND_BEETLE) {
        if (e.latched) {
          e.x = lantern.x + Math.cos(e.latchAngle) * (lantern.radius + e.radius * 0.55);
          e.y = lantern.y + Math.sin(e.latchAngle) * (lantern.radius + e.radius * 0.55);
          if (!harmless) events = hurtLantern(LANTERN.beetleDrainPerSecond * dt, e.x, e.y, events, true);
        } else {
          const dx = lantern.x - e.x;
          const dy = lantern.y - e.y;
          const dist = Math.hypot(dx, dy) || 1;
          e.x += (dx / dist) * speed * dt;
          e.y += (dy / dist) * speed * dt;
          if (dist < lantern.radius + e.radius + 2) {
            e.latched = true;
            e.latchAngle = Math.atan2(e.y - lantern.y, e.x - lantern.x);
            if (!harmless) {
              events |= EV_LANTERN_HURT;
              state.shake = Math.max(state.shake, 4);
            }
          }
        }
      } else {
        // Sputter Imp: hold the band around the keeper, strafe, and spit gloom.
        const dx = keeper.x - e.x;
        const dy = keeper.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        let mx = 0;
        let my = 0;
        if (dist > SPITTER.bandMax) { mx = dx / dist; my = dy / dist; }
        else if (dist < SPITTER.bandMin) { mx = -dx / dist; my = -dy / dist; }
        const strafe = Math.sin(state.time * 0.9 + e.phase) > 0 ? 1 : -1;
        mx += (-dy / dist) * 0.6 * strafe;
        my += (dx / dist) * 0.6 * strafe;
        const mlen = Math.hypot(mx, my) || 1;
        e.x += (mx / mlen) * speed * dt;
        e.y += (my / mlen) * speed * dt;
        // Keep out of the lantern's ring.
        const lx = e.x - lantern.x;
        const ly = e.y - lantern.y;
        const ldist = Math.hypot(lx, ly);
        const minL = lantern.radius + e.radius + 6;
        if (ldist < minL && ldist > 0.01) {
          e.x = lantern.x + (lx / ldist) * minL;
          e.y = lantern.y + (ly / ldist) * minL;
        }
        if (!harmless) {
          if (e.windupT > 0) {
            e.windupT -= dt * (state.slowT > 0 ? PICKUP.frostSlowScale : 1);
            if (e.windupT <= 0) {
              const g = freeOf(gloom);
              if (g !== null) {
                const aim = Math.atan2(keeper.y - e.y, keeper.x - e.x);
                g.active = true;
                g.x = e.x; g.y = e.y;
                g.vx = Math.cos(aim) * SPITTER.boltSpeed;
                g.vy = Math.sin(aim) * SPITTER.boltSpeed;
                g.life = SPITTER.boltLife;
              }
              e.shootT = range(random, SPITTER.spitIntervalMin, SPITTER.spitIntervalMax);
            }
          } else {
            e.shootT -= dt * (state.slowT > 0 ? PICKUP.frostSlowScale : 1);
            if (e.shootT <= 0) e.windupT = SPITTER.windup;
          }
        }
      }

      // Contact with the keeper.
      if (!harmless && state.phase !== PHASE_LOST) {
        const kd = Math.hypot(keeper.x - e.x, keeper.y - e.y);
        if (kd < keeper.radius + e.radius - 2) {
          if (e.kind === KIND_MOTH) {
            e.active = false;
            burst(e.x, e.y, 8, '#b9a7d9', 130, 0.35, 3);
          } else {
            const push = 190;
            const px = (e.x - keeper.x) / (kd || 1);
            const py = (e.y - keeper.y) / (kd || 1);
            e.knockX += px * push;
            e.knockY += py * push;
            if (e.latched) e.latched = false;
          }
          events = hurtKeeper(e.x, e.y, events);
        }
      }
    }

    // Gentle separation so swarms read as bodies, not a single blob.
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active || a.latched) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active || b.latched) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5 * 0.6;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
    return { events, alive };
  }

  function updateBolts(dt, events) {
    for (const b of bolts) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!b.active) break;
        if (!e.active || e.ambient) continue;
        if (e.serial === b.h0 || e.serial === b.h1 || e.serial === b.h2) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d >= e.radius + 5) continue;
        if (b.h0 === -1) b.h0 = e.serial;
        else if (b.h1 === -1) b.h1 = e.serial;
        else b.h2 = e.serial;
        e.hp -= boltDamage();
        e.flashT = 0.09;
        const kb = e.kind === KIND_MOTH ? 130 : e.kind === KIND_SPITTER ? 70 : 22;
        e.knockX += (b.vx / KEEPER.boltSpeed) * kb;
        e.knockY += (b.vy / KEEPER.boltSpeed) * kb;
        burst(b.x, b.y, 3, '#ffe9a8', 120, 0.25, 2.5);
        events |= EV_HIT;
        if (e.hp <= 0) events = killEnemy(e, events);
        if (b.pierceLeft > 0) b.pierceLeft -= 1;
        else b.active = false;
      }
    }
    return events;
  }

  function updateGloom(dt, events) {
    for (const g of gloom) {
      if (!g.active) continue;
      g.life -= dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (g.life <= 0 || g.x < -20 || g.x > FIELD.width + 20 || g.y < -20 || g.y > FIELD.height + 20) {
        g.active = false;
        continue;
      }
      if (Math.hypot(keeper.x - g.x, keeper.y - g.y) < keeper.radius + 6) {
        g.active = false;
        events = hurtKeeper(g.x - g.vx * 0.01, g.y - g.vy * 0.01, events);
        continue;
      }
      if (Math.hypot(lantern.x - g.x, lantern.y - g.y) < lantern.radius + 6) {
        g.active = false;
        state.shake = Math.max(state.shake, 3);
        events = hurtLantern(LANTERN.boltBite, g.x, g.y, events);
      }
    }
    return events;
  }

  function updatePickups(dt, events) {
    for (const p of pickups) {
      if (!p.active) continue;
      p.life -= dt;
      p.bob += dt * 3;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      const dx = keeper.x - p.x;
      const dy = keeper.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < PICKUP.magnetRadius && dist > 0.01) {
        p.x += (dx / dist) * PICKUP.magnetSpeed * dt;
        p.y += (dy / dist) * PICKUP.magnetSpeed * dt;
      }
      if (dist < PICKUP.collectRadius) {
        p.active = false;
        state.score += PICKUP.score;
        if (p.kind === PICK_KINDLING) {
          lantern.flame = Math.min(lantern.maxFlame, lantern.flame + PICKUP.kindlingFlame);
          addFloater(keeper.x, keeper.y - 26, 'Kindling +flame', '#ff9f43');
          events |= EV_PICKUP;
        } else if (p.kind === PICK_HEART) {
          keeper.hearts = Math.min(keeper.maxHearts, keeper.hearts + 1);
          addFloater(keeper.x, keeper.y - 26, '+1 heart', '#ff6b81');
          events |= EV_PICKUP;
        } else {
          state.slowT = PICKUP.frostSeconds;
          for (const g of gloom) g.active = false;
          addFloater(keeper.x, keeper.y - 26, 'Frost! The Gloam slows', '#a8e6ff');
          burst(keeper.x, keeper.y, 22, '#a8e6ff', 240, 0.5, 3);
          events |= EV_FROST;
        }
      }
    }
    return events;
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const f of floaters) {
      if (!f.active) continue;
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) f.active = false;
    }
    // The lantern forever sheds slow embers into the night air.
    state.emberT -= dt;
    if (state.emberT <= 0) {
      state.emberT = 0.14;
      const p = freeOf(particles);
      if (p !== null) {
        p.active = true;
        p.x = lantern.x + range(random, -12, 12);
        p.y = lantern.y - 8;
        p.vx = range(random, -8, 8);
        p.vy = range(random, -34, -16);
        p.maxLife = range(random, 0.8, 1.6);
        p.life = p.maxLife;
        p.size = range(random, 1.4, 2.6);
        p.color = '#ffb347';
        p.gravity = -12;
        p.drag = 0.995;
      }
    }
  }

  /**
   * One fixed step of a live game. `control` is { moveX, moveY, aimX, aimY, firing, dash }
   * in field coordinates. Returns the EV_* flags of what happened.
   */
  function step(dt, control, harmless = false) {
    let events = 0;
    state.time += dt;
    if (state.slowT > 0) state.slowT = Math.max(0, state.slowT - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);

    if (state.phase === PHASE_INTERMISSION) {
      state.interT -= dt;
      if (state.interT <= 0) {
        beginNight();
        events |= EV_NIGHT_START;
      }
    }

    if (!harmless) events = updateKeeper(dt, control, events);
    updateSpawning(dt);
    const { events: afterEnemies, alive } = updateEnemies(dt, events, harmless);
    events = afterEnemies;
    if (!harmless) {
      events = updateBolts(dt, events);
      events = updateGloom(dt, events);
      events = updatePickups(dt, events);
    }
    updateParticles(dt);

    if (!harmless && state.phase === PHASE_FIGHTING) {
      const regen = flameRegen();
      if (regen > 0) lantern.flame = Math.min(lantern.maxFlame, lantern.flame + regen * dt);
      if (state.spawned >= state.spawnTotal && alive === 0) {
        state.score += WAVE.clearBonusPerNight * state.night;
        if (state.night >= NIGHTS && !state.endless) {
          state.bonus = Math.round(lantern.flame) * 5 + keeper.hearts * 100;
          state.score += state.bonus;
          state.phase = PHASE_WON;
          burst(lantern.x, lantern.y, 60, '#ffd166', 320, 1.1, 4, -40);
          events |= EV_WON;
        } else {
          rollChoices();
          state.phase = PHASE_CHOICE;
          events |= EV_WAVE_CLEAR;
        }
      }
    }
    return events;
  }

  /** After dawn: keep the watch into the long dark — endless nights, each still ending in a boon. */
  function continueEndless() {
    if (state.phase !== PHASE_WON) return;
    state.endless = true;
    rollChoices();
    state.phase = PHASE_CHOICE;
  }

  /** The title screen's quiet meadow: moths circle the lantern, embers rise, nothing is at stake. */
  function stepAmbient(dt) {
    state.time += dt;
    let moths = 0;
    for (const e of enemies) if (e.active && e.ambient) moths += 1;
    if (moths < 7 && random() < dt * 1.5) spawnAmbientMoth();
    keeper.x = lantern.x - 64;
    keeper.y = lantern.y + 52;
    keeper.aim = Math.atan2(Math.sin(state.time * 0.24) * 60, Math.cos(state.time * 0.24) * 60);
    updateEnemies(dt, 0, true);
    updateParticles(dt);
  }

  reset();
  return { state, reset, beginNight, chooseBoon, continueEndless, step, stepAmbient };
}
