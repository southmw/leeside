# Model credits

## matt.glb, lis.glb, sam.glb, shaun.glb

The four player characters, from the "Zombie Apocalypse Kit" (March 2024) by Quaternius.
License: CC0 1.0 (public domain dedication).

Source: https://quaternius.com/packs/zombieapocalypsekit.html

Changed for the game by `scripts/build-characters.mjs`: the weapons carried in the hand are
removed, only the "Idle", "Run", "Jump_Idle" and "Death" animations are kept, and the file is written
as binary glTF. To rebuild, unpack the kit into `assets-src/` and run
`node scripts/build-characters.mjs`.

## props/quaternius/

Prop and rock models by Quaternius. License: CC0 1.0 (public domain dedication).
`scripts/build-props.mjs` puts them here from the packs unpacked in `assets-src/`.

- `car_sports.glb`, `car_pickup.glb`, `container_red.glb`, `container_green.glb`: from the
  "Zombie Apocalypse Kit" (March 2024), https://quaternius.com/packs/zombieapocalypsekit.html
  Unchanged apart from being written as binary glTF.
- `rock_medium_1..3.gltf` with their `.bin` files and `Rocks_Desert_Diffuse.png`: from the
  "Stylized Nature MegaKit" (free version), https://quaternius.itch.io/stylized-nature-megakit
  The rocks use the pack's desert texture instead of the grey one their files name, and the
  texture is reduced from 2048 to 512 pixels.
