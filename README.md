# Dark Battle

Co-op mythic boss battles in one shared realm: a three.js PWA hosted on GitHub Pages. **Play:** https://faunamysphere.github.io/dark-battle/

- **Loop:** In the Cloudhold sky hub, everyone works together to awaken 3 shrines and find the sky-orbs. Then a portal sends the whole server to that level's arena. Claim the relics while dodging hazards, and the arena's giant boss awakens. Beat it to reach the next level. Bosses get more HP, more speed and new attack patterns each level, and arenas rotate.
- **Arenas and bosses:** Molten Caldera (Kharvoth, the Cinder Fiend), Frozen Ruins (Jorvald, the Frost Colossus), Serpent's Barrow (Vessrath, the Grave Serpent), Stormspire Rooftop (Aurunax, the Storm Titan).
- **Forms** (switch any time, with a 3 s cooldown):
  - Vanguard: axe combos, Fury.
  - Drop Trooper: rifle, shotgun, Build Wall that blocks bolts.
  - Blockhead: hammer, jump slam, Tower Jump.
  - Shadow Mimic: claws, lunge, Shade Step (vanish, then teleport-strike).
  - Arcanist: homing bolts, star nova, Healing Ward.
  - Ogre Brute: haymakers, ground pound, Unstoppable.
- **Combat:**
  - Light and heavy attacks.
  - Hold block. Tap block just before a hit to parry, which builds stagger.
  - Roll has i-frames.
  - Stagger the boss, then press F for a finisher.
  - Orange zones are blockable; red zones must be dodged.
- **Multiplayer:** the same serverless stack as FaunaMySphere.
  - PeerJS WebRTC star (public broker) plus Nostr public relays as fallback.
  - One shared room (`world1`).
  - The longest-present player is the authoritative leader and simulates the world/boss. Every player reports their cumulative damage, so the boss HP is shared and robust.
  - `?room=name` gives a private room. `?solo` plays offline.
- **All assets are procedural** (geometry, canvas textures, WebAudio sound). Vendored libraries are listed in `vendor/LICENSES.md`.

## Controls
**Desktop:**
- WASD: move. Mouse: look (click to capture).
- LMB/J: light. RMB/K: heavy. Q/Shift: block. Space: roll.
- E: special. 1–6 or T: transform. F: finisher. Tab: lock-on.

**Touch:**
- Left thumb: joystick. Drag the right side to look.
- Buttons: Light, Heavy, Block (hold), Roll, Special, Form.
- On iPhone, use Share → Add to Home Screen to get full screen.
