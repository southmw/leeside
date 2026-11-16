/**
 * Terrain of the dry riverbed zone (prototype design 5), computed rather than drawn: a plain
 * with a dried-up river channel running north to south through the middle, 2.8 m lower than
 * its surroundings, and a mound in the east where house B stands. The numbers are placeholders
 * to be adjusted by walking around in the zone (plan step 1.10).
 */

export const DRY_RIVERBED_SIZE = 720;
/** 181 samples per side puts them 4 m apart. */
export const DRY_RIVERBED_SAMPLES = 181;

/** Height of the plain around the river. The riverbed's floor is at about 0. */
const PLAIN_HEIGHT = 2.8;
/** The channel: where its centre line runs, how wide its flat floor is, and how wide the banks are. */
const CHANNEL_CENTRE_X = 360;
const CHANNEL_MEANDER = 18;
const CHANNEL_MEANDER_LENGTH = 110;
const CHANNEL_HALF_WIDTH = 34;
/**
 * 2.8 m of drop over 9 m: about 17 degrees on average and about 25 at its steepest, which
 * reads clearly as a bank and is still well within what a character can walk up (45).
 */
const BANK_WIDTH = 9;
/** The eastern mound: centre (east, south), extra height and how far it spreads. */
const MOUND = { x: 563, z: 206, height: 4, radius: 80 };

/** 0 at `from`, 1 at `to`, with a smooth start and end. */
function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(Math.max((value - from) / (to - from), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Height of the dry riverbed's terrain at a point, in metres. */
export function dryRiverbedHeight(x: number, z: number): number {
  const centre = CHANNEL_CENTRE_X + CHANNEL_MEANDER * Math.sin(z / CHANNEL_MEANDER_LENGTH);
  const distance = Math.abs(x - centre);
  // 1 on the plain, 0 on the channel floor, in between on the banks.
  const outOfChannel = smoothstep(CHANNEL_HALF_WIDTH, CHANNEL_HALF_WIDTH + BANK_WIDTH, distance);

  const moundDistance = Math.hypot(x - MOUND.x, z - MOUND.z) / MOUND.radius;
  const mound = MOUND.height * Math.exp(-moundDistance * moundDistance);

  // Gentle unevenness, weaker on the channel floor. Fixed formulas, so it is the same every time.
  const ripple = 0.25 * Math.sin(x / 17 + 1.3) * Math.cos(z / 23) + 0.12 * Math.sin((x + z) / 9);

  return PLAIN_HEIGHT * outOfChannel + mound + ripple * (0.35 + 0.65 * outOfChannel);
}

/** A circle of ground to level, for a building to stand on. */
export interface TerrainPad {
  x: number;
  z: number;
  /** Fully level within this distance of the centre. */
  radius: number;
}

/** Beyond a pad's radius the ground returns to its natural height over this distance. */
const PAD_BLEND_WIDTH = 10;

/**
 * Terrain height with the ground levelled at each pad: inside a pad the height is that of
 * the natural terrain at the pad's centre, and it blends back smoothly outside.
 */
export function paddedHeight(x: number, z: number, pads: readonly TerrainPad[]): number {
  let height = dryRiverbedHeight(x, z);
  for (const pad of pads) {
    const distance = Math.hypot(x - pad.x, z - pad.z);
    const natural = 1 - smoothstep(pad.radius + PAD_BLEND_WIDTH, pad.radius, distance);
    height = dryRiverbedHeight(pad.x, pad.z) * (1 - natural) + height * natural;
  }
  return height;
}

/** The height grid for the zone definition: row by row from the north, each row west to east. */
export function generateDryRiverbedHeights(
  pads: readonly TerrainPad[] = [],
  samples: number = DRY_RIVERBED_SAMPLES,
  size: number = DRY_RIVERBED_SIZE,
): number[] {
  const cell = size / (samples - 1);
  const heights: number[] = [];
  for (let row = 0; row < samples; row += 1) {
    for (let column = 0; column < samples; column += 1) {
      heights.push(Math.round(paddedHeight(column * cell, row * cell, pads) * 100) / 100);
    }
  }
  return heights;
}
