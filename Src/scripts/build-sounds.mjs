// Puts the sound files into public/sounds from the original recordings (all CC0).
//   wind.wav            the wind that plays all the time, made to repeat without a seam
//   footstep00..07.wav  the character's footsteps on dry earth, made here from noise (no recording)
// The file names must match src/audio/audio.ts.
//
// The originals are not in the repository. Download them (see public/sounds/CREDITS.md),
// put them into assets-src/sounds/ and run:  node scripts/build-sounds.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sources = join(root, "assets-src", "sounds");
const outDir = join(root, "public", "sounds");

/** The end of the recording is blended into its beginning over this long, so the loop has no seam. */
const CROSSFADE_SECONDS = 2;
/** The loudest sample after conversion, leaving a little headroom below full scale. */
const PEAK = 0.89;

/** Reads a WAV file (16-bit integer or 32-bit float) as one channel of samples between -1 and 1. */
function readWavMono(path) {
  const file = readFileSync(path);
  if (file.toString("ascii", 0, 4) !== "RIFF" || file.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path} is not a WAV file`);
  }
  let format;
  let data;
  for (let at = 12; at + 8 <= file.length; ) {
    const id = file.toString("ascii", at, at + 4);
    const size = file.readUInt32LE(at + 4);
    if (id === "fmt ") {
      format = {
        tag: file.readUInt16LE(at + 8),
        channels: file.readUInt16LE(at + 10),
        rate: file.readUInt32LE(at + 12),
        bits: file.readUInt16LE(at + 22),
      };
    } else if (id === "data") {
      data = file.subarray(at + 8, at + 8 + size);
      break;
    }
    at += 8 + size + (size & 1);
  }
  const float = format?.tag === 3 && format.bits === 32;
  const int16 = format?.tag === 1 && format.bits === 16;
  if (!format || !data || !(float || int16)) {
    throw new Error(`${path}: only 16-bit integer and 32-bit float WAV files can be read`);
  }
  const bytes = format.bits / 8;
  const frames = Math.floor(data.length / (bytes * format.channels));
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < format.channels; channel += 1) {
      const offset = (frame * format.channels + channel) * bytes;
      sum += float ? data.readFloatLE(offset) : data.readInt16LE(offset) / 32768;
    }
    samples[frame] = sum / format.channels;
  }
  return { samples, rate: format.rate };
}

/**
 * Halves the sample rate. Everything above a quarter of the old rate is filtered out first;
 * left in, it would fold back into the sound as noise.
 */
function halveRate(samples) {
  const TAPS = 63;
  const middle = (TAPS - 1) / 2;
  const kernel = new Float64Array(TAPS);
  let total = 0;
  for (let i = 0; i < TAPS; i += 1) {
    const x = i - middle;
    // A low-pass at a little under half the new rate, shaped by a Hann window.
    const sinc = x === 0 ? 0.46 : Math.sin(Math.PI * 0.46 * x) / (Math.PI * x);
    kernel[i] = sinc * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (TAPS - 1)));
    total += kernel[i];
  }
  const out = new Float32Array(Math.floor(samples.length / 2));
  for (let i = 0; i < out.length; i += 1) {
    let sum = 0;
    for (let k = 0; k < TAPS; k += 1) {
      const at = i * 2 + k - middle;
      if (at >= 0 && at < samples.length) {
        sum += samples[at] * kernel[k];
      }
    }
    out[i] = sum / total;
  }
  return out;
}

/**
 * Makes a recording repeat without a seam: its last `fade` samples are blended into its first
 * ones, so the end of the result runs straight on into its beginning. The result is `fade`
 * samples shorter.
 */
function makeLoop(samples, fade) {
  const length = samples.length - fade;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const sample = samples[i + fade];
    const into = i - (length - fade);
    if (into < 0) {
      out[i] = sample;
    } else {
      // Equal power rather than a straight mix: unrelated noise would otherwise dip in the middle.
      const t = ((into + 1) / fade) * (Math.PI / 2);
      out[i] = sample * Math.cos(t) + samples[into] * Math.sin(t);
    }
  }
  return out;
}

function normalise(samples, peak) {
  let loudest = 0;
  for (const sample of samples) {
    loudest = Math.max(loudest, Math.abs(sample));
  }
  return loudest > 0 ? samples.map((sample) => (sample / loudest) * peak) : samples;
}

/** Writes one channel of samples as a 16-bit WAV file. */
function writeWavMono(path, samples, rate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(samples.length * 2, 40);
  const body = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    body.writeInt16LE(Math.round(Math.min(Math.max(samples[i], -1), 1) * 32767), i * 2);
  }
  writeFileSync(path, Buffer.concat([header, body]));
}

const need = (path) => {
  if (!existsSync(path)) {
    console.error(`An original recording is not at ${path}. See public/sounds/CREDITS.md for where to get it.`);
    process.exit(1);
  }
  return path;
};
const windSource = need(join(sources, "wind background noise 2.wav"));
mkdirSync(outDir, { recursive: true });

// The wind: one channel at half the sample rate is plenty for a low rumble and a quarter of the size.
const original = readWavMono(windSource);
const rate = original.rate / 2;
const wind = normalise(makeLoop(halveRate(original.samples), Math.round(CROSSFADE_SECONDS * rate)), PEAK);
writeWavMono(join(outDir, "wind.wav"), wind, rate);
console.log(
  `wind.wav  ${(readFileSync(join(outDir, "wind.wav")).length / 1024).toFixed(0)} KB, ${(wind.length / rate).toFixed(1)} s at ${rate} Hz`,
);

// The footsteps: soft steps on dry, sandy earth, made from filtered noise. Recorded footsteps
// were tried first (hard, clicking heels) and did not suit a run across a riverbed at five
// steps a second. Each is a dull thud with two short crunches of grit, heel then toe; the
// eight differ in pitch, length and grain. The numbers are seeded, so every build gives the
// same files.
const FOOTSTEPS = 8;
const STEP_RATE = 22050;
const STEP_SECONDS = 0.24;
const STEP_PEAK = 0.7;

/** Seeded random numbers from 0 to 1 (mulberry32, as in src/core/random.ts). */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFootstep(seed) {
  const random = createRandom(seed);
  const between = (min, max) => min + (max - min) * random();
  const length = Math.round(STEP_SECONDS * STEP_RATE);
  const out = new Float32Array(length);

  // Grit: noise with the hiss and the rumble filtered off, in grains rather than a smooth rush.
  const lowpass = 1 - Math.exp((-2 * Math.PI * between(900, 1400)) / STEP_RATE);
  const highpass = 1 - Math.exp((-2 * Math.PI * between(180, 320)) / STEP_RATE);
  const grainEvery = Math.round(STEP_RATE / between(350, 600));
  // The heel comes down, then the ball of the foot a little later and longer.
  const heel = { at: 0.004, level: 1, decay: between(0.02, 0.03) };
  const toe = { at: between(0.05, 0.075), level: between(0.45, 0.7), decay: between(0.035, 0.055) };
  const strike = (t, part) => (t < part.at ? 0 : part.level * (1 - Math.exp(-(t - part.at) / 0.003)) * Math.exp(-(t - part.at) / part.decay));
  // The thud of the weight landing: a low tone that falls and dies at once.
  const thudFrom = between(85, 105);
  const thudLevel = between(0.5, 0.7);

  let low = 0;
  let lower = 0;
  let rumble = 0;
  let grain = 1;
  let grainTarget = 1;
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / STEP_RATE;
    // Filtered twice: once leaves enough hiss to make the step sound like a spray of sand.
    low += lowpass * (random() * 2 - 1 - low);
    lower += lowpass * (low - lower);
    rumble += highpass * (lower - rumble);
    if (i % grainEvery === 0) {
      grainTarget = between(0.15, 1);
    }
    grain += 0.02 * (grainTarget - grain);
    const grit = (lower - rumble) * grain * (strike(t, heel) + strike(t, toe));
    phase += (2 * Math.PI * (55 + (thudFrom - 55) * Math.exp(-t / 0.02))) / STEP_RATE;
    const thud = Math.sin(phase) * thudLevel * 0.25 * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.03);
    out[i] = grit + thud;
  }
  // The end is faded to nothing, so that it does not stop with a click.
  const fade = Math.round(0.02 * STEP_RATE);
  for (let i = 0; i < fade; i += 1) {
    out[length - 1 - i] *= i / fade;
  }
  return normalise(out, STEP_PEAK);
}

let footstepBytes = 0;
for (let i = 0; i < FOOTSTEPS; i += 1) {
  const file = `footstep${String(i).padStart(2, "0")}.wav`;
  writeWavMono(join(outDir, file), makeFootstep(100 + i), STEP_RATE);
  footstepBytes += readFileSync(join(outDir, file)).length;
}
console.log(`footstep00..${String(FOOTSTEPS - 1).padStart(2, "0")}.wav  ${(footstepBytes / 1024).toFixed(0)} KB in all`);
