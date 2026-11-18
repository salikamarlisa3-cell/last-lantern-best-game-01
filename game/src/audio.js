// Sound made from nothing: every effect is an oscillator or a burst of filtered noise shaped
// by an envelope, and the music is a slow lantern-lit arpeggio the sequencer below schedules
// a beat ahead. There are no audio files. The context is created on the first user gesture
// (browsers refuse sound before one), and every call is safe before that: it stays silent.

const MASTER = 0.5;
const MUSIC_GAIN = 0.16;
const SFX_GAIN = 0.9;

/** The night's chord loop, in A minor: low roots the pad breathes over. */
const CHORDS = [
  { root: 110.0, tones: [220.0, 261.63, 329.63] }, // A2 - A3 C4 E4
  { root: 87.31, tones: [174.61, 220.0, 261.63] }, // F2 - F3 A3 C4
  { root: 98.0, tones: [196.0, 246.94, 293.66] }, // G2 - G3 B3 D4
  { root: 82.41, tones: [164.81, 196.0, 246.94] }, // E2 - E3 G3 B3
];
const BEAT = 0.46; // seconds per eighth-note step
const STEPS_PER_CHORD = 16;

export function createAudio() {
  let context = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let muted = false;
  let musicTimer = null;
  let nextStepTime = 0;
  let stepIndex = 0;

  /** Build the graph on the first gesture; returns false while sound is still impossible. */
  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(context.destination);
    musicBus = context.createGain();
    musicBus.gain.value = MUSIC_GAIN;
    musicBus.connect(master);
    sfxBus = context.createGain();
    sfxBus.gain.value = SFX_GAIN;
    sfxBus.connect(master);
    return true;
  }

  function tone({ freq, freqEnd = null, type = 'sine', at = 0, dur = 0.15, vol = 0.3, bus = null }) {
    if (context === null) return;
    const start = context.currentTime + at;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + dur);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(bus ?? sfxBus);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  function noise({ at = 0, dur = 0.2, vol = 0.25, from = 3000, to = 300 }) {
    if (context === null) return;
    const start = context.currentTime + at;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + dur);
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    source.start(start);
  }

  /** One plucked note of the arpeggio, quiet enough to sit under the game. */
  function pluck(freq, at, vol) {
    tone({ freq, type: 'triangle', at, dur: 0.5, vol, bus: musicBus });
    tone({ freq: freq * 2, type: 'sine', at, dur: 0.22, vol: vol * 0.35, bus: musicBus });
  }

  function scheduleStep(step, at) {
    const chord = CHORDS[Math.floor(step / STEPS_PER_CHORD) % CHORDS.length];
    const within = step % STEPS_PER_CHORD;
    if (within === 0) {
      // The pad: the root and fifth, swelling for the whole chord.
      tone({ freq: chord.root, type: 'sine', at, dur: BEAT * STEPS_PER_CHORD, vol: 0.5, bus: musicBus });
      tone({ freq: chord.root * 1.5, type: 'sine', at, dur: BEAT * STEPS_PER_CHORD, vol: 0.2, bus: musicBus });
    }
    // A sparse music-box pattern: steps 0, 3, 6, 10, 12 of each chord, cycling its tones.
    if (within % 2 === 0 || within === 3 || within === 11) {
      const toneIndex = (Math.floor(step / 2) + within) % chord.tones.length;
      const octave = within >= 12 ? 2 : 1;
      pluck(chord.tones[toneIndex] * octave, at, 0.16);
    }
  }

  function pumpMusic() {
    if (context === null) return;
    while (nextStepTime < context.currentTime + BEAT * 3) {
      scheduleStep(stepIndex, nextStepTime - context.currentTime);
      nextStepTime += BEAT;
      stepIndex += 1;
    }
  }

  function startMusic() {
    if (context === null || musicTimer !== null) return;
    nextStepTime = context.currentTime + 0.06;
    stepIndex = 0;
    pumpMusic();
    musicTimer = window.setInterval(pumpMusic, 160);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    unlock,
    startMusic,
    stopMusic,
    toggleMute() {
      muted = !muted;
      if (master !== null) master.gain.value = muted ? 0 : MASTER;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot() {
      tone({ freq: 880 + Math.random() * 160, freqEnd: 340, type: 'square', dur: 0.07, vol: 0.1 });
    },
    hit() {
      tone({ freq: 300, freqEnd: 190, type: 'triangle', dur: 0.05, vol: 0.12 });
    },
    kill() {
      noise({ dur: 0.16, vol: 0.2, from: 2600, to: 240 });
      tone({ freq: 520, freqEnd: 130, type: 'sawtooth', dur: 0.14, vol: 0.1 });
    },
    beetleDown() {
      noise({ dur: 0.3, vol: 0.3, from: 1200, to: 120 });
      tone({ freq: 140, freqEnd: 55, type: 'sawtooth', dur: 0.28, vol: 0.22 });
    },
    keeperHurt() {
      tone({ freq: 220, freqEnd: 70, type: 'sawtooth', dur: 0.25, vol: 0.3 });
      noise({ dur: 0.2, vol: 0.2, from: 900, to: 150 });
    },
    lanternHurt() {
      tone({ freq: 1180, freqEnd: 420, type: 'sine', dur: 0.18, vol: 0.2 });
      tone({ freq: 1760, freqEnd: 700, type: 'sine', at: 0.03, dur: 0.14, vol: 0.12 });
    },
    dash() {
      noise({ dur: 0.14, vol: 0.12, from: 500, to: 3200 });
    },
    pickup() {
      tone({ freq: 660, type: 'sine', dur: 0.09, vol: 0.18 });
      tone({ freq: 990, type: 'sine', at: 0.07, dur: 0.12, vol: 0.18 });
    },
    frost() {
      tone({ freq: 1320, freqEnd: 1980, type: 'sine', dur: 0.3, vol: 0.16 });
      tone({ freq: 1760, freqEnd: 2640, type: 'sine', at: 0.08, dur: 0.3, vol: 0.1 });
    },
    waveHorn() {
      tone({ freq: 196, type: 'sawtooth', dur: 0.4, vol: 0.16 });
      tone({ freq: 294, type: 'sawtooth', at: 0.02, dur: 0.4, vol: 0.12 });
      tone({ freq: 392, type: 'triangle', at: 0.05, dur: 0.45, vol: 0.14 });
    },
    choose() {
      tone({ freq: 523.25, type: 'triangle', dur: 0.12, vol: 0.2 });
      tone({ freq: 659.25, type: 'triangle', at: 0.09, dur: 0.12, vol: 0.2 });
      tone({ freq: 783.99, type: 'triangle', at: 0.18, dur: 0.2, vol: 0.2 });
    },
    gameOver() {
      stopMusic();
      tone({ freq: 392, type: 'triangle', dur: 0.5, vol: 0.24 });
      tone({ freq: 329.63, type: 'triangle', at: 0.35, dur: 0.5, vol: 0.24 });
      tone({ freq: 261.63, type: 'triangle', at: 0.7, dur: 0.9, vol: 0.26 });
      noise({ at: 0.1, dur: 1.1, vol: 0.1, from: 800, to: 60 });
    },
    victory() {
      stopMusic();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < notes.length; i += 1) {
        tone({ freq: notes[i], type: 'triangle', at: i * 0.14, dur: 0.5, vol: 0.22 });
      }
      tone({ freq: 1318.5, type: 'sine', at: 0.56, dur: 0.9, vol: 0.16 });
    },
  };
}
