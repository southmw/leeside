# Sound credits

## wind.wav

The wind that plays all the time: "Mild Wind Background Noise" by Bashar3A, a recording of a
gusty wind (44.5 s).
License: CC0 1.0 (public domain dedication).

Source: https://opengameart.org/content/mild-wind-background-noise
(file `wind background noise 2.wav`)

Changed for the game by `scripts/build-sounds.mjs`: mixed down to one channel at 22,050 Hz and
16 bits, its end blended into its beginning so that it repeats without a seam (42.5 s), and
made as loud as the format allows. To rebuild, put the original file into `assets-src/sounds/`
and run `node scripts/build-sounds.mjs`.

## footstep00.wav to footstep07.wav

The character's footsteps on dry earth. Not recordings: `scripts/build-sounds.mjs` makes them
from filtered noise, so they are the project's own and have no other source.
