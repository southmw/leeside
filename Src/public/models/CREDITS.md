# Model credits

## matt.glb, lis.glb, sam.glb, shaun.glb

The four player characters, from the "Zombie Apocalypse Kit" (March 2024) by Quaternius.
License: CC0 1.0 (public domain dedication).

Source: https://quaternius.com/packs/zombieapocalypsekit.html

Changed for the game by `scripts/build-characters.mjs`: the weapons carried in the hand are
removed, only the "Idle", "Run" and "Jump_Idle" animations are kept, and the file is written
as binary glTF. To rebuild, unpack the kit into `assets-src/` and run
`node scripts/build-characters.mjs`.
