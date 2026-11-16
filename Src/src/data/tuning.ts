/**
 * Game numbers in one place, so balancing means editing this file only.
 * The values come from DOC/06 (prototype design), chapter 3; change both together.
 */

/** Downward acceleration in m/s². Stronger than Earth's so jumps feel snappy. */
export const GRAVITY = 20;

/** Player capsule: total height and radius in metres. */
export const CHARACTER_HEIGHT = 1.8;
export const CHARACTER_RADIUS = 0.35;

/**
 * Player movement speed in m/s. The prototype has a single speed: no walking or sprinting.
 * Raised from 6.5 after trying the zone on foot; the zone was enlarged by the same ratio, so
 * the times between places are as designed.
 */
export const MOVE_SPEED = 12;

/** How high a jump lifts the character's feet, in metres. */
export const JUMP_HEIGHT = 1.1;

/** Steepest slope a character can walk up, in degrees. Anything steeper blocks and slides. */
export const MAX_SLOPE_DEGREES = 45;

/** Third-person camera: distance behind the character and sideways shift to the right, in metres. */
export const CAMERA_DISTANCE = 4.5;
export const CAMERA_SHOULDER_OFFSET = 0.5;
/** Height above the character's centre that the camera orbits and looks past, in metres. */
export const CAMERA_PIVOT_HEIGHT = 0.6;
/** How far the view can tilt down and up from level, in degrees. */
export const LOOK_DOWN_LIMIT_DEGREES = 60;
export const LOOK_UP_LIMIT_DEGREES = 70;

/** Default mouse sensitivity: radians of turn per pixel of mouse movement. */
export const MOUSE_SENSITIVITY = 0.0025;

/** Radius of the sphere swept from the character to the camera to find obstacles, in metres. */
export const CAMERA_COLLISION_RADIUS = 0.2;
/** The camera never comes closer to its pivot than this, in metres. */
export const CAMERA_MIN_DISTANCE = 0.3;
/** How fast the camera moves back out once an obstacle is gone, in m/s. */
export const CAMERA_RECOVER_SPEED = 6;
/**
 * How fast the camera closes in when something merely blocks its view of the character, in
 * m/s. If the camera itself would be inside something, it moves in at once instead.
 */
export const CAMERA_PULL_IN_SPEED = 10;

/** Mouse wheel zoom: nearest and farthest camera distance in metres. */
export const CAMERA_ZOOM_MIN = 1;
export const CAMERA_ZOOM_MAX = 20;
/**
 * Each wheel notch multiplies or divides the distance by this. A ratio rather than a fixed
 * step, so zooming feels the same close up and far out: about 21 notches from end to end.
 */
export const CAMERA_ZOOM_FACTOR = 1.15;
/**
 * The camera closes a gap to its target distance at this fraction of the gap per second, if
 * that is faster than the fixed speeds above. Keeps a long zoom from taking seconds.
 */
export const CAMERA_FOLLOW_RATE = 6;
