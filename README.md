# Pong Wars Reloaded

A full multiplayer evolution of the original Pong Wars — the eternal battle between Day and Night, now with rackets, powerups, AI, rotation, and more. Written using HTML5 Canvas, CSS, and vanilla JavaScript.

**[Play Now](https://mayerwin.github.io/pong-wars-reloaded/)**

https://github.com/user-attachments/assets/4446a03f-4b24-45d7-b49c-f2209feca44b

## How to Play

### Starting a Game

Open `index.html` in any modern browser. From the main menu you can choose:

- **2 Player**, **vs AI**, or **AI vs AI** mode (with difficulty: Easy / Medium / Hard / Hardest per AI)
- **Win condition**: Combined (time + domination), Domination only, or Timed only
- **Duration**: configurable game length (click the timer label during setup for arbitrary values)

### Objective

Each side starts with half the grid. Balls bounce around and paint squares in their team's color. Players use rackets to deflect balls and control territory. The game ends by:

- **Domination**: a team controls 80% of the grid
- **Time**: when the clock runs out, the team with more territory wins
- **Combined**: whichever happens first

### Controls

| Action         | Player 1 (Day)    | Player 2 (Night)   |
|----------------|-------------------|---------------------|
| Move Up        | E                 | Arrow Up            |
| Move Down      | D                 | Arrow Down          |
| Move Left      | S                 | Arrow Left          |
| Move Right     | F                 | Arrow Right         |
| Rotate Left    | A                 | , (comma)           |
| Rotate Right   | Q                 | . (period)          |

**Pause**: press **ESC** or the pause button in the HUD. **Fullscreen**: click the fullscreen button in the HUD.

All key bindings are fully customizable via Settings > Configure Keys.

**Mobile**: side-panel joystick controls with rotation buttons.

### Rotation

- **Single press**: snaps the racket 45 degrees
- **Hold**: continues snapping every few frames
- **Both rotate buttons**: resets rotation to vertical

### Ball Teleport (Emergency Rescue)

Hold **both left + right movement keys** for 2 seconds to teleport your nearest ball to your racket. This clears a small area of enemy territory around the spawn point and resets the ball to normal size. Each player gets **3 teleports per game** — shown as dimmed icons in the HUD (they brighten and show charging progress while held).

### Power Shot

Moving your racket into a ball as it bounces off transfers momentum — the faster you move, the faster the ball goes. The speed boost decays linearly over 5 seconds back to normal. Maximum boost is capped at 30% above base speed.

## Powerups

Powerups spawn as **stars** (Night territory) or **suns** (Day territory) every 15 seconds (configurable). Uncollected powerups expire after 30 seconds. Walk your racket over a powerup to collect it.

| Powerup        | Icon | Effect                                              |
|----------------|------|-----------------------------------------------------|
| Big Ball       | ◉    | Increases ball radius by +100% base per stack (max 5 stacks) |
| Extra Ball     | ✚    | Spawns an additional ball for your team (max 8)      |
| Big Racket     | ⇕    | Grows your racket by 2 blocks per stack (max 3 stacks) |
| Fast Ball      | »    | Increases ball speed by +50% base per stack (max 4 stacks) |
| Shrink Foe     | ⤓    | Shrinks opponent's racket by 2 blocks per stack (max 3 stacks, min 3 blocks) |

- Effects stack cumulatively (up to max per type). Collecting beyond the cap replaces the oldest, extending its duration.
- Extra balls cap at 8 per team; additional pickups extend the oldest ball's duration.
- Active powerups are shown in the HUD next to each team's score, with stack counts.

## HUD

- **Score**: territory count per team
- **Timer**: remaining game time (click to enter arbitrary duration)
- **Powerup icons**: active effects with stack counts
- **Teleport charges**: shown as dimmed ⇌ icons with remaining count
- **Progress bar** (below HUD): visual representation of domination progress, scaled so 100% = reaching the 80% domination threshold

## Settings

Access settings via the **gear icon** (⚙) during gameplay, or from the main menu / pause screen. Settings are persisted in localStorage.

### Sound
- **Sound On/Off**: master sound toggle
- **Volume**: adjustable slider (0-100%)

### Visual Effects
- **Master toggle**: enables/disables all visual effects
- **Color Theme**: choose between Coral, Sunset, or Cyber palettes
- **Screen Shake**: camera shake on ball impacts
- **Racket Outline**: colored outline around rackets
- **Grid Lines**: subtle grid overlay (off by default)
- **Particles**: impact and confetti particles
- **Progress Bar**: domination progress indicator

### Powerups
- **Frequency**: how often powerups spawn (5-60 seconds)
- **Duration**: how long powerup effects last (10-120 seconds)
- **Mirrored Types**: both teams spawn the same powerup sequence (off by default)

### Gameplay
- **Free Movement**: allows rackets to move freely across enemy territory and collect powerups from either side (off by default — when off, rackets are blocked by enemy squares)

Game-logic settings (powerup config, free movement) are greyed out during active gameplay to prevent mid-game changes.

Each setting has an individual reset-to-default button.

## Stuck Racket Protection

If a racket becomes completely trapped by enemy territory (can't move or rotate in any direction), the game automatically clears adjacent enemy squares to free it. This prevents permanent soft-locks.

## Win Screen

- **Domination win**: "DAY/NIGHT DOMINATES!"
- **Time-based win**: "DAY/NIGHT WINS!" with domination percentage (e.g. "59% domination")
- **Draw** (both at 50%): "IT'S A DRAW!"

## Ball Physics

- Sub-stepped movement prevents balls from passing through rackets at high speed
- Ball-ball elastic collision prevents overlapping when multiple balls are in play
- Balls pass through squares protected by the opponent's racket (no stuck oscillation)

## Development

Run:

```sh
npx serve
```

Open up the link and you're ready to start.

## Credits

Original Pong Wars by [Koen van Gilst](https://koenvangilst.nl). This fork by [Erwin Mayer](https://github.com/mayerwin/pong-wars-reloaded).

I saw this first [here](https://twitter.com/nicolasdnl/status/1749715070928433161), but it appears to be a much older idea. There's some more information on the history in the [Hackernews discussion](https://news.ycombinator.com/item?id=39159418).

The colors are based on the Mindful Palette by [Alex Cristache](https://twitter.com/AlexCristache/status/1738610343499157872).

## Alternate versions

If you've created an alternate version of Pong Wars and would like to share it, please feel free to create a pull request to add the link here.

The alternate versions are listed below in alphabetical order:

- [ASCII Python](https://github.com/flash1293/ascii-pong-wars)
- [Atari 2600](https://forums.atariage.com/topic/360475-pong-wars-atari-2600)
- [BBC Micro Bot](https://mastodon.me.uk/@bbcmicrobot/111829277042377169)
- [C version](https://github.com/BrunoLevy/TinyPrograms)
- [C# (Cross-platform on iOS, Android, WebAssembly, MacOS, Linux, and Windows)](https://aka.platform.uno/pongwars)
- [C# with DIKUArcade](https://github.com/Roar-Morkore-Hansen/pong-wars.git)
- [C++](https://invent.kde.org/carlschwan/pongwars/-/blob/master/src/scene.cpp?ref_type=heads)
- [C++ with SFML](https://github.com/Alan-Kuan/pong-wars)
- [Combat Pong](https://www.combatpong.com/)
- [Earlier version with padels](https://twitter.com/CasualEffects/status/1390290306206216196)
- [Eternal Bounce Battle (GDevelop)](https://gd.games/victrisgames/eternal-bounce-battle)
- [Flutter](https://github.com/flikkr/flutter_pong_wars)
- [Framework 16 LED Matrix](https://github.com/boobcactus/fw16-pongwars)
- [Godot](https://github.com/rosskarchner/pong-wars-godot)
- [Gold Wars (This version has an end!)](https://ask5.github.io/gold-wars/)
- [Java](https://github.com/krefikk/yingyang)
- [Kotlin/Wasm](https://github.com/wasmhub-dev/pong_wars.kt)
- [Land-Or-Water](https://github.com/makaveli2P/land-or-water)
- [Pico8](https://www.pico-8-edu.com/?c=AHB4YQHaAT3vsH558QbF5cXZxd3F_Uedc010zTVJ_gCnN3F6-RNE_SuEUXRRUa8tpK9wzE3nZMedcvntx9y1MpRnV4Xp0v3ZTrm0EUzMSQTsOWBuJL5-8C2Cl0gG0vK2sXTtKYyQN81iujMXPUN03Vq0FGXNajPzGtHOXUGgE3zegFI4hIIzoYCyC7ITgzcogmTuIaba7Nqzz48mh5JFxYFgKllpExWB7ZVnKAaH5qvd3SzqTLA0aZrR1Wy0GFywwsjUQhgOznQ3jtx6QCkisOCWvA9ngqFsZXMnFyKJhkynGFYEyZmCBcaIkk5BMF3YVRBX7RcFcZtGQbRQEN9GU_uMVEkSiRNn_aR55AmGqmBbiigfGuqybCXz5QnZI3W_Lutw2Ph4FOMn6Scn0lBgoSsFi3KlgIGpya1iYRY=&g=w-w-w-w1HQHw-w2Xw-w3Xw-w2HQH)
- [Pong-Wars Fireballs](https://pong-wars-fireballs.vercel.app)
- [Processing](https://github.com/riktov/processing-pong-wars)
- [Pygame version](https://github.com/BjoernSchilberg/py-pong-wars)
- [Python](https://github.com/vocdex/pong-wars-python)
- [Rock, Paper, Scissors, Lizard & Spock](https://kartikp36.github.io/rock-paper-scissors-lizard-spock/)
- [React Native](https://github.com/Nodonisko/react-native-skia-pong-wars)
- [Rust/Wasm](https://github.com/wasmhub-dev/pong_wars.rs)
- [Scratch](https://scratch.mit.edu/projects/957461584)
- [Seasons Pong](https://github.com/hmak-dev/seasons-pong)
- [SwiftUI (Native)](https://github.com/1998code/pong-wars-swiftui)
- [Swift (SpriteKit)](https://github.com/frederik-jacques/ios-pongwars)
- [Tag-Team](https://github.com/SSteve/pong-wars) ([Live](https://ssteve.github.io/pong-wars/))
- [Yin-Yang Pong](https://ying-yang-pong.vercel.app/)
- [Ying Yang](https://twitter.com/a__islam/status/1751485227787034863)
- [M5Stack version](https://github.com/anoken/pong-wars-forM5Stack/)
- [Hex version](https://pong-wars-hex.whichoneiwonder.com/)
- [Bevy](https://github.com/andyleclair/bevy_pong_wars)
- [Atari ST](https://github.com/neilrackett/atarist-pong-wars.git)
- [Three.js](https://labs.mesmotronic.com/three-labs/pong-wars-3d/)
