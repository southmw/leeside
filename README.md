# LEESIDE

**English** | [한국어](README.ko.md)

**A third-person survival action RPG for desktop browsers, in a world where the weather is your greatest enemy.** Built with Three.js.

> **Play the prototype: https://southmw.github.io/leeside/** (desktop browser, keyboard and mouse; nothing to install, no account)

Civilisation has fallen to climate collapse. You search the ruins before the storm arrives, find somewhere to sit it out, and bring an abandoned shelter back to life with what you carried home. "Leeside" is the side sheltered from the wind.

## Status

**The ten-minute prototype is finished (milestones M0 to M2). Next comes the playtest that decides whether the rest gets built (G1).**

| Stage | Status |
|---|---|
| Design | Done |
| Prototype (ten minutes of the core loop) | Done (2026-11-24, https://southmw.github.io/leeside/) |
| Playtest | Next |
| Vertical slice (thirty minutes) | Not started |

What the prototype has:

- A title screen, four characters to choose from, and a two-minute tutorial that leads to the shelter.
- A zone to walk through (the dry riverbed) and a shelter underneath it.
- A storm every day. A wall of dust comes up from the south, the view closes in, and anyone still outside loses health.
- Health, temperature (the nights are cold) and thirst, with a compass and a storm warning on screen.
- Fourteen containers to search (hold E), an eight-slot bag, and four quick slots for water and bandages.
- A goal: bring back enough scrap, cloth and tape to repair the shelter's door. Each return shows what the outing brought in and moves on to the next morning.
- Falling leaves the bag where you fell. You wake in the shelter the next day and have to go back for it.
- Pause, settings (sensitivity, volume, graphics quality, language and more), English and Korean.
- An end screen once the door is repaired, with a link to a short feedback form.

About data: the game keeps a record of each game (how far it went and how well it ran) in your browser. The published game also sends that record anonymously as you play. It holds nothing that identifies you, and the settings can turn it off.

## The game

| | |
|---|---|
| Genre | Third-person survival action RPG |
| Platform | Desktop web browsers. No install, no sign-up. Mobile is not supported |
| Controls | Keyboard and mouse; gamepad planned |
| Languages | English, Korean |
| Players | Single player first, then co-op for two to four |

### What it is about

- **The weather is the greatest enemy.** Heat, sandstorms and cold decide when you go out and how far. You watch the sky before you watch for enemies.
- **The tension of scavenging.** The bag is small and the weather is about to turn. One more container, or head back now?
- **What you carry home is your strength.** You grow through the gear you make and the facilities you restore, more than through levels.
- **Ten minutes is enough.** A short session still moves things forward.

### The world

Each region has its own disaster. The long-term goal is to retake a key facility in each one and restore a part of the shelter with it.

| Region | Disaster | Facility to retake | What it restores |
|---|---|---|---|
| Drought plains | Drought, heat, sandstorms | Pumping station | Water purification |
| Flooded city | Heavy rain, flooding | Substation | Generator |
| Frozen zone | Severe cold, blizzards | Weather station | Greenhouse and forecasts |

## Why a prototype first

Before building the whole game, the prototype asks one question: **is it fun to scavenge with a storm on the way, and do you want to go out one more time?** What people do when they play it decides whether the rest is built.

It has one zone and the shelter, the storm, the cold of night and thirst, containers and a small bag, and one goal. Combat, crafting and saving are left out.

## Documents

All the design is in [DOC/](DOC/). The documents are written in Korean.

| Document | Contents |
|---|---|
| [Game design](DOC/01-게임기획서.md) | The whole game: world, combat, survival, crafting, zones, settings |
| [Technical design](DOC/02-기술설계서.md) | Stack, structure, zone system, weather and temperature, saving, performance budget |
| [Roadmap](DOC/03-개발로드맵.md) | Milestones and progress |
| [Design review](DOC/04-기획검증.md) | The design checked against market data, and the decisions that followed |
| [Prototype plan](DOC/05-시제품개발계획.md) | The prototype in 57 steps, each with a way to verify it |
| [Prototype design](DOC/06-시제품설계.md) | The prototype's goal, zone layout, numbers and items |
| [UI design](DOC/07-UI설계.md) | Screen flow, layouts, key bindings, icons |
| [Asset candidates](DOC/08-에셋후보.md) | Free (CC0) assets considered and how they are chosen |

The eighteen icons are in [DOC/icons/](DOC/icons/). Open `DOC/icons/preview.html` in a browser to see them all.

## Technology

| Area | Choice |
|---|---|
| Language and build | TypeScript, Vite |
| Rendering | Three.js |
| Physics | Rapier |
| Structure | ECS (miniplex) |
| Tests | Vitest, and a smoke test that opens the game in a real browser |

## How it is made

- Design is written down before anything is implemented.
- Work goes in small steps, and every step has a way to verify it.
- Fun is tested first: the prototype's playtest decides the direction.

The working rules and a summary of the decisions are in [CLAUDE.md](CLAUDE.md) (in Korean).

## Running it locally

Node.js 20 or later.

```
cd Src
npm install
npm run dev
```

Open the address it prints. Pick a character and press START. Move with WASD, jump with Space, hold a mouse button and move the mouse to look around, and zoom with the wheel. F3 shows performance figures, and adding `?skipTitle` to the address starts without the title screen.

## Assets

| Asset | Author | License |
|---|---|---|
| Four player characters, vehicles and props (Zombie Apocalypse Kit) | Quaternius | CC0 1.0 |
| Rocks (Stylized Nature MegaKit, free version) | Quaternius | CC0 1.0 |
| Wind (Mild Wind Background Noise) | Bashar3A | CC0 1.0 |

Details are in [Src/public/models/CREDITS.md](Src/public/models/CREDITS.md) and [Src/public/sounds/CREDITS.md](Src/public/sounds/CREDITS.md).

## License

Not decided yet.
