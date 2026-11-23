/**
 * Device-independent player input.
 *
 * Devices (keyboard, mouse, gamepad) are translated into `PlayerActions`. The simulation only
 * ever reads actions, never devices, so a remote player's actions can later be fed in from the
 * network in exactly the same shape.
 */

export interface PlayerActions {
  /** Strafe: -1 (left) to 1 (right). */
  moveX: number;
  /** Advance: -1 (back) to 1 (forward). The move vector never exceeds length 1. */
  moveY: number;
  /** How far to turn the view this step, in radians: to the right, and downwards. */
  lookX: number;
  lookY: number;
  jump: boolean;
  interact: boolean;
  /** The keys of the quick slots (prototype design 4.5). */
  quick1: boolean;
  quick2: boolean;
  quick3: boolean;
  quick4: boolean;
}

/** The quick slots' actions, in the order of the slots. */
export const QUICK_ACTIONS = ["quick1", "quick2", "quick3", "quick4"] as const;

export type ButtonAction =
  | "moveForward"
  | "moveBack"
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "interact"
  | (typeof QUICK_ACTIONS)[number];

/** Maps each action to the keys that trigger it, as `KeyboardEvent.code` values. */
export type KeyBindings = Readonly<Record<ButtonAction, readonly string[]>>;

/** Default layout (UI design 3.4). Codes are physical keys, so the layout survives non-QWERTY keyboards. */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  interact: ["KeyE"],
  quick1: ["Digit1"],
  quick2: ["Digit2"],
  quick3: ["Digit3"],
  quick4: ["Digit4"],
};

export function createEmptyActions(): PlayerActions {
  return {
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    jump: false,
    interact: false,
    quick1: false,
    quick2: false,
    quick3: false,
    quick4: false,
  };
}

/**
 * Turns four direction buttons into a move vector. Opposite directions cancel, and diagonals
 * are scaled to length 1 so that moving diagonally is not faster.
 */
export function moveVector(
  forward: boolean,
  back: boolean,
  left: boolean,
  right: boolean,
): { x: number; y: number } {
  let x = (right ? 1 : 0) - (left ? 1 : 0);
  let y = (forward ? 1 : 0) - (back ? 1 : 0);
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  return { x, y };
}

/** Builds the actions for the given set of pressed keys. */
export function actionsFromKeys(
  pressed: ReadonlySet<string>,
  bindings: KeyBindings = DEFAULT_KEY_BINDINGS,
): PlayerActions {
  const isDown = (action: ButtonAction): boolean => bindings[action].some((code) => pressed.has(code));

  const move = moveVector(
    isDown("moveForward"),
    isDown("moveBack"),
    isDown("moveLeft"),
    isDown("moveRight"),
  );

  return {
    moveX: move.x,
    moveY: move.y,
    lookX: 0,
    lookY: 0,
    jump: isDown("jump"),
    interact: isDown("interact"),
    quick1: isDown("quick1"),
    quick2: isDown("quick2"),
    quick3: isDown("quick3"),
    quick4: isDown("quick4"),
  };
}
