# RIFT RUMBLE

A Super Smash Bros.-style platform fighter built to the Game Design Document in this project.
Runs in the browser, no build step, no dependencies.

## Play

Open the live preview, or serve the folder:

```bash
cd game
python3 -m http.server 8080
# → http://localhost:8080
```

## Fighter presentation

The original five supplied fighter sheets are in `../assets-src/characters/`. Their 290
individually cut frames, including standalone effects, are packed into runtime atlases
in `assets/atlas/` and used for movement, attacks and specials. Fighter select also
shows portraits and appearance descriptions. Item artwork is unchanged.

The reviewed row and cell boundaries are maintained in `tools/build_character_sheets.py`.
Rebuild with Pillow and NumPy installed: `python tools/build_character_sheets.py`.
Effect-only cells keep the previous fighter pose underneath them. Some source art has
overlapping trails; these are separated as far as the supplied artwork permits.

Marrow's supplied sheets are in `../assets-src/characters/marrow-sheets/`.
`tools/build_marrow.py` keys and slices a curated set of 33 visually consistent
poses into a runtime atlas; run it from the project root with Pillow and NumPy
installed. His moves use fixed, hand-selected sequences and timed strike frames
rather than rotating between unrelated drawings. Some actions reuse poses where
the source sheets do not provide matching sequences. His separately generated
ledge pose sways around a hand fixed to the lip; rebuild it (and the other ledge
poses) with `python tools/build_ledge_sprites.py`.

## Controls

**Player 1** — `A`/`D` move · `W` aim up · `Space` jump · `S` crouch / fast-fall / drop through ·
`F` attack · `G` special · `C` shield (air dodge in the air) · `V` grab

**Player 2** — Arrows to move/aim · `Numpad 1` attack · `Numpad 2` special · `Numpad 3` jump ·
`Numpad 0` shield · `Numpad 4` grab

Gamepads are detected automatically for both players. `M` mutes audio, `Esc` pauses.

Each fighter has an **up special**: press up + special, or hold jump and press
special (P1 `W`+`G` or `Space`+`G`; P2 `↑`+`Numpad 2` or `Numpad 3`+
`Numpad 2`). The same inputs work on gamepad and touch. You can steer the rising
recovery left/right; it is usable once per airtime and resets on landing, ledge
grab, or respawn. Explicit down + special still selects the down special.


## Implemented systems

**Damage & knockback (§2)**
- Percentage damage 0–999% with no health bars
- `knockback = (base + scaling × damage%) × (100 / weight)`, per-attack angles
- Weight, gravity and fall-speed per fighter
- Blast zones on all four sides, stocks, respawn platform with invincibility

**Combat (§4)**
- Jab, three tilts, three smash attacks (chargeable), dash attack
- Five aerials per fighter including down-air spikes
- Four character-specific specials per fighter: neutral, side, recovery and down
- Grabs, pummelling and four directional throws — grabs beat shields; a hold that is never
  thrown releases on its own after `GRAB_HOLD_MAX` = 120 ticks, so nobody is pinned by a grab
- One move lands at most its authored hits (`1 + multi`) on the same target per action

**Defence (§5, §6)**
- Shrinking breakable shield with directional aiming and break stun
- Spot dodge, rolls, air dodge, tech and tech-roll
- Hitstun, directional influence, stale-move negation (last 10 moves decay to 62%)
- Ledge grabbing with climb / attack / roll / jump get-ups, edge-guarding, recovery moves

**Items (§8)** — 22 items: battering (beam sword, home-run bat, star rod), throwing (bob-omb,
shell, bumper), shooting (ray gun, fire flower), healing (heart, tomato, food), status
(star, mushrooms, metal box, bunny hood), containers (crate, capsule), summons, Smash Ball,
Hammer. Item frequency and individual toggles. Walk into items to pick them up; a floating item name and colored ring mark each pickup. Grab / Use Item (V for P1) fires ranged items, throws bombs, shells and bumpers, or drops melee weapons; without an item it grabs as usual. Attack (F) keeps the fighter's normal moves and adds a weapon perk: beam sword reach, bat launch power, star rod projectiles, or hammer power. Specials are unchanged. Healing, status items and summons activate on contact; containers break on contact. Ranged shots have a 24-tick cooldown and limited ammo.

Each one draws a generated sprite from `assets/items/` (built by `tools/slice_items.py` out of
`assets-src/items/*.png`), placed by what an item *is* rather than by its collision box: a
resting item sits on its bottom edge, so a crate stands on the deck instead of sinking through
it, and a held item hangs off the holder's own hurtbox at the knuckle line, mirrors with the
facing and swings through an attack. `items.json` carries the drawn size and the mirror flag;
if the art is missing the old vector icon still draws, so nothing can blank.

**Final Smash (§7)** — Smash Ball spawns and floats, breaks under damage, grants an
aura; press special for a screen-clearing super.

**Stages (§9)** — 19 selectable decks, including three extra-wide XL arenas. The roster includes
pass-through platforms, moving platforms (a fighter — and an item — standing on a mover rides
its `p.dx/p.dy` for the tick), and hazards (lava pools, timed
pillar) that re-arm on a 45-tick `HAZARD_REHIT` rather than billing you every frame of contact.
Side and upper blast zones give fighters more recovery room on every stage; XL decks retain additional space beyond their wider edges. The camera can zoom out to follow offstage fighters.
Ten of the standard decks are the Super Smash Bros. Ultimate *templates* copied as geometry: the Battlefield
form (flat deck, two soft platforms to the sides, one high in the middle, one low over the
centre), its Big and Small sizes, the Final Destination / Ω form (the same deck with the soft
platforms deleted), and the tournament layouts — Pokémon Stadium 2, Town & City, Smashville,
Yoshi's Story, Lylat Cruise, Kalos Pokémon League.  `tools/simtest.js`'s `decks:` test checks
each one against the form its `sub` claims, so a layout cannot drift away from the name it is
sold under.  What is deliberately *not* copied: damage hazards on the flat decks, Town & City's
rising road segments, Smashville's rotating deck, the League's platforms that fall away — the
platform model has no `oneWayDrop`, and inventing one under a "give me maps" request is how a
deck acquires a new way to fall out of the world.

**Modes (§11)** — VS (stock / time / stamina), team battles with friendly-fire toggle,
4-player free-for-all, Classic Mode (5-stage gauntlet with boss), Break the Targets,
Home-Run Contest, Multi-Man Brawl, Training-style records screen, hazard toggles,
damage ratio, CPU levels 1–9.

**Presentation (§13, §16)** — Dynamic zoom camera that frames all fighters and punches on
KOs, hit sparks, screen shake, hitlag, slow-motion on heavy hits, combo counter,
damage-colour scale on the HUD, revival platforms, star/stealth KO effects, procedural
chiptune and SFX via WebAudio.

## Roster

| Fighter | Archetype | Signature specials |
|---|---|---|
| **Valor** the Rift Blade | All-rounder | Crescent Combo · Skyslash Rush · Skyward Ascent · Guardian Stance |
| **Grim** the Colossus | Heavyweight | Faultline Smash · Boulder Crash · Titan Rise · Guardian Stance |
| **Astra** the Starweaver | Floaty zoner | Starfall Trio · Comet Rush · Star Blink · Gravity Orb |
| **Vesper** the Shade | Rushdown | Viper Flurry · Shadowstep Dash · Viper Ascendant · Smoke Counter |
| **Rook** the Rift Brawler | Combo brawler | Rift Fist Combo · Rift Rising · Drone Grapple · Rune Mine |
| **Marrow** the Hollow Knight | Heavy / sustain | Soul Reap · Wraith Charge · Grave Ascent · Hollow Guard |

Neutral special is G; hold left or right + G for a side special, up + G (or jump + G) for recovery, and down + G for the down special. Running + F uses the fighter's dash attack. Valor chains blade cuts and Skyward Ascent follows up on opponents hit during its opening rise; Grim's rune strike is a wide quake that reaches in front of and behind him; Astra calls falling stars and can leave a comet on her dash attack; Vesper's flurry finishes with a launcher; Rook chains punches and can rise into a launching side special. All fighters' F attacks have extended reach, including tilts, smash attacks, aerials and dash attacks. Marrow holds G to charge Soul Reap up to 2× damage after one second, and releases G to fire a spectral blast; a clean hit restores up to 2% damage. Up + G (or jump + G) performs Grave Ascent, a full-circle axe sweep that damages nearby foes once while launching him upward. Hollow Guard counters an incoming attack.

### Which build the browser is running

`js/core.js` defines `BUILD`, and `index.html` links every script and the stylesheet with a
`?v=` of that token; item artwork fetches in `js/render.js` carry it too.  This is not
decoration: the preview is a plain static server that sends no `Cache-Control`, so a browser
tab is free to keep executing a script it fetched an hour ago without asking again — which is
how a fixed move stays "still broken" while every test about it is green.  So bump `BUILD`
and the queries in the same commit as any change under `game/js` or `game/assets`, and when a
report says an old bug is still there, read the `[rift] build …` line the game prints on boot
(or `UI.diag().build`) before believing it.

## Tests

The engine runs headless in node — no browser, no canvas (also from the project root):

```bash
node tools/simtest.js       # physics, collision, state machine, 4-player
node tools/cloudtest.js     # cloud save sync: merge, conflicts, offline
node tools/character-art-test.js     # frame coverage, atlas rendering, item art
```

The legacy atlas and animation-art suites were written for the previous sheets and
geometry-derived strike frames; their assumptions do not all apply to these new sheets.

## Cloud saves (optional)

Progress lives in `localStorage` (`js/core.js` → `SAVE`). `js/cloud.js` can additionally mirror
it to one Supabase row per player so a second device picks up where the first left off —
unlocks, Rift Coins, stats, records, challenges. It is off until you paste a project URL and
publishable key in **RECORDS → CLOUD SAVES**, it never blocks play, and every failure path
(offline, wrong key, project paused, 500) degrades to the local save. See
[`../supabase/README.md`](../supabase/README.md) for the schema and the one dashboard toggle it
needs.

## Files

```
game/
  index.html        shell + all screens
  css/style.css     base UI styling
  css/ui-refresh.css graphic UI system and responsive overrides
  js/core.js        math, input, gamepad, procedural audio, save data
  js/data.js        fighters, movesets, stages, items, rules
  js/render.js      gameplay visuals, item artwork, stage backdrops
  js/fighter.js     physics, state machine, damage, ledge, final smash
  js/items.js       items, projectiles, mines, summons, FX
  js/ai.js          CPU opponents, levels 1–9
  js/match.js       match orchestration, camera, knockback resolution
  js/modes.js       Classic, Targets, Home-Run, Multi-Man
  js/ui.js          screens, HUD, main loop, debug hooks
  js/cloud.js       optional cross-device save sync (see above)
  assets/atlas/     {key}.png + {key}.json — packed animation atlases (generated)
  assets/items/     {key}.png + items.json — item sprites (generated, see tools/slice_items.py)

tools/
  build_character_sheets.py  supplied sheets → individual frames + runtime atlases
  build_ledge_sprites.py  approved ledge-pose concepts → keyed art + hand anchors
  slice_roster.py       legacy roster-sheet slicer
  slice_rows.py         generated pose sheets → extra rows injected into an atlas
  slice_items.py        generated item sheet → game/assets/items + items.json
  atlas_desmerge.py     re-cut the merged attack rows the slicer could not split
  harness.js            headless boot (stub DOM/canvas/audio) shared by the suites
  animtest.js           animation + hitbox tests  · node tools/animtest.js
  film.js               record what the renderer draws, tick by tick
  film_render.py        …and turn it into a contact sheet + GIF
  simtest.js            simulation tests        · node tools/simtest.js
  atlascheck.js         atlas + renderer tests  · node tools/atlascheck.js
  cloudtest.js          save-sync tests         · node tools/cloudtest.js

supabase/
  README.md         project setup, what is stored, the sync contract
  migrations/       player_saves + save_sync (applied, kept in step with this branch)
```

`window.RR.step(n)` and `window.RR.makeAllCPU()` exist for automated testing.

## Arena selection and HUD

In VS mode, open **Stage** from character select to pick an arena. The three XL
stages appear first; selecting a stage also turns off random selection. The HUD
uses player-colored badges and actual damage percentages and stocks. In 1v1,
the upper damage indicators and Smash Ball readiness also reflect match state;
they are not health or a fictional charge meter. Timed matches show minutes and
seconds; stock matches display their mode instead of a countdown.

## Interface and audio

The mode board, character and arena pickers, rules, records, pause, and results
use a shared high-contrast, player-colored visual system. Selected options are
marked explicitly, and interface motion respects reduced-motion preferences.
Settings is available from the title and pause screens. Music and sound-effect
preferences are saved separately; master mute (also toggled with M) applies to
both for the current session. Leaving settings during a match returns to pause.

The mode board previews each mode on hover or keyboard focus without starting
it. Character player badges can be selected directly, and selection and match
feedback is visual only—it does not alter gameplay. Reduced-motion preferences
also apply to the interface effects.

Entering menus zooms from the chosen control; returning reverses the transition
and restores keyboard focus where possible. Screen changes remain immediate and
zoom transitions are omitted when reduced motion is enabled.

## Ledge recovery

A free stage ledge can be grabbed from the outside while falling or during an
up-special recovery. Hold down to avoid a grab; a fighter in hitstun cannot
catch. Only one fighter may hang from each ledge. Press up or hold toward the
stage to climb, jump to leap without spending a double jump, attack for a get-up
attack, shield to roll, or down to drop. Dropping briefly prevents a regrab.
Landing, respawning, or catching a ledge restores the up-special recovery.
The hanging art uses the five approved AI-generated pose concepts in
`assets-src/ledge-proposals/`; keyed runtime sprites and hand anchors live in
`game/assets/ledge/`. The source concepts for Valor and Grim touch the image
edge, so those cut-off pixels cannot be reconstructed by the keying process.

### Tide

Tide, the Wave Warden, joins the roster with **Tidal Wave** (neutral special),
**Surge Step** (side special), **Geyser Leap** (up special), and **Ocean Guardian**
(down-special counter). Hold G and release to send a wave along the surface;
it lasts twice as long as the hold (minimum 18 ticks for a tap; a five-second
hold yields a ten-second wave). It can hit repeatedly, knocks opponents back,
and fades before expiring. Airborne waves fall onto surfaces;
waves also fall off platform edges. Geyser Leap sends water down from Tide’s back, curls it beneath her feet,
then launches her on a vertical geyser; her landings spray droplets. Her supplied sheet is in `../assets-src/characters/tide-sheets/`.
`tools/build_tide.py` (Pillow, NumPy, SciPy) keys hand-selected frames, adds the
knife to poses where it was missing, and builds her atlas and portrait. The idle
and ledge poses are generated adaptations; the action sheet does not contain a
complete set of normal attacks or a hanging pose, so some actions reuse related
poses and a single anchored ledge pose sways. Effects in the original sheet
sometimes overlap neighboring poses and have been cropped where necessary.

### Vector

Vector, the Hunter Protocol, is a mid-range cyborg with four specials:

- **G — Hunter Missiles:** launches two independently moving missiles toward
  opponents in front of him. They have a limited turn rate and expire, so they
  can be dodged. They respect teams, shields, counters and invulnerability.
- **Side + G — Overdrive Rush:** back-mounted rockets fire rearward to propel a fast, punishable shoulder charge. The rockets are visual thrust; the charge itself deals damage.
- **Up + G — Rocket Boost:** fires two shoulder rockets downward to propel Vector upward. Each rocket explodes on contact, damaging nearby opponents; rockets lost offstage expire harmlessly. A fresh jump pressed during the boost is queued until thrust ends, using an available jump.
- **Down + G — Target Lock:** scans the nearest opponent in front within range.
  The target is marked for up to four seconds; the next missile volley consumes
  the mark and tracks that target more sharply.
- **Final Smash — Redline Barrage:** launches repeated missile pairs in both
  directions during the Final Smash.

Vector's supplied sheet is in `../assets-src/characters/vector-sheets/`.
`tools/build_vector.py` (Pillow, NumPy, SciPy) keys and packs a curated set of
poses into an atlas and portrait. The source has no dedicated idle or ledge
pose: idle reuses an attack stance and the separately generated hanging pose
uses a fixed hand anchor. Directional normal attacks use separately authored strike poses, while the
missiles are independent simulated projectiles rather than baked sheet effects.

### Briar

Briar, the Wildwarden, is a nimble forest guardian who controls space with vines
and earth magic:

- **G — Vine Whip:** lashes a long way straight ahead, hitting once.
- **Side + G — Bramble Grapple:** dash with a reaching vine that grabs an
  opponent (including through shield), lifts them, then slams and launches them.
- **Up + G — Canopy Leap:** shoots vines upward and rises. Offstage near an
  unoccupied ledge, when no stage surface is below her (even above the island),
  a vine tethers Briar and pulls her into a ledge hang instead.
  A fresh jump pressed during ascent queues until the ascent ends if a jump remains.
- **Down + G — Earth Spike:** erupts spikes around Briar, covering both sides.
- **Final Smash — Wild Overgrowth:** four pulses of thorny earth across a broad
  area around her.

The supplied sheet is in `../assets-src/characters/briar-sheets/`.
`tools/build_briar.py` (Pillow, NumPy, SciPy) keys and packs its curated poses.
The sheet has no separate idle or ledge pose: the idle uses the first whip
stance, and the separately generated ledge sprite is anchored by its hand.
