import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial } from "three";
import type { GameWorld } from "../core/ecs";
import { SHELTER_DEPTH_BELOW_FLOOR } from "../gameplay/shelter";
import type { SceneLike } from "../render/renderSync";

/**
 * Shows the shelter zones as green boxes, for checking that they sit where the buildings are.
 * Development builds only. The boxes are drawn over everything, so they show through walls.
 */

const COLOR = 0x4dff88;
const FILL_OPACITY = 0.16;

export interface ShelterZoneOverlay {
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  /** Rebuilds the boxes from the zones now in the world. Call after a zone is loaded again. */
  refresh(): void;
}

export function createShelterZoneOverlay(world: GameWorld, scene: SceneLike): ShelterZoneOverlay {
  const zones = world.with("shelterZone", "transform");
  const group = new Group();
  const fill = new MeshBasicMaterial({ color: COLOR, transparent: true, opacity: FILL_OPACITY, depthTest: false, depthWrite: false, fog: false });
  const line = new LineBasicMaterial({ color: COLOR, depthTest: false, fog: false });
  let visible = false;

  const clear = (): void => {
    for (const child of group.children) {
      (child as Mesh | LineSegments).geometry.dispose();
    }
    group.clear();
  };
  const build = (): void => {
    clear();
    for (const { shelterZone: zone, transform: at } of zones) {
      const height = zone.height + SHELTER_DEPTH_BELOW_FLOOR;
      const box = new BoxGeometry(zone.halfWidth * 2, height, zone.halfDepth * 2);
      for (const object of [new Mesh(box, fill), new LineSegments(new EdgesGeometry(box), line)]) {
        object.position.set(at.x, at.y - SHELTER_DEPTH_BELOW_FLOOR + height / 2, at.z);
        object.rotation.y = at.rotationY;
        // After everything else, or the sky and the haze would be drawn over them.
        object.renderOrder = 1000;
        group.add(object);
      }
    }
  };

  return {
    get visible(): boolean {
      return visible;
    },
    setVisible(next): void {
      if (next === visible) {
        return;
      }
      visible = next;
      if (visible) {
        build();
        scene.add(group);
      } else {
        scene.remove(group);
        clear();
      }
    },
    refresh(): void {
      if (visible) {
        build();
      }
    },
  };
}
