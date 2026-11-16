import { CAMERA_DISTANCE, CAMERA_PIVOT_HEIGHT, CAMERA_SHOULDER_OFFSET } from "../data/tuning";

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Point;
  /** A point straight ahead of the camera, for `lookAt`. */
  target: Point;
}

export interface CameraRigOptions {
  distance?: number;
  shoulderOffset?: number;
  pivotHeight?: number;
}

/** Unit vector the view faces along, and the horizontal unit vector to its right. */
export function viewAxes(yaw: number, pitch: number): { forward: Point; right: { x: number; z: number } } {
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const cosPitch = Math.cos(pitch);
  return {
    forward: { x: -sinYaw * cosPitch, y: Math.sin(pitch), z: -cosYaw * cosPitch },
    right: { x: cosYaw, z: -sinYaw },
  };
}

/**
 * Third-person camera placement as plain arithmetic: the camera sits `distance` behind a
 * pivot above the character, shifted to the right, and looks along the view direction, so
 * the character stays left of the centre of the screen.
 */
export function computeCameraPose(
  character: Point,
  yaw: number,
  pitch: number,
  options: CameraRigOptions = {},
): CameraPose {
  const distance = options.distance ?? CAMERA_DISTANCE;
  const shoulderOffset = options.shoulderOffset ?? CAMERA_SHOULDER_OFFSET;
  const pivotHeight = options.pivotHeight ?? CAMERA_PIVOT_HEIGHT;

  const { forward, right } = viewAxes(yaw, pitch);

  const position = {
    x: character.x + right.x * shoulderOffset - forward.x * distance,
    y: character.y + pivotHeight - forward.y * distance,
    z: character.z + right.z * shoulderOffset - forward.z * distance,
  };
  return {
    position,
    target: { x: position.x + forward.x, y: position.y + forward.y, z: position.z + forward.z },
  };
}
