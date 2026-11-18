import type { GameWorld, ShelterZone, Transform } from "../core/ecs";

/**
 * Shelter: whether a character is somewhere the weather does not reach (prototype design 3.4).
 * A shelter zone is an upright box that turns with its building; sound, the HUD and, later,
 * storm damage and body temperature all read the one answer kept on each player.
 */

/** How far a zone reaches below its floor, so a foot in a dip of the ground is still indoors. */
export const SHELTER_DEPTH_BELOW_FLOOR = 0.5;

/** A zone and where it stands: `transform` is the middle of its floor. */
export interface PlacedShelterZone {
  shelterZone: ShelterZone;
  transform: Transform;
}

/** Whether a point is within a zone. Points on its edge count as within. */
export function isWithinShelterZone(placed: PlacedShelterZone, x: number, y: number, z: number): boolean {
  const { shelterZone: zone, transform: at } = placed;
  if (y < at.y - SHELTER_DEPTH_BELOW_FLOOR || y > at.y + zone.height) {
    return false;
  }
  // The point in the zone's own axes: the world offset turned back by the zone's rotation.
  const sin = Math.sin(at.rotationY);
  const cos = Math.cos(at.rotationY);
  const dx = x - at.x;
  const dz = z - at.z;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= zone.halfWidth && Math.abs(localZ) <= zone.halfDepth;
}

/** Id of the zone a point is in, or null out in the open. */
export function shelterZoneAt(zones: Iterable<PlacedShelterZone>, x: number, y: number, z: number): string | null {
  for (const placed of zones) {
    if (isWithinShelterZone(placed, x, y, z)) {
      return placed.shelterZone.id;
    }
  }
  return null;
}

/** Notes on every entity that can take shelter which zone it is in. Runs after the physics step. */
export function createShelterSystem(world: GameWorld): () => void {
  const zones = world.with("shelterZone", "transform");
  const seekers = world.with("shelter", "transform");
  return () => {
    for (const { shelter, transform } of seekers) {
      shelter.zone = shelterZoneAt(zones, transform.x, transform.y, transform.z);
    }
  };
}
