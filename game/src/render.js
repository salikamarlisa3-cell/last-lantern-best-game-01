// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 meadow
// is scaled to fit the window and centred. Everything is drawn from code — gradients, paths
// and glow sprites made once on offscreen canvases — so the game ships no image files.
// `now` is a free-running clock in seconds for flicker, twinkle and pulse, so menus stay
// alive even while the world itself is paused.

import { FIELD, FONT_BODY, FONT_TITLE, KEEPER, LANTERN, NIGHTS, PALETTE, PICKUP, UPGRADES } from './config.js';
import { KIND_BEETLE, KIND_MOTH, PHASE_WON, PICK_FROST, PICK_HEART, PICK_KINDLING } from './world.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_CHOICE = 'choice';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';

const CARD = { width: 360, height: 196, gap: 24, top: 296 };

/** The field rectangle of boon card `index` (0, 1, 2); main hit-tests clicks with the same boxes. */
export function choiceCardRect(index) {
  const total = CARD.width * 3 + CARD.gap * 2;
  return {
    x: (FIELD.width - total) / 2 + index * (CARD.width + CARD.gap),
    y: CARD.top,
    width: CARD.width,
    height: CARD.height,
  };
}

function formatNumber(value) {
  return String(Math.max(0, Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A radial glow sprite in one colour, drawn additively wherever something shines. */
function makeGlowSprite(color) {
  const size = 128;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const c = off.getContext('2d');
  const gradient = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.35, color);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.fillStyle = gradient;
  c.globalAlpha = 0.55;
  c.fillRect(0, 0, size, size);
  return off;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const glowWarm = makeGlowSprite('rgba(255, 166, 60, 1)');
  const glowSoft = makeGlowSprite('rgba(255, 233, 168, 1)');
  const glowTeal = makeGlowSprite('rgba(127, 231, 210, 1)');
  const glowPurple = makeGlowSprite('rgba(199, 125, 255, 1)');

  // Scenery fixed for the whole night: stars, meadow tufts and fireflies, from their own seed.
  const sceneryRandom = createRandom(20261115);
  const stars = [];
  for (let i = 0; i < 130; i += 1) {
    stars.push({ x: sceneryRandom() * FIELD.width, y: sceneryRandom() * 300, r: 0.6 + sceneryRandom() * 1.3, tw: sceneryRandom() * 6.28 });
  }
  const tufts = [];
  for (let i = 0; i < 240; i += 1) {
    tufts.push({ x: sceneryRandom() * FIELD.width, y: 330 + sceneryRandom() * 380, s: 3 + sceneryRandom() * 6, lean: sceneryRandom() * 2 - 1 });
  }
  const fireflies = [];
  for (let i = 0; i < 22; i += 1) {
    fireflies.push({ x: sceneryRandom() * FIELD.width, y: 380 + sceneryRandom() * 300, ph: sceneryRandom() * 6.28, sp: 0.3 + sceneryRandom() * 0.5 });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function fontFor(size, family, weight) {
    const key = `${weight} ${size} ${family}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${family}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'center', family = FONT_BODY, weight = '') {
    context.font = fontFor(size, family, weight);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function glow(sprite, x, y, radius, alpha) {
    context.globalCompositeOperation = 'lighter';
    context.globalAlpha = alpha;
    context.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }

  function drawScenery(state, now) {
    const sky = context.createLinearGradient(0, 0, 0, FIELD.height);
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(0.55, PALETTE.skyBottom);
    sky.addColorStop(0.551, PALETTE.meadowDark);
    sky.addColorStop(1, PALETTE.meadow);
    context.fillStyle = sky;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    for (const star of stars) {
      context.globalAlpha = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(now * 1.7 + star.tw));
      context.fillStyle = '#dfe8ff';
      context.fillRect(star.x, star.y, star.r, star.r);
    }
    context.globalAlpha = 1;

    // The moon, a pale coin in the top right, and the two hill ridges it lights.
    context.fillStyle = '#e8ecf7';
    context.beginPath();
    context.arc(1130, 86, 30, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.skyTop;
    context.beginPath();
    context.arc(1144, 76, 26, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.hillFar;
    context.beginPath();
    context.moveTo(0, 330);
    for (let x = 0; x <= FIELD.width; x += 64) context.lineTo(x, 318 - Math.sin(x * 0.004 + 1.2) * 26);
    context.lineTo(FIELD.width, 400);
    context.lineTo(0, 400);
    context.fill();
    context.fillStyle = PALETTE.hillNear;
    context.beginPath();
    context.moveTo(0, 356);
    for (let x = 0; x <= FIELD.width; x += 64) context.lineTo(x, 348 - Math.cos(x * 0.005 + 0.4) * 18);
    context.lineTo(FIELD.width, 420);
    context.lineTo(0, 420);
    context.fill();

    context.strokeStyle = 'rgba(46, 94, 74, 0.8)';
    context.lineWidth = 1.4;
    context.beginPath();
    for (const tuft of tufts) {
      context.moveTo(tuft.x, tuft.y);
      context.lineTo(tuft.x + tuft.lean * 2, tuft.y - tuft.s);
      context.moveTo(tuft.x + 2, tuft.y);
      context.lineTo(tuft.x + 2 + tuft.lean, tuft.y - tuft.s * 0.7);
    }
    context.stroke();

    for (const fly of fireflies) {
      const fx = fly.x + Math.sin(now * fly.sp + fly.ph) * 26;
      const fy = fly.y + Math.cos(now * fly.sp * 0.8 + fly.ph) * 14;
      context.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(now * 2.1 + fly.ph * 3));
      context.fillStyle = '#ffe9a8';
      context.beginPath();
      context.arc(fx, fy, 1.8, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    void state;
  }

  function drawLantern(state, now) {
    const { lantern } = state;
    const flameFrac = Math.max(0, lantern.flame / lantern.maxFlame);
    const flicker = 0.9 + 0.1 * Math.sin(now * 11) + 0.05 * Math.sin(now * 23 + 1.7);

    // The pool of light on the grass, breathing with the flame.
    glow(glowWarm, lantern.x, lantern.y, (130 + flameFrac * 190) * flicker, 0.16 + flameFrac * 0.2);

    // Stone ring and plinth.
    context.fillStyle = PALETTE.lanternStone;
    context.beginPath();
    context.ellipse(lantern.x, lantern.y + 20, 44, 13, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2d3348';
    context.beginPath();
    context.ellipse(lantern.x, lantern.y + 16, 40, 11, 0, 0, Math.PI * 2);
    context.fill();

    // The lantern body: a dark metal cage around warm glass.
    const bodyW = 34;
    const bodyH = 46;
    const bodyX = lantern.x - bodyW / 2;
    const bodyY = lantern.y - bodyH + 14;
    context.fillStyle = PALETTE.lanternMetal;
    context.beginPath();
    context.roundRect(bodyX - 3, bodyY - 10, bodyW + 6, 10, 4);
    context.fill();
    context.beginPath();
    context.moveTo(lantern.x, bodyY - 22);
    context.lineTo(bodyX + bodyW + 3, bodyY - 9);
    context.lineTo(bodyX - 3, bodyY - 9);
    context.closePath();
    context.fill();
    context.fillRect(bodyX - 3, bodyY + bodyH - 4, bodyW + 6, 7);
    if (flameFrac > 0) {
      const glass = context.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
      glass.addColorStop(0, '#ffd98a');
      glass.addColorStop(1, '#ff9f43');
      context.fillStyle = glass;
      context.globalAlpha = 0.35 + flameFrac * 0.65;
    } else {
      context.fillStyle = '#1a2030';
      context.globalAlpha = 1;
    }
    context.beginPath();
    context.roundRect(bodyX, bodyY, bodyW, bodyH, 5);
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = PALETTE.lanternMetal;
    context.lineWidth = 3;
    context.beginPath();
    context.roundRect(bodyX, bodyY, bodyW, bodyH, 5);
    context.stroke();
    context.beginPath();
    context.moveTo(lantern.x, bodyY);
    context.lineTo(lantern.x, bodyY + bodyH);
    context.stroke();

    if (flameFrac > 0) {
      // The flame itself: two teardrops, sized by the flame that is left.
      const fh = (10 + flameFrac * 20) * flicker;
      const fw = 6 + flameFrac * 7;
      context.fillStyle = PALETTE.lanternFlame;
      context.beginPath();
      context.moveTo(lantern.x, bodyY + bodyH - 4 - fh * 2);
      context.bezierCurveTo(lantern.x + fw, bodyY + bodyH - 6 - fh * 0.6, lantern.x + fw * 0.7, bodyY + bodyH - 3, lantern.x, bodyY + bodyH - 3);
      context.bezierCurveTo(lantern.x - fw * 0.7, bodyY + bodyH - 3, lantern.x - fw, bodyY + bodyH - 6 - fh * 0.6, lantern.x, bodyY + bodyH - 4 - fh * 2);
      context.fill();
      context.fillStyle = PALETTE.lanternCore;
      context.beginPath();
      context.ellipse(lantern.x, bodyY + bodyH - 8, fw * 0.42, fh * 0.4, 0, 0, Math.PI * 2);
      context.fill();
      glow(glowWarm, lantern.x, bodyY + bodyH / 2, 54 + flameFrac * 30, 0.35);
    }
  }

  function drawKeeper(state, now) {
    const keeper = state.keeper;
    if (keeper.invulnT > 0 && Math.floor(now * 12) % 2 === 0 && keeper.dashT <= 0) return; // mercy blink
    const aimX = Math.cos(keeper.aim);
    const aimY = Math.sin(keeper.aim);

    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.beginPath();
    context.ellipse(keeper.x, keeper.y + 13, 15, 5, 0, 0, Math.PI * 2);
    context.fill();
    glow(glowTeal, keeper.x, keeper.y, 44, 0.2);

    // Cloak: a teardrop leaning toward the aim, hem swaying while moving.
    const sway = keeper.moving ? Math.sin(now * 13) * 2.2 : Math.sin(now * 2.2) * 0.8;
    context.fillStyle = PALETTE.keeperCloak;
    context.beginPath();
    context.moveTo(keeper.x + aimX * 6, keeper.y - 16);
    context.bezierCurveTo(
      keeper.x + 15, keeper.y - 6,
      keeper.x + 13 + sway, keeper.y + 14,
      keeper.x, keeper.y + 16,
    );
    context.bezierCurveTo(
      keeper.x - 13 + sway, keeper.y + 14,
      keeper.x - 15, keeper.y - 6,
      keeper.x + aimX * 6, keeper.y - 16,
    );
    context.fill();
    context.strokeStyle = PALETTE.keeperRim;
    context.lineWidth = 1.6;
    context.stroke();

    // Hood and face: a dark oval with two warm eyes turned to the aim.
    context.fillStyle = '#0e3a33';
    context.beginPath();
    context.arc(keeper.x + aimX * 3, keeper.y - 9, 9.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.keeperFace;
    context.beginPath();
    context.arc(keeper.x + aimX * 4.5, keeper.y - 8, 6.4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffd166';
    const eyeOff = 2.6;
    const px = -aimY;
    const py = aimX;
    context.beginPath();
    context.arc(keeper.x + aimX * 7 + px * eyeOff, keeper.y - 8 + aimY * 2 + py * eyeOff, 1.3, 0, Math.PI * 2);
    context.arc(keeper.x + aimX * 7 - px * eyeOff, keeper.y - 8 + aimY * 2 - py * eyeOff, 1.3, 0, Math.PI * 2);
    context.fill();

    // Staff, held toward the aim, its tip alight.
    const handX = keeper.x + aimX * 10;
    const handY = keeper.y + aimY * 10;
    const tipX = keeper.x + aimX * 27;
    const tipY = keeper.y + aimY * 27;
    context.strokeStyle = '#6b4a2a';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(handX, handY);
    context.lineTo(tipX, tipY);
    context.stroke();
    glow(glowSoft, tipX, tipY, 17, 0.5);
    context.fillStyle = '#fff3c4';
    context.beginPath();
    context.arc(tipX, tipY, 3, 0, Math.PI * 2);
    context.fill();
  }

  function drawMoth(e, now) {
    const flap = Math.sin(now * 26 + e.phase * 4) * 0.55;
    context.save();
    context.translate(e.x, e.y);
    for (const side of [-1, 1]) {
      context.save();
      context.rotate(side * (0.5 + flap * 0.5));
      context.fillStyle = e.flashT > 0 ? '#ffffff' : PALETTE.mothWing;
      context.beginPath();
      context.ellipse(side * 10, -3, 11, 6.5, side * 0.5, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    context.fillStyle = e.flashT > 0 ? '#ffffff' : PALETTE.mothBody;
    context.beginPath();
    context.ellipse(0, 0, 5.5, 8.5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffd166';
    context.beginPath();
    context.arc(-2.2, -6, 1.4, 0, Math.PI * 2);
    context.arc(2.2, -6, 1.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawBeetle(e, now) {
    context.save();
    context.translate(e.x, e.y);
    const scuttle = Math.sin(now * 18 + e.phase * 5) * 3;
    context.strokeStyle = '#2c1710';
    context.lineWidth = 3;
    for (const side of [-1, 1]) {
      for (let leg = 0; leg < 3; leg += 1) {
        const ly = -9 + leg * 9;
        const off = (leg % 2 === 0 ? scuttle : -scuttle);
        context.beginPath();
        context.moveTo(side * 13, ly);
        context.lineTo(side * 22, ly + off);
        context.stroke();
      }
    }
    const shell = context.createLinearGradient(0, -20, 0, 20);
    shell.addColorStop(0, e.flashT > 0 ? '#ffffff' : '#7a4030');
    shell.addColorStop(1, e.flashT > 0 ? '#ffffff' : PALETTE.beetleShell);
    context.fillStyle = shell;
    context.beginPath();
    context.ellipse(0, 0, 20, 17, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.4)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -16);
    context.lineTo(0, 16);
    context.stroke();
    // Ember cracks in the shell, glowing through.
    context.strokeStyle = PALETTE.beetleCrack;
    context.lineWidth = 1.8;
    context.beginPath();
    context.moveTo(-11, -6);
    context.lineTo(-4, 0);
    context.lineTo(-9, 7);
    context.moveTo(12, -9);
    context.lineTo(5, -2);
    context.lineTo(10, 5);
    context.stroke();
    context.fillStyle = '#1d0f0a';
    context.beginPath();
    context.arc(0, -19, 6.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
    drawHealthBar(e);
  }

  function drawSpitter(e, now) {
    context.save();
    context.translate(e.x, e.y);
    const breathe = 1 + Math.sin(now * 3.4 + e.phase) * 0.05;
    context.scale(breathe, breathe);
    context.fillStyle = e.flashT > 0 ? '#ffffff' : PALETTE.spitterBody;
    context.beginPath();
    context.ellipse(0, 0, 16, 14.5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = e.flashT > 0 ? '#ffffff' : PALETTE.spitterBelly;
    context.beginPath();
    context.ellipse(0, 4, 9.5, 8, 0, 0, Math.PI * 2);
    context.fill();
    // Eyes: two suspicious slits.
    context.fillStyle = '#14081c';
    context.fillRect(-8.5, -7, 5.5, 2.6);
    context.fillRect(3, -7, 5.5, 2.6);
    // The mouth glows as the windup gathers a gloom bolt.
    if (e.windupT > 0) {
      const charge = 1 - e.windupT / 0.45;
      glow(glowPurple, 0, 3, 12 + charge * 16, 0.4 + charge * 0.4);
      context.fillStyle = PALETTE.gloomBolt;
      context.beginPath();
      context.arc(0, 3, 2.5 + charge * 4, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = '#2a1238';
      context.beginPath();
      context.arc(0, 3, 3.2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    drawHealthBar(e);
  }

  function drawHealthBar(e) {
    if (e.maxHp <= 1 || e.hp >= e.maxHp) return;
    const width = e.radius * 2;
    const frac = Math.max(0, e.hp / e.maxHp);
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(e.x - e.radius, e.y - e.radius - 11, width, 5);
    context.fillStyle = '#ff6b81';
    context.fillRect(e.x - e.radius + 1, e.y - e.radius - 10, (width - 2) * frac, 3);
  }

  function drawPickup(p, now) {
    const bobY = Math.sin(p.bob) * 3;
    const y = p.y + bobY;
    if (p.life < 2 && Math.floor(now * 6) % 2 === 0) return; // expiring: blink out
    glow(p.kind === PICK_FROST ? glowTeal : glowWarm, p.x, y, 26, 0.4);
    context.save();
    context.translate(p.x, y);
    if (p.kind === PICK_KINDLING) {
      context.strokeStyle = '#a0662a';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(-8, 7);
      context.lineTo(7, -6);
      context.moveTo(-7, -6);
      context.lineTo(8, 7);
      context.stroke();
      context.fillStyle = PALETTE.lanternFlame;
      context.beginPath();
      context.arc(0, -2, 4.4, 0, Math.PI * 2);
      context.fill();
    } else if (p.kind === PICK_HEART) {
      drawHeart(0, 0, 11, PALETTE.heart);
    } else {
      context.strokeStyle = PALETTE.frost;
      context.lineWidth = 2.4;
      for (let i = 0; i < 3; i += 1) {
        const angle = (i * Math.PI) / 3 + now * 0.8;
        context.beginPath();
        context.moveTo(Math.cos(angle) * -10, Math.sin(angle) * -10);
        context.lineTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
        context.stroke();
      }
      context.fillStyle = '#e8f7ff';
      context.beginPath();
      context.arc(0, 0, 2.6, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawHeart(x, y, size, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y + size * 0.85);
    context.bezierCurveTo(x - size * 1.15, y, x - size * 0.62, y - size * 0.95, x, y - size * 0.3);
    context.bezierCurveTo(x + size * 0.62, y - size * 0.95, x + size * 1.15, y, x, y + size * 0.85);
    context.fill();
  }

  function drawEntities(state, now) {
    for (const p of state.pickups) if (p.active) drawPickup(p, now);

    for (const e of state.enemies) {
      if (!e.active) continue;
      context.fillStyle = 'rgba(0, 0, 0, 0.3)';
      context.beginPath();
      context.ellipse(e.x, e.y + e.radius * 0.8, e.radius * 0.85, e.radius * 0.3, 0, 0, Math.PI * 2);
      context.fill();
      if (e.kind === KIND_MOTH) drawMoth(e, now);
      else if (e.kind === KIND_BEETLE) drawBeetle(e, now);
      else drawSpitter(e, now);
      if (state.slowT > 0 && !e.ambient) {
        context.fillStyle = 'rgba(168, 230, 255, 0.16)';
        context.beginPath();
        context.arc(e.x, e.y, e.radius + 3, 0, Math.PI * 2);
        context.fill();
      }
    }

    drawLantern(state, now);
    drawKeeper(state, now);

    // Bolts of light and gloom.
    for (const b of state.bolts) {
      if (!b.active) continue;
      glow(glowSoft, b.x, b.y, 13, 0.55);
      context.strokeStyle = PALETTE.bolt;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const g of state.gloom) {
      if (!g.active) continue;
      glow(glowPurple, g.x, g.y, 15, 0.5);
      context.fillStyle = PALETTE.gloomBolt;
      context.beginPath();
      context.arc(g.x, g.y, 5, 0, Math.PI * 2);
      context.fill();
    }

    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    context.textBaseline = 'bottom';
    for (const f of state.floaters) {
      if (!f.active) continue;
      context.globalAlpha = Math.min(1, f.life * 2);
      text(f.text, f.x, f.y, 17, f.color, 'center', FONT_BODY, 'bold');
    }
    context.globalAlpha = 1;
  }

  function drawVignette(state) {
    const gradient = context.createRadialGradient(640, 360, 320, 640, 360, 760);
    gradient.addColorStop(0, 'rgba(2, 3, 8, 0)');
    gradient.addColorStop(1, 'rgba(2, 3, 8, 0.6)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    if (state.shake > 1) {
      context.fillStyle = `rgba(255, 60, 70, ${Math.min(0.16, state.shake * 0.014)})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function foesLeft(state) {
    let alive = 0;
    for (const e of state.enemies) if (e.active && !e.ambient) alive += 1;
    return state.spawnTotal - state.spawned + alive;
  }

  function drawHud(state, best) {
    context.textBaseline = 'top';
    // Hearts, top left.
    for (let i = 0; i < state.keeper.maxHearts; i += 1) {
      const x = 30 + i * 30;
      drawHeart(x, 26, 11, i < state.keeper.hearts ? PALETTE.heart : 'rgba(255, 255, 255, 0.16)');
    }
    // Night and foes, top centre.
    const nightLabel = state.endless || state.night > NIGHTS
      ? `Night ${state.night} — the long dark`
      : `Night ${state.night} of ${NIGHTS}`;
    text(nightLabel, FIELD.width / 2, 14, 24, PALETTE.text, 'center', FONT_TITLE, 'bold');
    if (state.phase !== PHASE_WON) {
      text(`${foesLeft(state)} of the Gloam remain`, FIELD.width / 2, 44, 16, PALETTE.muted, 'center');
    }
    if (state.slowT > 0) {
      text(`Frost — the Gloam crawls (${state.slowT.toFixed(1)}s)`, FIELD.width / 2, 66, 15, PALETTE.frost, 'center');
    }
    // Embers and best, top right.
    text(`Embers ${formatNumber(state.score)}`, FIELD.width - 24, 14, 24, PALETTE.ember, 'right', FONT_BODY, 'bold');
    text(`Best ${formatNumber(Math.max(best, state.score))}`, FIELD.width - 24, 44, 15, PALETTE.muted, 'right');

    // The lantern's flame, bottom centre: the other life that matters.
    const barW = 340;
    const barX = (FIELD.width - barW) / 2;
    const barY = FIELD.height - 34;
    const flameFrac = Math.max(0, state.lantern.flame / state.lantern.maxFlame);
    text('THE LAST LANTERN', FIELD.width / 2, barY - 19, 13, PALETTE.muted, 'center');
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.beginPath();
    context.roundRect(barX, barY, barW, 12, 6);
    context.fill();
    if (flameFrac > 0) {
      const flameGrad = context.createLinearGradient(barX, 0, barX + barW, 0);
      flameGrad.addColorStop(0, '#ff7a3c');
      flameGrad.addColorStop(1, '#ffd166');
      context.fillStyle = flameFrac < 0.25 && Math.floor(performance.now() / 300) % 2 === 0 ? '#ff5252' : flameGrad;
      context.beginPath();
      context.roundRect(barX + 2, barY + 2, (barW - 4) * flameFrac, 8, 4);
      context.fill();
    }

    // Dash readiness, bottom left.
    const ready = state.keeper.dashCdT <= 0;
    context.globalAlpha = ready ? 1 : 0.35;
    drawDiamond(34, FIELD.height - 28, 9, ready ? PALETTE.keeperRim : PALETTE.muted);
    context.globalAlpha = 1;
    text(ready ? 'DASH READY · Shift' : 'dash…', 52, FIELD.height - 38, 14, ready ? PALETTE.keeperRim : PALETTE.muted, 'left');
    text('WASD move · mouse aim · hold to shoot · M sound', FIELD.width - 24, FIELD.height - 36, 13, 'rgba(154, 167, 189, 0.75)', 'right');
  }

  function drawDiamond(x, y, size, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y - size);
    context.lineTo(x + size, y);
    context.lineTo(x, y + size);
    context.lineTo(x - size, y);
    context.closePath();
    context.fill();
  }

  function drawPanel(title, lines, prompt, titleColor = PALETTE.text, width = 640) {
    // The panel grows to fit its widest line, so no sentence ever spills past the edge.
    let widest = width;
    context.font = fontFor(44, FONT_TITLE, 'bold');
    widest = Math.max(widest, context.measureText(title).width + 72);
    context.font = fontFor(19, FONT_BODY, '');
    for (const line of lines) widest = Math.max(widest, context.measureText(line).width + 72);
    if (prompt !== null) {
      context.font = fontFor(21, FONT_BODY, 'bold');
      widest = Math.max(widest, context.measureText(prompt).width + 72);
    }
    width = Math.min(widest, FIELD.width - 48);
    const lineH = 30;
    const height = 118 + lines.length * lineH + 64;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2 - 10;
    context.fillStyle = PALETTE.panel;
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, width, height, 14);
    context.fill();
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 66, 44, titleColor, 'center', FONT_TITLE, 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 112 + i * lineH, 19, i === lines.length - 1 ? PALETTE.muted : PALETTE.text, 'center');
    }
    if (prompt !== null) {
      const pulse = 0.72 + 0.28 * Math.sin(performance.now() / 340);
      context.globalAlpha = pulse;
      text(prompt, FIELD.width / 2, y + height - 26, 21, PALETTE.lanternFlame, 'center', FONT_BODY, 'bold');
      context.globalAlpha = 1;
    }
    return { x, y, width, height };
  }

  function drawChoice(state, pointer) {
    context.fillStyle = 'rgba(3, 5, 12, 0.62)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text(`Night ${state.night} held. The lantern still burns.`, FIELD.width / 2, 168, 34, PALETTE.text, 'center', FONT_TITLE, 'bold');
    text('Choose a boon for the keeper', FIELD.width / 2, 204, 20, PALETTE.muted, 'center');
    text('Click a card, or press 1 · 2 · 3', FIELD.width / 2, 232, 15, PALETTE.muted, 'center');

    for (let i = 0; i < 3; i += 1) {
      const rect = choiceCardRect(i);
      const id = state.choices[i];
      const def = UPGRADES.find((u) => u.id === id);
      const hovered = pointer !== null
        && pointer.x >= rect.x && pointer.x <= rect.x + rect.width
        && pointer.y >= rect.y && pointer.y <= rect.y + rect.height;
      context.fillStyle = hovered ? 'rgba(38, 34, 22, 0.97)' : PALETTE.panel;
      context.strokeStyle = hovered ? '#ffd166' : PALETTE.panelEdge;
      context.lineWidth = hovered ? 3 : 2;
      context.beginPath();
      context.roundRect(rect.x, rect.y, rect.width, rect.height, 12);
      context.fill();
      context.stroke();
      const cx = rect.x + rect.width / 2;
      drawBoonIcon(id, cx, rect.y + 52);
      text(def ? def.name : 'Kindled Cache', cx, rect.y + 108, 24, PALETTE.text, 'center', FONT_TITLE, 'bold');
      text(def ? def.blurb : '', cx, rect.y + 138, 16.5, PALETTE.muted, 'center');
      const taken = state.derived.stacks(id);
      text(taken > 0 ? `Press ${i + 1} · taken ${taken}×` : `Press ${i + 1}`, cx, rect.y + rect.height - 16, 15, PALETTE.lanternFlame, 'center', FONT_BODY, 'bold');
    }
  }

  function drawBoonIcon(id, x, y) {
    context.save();
    context.translate(x, y);
    context.strokeStyle = PALETTE.lanternFlame;
    context.fillStyle = PALETTE.lanternFlame;
    context.lineWidth = 2.6;
    if (id === 'tempo') {
      for (let i = -1; i <= 1; i += 1) {
        context.beginPath();
        context.moveTo(i * 11 - 4, 8);
        context.lineTo(i * 11 + 4, -8);
        context.stroke();
      }
    } else if (id === 'twin') {
      context.beginPath();
      context.arc(-8, 0, 6.5, 0, Math.PI * 2);
      context.arc(8, 0, 6.5, 0, Math.PI * 2);
      context.fill();
    } else if (id === 'bright') {
      context.beginPath();
      context.arc(0, 0, 7, 0, Math.PI * 2);
      context.fill();
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4;
        context.beginPath();
        context.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
        context.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
        context.stroke();
      }
    } else if (id === 'pierce') {
      context.beginPath();
      context.moveTo(-16, 0);
      context.lineTo(10, 0);
      context.moveTo(4, -6);
      context.lineTo(12, 0);
      context.lineTo(4, 6);
      context.stroke();
      context.beginPath();
      context.arc(14, 0, 3.4, 0, Math.PI * 2);
      context.stroke();
    } else if (id === 'swift') {
      context.beginPath();
      context.moveTo(-14, 6);
      context.quadraticCurveTo(0, -12, 15, -4);
      context.moveTo(-12, 12);
      context.quadraticCurveTo(2, -2, 16, 2);
      context.stroke();
    } else if (id === 'ward') {
      drawHeart(0, 2, 13, PALETTE.heart);
    } else if (id === 'charm') {
      context.beginPath();
      context.roundRect(-8, -6, 16, 20, 3);
      context.stroke();
      context.beginPath();
      context.arc(0, 3, 4, 0, Math.PI * 2);
      context.fill();
    } else if (id === 'wind') {
      drawDiamond(0, 0, 11, PALETTE.keeperRim);
    } else {
      context.beginPath();
      context.arc(0, 0, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.panel;
      text('✦', 0, 6, 16, PALETTE.ember, 'center');
    }
    context.restore();
  }

  /** Paint one frame: scenery, entities, vignette, then the HUD or panel for the screen. */
  function draw(state, screen, best, now, pointer = null) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    let shakeX = 0;
    let shakeY = 0;
    if (state.shake > 0.2) {
      shakeX = (Math.random() - 0.5) * state.shake;
      shakeY = (Math.random() - 0.5) * state.shake;
    }
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawScenery(state, now);
    drawEntities(state, now);
    drawVignette(state);

    if (screen === SCREEN_TITLE) {
      drawPanel('LAST LANTERN', [
        'The Gloam comes each night for the last flame in the valley.',
        'Hold it through ten nights, and dawn breaks. Let it die, and the dark is forever.',
        'Move WASD · aim with the mouse · hold click or Space to shoot · Shift to dash',
        best > 0 ? `Best watch: ${formatNumber(best)} embers` : 'Your first watch begins tonight.',
      ], 'Click or press Enter to take up the watch');
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The Gloam waits, patient as frost.'], 'Press P or Esc to resume');
    } else if (screen === SCREEN_CHOICE) {
      drawChoice(state, pointer);
    } else if (screen === SCREEN_OVER) {
      const cause = state.lostCause === 'keeper'
        ? 'The keeper fell, and no hand was left to tend the flame.'
        : 'The last lantern went dark, and the valley went with it.';
      // Losing on night N means N-1 nights were held to their end.
      const nightsHeld = Math.max(0, state.night - 1);
      drawPanel('THE DARK PREVAILS', [
        cause,
        `Embers gathered: ${formatNumber(state.score)}`,
        `Nights held: ${nightsHeld} · Foes quenched: ${formatNumber(state.kills)}`,
        `Best watch: ${formatNumber(Math.max(best, state.score))} embers`,
      ], 'Press Enter or click to light it again', '#ff8f9a');
    } else if (screen === SCREEN_WON) {
      drawPanel('DAWN BREAKS', [
        'Ten nights held. The last lantern still burns, and the valley wakes.',
        `Embers gathered: ${formatNumber(state.score)} (dawn bonus ${formatNumber(state.bonus)})`,
        `Foes quenched: ${formatNumber(state.kills)} · Flame remaining: ${Math.round(state.lantern.flame)}`,
        `Best watch: ${formatNumber(Math.max(best, state.score))} embers`,
      ], 'Enter — a new watch · E — keep watch into the long dark', '#ffd166');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    view,
    /** Turn client (CSS pixel) coordinates into field coordinates. */
    toField(clientX, clientY) {
      const ratio = window.devicePixelRatio || 1;
      return {
        x: (clientX * ratio - view.x) / view.scale,
        y: (clientY * ratio - view.y) / view.scale,
      };
    },
  };
}
