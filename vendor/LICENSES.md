# Third-party libraries (vendored, unmodified)
- three.js r170 — MIT License — https://github.com/mrdoob/three.js
  - `vendor/three-addons.min.js` is an esbuild bundle of three.js r170 examples/jsm addons (GLTFLoader, meshopt decoder, SkeletonUtils, EffectComposer, UnrealBloomPass, GTAOPass, SMAAPass, OutputPass, ShaderPass, Sky) — MIT
- PeerJS — MIT License — https://github.com/peers/peerjs
- nostr-tools (bundle) — Unlicense — https://github.com/nbd-wtf/nostr-tools

# 3D models (`models/*.glb`)
Rigged, animated models by **Quaternius** (https://quaternius.com), downloaded from Poly Pizza.
They were re-encoded (meshopt-compressed, unused data removed); the geometry and animations are otherwise unchanged.

| File | Model | Used for | License | Source |
|---|---|---|---|---|
| vanguard.glb | Hooded Adventurer | Vanguard form | CC0 1.0 (public domain) | https://poly.pizza/m/y9KWOVG21R |
| trooper.glb | SWAT | Drop Trooper form | CC0 1.0 | https://poly.pizza/m/Btfn3G5Xv4 |
| blocky.glb | Giant (blocky) | Blockhead form | CC0 1.0 | https://poly.pizza/m/BldaiPtyJa |
| zombie.glb | Zombie | Shadow Mimic form, Gravecaller Ghoul elite | CC0 1.0 | https://poly.pizza/m/VlXjG0N8Eg |
| wizard.glb | Animated Wizard | Arcanist form | **CC-BY 3.0** — "Animated Wizard" by Quaternius (https://poly.pizza/m/kttbFvCl2C), https://creativecommons.org/licenses/by/3.0/ | https://poly.pizza/m/kttbFvCl2C |
| adventurer.glb | Adventurer | Ogre Brute form, Jorvald the Frost Colossus | CC0 1.0 | https://poly.pizza/m/5EGWBMpuXq |
| king.glb | King | Aurunax the Storm Titan | CC0 1.0 | https://poly.pizza/m/I1gTjmuK2m |
| dragon.glb | Dragon | Kharvoth the Cinder Wyrm | CC0 1.0 | https://poly.pizza/m/VBvzjFIYws |
| trex.glb | T-Rex | Zharkul the Dune Tyrant | CC0 1.0 | https://poly.pizza/m/UYtneO5FpF |
| spider.glb | Spider | Arachnyx the Web Matriarch | CC0 1.0 | https://poly.pizza/m/yRYJiAJyiM |
| wolf.glb | Wolf | Fenrask the Moon Devourer, Dire Stalker elite | CC0 1.0 | https://poly.pizza/m/P1gU3Qkr9r |
| skeleton.glb | Skeleton | Skarnek the Ossuary King, Bone Reaver elite | CC0 1.0 | https://poly.pizza/m/yq5ATpujSt |

Weapons, armor add-ons, arenas, skies, terrain, particles, quest objects and the Vessrath serpent are generated in code. All sound is synthesized with WebAudio.
