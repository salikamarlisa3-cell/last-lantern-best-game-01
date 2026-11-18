// Keyboard and pointer input. Held keys and the pointer give continuous control (a movement
// vector, an aim point, whether the keeper is firing); one-shot presses (confirm, pause, dash,
// a boon pick, mute) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;
export const ACTION_ENDLESS = 16;
export const ACTION_PICK_1 = 32;
export const ACTION_PICK_2 = 64;
export const ACTION_PICK_3 = 128;

const KEY_ACTIONS = new Map([
  ['Enter', ACTION_CONFIRM],
  ['KeyP', ACTION_PAUSE],
  ['Escape', ACTION_PAUSE],
  ['ShiftLeft', ACTION_DASH],
  ['ShiftRight', ACTION_DASH],
  ['KeyM', ACTION_MUTE],
  ['KeyE', ACTION_ENDLESS],
  ['Digit1', ACTION_PICK_1],
  ['Digit2', ACTION_PICK_2],
  ['Digit3', ACTION_PICK_3],
]);

const MOVE_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space',
]);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let pointerClientX = window.innerWidth / 2;
  let pointerClientY = window.innerHeight / 3;
  let pointerDown = false;
  let clicked = false;

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code)) event.preventDefault();
    if (event.code === 'Space') {
      held.add('Space');
      return;
    }
    held.add(event.code);
    const action = KEY_ACTIONS.get(event.code);
    if (action !== undefined && !event.repeat) actions |= action;
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    pointerDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
    pointerDown = true;
    clicked = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    pointerDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  return {
    /** The held movement direction, normalised: x and y each in [-1, 1], length at most 1. */
    moveVector() {
      let x = 0;
      let y = 0;
      if (held.has('ArrowLeft') || held.has('KeyA')) x -= 1;
      if (held.has('ArrowRight') || held.has('KeyD')) x += 1;
      if (held.has('ArrowUp') || held.has('KeyW')) y -= 1;
      if (held.has('ArrowDown') || held.has('KeyS')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    /** True while the player asks to shoot: the pointer held down, or Space held. */
    firing() {
      return pointerDown || held.has('Space');
    },
    /** The pointer in client pixels; main turns it into a field point with the renderer's view. */
    pointerClient() {
      return { x: pointerClientX, y: pointerClientY };
    },
    /** True once per pointer press, for picking a boon card under the cursor. */
    takeClick() {
      const was = clicked;
      clicked = false;
      return was;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
