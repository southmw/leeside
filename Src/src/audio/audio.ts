import { FOOTSTEP_VARIANTS, type FootstepSound } from "./footsteps";
import { OPEN_CUTOFF_HZ, type WindMix } from "./windMix";

/**
 * Plays the game's sound through the browser's Web Audio. What to play is decided elsewhere
 * (windMix.ts); this is the thin part that touches the browser.
 *
 * The game runs without it: if the browser has no audio or the recording cannot be fetched,
 * everything here quietly does nothing.
 */

/**
 * "off" until started, "loading" while the recording is fetched, "blocked" while the browser
 * holds sound back (until the first click or key press, or while the tab is hidden),
 * "playing", or "failed" if there will be no sound.
 */
export type AudioState = "off" | "loading" | "blocked" | "playing" | "failed";

export interface GameAudio {
  readonly state: AudioState;
  readonly muted: boolean;
  /**
   * Switches the sound on. Browsers allow sound only after the player has clicked or pressed
   * a key, so this is called from START; called without one, the sound waits for the first.
   */
  start(): void;
  /** How the wind should sound from now on. The change is eased in, never abrupt. */
  setWind(mix: WindMix): void;
  /** Plays one footstep at `volume` (0 to 1) times its own. Nothing is heard until sound is playing. */
  playFootstep(step: FootstepSound, volume: number): void;
  setMuted(muted: boolean): void;
}

const WIND_URL = "sounds/wind.wav";
/** The footstep recordings are numbered from 00. */
const footstepUrl = (variant: number): string => `sounds/footstep${String(variant).padStart(2, "0")}.wav`;
/**
 * How quickly the sound follows a change, as the time to cover about two thirds of it, in
 * seconds. Stepping through a doorway takes about a second to be heard in full.
 */
const WIND_EASE_SECONDS = 0.35;
/** Muting and unmuting are eased as well, but briskly: a jump in volume is heard as a click. */
const MUTE_EASE_SECONDS = 0.05;
/** Sound louder than this is held back by the limiter, in decibels below full scale. */
const LIMITER_THRESHOLD_DB = -3;
/** What the player has to do before a browser lets sound play. */
const UNLOCK_EVENTS = ["pointerdown", "keydown"] as const;

/** `baseUrl` is where the site's files are served from; `volume` is the overall volume, 0 to 1. */
export function createGameAudio(baseUrl: string, volume: number, muted = false): GameAudio {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let windGain: GainNode | undefined;
  let windFilter: BiquadFilterNode | undefined;
  let windSource: AudioBufferSourceNode | undefined;
  /** The footstep recordings that could be loaded, by number. */
  const footsteps: Array<AudioBuffer | undefined> = [];
  let failed = false;
  let isMuted = muted;
  // Kept so that the wind starts out as it should be rather than easing in from somewhere else.
  let wind: WindMix = { volume: 0, cutoffHz: OPEN_CUTOFF_HZ, rate: 1 };

  const fail = (error: unknown): void => {
    failed = true;
    console.warn("Sound could not be started; the game goes on without it.", error);
  };

  const resume = (): void => {
    // Refused without a click or key press; the state then simply stays "blocked".
    void context?.resume().catch(() => {});
  };
  const unlock = (): void => {
    resume();
    if (context?.state === "running") {
      for (const event of UNLOCK_EVENTS) {
        window.removeEventListener(event, unlock);
      }
    }
  };

  const load = async (audio: AudioContext, url: string): Promise<AudioBuffer> => {
    const response = await fetch(`${baseUrl}${url}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return audio.decodeAudioData(await response.arrayBuffer());
  };
  const loadFootsteps = (audio: AudioContext): void => {
    for (let variant = 0; variant < FOOTSTEP_VARIANTS; variant += 1) {
      load(audio, footstepUrl(variant)).then(
        (buffer) => {
          footsteps[variant] = buffer;
        },
        (error: unknown) => {
          // Without them there are simply no footsteps; the wind still plays.
          if (variant === 0) {
            console.warn("Footstep sounds could not be loaded.", error);
          }
        },
      );
    }
  };
  const playWind = async (audio: AudioContext, into: AudioNode): Promise<void> => {
    const buffer = await load(audio, WIND_URL);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(into);
    source.start();
    windSource = source;
    // The weather may have changed while the recording was on its way.
    source.playbackRate.value = wind.rate;
  };

  return {
    get state(): AudioState {
      if (failed) {
        return "failed";
      }
      if (!context) {
        return "off";
      }
      if (!windSource) {
        return "loading";
      }
      return context.state === "running" ? "playing" : "blocked";
    },
    get muted(): boolean {
      return isMuted;
    },
    start(): void {
      if (context || failed) {
        return;
      }
      try {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = isMuted ? 0 : volume;
        // The storm plays the wind louder than it was recorded. The limiter holds the loudest
        // gusts just under full scale; without it they would distort.
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = LIMITER_THRESHOLD_DB;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.25;
        master.connect(limiter);
        limiter.connect(context.destination);
        windGain = context.createGain();
        windGain.gain.value = wind.volume;
        windGain.connect(master);
        windFilter = context.createBiquadFilter();
        windFilter.type = "lowpass";
        windFilter.frequency.value = wind.cutoffHz;
        windFilter.connect(windGain);
      } catch (error) {
        fail(error);
        return;
      }
      playWind(context, windFilter).catch(fail);
      loadFootsteps(context);
      for (const event of UNLOCK_EVENTS) {
        window.addEventListener(event, unlock);
      }
      unlock();
      // A game left in a hidden tab should not go on howling.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          void context?.suspend().catch(() => {});
        } else {
          resume();
        }
      });
    },
    setWind(mix: WindMix): void {
      // Called every step; the browser is told only when something has changed.
      const same = mix.volume === wind.volume && mix.cutoffHz === wind.cutoffHz && mix.rate === wind.rate;
      wind = mix;
      if (same || !context || !windGain || !windFilter) {
        return;
      }
      const now = context.currentTime;
      windGain.gain.setTargetAtTime(mix.volume, now, WIND_EASE_SECONDS);
      windFilter.frequency.setTargetAtTime(mix.cutoffHz, now, WIND_EASE_SECONDS);
      windSource?.playbackRate.setTargetAtTime(mix.rate, now, WIND_EASE_SECONDS);
    },
    playFootstep(step: FootstepSound, stepVolume: number): void {
      const buffer = footsteps[step.variant];
      // Steps taken while sound is held back are not saved up for later.
      if (!context || !master || !buffer || context.state !== "running") {
        return;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = step.rate;
      const gain = context.createGain();
      gain.gain.value = step.volume * stepVolume;
      source.connect(gain);
      gain.connect(master);
      source.start();
    },
    setMuted(value: boolean): void {
      isMuted = value;
      if (context && master) {
        master.gain.setTargetAtTime(value ? 0 : volume, context.currentTime, MUTE_EASE_SECONDS);
      }
    },
  };
}
