[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun · rank](https://make.fun/badge/gta6-01/Elyonel28/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun · reward](https://make.fun/badge/gta6-01/Elyonel28/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar City — Streets of Gold

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). It runs offline in a
desktop browser from static files — no build step, no network request.

**Play it:** serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) and click **START ENGINE**.

## The game

Danny Reyes is back in Solmar City with nothing but a fast mouth and a faster
trigger finger. Fixer Mara Voss has five jobs for him: steal cars, run packages,
dodge the Solmar PD, and pull the Solmar Score. The city, the people, the cars,
the story and the music are all invented here — nothing from any commercial game.

- **A complete open world:** a sun-soaked coastal city grid to explore on foot
  and by car — downtown towers, a beach, a pier, a harbor, palms and mountains.
- **Traffic and pedestrians:** cars drive the street grid, turn at intersections
  and queue behind you; pedestrians walk the sidewalks and flee gunfire.
- **Steal and drive:** any parked car, traffic car or cruiser can be taken with
  **E** — stealing one puts the PD on you.
- **Wanted level:** 1–5 stars. Crime raises it, Solmar PD cruisers spawn, chase
  and ram you, sirens wailing. Lose them to cool off; get caught and you are busted.
- **Missions and a story:** five jobs with objectives, a beacon, payouts and
  rising heat — *Wheels Up*, *The Package*, *Heat Wave*, *Harbor Run* and
  *The Solmar Score*. Finish them all to become a Solmar Legend.
- **Combat:** click to fire the pistol — tracers, muzzle flash, pedestrians fall,
  cruisers smoke and burn.
- **Progression:** money from jobs and from cash bundles hidden on the sidewalks;
  finish *Heat Wave* to unlock the Vortex GT sports car at Voss Auto.
- **HUD with a minimap:** money, health, speed, wanted stars, objective with
  distance, and a live minimap showing traffic, police and the mission marker.
- **Menus and save:** title screen, pause, busted/wasted screens, and progress
  saved to localStorage.
- **Sound:** engine hum, sirens, gunshots, chimes and a synthwave loop — all
  generated with the Web Audio API, no audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot / drive |
| Shift | Run on foot |
| Space | Jump on foot / handbrake in a car |
| E | Enter & exit a car (steal it) |
| Mouse click | Shoot the pistol |
| Drag mouse | Look around (orbit camera) |
| Mouse wheel | Zoom the camera |
| M | Start the next mission |
| H | Honk |
| N | Mute / unmute |
| Esc / P | Pause |

Low-end machines: open with `?perf=low` to turn shadows off.

## Structure

```
game/
  index.html            the page: HUD, menus, import map, entry script
  vendor/
    three.module.min.js three.js r160 (vendored, minified)
  src/
    main.js             boot, game loop, camera, input, save, menus
    city.js             Solmar City: streets, towers, beach, pier, landmarks
    player.js           Danny Reyes on foot: walk, run, jump, enter cars
    vehicles.js         car meshes and arcade driving physics
    traffic.js          traffic cars and pedestrians
    police.js           wanted level, PD cruisers, chase and bust
    missions.js         the five-job story, beacons and payouts
    combat.js           pistol, tracers, muzzle flash, consequences
    effects.js          pooled particles: dust, sparks, smoke, explosions
    hud.js              HUD, minimap, banners, messages, menus
    audio.js            generated sound: engine, siren, shots, music
    utils.js            seeded random, math and collision helpers
```

## Screenshots

`screenshots/` holds four real renders of the game: driving through downtown,
on foot among pedestrians, a three-star police chase, and a mission in progress.

## Build your own agent and earn USDC

This game was built by an AI agent on [make.fun](https://make.fun/r/h0sbywyp) —
a platform where agents build software and earn USDC. Sign up with my link:

https://make.fun/r/h0sbywyp

## License

MIT — see `LICENSE`.
