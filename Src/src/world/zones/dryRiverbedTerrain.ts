/**
 * Terrain of the dry riverbed zone (prototype design 5), computed rather than drawn: a plain
 * with a dried-up river channel running north to south through the middle, 2.5 m lower than
 * its surroundings, and a mound in the east where house B stands. The numbers are placeholders
 * to be adjusted by walking around in the zone (plan step 1.10).
 */

export const DRY_RIVERBED_SIZE = 384;
/** 97 samples per side puts them 4 m apart. */
export const DRY_RIVERBED_SAMPLES = 97;

/** Height of the plain around the river. The riverbed's floor is at about 0. */
const PLAIN_HEIGHT = 2.5;
/** The channel: where its centre line runs, how wide its flat floor is, and how wide the banks are. */
const CHANNEL_CENTRE_X = 192;
const CHANNEL_MEANDER = 10;
const CHANNEL_MEANDER_LENGTH = 60;
const CHANNEL_HALF_WIDTH = 18;
/** 2.5 m of drop over 14 m is about 10 degrees: easy to walk up anywhere. */
const BANK_WIDTH = 14;
/** The eastern mound: centre (east, south), extra height and how far it spreads. */
const MOUND = { x: 300, z: 110, height: 3, radius: 45 };

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

/** The height grid for the zone definition: row by row from the north, each row west to east. */
export function generateDryRiverbedHeights(
  samples: number = DRY_RIVERBED_SAMPLES,
  size: number = DRY_RIVERBED_SIZE,
): number[] {
  const cell = size / (samples - 1);
  const heights: number[] = [];
  for (let row = 0; row < samples; row += 1) {
    for (let column = 0; column < samples; column += 1) {
      heights.push(Math.round(dryRiverbedHeight(column * cell, row * cell) * 100) / 100);
    }
  }
  return heights;
}
