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

/** How fast a character turns to face the way it is moving, in radians per second. */
export const CHARACTER_TURN_RATE = 14;

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

/** Length of one game day in real seconds (8 minutes: one game hour is 20 seconds). */
export const DAY_SECONDS = 480;
/**
 * The hour at which the player sets out and at which the day number goes up. A day is one
 * expedition, so it turns at dawn rather than at midnight.
 */
export const DAY_START_HOUR = 6;
/** Dusk, when the sky reddens, runs from this hour until night. */
export const DUSK_START_HOUR = 18;
/** Night runs from this hour through midnight to `NIGHT_END_HOUR`. */
export const NIGHT_START_HOUR = 19;
export const NIGHT_END_HOUR = 5;

/**
 * The storm that comes once a day (prototype design 3.3). Times are seconds of game time at
 * normal clock speed. The warning starts this long after setting out, at a moment that
 * differs from day to day.
 */
export const STORM_WARNING_START_MIN = 90;
export const STORM_WARNING_START_MAX = 180;
/** From the warning to the storm's arrival. Lengthen if it proves too tight. */
export const STORM_WARNING_SECONDS = 30;
export const STORM_SECONDS_MIN = 45;
export const STORM_SECONDS_MAX = 75;
/** How long the storm takes to die down. */
export const STORM_FADE_SECONDS = 15;
/** How long the storm takes to reach full strength once it arrives. */
export const STORM_RISE_SECONDS = 4;
/** The introduction's storm: it is announced at once, with a long warning for learning the controls. */
export const INTRO_STORM_WARNING_SECONDS = 75;
export const INTRO_STORM_SECONDS = 40;

/** Health a player starts with and can have at most (prototype design 3.4). */
export const MAX_HEALTH = 100;
/**
 * Health lost per second of game time out in a storm at full strength: 25 seconds from full
 * health to none, about 160 m on foot.
 */
export const STORM_DAMAGE_PER_SECOND = 4;

/**
 * Body temperature (prototype design 3.4): 0 is comfortable and the scale runs down to the
 * coldest, where hypothermia sets in. From `COLD_TEMPERATURE` down the player is warned.
 */
export const MIN_TEMPERATURE = -100;
export const COLD_TEMPERATURE = -50;
/** Cooling per second of game time at night out of shelter: cold after 60 s, hypothermia after 120. */
export const COOLING_PER_SECOND = 100 / 120;
/** Warming per second of game time anywhere else: from the coldest to comfortable in 20 s. */
export const WARMING_PER_SECOND = 5;
/** Health lost per second of game time in hypothermia. */
export const HYPOTHERMIA_DAMAGE_PER_SECOND = 2;

/** From this health down the screen warns of danger (UI design 5). */
export const DANGER_HEALTH = 30;
/** From this thirst down the thirst bar calls for attention (UI design 5). */
export const LOW_THIRST = 20;

/** Thirst (prototype design 3.4): the figure a player starts with and can have at most. */
export const MAX_THIRST = 100;
/** Lost per second of game time: from full to nothing in ten minutes. */
export const THIRST_PER_SECOND = MAX_THIRST / 600;
/** Health lost per second of game time with nothing left. */
export const THIRST_DAMAGE_PER_SECOND = 1;
/** What a water bottle gives back (prototype design 4.1). */
export const WATER_BOTTLE_THIRST = 40;

/** How far one can see in a storm at full strength, in metres. */
export const STORM_VISIBILITY = 25;

/**
 * The wind's sound (prototype design 3.3). A volume of 1 plays the recording as it is; the
 * storm plays it louder than that, and a limiter keeps it from distorting. In clear weather a
 * light wind is heard; a storm on its way counts as a wind of up to `WIND_APPROACH_STRENGTH` (of 1),
 * growing evenly through the warning so that it is heard before it is seen.
 * The calm volume was 0.15 at first, which could hardly be heard, and the storm 1, which was
 * not loud enough for a storm.
 */
export const WIND_CALM_VOLUME = 0.55;
export const WIND_STORM_VOLUME = 2;
export const WIND_APPROACH_STRENGTH = 0.3;
/** Indoors the wind is this much as loud as outside, and everything above this pitch (Hz) is muffled. */
export const WIND_INDOOR_VOLUME = 0.35;
export const WIND_INDOOR_CUTOFF_HZ = 500;
/** How much faster the recording plays in a full storm, which makes the wind sharper and more hurried. */
export const WIND_STORM_RATE = 1.15;
/** Volume of the character's footsteps, 0 to 1. Halved from 0.5, which was far too loud. */
export const FOOTSTEP_VOLUME = 0.25;
/** Distance between two footsteps in metres, for a character whose model does not say (the capsule). */
export const FOOTSTEP_STRIDE = 2.5;
/** Overall volume until the settings screen exists (step 2.22); its default there. */
export const DEFAULT_VOLUME = 0.8;

/**
 * Interaction (prototype design 3.5). A target can be used from this far away (metres,
 * measured level from the character's centre), while the view points within this many degrees
 * of it and its base is at most this far above or below the character's feet.
 */
export const INTERACT_DISTANCE = 2;
export const INTERACT_ANGLE_DEGREES = 60;
export const INTERACT_HEIGHT = 1.5;
/** Nearer than this (metres) the direction no longer counts: standing on a target, there is none. */
export const INTERACT_NEAR_DISTANCE = 0.3;

/** The bag (prototype design 3.4, 4.1, 4.4): how many slots, and how many of one thing fit in a slot. */
export const BAG_SLOTS = 8;
export const MATERIAL_STACK = 5;
export const CONSUMABLE_STACK = 3;
/** What a bandage gives back (prototype design 4.1). */
export const BANDAGE_HEALTH = 30;

/** Searching a container for the first time: how long E is held, in seconds (prototype design 3.4). */
export const SEARCH_SECONDS = 1.5;
/** What the shelter's door takes to repair (prototype design 2.1). Containers are sure to hold this much. */
export const REPAIR_NEEDS = { scrap: 15, cloth: 8, tape: 3 } as const;
/** Of the amounts that are sure to be found, no container holds more than this many of one material. */
export const GUARANTEED_PER_CONTAINER = 3;
