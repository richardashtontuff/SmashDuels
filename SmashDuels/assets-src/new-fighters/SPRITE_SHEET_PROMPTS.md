# Rift Rumble — new fighter reference art and sprite-sheet prompts

## Reference art

Use the corresponding original reference image as an image reference for **every** sheet of that fighter. Each image depicts one fighter, not an animation frame sequence.

- **Ember — the Cinder Dancer:** `ember.png` — red-haired fire fighter, brass armor, crimson sash and flame gauntlets.
- **Volt — the Livewire:** `volt.png` — white-haired electric courier, silver visor, black-and-yellow armor and shock batons.
- **Marrow — the Hollow Knight:** `marrow.png` — skull-helmed spectral knight with indigo armor, purple cape and violet crescent halberd.
- **Tide — the Wave Warden:** `tide.png` — ocean guardian with dark wavy hair, blue-and-coral shell armor and a wave blade.
- **Bramble — the Acorn Guardian:** `bramble.png` — stout woodland guardian with tan fur, copper armor, orange leaf mantle and an acorn shield.

Some references touch the edge of the image. For every animation cell, please **reconstruct any missing extremity** as needed and leave the entire character, feet, weapon and effects inside the cell. Preserve the character's identity rather than reproducing the crop.

## Recommended workflow

Generate one fighter at a time, using its reference image and the master prompt below. Generate **11 separate sheets for that fighter**, changing only the four rows named in the sheet list. Each sheet has four rows and six frames per row. This is more reliable than asking an image generator for an enormous single sheet, and lets me cut each frame accurately. If your generator struggles with a 4×6 sheet, generate each action as its own six-frame horizontal strip with the same layout instructions instead.

If producing all 11 sheets for every fighter is too much, send the sheets you have: I can integrate them incrementally and reuse poses for missing animations. Please don't add invented intermediary frames just to fill gaps; mark a sheet or row incomplete instead.

## Master prompt — paste once per sheet

> Using the attached reference image, create a **single animation sprite sheet of this exact original character** for a 2D side-view platform fighting game. Retain the character's face, body proportions, costume, colors, hairstyle, equipment and distinctive silhouette across every frame. Do not redesign the fighter or copy any existing game character. Match the reference's bold outlines, vivid colors and illustrated fighting-game style.
>
> The sheet is a precise **6-column by 4-row grid**: exactly 24 separate full-body drawings, one per cell. Each cell is 256 × 256 pixels, for a total sheet size of 1536 × 1024 pixels if supported. **Rows, from top to bottom:** [PASTE THE FOUR ROWS FOR THIS SHEET]. Within each row, frames progress left to right in time; each row shows six distinct stages of that action, including anticipation, motion and recovery where appropriate.
>
> Every frame depicts the same fighter **facing right** in the same side-view/three-quarter perspective. Keep a consistent camera, scale and body proportions across the entire sheet and across all sheets. Grounded poses share a consistent foot baseline; airborne poses show a believable body pose without changing the scale. Leave generous empty padding on every side inside each cell. Keep the complete head, limbs, feet, costume, weapons and any effects inside that same cell: no overlap into neighboring cells, cropping, extra limbs, duplicates, ghosts, motion trails crossing cells or effect-only frames. Use restrained, character-colored effects that do not cover the body or obscure the silhouette.
>
> Use a perfectly flat, uniform **bright chroma-green background (#00FF00)** in every cell, with no shadows or texture on the background. Avoid that exact green in the fighter or effects. No grid lines, dividers, captions, labels, numbering, text, logos, watermarks, scenery or other characters. Maintain exact cell boundaries and a consistent canvas size. Export the original-resolution PNG without compression artifacts.

**For individual strips:** change “6-column by 4-row grid” to “six equal 256 × 256 cells in one horizontal row, 1536 × 256 pixels,” and provide just one action. Don't resize a low-resolution image to these dimensions and call it higher resolution; send the best native export your generator provides.

## The 11 sheets — row instructions

Use the four lines for one sheet in the `[PASTE ...]` placeholder. In every row, frame 1 starts the action and frame 6 completes it. Grounded attack rows should remain on the floor unless the description explicitly says otherwise.

| Sheet | Row 1 | Row 2 | Row 3 | Row 4 |
|---|---|---|---|---|
| **01 — ground movement** | Idle: subtle breathing, weight shifts, return to ready stance | Walk: complete slow step cycle | Run: complete fast stride cycle | Dash: quick forward burst with low lean, then settle |
| **02 — air movement** | Jump: crouched takeoff into rising pose | Double jump: a second midair push and rise | Fall: transition into controlled falling pose | Fast fall: compact, steep downward dive |
| **03 — posture** | Landing: impact crouch into standing | Crouch: lower into held crouch | Turn: brace, pivot, return to ready stance while still depicted facing right | Taunt: expressive character-specific flourish, ending in ready stance |
| **04 — quick attacks** | Jab: fast forward strike | Forward tilt: medium forward strike | Up tilt: upward strike | Down tilt: low forward sweep |
| **05 — powerful attacks** | Dash attack: running forward strike | Forward smash: windup, powerful forward strike, recovery | Up smash: windup, powerful overhead strike, recovery | Down smash: low sweep covering both sides, recovery |
| **06 — aerial attacks I** | Neutral air: compact strike around body | Forward air: forward aerial strike | Back air: backward aerial strike while facing right | Up air: upward aerial strike |
| **07 — aerial / specials I** | Down air: downward aerial spike | Neutral special: use the fighter-specific move below | Side special: use the fighter-specific move below | Up special: use the fighter-specific recovery below |
| **08 — defense / special** | Down special: use the fighter-specific move below | Shield: protective brace, no full-screen shield effect | Forward roll: tucked forward tumble with clear full-body poses | Back roll: tucked backward tumble, character facing right in the source art |
| **09 — evasion / damage** | Spot dodge: briefly lean out of danger and return | Air dodge: midair evasive tuck and recovery | Hurt: stagger from a hit | Launch: recoil and tumble after a hard hit |
| **10 — grabs / knockdown** | Grab: reach forward and close hand | Grabbing: holding and pummeling an invisible opponent, no opponent drawn | Grabbed: struggle in place, no opponent drawn | Down: collapse into a prone knocked-down pose |
| **11 — recovery / defeat** | Get-up: rise from prone to ready stance | Respawn: materialize or descend into ready stance | KO: lose balance and fly out of view; keep all six poses fully within cells | Shield break: shield shatters, fighter staggers and becomes stunned |

Please keep each sheet in row order and name it `<fighter>-01.png`, `<fighter>-02.png`, … `<fighter>-11.png`. If you generate strips instead, name them `<fighter>-<action>.png`. Please also send the original files rather than screenshots or a video, and avoid rearranging or trimming cells afterward.

## Fighter-specific special animation direction

Use these concepts for sheet 07 rows 2–4 and sheet 08 row 1. The artwork shows the move; gameplay timing and damage will be implemented separately when the sheets arrive.

| Fighter | Neutral special | Side special | Up special / recovery | Down special |
|---|---|---|---|---|
| **Ember** | **Cinder Fan:** a gauntlet thrust releasing three small orange fireballs in a fan. | **Furnace Charge:** a low, flame-trailing forward gauntlet rush. | **Phoenix Rise:** a rising flame-powered uppercut. | **Heat Guard:** a guarded counter stance followed by a fiery riposte. |
| **Volt** | **Chain Spark:** strike forward with a baton and release branching yellow electricity. | **Flash Step:** a fast, low electric dash with one restrained spark accent. | **Volt Vault:** spring upward using charged batons. | **Static Mine:** crouch and plant a small yellow electric trap at the feet. |
| **Marrow** | **Soul Reap:** a deliberate, wide halberd sweep with a violet soul arc. | **Wraith Charge:** charge forward with the halberd and cape flowing behind. | **Grave Ascent:** lift the halberd overhead and rise in spectral energy. | **Hollow Guard:** defensive halberd guard followed by a counter strike. |
| **Tide** | **Undertow Blade:** cast a crescent water blade forward, then receive it returning. | **Surge Step:** ride a low, curling wave forward while striking. | **Geyser Leap:** launch upward on a compact jet of water. | **Tidal Pool:** sweep the blade low to form a small swirling water pool. |
| **Bramble** | **Thorn Seed:** plant a small thorn seed on the ground ahead. | **Acorn Bash:** charge forward shield-first. | **Canopy Hop:** spring upward with the shield raised. | **Oaken Guard:** brace behind the acorn shield, then counter-bash. |

Do not draw opponents in these cells. If a projectile or trap is difficult to contain, keep it small and near the fighter; the game can render the moving projectile or trap separately.

## Ledge-hang art

The existing fighters have separately approved, hand-anchored hanging poses. Do **not** add new hanging art to the gameplay sheets. If desired, provide one separate full-body ledge-hang reference per new fighter with a clearly visible gripping hand; I will ask for your approval before integrating any new ledge-hang art.
