# Yharnam Nights

A Bloodborne-themed *Vampire Survivors*-style action roguelite that runs in the
browser. Built mobile-first with a single HTML page, a stylesheet, and a
self-contained JavaScript file — no build step, no dependencies.

## Purpose

This repo is a hobby/learning project: a small but complete game that shows
how much you can pack into a static page. It is intentionally vanilla — open
`index.html` in any modern browser and play. The codebase is also a useful
reference for canvas rendering, touch input, procedural audio, and the
classic horde-survival upgrade loop.

## Contents

| File          | Purpose                                                   |
| ------------- | --------------------------------------------------------- |
| `index.html`  | Page shell, HUD, and overlay menus (title, pause, dream,  |
|               | level-up, game over, victory).                            |
| `style.css`   | Gothic typography and layout for the HUD and overlays.    |
| `game.js`     | All gameplay: rendering, input, audio, enemies, weapons,  |
|               | passives, upgrades, and meta-progression.                 |
| `.nojekyll`   | Lets GitHub Pages serve the files as-is.                  |

## Gameplay

- Drag anywhere on screen to move; weapons swing on their own.
- Survive 30 minutes against escalating waves of beasts, hunters, and bosses.
- Pick up Blood Echoes from kills to level up and choose a **Boon** — a new
  weapon, a passive upgrade, or a level on something you already have.
- Insight gathered during a run carries over to the **Hunter's Dream**, where
  it can be spent on permanent boons between hunts.

### Hunters

Four starting characters with distinct weapons and passives:

- **The Hunter** — Saw Cleaver. Balanced, with HP regen.
- **The Foreigner** — Hunter's Pistol. Frail, deadly at range.
- **The Executioner** — Threaded Cane. Hardy, with damage reduction.
- **Iosefka** — Hunter's Torch. Slow, with regen and lifesteal.

## Running locally

No build, no server required for casual play — just open `index.html`.

If your browser blocks `localStorage` or audio on `file://`, serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying

The repo is structured for **GitHub Pages**: enable Pages on the default
branch, and the root `index.html` is served directly. The `.nojekyll` file
disables Jekyll processing so nothing gets rewritten.
