# 04 — Rules System (built-in fantasy ruleset)

One hardcoded ruleset: a classless fantasy RPG with d20 checks and a wide set of combat, adventuring and trade skills that level up as you use them.

**All numbers below are starting values for playtesting.** They live in data tables under `core/rules/tables/` so they can be tuned without touching the logic. Every rule is a pure function in `core/rules/`.

Design goals:
- **Every creation choice changes many numbers**, not just one racial perk. Race, sex, age and background each adjust caps across the whole sheet.
- **High attrition.** Low HP, real damage, real death.
- **Readable math.** Every roll can show its full breakdown on hover.

---

## Attributes

Seven attributes, scored 1–20 (an average human is 10). **Modifier = floor((score − 10) / 2).**

| Attribute | Short | Governs |
|---|---|---|
| Strength | STR | Melee damage, carrying, heavy labor (mining, smithing) |
| Agility | AGI | Ranged attacks, dodging, stealth, fine handwork |
| Endurance | END | HP, stamina, resisting poison, disease, exhaustion |
| Intellect | INT | Lore, medicine, alchemy, learning |
| Arcane | ARC | Spellcasting, mana, enchanting |
| Wits | WIT | Perception, survival, initiative |
| Presence | PRE | Persuasion, deception, bartering, leadership |

### Attribute caps

Each character has a personal maximum for every attribute:

**Cap = 16 (base) + race + sex + age**, limited to the range 8–20.

**Race** (each row adds up to about zero, so every race trades strengths for weaknesses):

| Race | STR | AGI | END | INT | ARC | WIT | PRE | Trait |
|---|---|---|---|---|---|---|---|---|
| Human | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **Adaptable:** +1 cap to any two attributes, +10% skill XP |
| Dwarf | +2 | −2 | +3 | 0 | −3 | +1 | −1 | **Stoneborn:** sees in dim light, +5 Mining/Smithing skill caps |
| Elf | −2 | +2 | −2 | +1 | +2 | +1 | −2 | **Old Blood:** +5 Spellcasting/Enchanting skill caps, slow to tire from magic |
| Halfling | −3 | +3 | 0 | 0 | −1 | 0 | +1 | **Small & Lucky:** once per day reroll a natural 1 |
| Orc | +3 | 0 | +2 | −2 | −1 | 0 | −2 | **Relentless:** once per day stay at 1 HP instead of going down |

**Sex** (campaign setting **Sex modifiers: Realistic** (default) **/ Off**):

The design goal is two very different playthroughs. Men hold the physical power but must prove themselves socially; women gain access easily but are fragile in a fight, and mostly fight with magic.

| | STR | AGI | END | INT | ARC | WIT | PRE | Other |
|---|---|---|---|---|---|---|---|---|
| Male | +2 | 0 | +1 | 0 | 0 | 0 | −1 | Base HP 10. **Must prove himself:** −2 on social checks with strangers and authority, offset by Renown (+1 per 12 Renown, up to +6). |
| Female | −3 | +1 | −2 | 0 | +2 | +1 | +2 | Base HP 6. +5 affinity to Spellcasting, Enchanting, Alchemy and Medicine caps. **Easy access:** +2 on social checks; Renown counts for less (+1 per 25, up to +3). |

**Defeat by human (or other sentient) enemies** can mean capture instead of death: when a character is downed by sentient foes, the engine first rolls for capture (**female 65%**, **male 20%**). A captured character wakes at 1 HP, stripped of weapons, as a prisoner; the DM then runs the captivity and any escape. Beasts, monsters and the environment never capture.

With the setting **Off**, both sexes use the male physical row with no social modifiers, base HP 8, and a 35% capture chance.

**Age** (aging over time is a v2 feature; at character creation it's a one-time choice):

| Age | STR | AGI | END | INT | ARC | WIT | PRE | Other |
|---|---|---|---|---|---|---|---|---|
| Young | 0 | +1 | +1 | −1 | −1 | 0 | 0 | +10% skill XP |
| Adult | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Middle-aged | −1 | −1 | 0 | +1 | +1 | +1 | 0 | +2 starting skill levels, +3 Renown |
| Elder | −2 | −2 | −2 | +2 | +2 | +1 | +1 | +5 starting skill levels, +8 Renown |

### Starting attributes

All attributes start at 8. Spend **24 points**: 1 point per level up to 14, 2 points per level above 14. Nothing can go above its cap.

---

## Skills

Skills level from **1 to 50** **only by doing** (OSRS-style XP): every check with a skill trains it. The only exception is character creation, where the background's starting levels plus **6 starting skill levels** (more for older characters) are spread by the player, up to level 10 in any one skill.

**Skill check bonus = governing attribute modifier + floor(skill level / 5)** (so +0 to +10 from the skill).

### Skill caps

**Skill cap = 2 × governing attribute's cap + affinity**, maximum 50.

Affinity comes from race traits (above) and background (below). Example: a dwarf (STR cap 19) with the Apprentice Smith background (+5 Smithing): Smithing cap = 2 × 19 + 5 + 5 (Stoneborn) = 48. An elf with STR cap 13 has a Smithing cap of 26. Same skill, very different ceilings.

### Skill list

| Group | Skill | Attr | Notes |
|---|---|---|---|
| **Combat** | Melee | STR | Swords, axes, maces, spears |
| | Ranged | AGI | Bows, crossbows, thrown |
| | Defense | END | Armor use, blocking, parrying |
| | Spellcasting | ARC | Casting known spells |
| **Adventuring** | Athletics | STR | Climbing, swimming, forcing doors |
| | Stealth | AGI | Sneaking, hiding, pickpocketing |
| | Perception | WIT | Noticing things (the classic "roll a perception check") |
| | Survival | WIT | Tracking, foraging, navigation, camping |
| | Lore | INT | History, monsters, religion, magic theory |
| | Medicine | INT | First aid, stabilizing the dying, curing disease |
| **Social** | Persuasion | PRE | |
| | Deception | PRE | |
| | Intimidation | PRE | Uses STR instead when it's physical intimidation |
| | Bartering | PRE | Buy and sell prices |
| **Gathering** | Mining | STR | Ore, gems, stone |
| | Woodcutting | STR | Logs |
| | Fishing | WIT | |
| | Hunting | AGI | Trapping, skinning, hides and meat |
| | Herbalism | WIT | Finding and harvesting herbs |
| **Crafting** | Smithing | STR | Smelting, weapons, armor, tools |
| | Cooking | WIT | Meals that heal and give buffs |
| | Crafting | AGI | Leather, cloth, jewelry, general goods |
| | Fletching | AGI | Bows, arrows, bolts |
| | Alchemy | INT | Potions, poisons |
| | Enchanting | ARC | Magic properties on items |

Gathering feeds crafting, and crafting feeds adventuring (food heals, potions save lives, better gear raises Defense). That loop is what makes trade skills matter in a story game.

### Skill XP

- Each check grants skill XP: **success = full XP, failure = half** (you learn from mistakes). XP scales with difficulty: harder checks give more.
- Trivial actions (DC below what the skill makes automatic) give no XP. You can't level by chopping twigs forever.
- XP needed per level follows a curve in `tables/xp.ts` (early levels fast, later levels slow).
- When a skill levels up: a small toast with the skill icon and a sound.

### Backgrounds

Each sets starting skill levels, gear, coin and **+5 affinity** to 2–3 skills.

| Background | Skill affinities | Starting kit |
|---|---|---|
| Farmhand | Athletics, Survival, Cooking | Pitchfork, rations, 5 silver |
| Apprentice Smith | Smithing, Mining, Melee | Hammer, leather apron, 8 silver |
| Temple Acolyte | Medicine, Lore, Persuasion | Holy symbol, bandages, 6 silver |
| Street Thief | Stealth, Deception, Crafting | Dagger, lockpicks, 3 silver |
| Hunter | Ranged, Hunting, Survival | Shortbow, 20 arrows, skinning knife, 5 silver |
| Hedge Witch | Herbalism, Alchemy, Spellcasting | Herb pouch, mortar, 1 minor spell, 4 silver |
| Sellsword | Melee, Defense, Intimidation | Sword, leather armor, 10 silver |
| Fisher | Fishing, Cooking, Athletics | Rod, net, 5 silver |

More backgrounds are just more table rows.

---

## Checks

**Roll: d20 + skill check bonus + situation modifier (−4 to +4) vs. DC.**

- The **Referee** job decides whether a check is needed, which skill, the DC (from the ladder below), and any situation modifier (good tools, darkness, being rushed). The engine limits all of these to legal values.
- **Advantage / disadvantage:** roll 2d20 and keep the higher / lower. Used when the situation is strongly for or against the character.

**DC ladder:**

| Difficulty | DC |
|---|---|
| Trivial | No roll |
| Easy | 8 |
| Moderate | 12 |
| Hard | 16 |
| Very hard | 20 |
| Heroic | 25 |
| Legendary | 30 |

### Degrees of success

The engine turns every roll into a **result tier** and gives the narrator both the tier and the raw die. That way a natural 20, a 15 and a 10 all read differently.

| Tier | Condition | Narration guidance |
|---|---|---|
| **Critical success** | Natural 20 | Something extra and memorable happens: a bonus effect, an unexpected advantage |
| **Overwhelming** | Beat DC by 10+ | Effortless, stylish, possibly a small bonus |
| **Clean success** | Beat DC by 5–9 | Done well |
| **Narrow success** | Beat DC by 0–4 | Done, barely; visible strain, close call |
| **Narrow failure** | Missed by 1–4 | Fails, with a near-miss detail |
| **Failure** | Missed by 5–9 | Fails, with a consequence |
| **Severe failure** | Missed by 10+ | Fails badly, with a serious consequence |
| **Critical failure** | Natural 1 | Always fails, plus a complication (broken tool, alerted guard, injury) |

**No "fail forward" by default.** A failure is a failure. *DM settings → Mercy* can turn on "success at a cost" for narrow failures, but it's off by default.

### Opposed checks

Both sides roll (e.g. Stealth vs. Perception); the higher total wins, and the attacker wins ties. Used for sneaking, lying, grappling and ambushes.

---

## Resources

| Resource | Formula | Recovers by |
|---|---|---|
| **HP** | Base HP (by sex: 10 / 6, or 8) + END + level × max(1, 3 + END mod) | Long rest (half max), food, potions, Medicine, healing magic |
| **Stamina** | 10 + END + AGI mod | Short rest (full); spent on sprinting, power attacks, dodging, heavy labor |
| **Mana** | ARC × 2 + level × max(0, ARC mod) | Long rest (full); spent on spells |

A level-1 character with average END has about 21 HP. Most weapons deal 1d6–1d10 + STR modifier, so **three or four solid hits can kill.**

**Survival needs** (campaign toggle, on by default, light-touch):
- **Hunger:** Fed → Peckish → Hungry → Starving. Each step gives growing penalties. Eating resets it; cooked meals can also give *Well-Fed* buffs.
- **Fatigue:** going without sleep adds levels of *Exhausted* (−1 to all checks per level).

### Rest

| | Time | Effect |
|---|---|---|
| **Short rest** | ~1 hour | Full stamina, spend a ration for +END mod HP |
| **Long rest** | ~8 hours of sleep | Half max HP, full stamina and mana, −1 Exhausted |

Resting in the wild rolls on the random encounter table (see [06](06-ai-dm.md#5-random-events)). The Scribe detects rests from the story ("you sleep until dawn") and the engine applies them automatically, with a small "Rested" toast.

---

## Combat

### Modes (campaign setting)

| Mode | Behavior |
|---|---|
| **Narrative** | No turn tracker. Each player action is one exchange, resolved by checks and woven into prose. |
| **Turn-based** | Initiative order, one action per turn, a visible tracker. |
| **Mixed** (default) | Starts narrative. Switches to turn-based when a fight has several enemies or lasts more than one exchange, or when the player taps ⚔️ **Tactical**. |

### Starting a fight

- **Ambush:** whoever starts the fight rolls **Stealth vs. the other side's Perception**. The side that loses is *surprised* and loses the first round.
- **Initiative** (turn-based): d20 + AGI mod + WIT mod.

### Attacks

- **Attack roll:** d20 + Melee/Ranged/Spellcasting bonus vs. target's **Defense = 10 + Defense skill bonus + armor + AGI mod** (armor may cap AGI mod).
- **Damage:** weapon die + STR mod (melee) or AGI mod (ranged). A natural 20 doubles the dice.
- **Stamina actions:** power attack (+damage), dodge (+Defense until next turn), sprint, and so on, each with a stamina cost.
- The player still writes actions freely ("I kick the table into him and run for the door"). The Referee maps that to mechanics.

### Enemies

The DM never invents enemy numbers. It **requests** an enemy by type, tier (minion / standard / elite / boss) and level, and the engine builds the stat block from templates. That stops the AI from quietly going easy on the player.

Enemies choose actions from their stat block's action list. The engine picks (weighted by simple behavior: aggressive / cautious / cowardly, fleeing at low HP), and the narrator describes it.

---

## Conditions

Defined in `tables/conditions.ts`, each with mechanical effects, a duration, an icon and a tooltip:

Bleeding, Poisoned, Diseased, Burning, Stunned, Prone, Frightened, Exhausted (stacks), Hungry/Starving, Downed, Well-Fed, Inspired, Hidden, Blessed, Cursed.

---

## Death

- **Downed by sentient enemies:** roll for capture first (see the sex table). Captured characters survive as prisoners.
- **0 HP → Downed.** Unconscious, and each turn you make a **death roll** (d20 + END mod vs. 10). Three failures: death. Three successes: stable at 0 HP. A natural 1 counts as two failures.
- **Instant death:** if damage would take you to −(half max HP) or lower.
- Allies or NPCs can stabilize a downed character with Medicine (DC 12) or healing.

**Mercy setting** (DM settings):
- **Brutal:** 0 HP = dead.
- **Harsh** (default): the rules above.
- **Forgiving:** at 0 HP you're knocked out and captured or left for dead, but not killed.

---

## Character level

- **Character XP** comes from: skill XP (a fraction of all of it), defeating enemies, quests and story milestones (granted by the DM through a `grant_xp` request, limited by the engine).
- **Level-up** (levels 1–30): +1 attribute point (up to the cap), an HP increase, and **+2 Renown**. A big level-up moment with animation and a sound. The attribute point can be spent now or later. (Skills never get points; they only grow by use.)

## Renown

Renown is how widely and how well the character is known. It changes how people treat them, and it grows **slowly** and **from the story**.

- **Score 0–100**, shown as a tier: Nobody (0–4) · Local name (5–14) · Known (15–29) · Respected (30–49) · Renowned (50–74) · Famous (75–89) · Legendary (90+).
- **Gained from:** each level-up (+2), and notable deeds the Scribe picks out of the story (+1 to +3, at most one deed per scene, each deed recorded with a short line such as "slew the river-thing at Millbrook"). Infamy counts too: a notorious deed raises Renown but sours first impressions.
- **Effects:** a bonus on social checks (scaled by sex; see the sex table), better first impressions from strangers, and the narrator is told the tier and the character's best-known deeds so NPCs can recognise them ("You're the one who…").
- Renown points are never spent; they accumulate.

---

## Items, equipment, money

- **Equipment slots:** head, body, hands, feet, main hand, off hand, neck, 2 rings, back.
- **Carrying capacity:** STR × 5 kg. Over the limit = Encumbered (disadvantage on AGI checks, slower travel).
- **Items:** name, icon, type, weight, value, slot, stats (damage die, armor, effects), and an optional image. Item templates live in `tables/items.ts`. The DM can create unique items through a request; the engine checks their stats against limits for the character's level.
- **Money:** stored as copper. Displayed as gold / silver / copper (10 copper = 1 silver, 10 silver = 1 gold).
- **Crafting recipes** (`tables/recipes.ts`): inputs, tool, skill + minimum level, DC, output, XP. **Gathering nodes** (`tables/nodes.ts`): skill, level, DC, yield.

## Spells (v1, simple)

- Spells are learned from tomes, teachers or backgrounds.
- Each spell: mana cost, effect template (damage / heal / buff / debuff / utility), DC or attack, and a scaling rule.
- Casting = Spellcasting check. A critical failure is a **backfire** (rolled on a backfire table).

## NPC relationships

- Each NPC has a **disposition toward the player from −100 to +100**: Hostile, Unfriendly, Neutral, Friendly, Trusted, Devoted.
- The Scribe proposes changes after each scene. The engine limits the size of each change.
- Mechanical effects: shop prices, Persuasion DC modifiers, whether they'll help, and whether they'll betray you.

---

## Player overrides

Story first, so the player can always overrule the dice, but openly:
- **Edit any number** on the sheet (pencil icon). This is logged as a "manual edit" event (visible, can be undone).
- **Free reroll** on any roll. It's logged but has no penalty.
- **Ironman mode** (optional campaign setting): turns off manual edits and rerolls for players who want real stakes.
