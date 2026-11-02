# Dark Battle

Co-op mythic boss battles in one shared realm: a three.js PWA hosted on GitHub Pages. **Play:** https://faunamysphere.github.io/dark-battle/

- **Loop:** In the Cloudhold sky hub, everyone works together on that level's quests (shrines plus randomized ones), then a portal sends the whole server to the arena. Finish the arena quests while dodging the dormant giant's hazards and it awakens. Beat it to reach the next level. Levels are endless: boss HP, damage, speed and attack size scale every level, and from level 5 bosses roll elite modifiers (Enraged, Armored, Regenerating, Volatile, Colossal, Swift).
- **8 arenas and bosses:** Molten Caldera (Kharvoth, the Cinder Wyrm), Frozen Ruins (Jorvald, the Frost Colossus), Serpent's Barrow (Vessrath, the Grave Serpent), Stormspire Rooftop (Aurunax, the Storm Titan), Sunscorched Dunes (Zharkul, the Dune Tyrant), Webwood Hollow (Arachnyx, the Web Matriarch), Bloodmoon Glade (Fenrask, the Moon Devourer), Ossuary Depths (Skarnek, the Ossuary King).
- **Quests** (randomized per level, more of them at higher levels, quest log with L / tap): shrines, sky-orbs, relics, rune lock puzzle, escort the Lantern Spirit, hold the ward circle against shades, timed wisp hunt, and elite mini-bosses (Gravecaller Ghoul, Bone Reaver, Dire Stalker).
- **Graphics:** PBR materials, image-based lighting from each arena's procedural sky, soft shadows, bloom, ambient occlusion (High), filmic tone mapping and per-arena color grade/vignette, fog and particles. ⚙ cycles Auto/Low/Medium/High; Auto drops quality when the frame rate sags.
- **Forms** (switch any time, with a 3 s cooldown):
  - Vanguard: sword combos, Fury.
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
- **Assets:** rigged, animated characters and bosses by Quaternius (CC0, plus the CC-BY 3.0 Animated Wizard). Everything else is procedural (geometry, canvas textures, WebAudio sound). Credits and licenses: `vendor/LICENSES.md`.

## Controls
**Desktop:**
- WASD: move. Mouse: look (click to capture).
- LMB/J: light. RMB/K: heavy. Q/Shift: block. Space: roll.
- E: special. 1–6 or T: transform. F: finisher. Tab: lock-on. L: quest log.

**Touch:**
- Left thumb: joystick. Drag the right side to look.
- Buttons: Light, Heavy, Block (hold), Roll, Special, Form.
- On iPhone, use Share → Add to Home Screen to get full screen.
