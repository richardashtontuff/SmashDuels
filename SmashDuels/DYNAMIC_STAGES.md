# Stage work and known limitations

These stages are independently drawn and implemented interpretations of Smash stages, scaled to Rift Rumble's physics. They are **not exact recreations**. Original generated scenery was guided by screenshots and descriptions; the source screenshots are not shipped as game assets. Most stages use a rectangular main deck plus one-way platforms; selected stages use separated solid deck segments with real gaps. Arbitrary slopes are not supported.

## Stage selection and older maps

The original 19 Rift arenas are hidden from the versus and online selectors and random pool, replaced by the newer stage roster. Their stage IDs and refreshed artwork remain available internally for old clients, existing references and bonus modes. Classic mode now uses the new stages. Battlefield, Small Battlefield, Big Battlefield and Final Destination have 3, 2, 6 and 0 soft platforms. With hazards on they have original, non-Smash gameplay variations: rising tiers, blinking platforms, shifting tiers and a warned energy strike, respectively. Hazards off restores their static competitive layouts.

## Moving and environmental stages

- **Smashville:** one horizontal platform; freezes in the center with hazards off.
- **Town and City:** cycles between three- and two-platform formations, including with hazards off. Riders inherit motion. The backdrop does not currently transition between town and city.
- **Fountain of Dreams:** independently rising and sinking side platforms and a fixed center; side platforms freeze with hazards off.
- **Hollow Bastion:** a drifting and separating platform, per the earlier requested variation. This is not the original's stationary platform; no tilt or final-stock backdrop transition is implemented.
- **Northern Cave:** two diagonally moving platforms, per the earlier requested variation. The original's platforms are stationary.
- **Dream Land:** alternating wind gusts with hazards on.
- **Brinstar:** rising acid, a telegraphed damaging meteor strike, and small edge spike clusters with hazards on. The spikes damage fighters on contact and use the shared hazard cooldown. The meteor is an original addition, not a Smash stage feature; the hidden legacy Ember Foundry lava stage also has it. The original stage's destructible parts are not implemented.
- **Yoshi's Story:** a compact three-platform layout and a moving cloud when hazards are on. The cloud's route is simplified; edge slopes, walls extending to the blast zone, and Shy Guys are absent.

## Transformations and interactive stages

- **Pokémon Stadium:** alternates the standard layout with approximated grass, water, fire and rock soft-platform formations. Transformations have related backdrop art but not the original solid hills, houses or exact geometry.
- **Pokémon Stadium 2:** alternates standard, electric, flying, ground and ice approximations. Electric belts push grounded fighters outward, flying adds an updraft, and ice lowers normal ground movement traction. Effects do not currently act on items; ground mounds and sloped surfaces are not solid. Both Stadiums freeze in the standard form with hazards off.
- **Castle Siege:** cycles between simplified roof, interior and cavern platform formations with related backdrops. There are no destructible statues, walk-off zones or moving camera transitions.
- **Arena Ferox:** cycles through simplified one-way platform formations. Gears, solid structures and destructible statues are not simulated. Both Castle Siege and Arena Ferox freeze in their starting formation with hazards off.
- **Spring Stadium:** timed edge and center-platform pads boost a held jump, but not a short tap. Hazards off disables them. The offstage trampolines, launch hitboxes, ceiling arches and item bouncing are not implemented.
- **King of Fighters Stadium:** invisible side boundaries stop movement and rebound weak outward launches; sufficiently fast outward hitstun launches break through and cause an immediate KO. The barriers are always active, including with hazards off. The threshold and KO behavior are an approximation, not the original's exact knockback rules.
- **Minecraft World:** an XL deck with a permanent central opening, extra outer platforms, blocky surfaces and two melee-breakable, one-way block platforms; each attack can damage a block once and destroyed blocks stay gone. Hazards off removes the breakable platforms. Blocks are not solid on their sides, projectiles do not break them, and the six biomes, mining and building are not implemented.

## Other reference-inspired additions

- **Tortimer Island:** XL sandy deck and additional palm-height platforms, plus periodically dropped healing fruit even with ordinary items disabled (hazards must be on); no randomized island or swimming.
- **PictoChat 2:** two alternating sets of sketch platforms; no complete drawings or seesaw physics. Hazards off freezes the first set.
- **New Donk City Hall:** XL facade with two vertical lifts and extra scaffolds; the main deck and camera do not travel up the building.
- **Mishima Dojo:** flat floor with walls and a ceiling that break after attacks or strong launches and repair after a delay once fighters are clear. Hazards off removes these barriers; break thresholds and repair timing are approximations.
- **Wrecking Crew:** XL construction deck with additional outer scaffolds and small contact-damage spike clusters when hazards are on; an attack-triggered demolition charge damages nearby fighters and collapses one scaffold. The full original wall chains, ladders and barrels are not implemented.
- **Flat Zone X:** LCD-inspired art, alternating platforms, and a periodically appearing localized slippery oil spill; no full Game & Watch events. Hazards off freezes the first set and removes the oil.
- **The Great Cave Offensive:** XL cavern approximation with a permanent central floor opening and two marked danger zones: touching one damages a fighter below 100% or KOs them at 100% or higher. The giant interconnected cave and minecarts are not implemented.
- **Midgar:** touch periodically appearing materia to summon a warned fire blast, platform lightning or energy beam that targets opponents and spares the collector. This is a simplified three-effect system, not the five original cinematic summons or stage-splitting effects.

Private online room hosts can toggle hazards on or off; everyone sees the selected setting. Queue matches keep hazards off. Platform positions and visibility, stage form, special state, hazard levels, dropped stage fruit and fighter motion are sent from the authoritative server; ring walls remain active with hazards off. Scrolling and vehicle stages, other requested transformations, destructible structures and accurate slopes remain unimplemented.

The four expanded XL arenas use wider decks and added soft-platform routes; their existing mechanics and hazards remain active under the same rules. Great Cave Offensive and Big Battlefield were already XL. Both selectors provide an info button for every stage, including its hazard-off behavior.

Minecraft World and Great Cave Offensive have visible, permanent center gaps even with hazards off; elevated platforms offer routes across. Fighters, items and relevant projectiles can fall through them, and CPU opponents try to jump across or recover through the opening. Only the two outer stage edges have grabbable ledges; the inner gap edges are not ledges. Brinstar and Wrecking Crew spikes are original additions, visible and damaging only with hazards on.

## References

[Pokémon Stadium](https://www.ssbwiki.com/Pok%C3%A9mon_Stadium), [Pokémon Stadium 2](https://www.ssbwiki.com/Pok%C3%A9mon_Stadium_2), [Castle Siege](https://www.ssbwiki.com/Castle_Siege), [Arena Ferox](https://www.ssbwiki.com/Arena_Ferox), [Spring Stadium](https://www.ssbwiki.com/Spring_Stadium), [King of Fighters Stadium](https://www.ssbwiki.com/King_of_Fighters_Stadium), [Minecraft World](https://www.ssbwiki.com/Minecraft_World), [Yoshi's Story](https://www.ssbwiki.com/Yoshi%27s_Story), [stage hazard switch](https://www.ssbwiki.com/Stage_hazard), [Smashville](https://www.ssbwiki.com/Smashville), [Town and City](https://www.ssbwiki.com/Town_and_City), [Fountain of Dreams](https://www.ssbwiki.com/Fountain_of_Dreams), [Tortimer Island](https://www.ssbwiki.com/Tortimer_Island), [PictoChat 2](https://www.ssbwiki.com/PictoChat_2), [New Donk City Hall](https://www.ssbwiki.com/New_Donk_City_Hall), [Mishima Dojo](https://www.ssbwiki.com/Mishima_Dojo), [Wrecking Crew](https://www.ssbwiki.com/Wrecking_Crew), [Flat Zone X](https://www.ssbwiki.com/Flat_Zone_X), [The Great Cave Offensive](https://www.ssbwiki.com/The_Great_Cave_Offensive), [Midgar](https://www.ssbwiki.com/Midgar).

Run `node SmashDuels/tools/stage-test.js` from the repository root for platform motion and collision, form changes, hazard toggles, ring and dojo boundaries, summoning, strikes, danger zones, fruit and destructible-block checks.
