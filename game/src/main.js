// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between screens — title, play, boon choice, paused, dawn and
// dark — and the world's own phases drive most of the moves; this file owns the rest,
// plus which sound answers which event.
//
// ?seed=N fixes the night's pattern. ?shot=title|play|choice|over (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EV_BEETLE_DOWN, EV_DASH, EV_FROST, EV_HIT, EV_KEEPER_HURT, EV_KILL, EV_LANTERN_HURT,
  EV_LOST, EV_NIGHT_START, EV_PICKUP, EV_SHOOT, EV_WAVE_CLEAR, EV_WON,
  PHASE_CHOICE, PHASE_LOST, PHASE_WON,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_DASH, ACTION_ENDLESS, ACTION_MUTE, ACTION_PAUSE,
  ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  choiceCardRect, createRenderer,
  SCREEN_CHOICE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  world.state.shake = 0;
  const pointer = scene.screen === SCREEN_CHOICE
    ? (() => { const r = choiceCardRect(0); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()
    : null;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, 12.5, pointer);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let lastLanternCry = 0;
  let endedSoundPlayed = false;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.startMusic();
    world.reset();
    world.beginNight();
    endedSoundPlayed = false;
    screen = SCREEN_PLAY;
    announce('Night 1 of 10. The Gloam is coming for the lantern.');
    audio.waveHorn();
  }

  function finishRun() {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
  }

  function reactToEvents(events) {
    if (events & EV_SHOOT) audio.shoot();
    if (events & EV_HIT) audio.hit();
    if (events & EV_KILL) audio.kill();
    if (events & EV_BEETLE_DOWN) audio.beetleDown();
    if (events & EV_DASH) audio.dash();
    if (events & EV_PICKUP) audio.pickup();
    if (events & EV_FROST) audio.frost();
    if (events & EV_KEEPER_HURT) {
      audio.keeperHurt();
      announce(world.state.keeper.hearts === 1 ? 'The keeper is fading — one heart left.' : `The keeper is struck. ${world.state.keeper.hearts} hearts left.`);
    }
    if ((events & EV_LANTERN_HURT) && performance.now() - lastLanternCry > 300) {
      lastLanternCry = performance.now();
      audio.lanternHurt();
      if (world.state.lantern.flame < 25) announce('The lantern gutters — feed it kindling, shoot the Cinderbacks off it.');
    }
    if (events & EV_NIGHT_START) {
      audio.waveHorn();
      announce(`Night ${world.state.night} of 10. Hold the lantern.`);
    }
    if (events & EV_WAVE_CLEAR) {
      audio.choose();
      announce(`Night ${world.state.night} held. Choose a boon.`);
    }
    if ((events & EV_WON) && !endedSoundPlayed) {
      endedSoundPlayed = true;
      finishRun();
      audio.victory();
      announce(`Dawn breaks. ${world.state.score} embers gathered.`);
    }
    if ((events & EV_LOST) && !endedSoundPlayed) {
      endedSoundPlayed = true;
      finishRun();
      audio.gameOver();
      announce(`The dark prevails. ${world.state.score} embers gathered.`);
    }
  }

  function pickAt(pointer) {
    for (let i = 0; i < 3; i += 1) {
      const rect = choiceCardRect(i);
      if (pointer.x >= rect.x && pointer.x <= rect.x + rect.width && pointer.y >= rect.y && pointer.y <= rect.y + rect.height) return i;
    }
    return -1;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.unlock();
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
      return actions;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_WON) {
      if (actions & ACTION_CONFIRM) startGame();
      else if (screen === SCREEN_WON && (actions & ACTION_ENDLESS)) {
        world.continueEndless();
        screen = SCREEN_CHOICE;
        announce('The long dark: night after night, until the flame or the keeper fails. Choose a boon.');
      }
      return actions;
    }
    if (screen === SCREEN_CHOICE) {
      let pick = -1;
      if (actions & ACTION_PICK_1) pick = 0;
      else if (actions & ACTION_PICK_2) pick = 1;
      else if (actions & ACTION_PICK_3) pick = 2;
      else if (input.takeClick()) pick = pickAt(renderer.toField(input.pointerClient().x, input.pointerClient().y));
      if (pick !== -1) {
        world.chooseBoon(pick);
        audio.pickup();
        screen = SCREEN_PLAY;
      }
      return actions;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('The watch resumes.');
      }
    }
    return actions;
  }

  function stepOnce(actions) {
    const pointerClient = input.pointerClient();
    const aim = renderer.toField(pointerClient.x, pointerClient.y);
    const move = input.moveVector();
    const control = {
      moveX: move.x,
      moveY: move.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: input.firing(),
      dash: (actions & ACTION_DASH) !== 0,
    };
    const events = world.step(STEP, control, false);
    reactToEvents(events);
    if (world.state.phase === PHASE_CHOICE && screen === SCREEN_PLAY) screen = SCREEN_CHOICE;
    else if (world.state.phase === PHASE_WON && screen === SCREEN_PLAY) screen = SCREEN_WON;
    else if (world.state.phase === PHASE_LOST && screen === SCREEN_PLAY) screen = SCREEN_OVER;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.stepAmbient(STEP);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepOnce(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
      if (screen !== SCREEN_PLAY) accumulator = 0;
    } else {
      accumulator = 0;
    }
    const pointerClient = input.pointerClient();
    const pointer = renderer.toField(pointerClient.x, pointerClient.y);
    renderer.draw(world.state, screen, best, now / 1000, pointer);
  }

  // Leaving the tab pauses a running game rather than letting the Gloam feed unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Last Lantern. Click or press Enter to take up the watch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
