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

**Age** (the stage of life picked at creation; characters grow older as the story goes on, and the stage they reach sets their caps from then on, see [Seasons and aging](#seasons-and-aging)):

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

**Each people has its own callings** (0.7.0, `RACE_BACKGROUNDS` in `src/shared/rules/tables.ts`), because their cultures differ:

| People | Callings |
|---|---|
| Human | Farmhand, Apprentice Smith, Temple Acolyte, Street Thief, Hunter, Hedge Witch, Sellsword, Fisher, Road Peddler |
| Dwarf | Tunnel Delver, Apprentice Smith, Rune-Carver's Apprentice, Clan Brewer, Hold Shieldbearer, Keeper of Names |
| Elf | Grove Warden, Loremaster's Ward, Moonsinger, Grove Healer, Bladedancer, Bowyer |
| Halfling | Farmhand, Hearth Cook, Road Peddler, Street Thief, Fisher, Lane Warden |
| Orc | Clan Raider, Beast-Tamer, Bone-Caller, Pit Fighter, Scrap-Smith, Hunter |

Changing race in the creator switches to the new people's first calling if the old one isn't theirs. Characters made before 0.7.0 keep the calling they have.

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

*Built (0.8.0)* (`src/shared/rules/gear.ts`): hunger and tiredness are counted in minutes from the in-game clock. Fed under 8 hours since a proper meal, peckish to 16, hungry to 30 (−1 physical checks), then starving (−2 all checks, and sleep heals nothing). Awake 18 hours: Exhausted 1, and one more level every 8 hours (−1 all checks each); a long sleep clears it. A full meal (12 hours of food or more) leaves you fed whatever came before; a snack takes a few hours off. The Scribe reports eating, and food or medicine used from the pack, and the engine applies the item's effect.

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

## Seasons and aging

*Built (0.24.0).* The story keeps a calendar: four seasons of 90 days and a year of 360, beginning on the first day of spring. The Sheet shows the date ("Day 300 · Winter, year 1"), and the DM is told the season and what it means.

**Growing older.** A character's age is counted in years. It starts at a typical age for the stage picked at creation (in human years: young 18, adult 27, middle-aged 44, elder 62) and goes up by one every 360 days. Some peoples age much slower than others:

| People | Ages | An adult starts at | Middle-aged from | Elder from |
|---|---|---|---|---|
| Human | with the calendar | 27 | 36 | 56 |
| Halfling | 1.25× slower | 34 | 45 | 70 |
| Orc | a little faster | 22 | 29 | 45 |
| Dwarf | 2.5× slower | 68 | 90 | 140 |
| Elf | 5× slower | 135 | 180 | 280 |

The stage of life follows the years, and **the stage reached sets the character's limits from then on**: the caps in the [age table](#attribute-caps) move with it. A hunter who turns middle-aged loses a point of Strength and Agility cap and gains a point of Intellect, Arcane and Wits cap; a young character who grows up loses the +10% skill XP. The attributes themselves don't fall, only how far they can grow. Nobody goes back a stage: a character picked as middle-aged stays middle-aged even if their years are few. Each new stage is marked on the timeline. An heir's years begin when they take up the tale.

**What the seasons do:**
- **Gathering:** herbs are scarce in winter (−4) and plentiful in autumn (+2) and spring (+1); fishing is harder in winter (−2) and easier in summer (+1); hunting is harder in winter (−1) and easier in autumn (+1). The bonus shows in the roll's breakdown, with why.
- **Weather:** snow falls in winter, in place of rain and storms; rain and storms come the rest of the year.
- **Sound:** no birdsong or crickets in winter, and more wind outside.
- **The DM** hears the season (thaw and mud in spring, dust on summer roads, harvest and cold mornings in autumn, short days and snow in winter) and plays to it: winter travel is slow, and a night in the open is dangerous.
- **The timeline** marks each new season, each new year, and the years that go by in a jump.

Code: `src/shared/rules/calendar.ts`.

### Time skips

*Built (0.27.0).* "Five years pass." The player can skip ahead from the Sheet (*Timeskip*, under the date), or ask out of character: `((five years pass))`, `((skip ahead a year while I train with Old Tam))`, `((let a season go by. I work the forge.))`.

- **How long:** a week, a month, a season, a year, five years or ten in the dialog. Out of character, any number of days, weeks, months, seasons, years or decades, up to twenty years at once.
- **What they do with it**, in the player's words (or left to the DM).
- **Practice:** up to two skills, sharing the time. A day of practice is worth 4.8 skill XP (with the character's XP bonuses), so a year spent on one skill takes a beginner to about 13. The XP curve makes later years count for less, and practice stops at the skill's cap. Practice counts a third as much towards the character's level as skill XP earned in the story: years of quiet work make someone skilled, not a hero (five years at two skills bring about three levels).
- **The engine** moves the calendar to the morning after the time has passed, so the character grows older (and may reach a new stage of life). A week or more mends everything: they come out of it rested, fed and healed, with every condition gone except being a prisoner (the DM tells whether they got free). A shorter stretch heals like a night's sleep each day. The weather is forgotten, and companions stay unless the story says otherwise. No Referee, no dice and no random events.
- **The DM** is told how long passed, between which dates, how old the character is now, what they did, what they practised and who was with them. It writes **a montage, not scenes**: a few paragraphs moving through the time (how they lived, what became of the people they know, how the places changed), keeping to what the story has set up. It ends back in the present, on a morning, with something new to act on. The Scribe records the people, places and deeds the montage tells of, but not its time, rest or meals (the engine has already moved those).
- **The timeline** marks it ("Five years went by: spring, year 6"), and a rewind takes it back like any other turn.
- Not during a fight, and not while downed or dead.

Code: `src/shared/rules/skips.ts`.

### Homes and work

*Built (0.28.0).* Somewhere to live, and a living, chosen on the Sheet (*Home and work*) so the story never misreads them. Both go in front of the DM ("HOME AND WORK"), and the timeline marks each change.

**Homes**, found in a town or a village, where the character is now:

| | Price | Living costs a day |
|---|---|---|
| A rented room | none (rent) | 6 copper (rent and food) |
| A cottage | 20 gold | 4 copper |
| A house | 60 gold | 6 copper |
| A hall | 300 gold | 15 copper (servants) |
| No home: inns and the road | | 12 copper |

- **A night's sleep at home mends fully** (instead of half), and no random event comes while resting there.
- One home at a time: buying another sells the old one for half its price. Selling or giving up a room is a button too.
- A child who takes up the tale keeps the family home; a stranger doesn't.

**Work:** what it is ("smith's hand", "caravan guard"), the skill it uses, and whether room and board come with it (half the pay, no living costs). It's taken up where the character is.

- **Pay:** 6 copper a day + the skill's level (a beginner 7, a skilled hand at 13 earns 19, a master over 50), six days a week, half with board. A beginner breaks even in a rented room; a skilled hand saves a cottage's price in under a year.
- **Working:** *A day*, *A week* or *A season* on the Sheet is a short time-skip at work: pay comes in, living costs go out, and the job's skill is practised. A day heals like a night's sleep; the DM tells a day or a week in a paragraph or two and a season as a montage. In a *Timeskip*, the time goes on the work by default.
- **Without work**, a time-skip neither earns nor costs: the character gets by on odd jobs.
- Savings never fall below an empty purse; the DM is told when the pay didn't cover living.
- Nobody keeps the dead's work: an heir starts without a job.

Code: `src/shared/rules/life.ts`.

### Family

*Built (0.29.0).* A family lives in the story's memory, so the Journal shows it and can correct it: a spouse is a person tied to the character as their spouse, and children are people tied to them as children, with the day they were born. The Sheet's *Family* section:

- **Marry** someone from the Journal who is alive, not already family, and doesn't think badly of the character (hostile or unfriendly won't do). The story should have brought them together; the game doesn't ask how. One living spouse at a time; a widow or widower can marry again.
- **Add child**: a name and daughter or son, with a spouse (or a lover) as the other parent. At most eight.
- **Raising a family** in a *Timeskip* (with a living spouse, for a year or more): each year has a 40% chance of a child, named from the character's people with the family name. A woman bears no children past forty-five (in her people's years). The DM is told who was born and weaves it into the montage.
- **Growing up:** children age with the calendar, at their people's pace (a baby, a small child, a child, a youth, grown at 16 human years; an elf at 80).
- **The DM** gets a FAMILY block: who the character married (and if they were widowed), and each child with their age.
- **The timeline** marks weddings and births (on the day they happened).
- **Heirs:** a child born in the story takes up the tale when they've come of age: if they're 5 when the character dies, the story moves 11 years on and they begin at 16 (at most 20 years on). A child the story only mentioned, with no birth day, comes ten years later, as before.

Code: `src/shared/family.ts`.

---

## Combat

### Modes (campaign setting)

| Mode | Behavior |
|---|---|
| **Story** (narrative) | No tracker. Each player action is one exchange, resolved by checks and woven into prose. |
| **Tracker** (turn-based) | Every fight goes on the tracker: initiative, rounds, enemy health, every blow rolled. |
| **Mixed** (default) | A quick scuffle with one ordinary foe is told in prose. A fight with two or more foes, or any elite or boss, goes on the tracker. |

*Built in 0.9.0.* The engine is `src/shared/rules/combat.ts`; enemy templates are in `enemies.ts`.

### Starting a fight

A fight starts three ways:

1. **The player attacks, or provokes an attack** that happens right away. The Referee says so (`fight.starts`) and lists who fights: what they are, how many, and how tough. If the player's own action is the attack, it's resolved as the first blow of round 1. If words might start it ("Nobody needs to bleed today"), the words are rolled first, without harm: success, and there's no fight; failure, and the foes attack.
2. **A random event** brings foes (see [06](06-ai-dm.md#5-random-events)). The fight is set up and the narrator brings the foes in; blows start next turn.
3. **The DM sets foes on the character** on its own, by ending its reply with `[[FIGHT: 2 bandit, 1 bandit captain (elite) | ambush]]`. The tag is removed from the text and the engine sets up the fight. Rewriting that reply takes the fight with it.

- **Ambush:** a player striking unseen rolls **Stealth vs. 10 + the foes' best Perception**; foes ambushing the player get a hidden **Perception vs. 10 + their best Stealth**. Whoever is caught off guard loses the first round (the player striking unseen also gets advantage on that first attack).
- **Initiative:** d20 + AGI mod + WIT mod for the player; d20 + the template's initiative for each foe. Foes faster than the player act before them each round, the rest after.

### Rounds

One player message is one round: the player's move and every foe's. On the tracker the player taps a move (Attack, Power, Spell, Defend, Heal, Flee, Yield, with a target picked from the foe list) or types anything; the combat Referee turns words into one move. The engine rolls everything and hands the narrator a blow-by-blow log, with the rule to narrate exactly that and add no wounds, deaths or enemies of its own.

- **Attack:** d20 + Melee/Ranged/Spellcasting bonus vs. the foe's **Defense**. Damage is the weapon's dice + STR mod (melee) or AGI mod (ranged); a critical doubles the dice, an overwhelming success adds 2. A bow or sling uses one arrow, bolt or stone a shot; with none left, it's a club.
- **Power attack:** one extra damage die, for 2 stamina.
- **Spell:** 2 mana for 1d8 + ARC mod (Spellcasting vs. Defense). Shown to characters with some training or a strong Arcane score.
- **Defend:** +2 Defense until the next move, for 1 stamina.
- **Heal:** a potion or bandage from the pack; the foes still get their turn.
- **Flee:** Athletics, moderate, or hard against beasts. Success ends the fight.
- **Talk:** intimidation, persuasion or deception, typed. If it works against people who are beaten or not fearless, they lay down their weapons.
- **Yield:** to people only. The character is taken prisoner.

The player's attack rolls show on the roll cards and in the dice tray (elite and boss foes count as big moments). A free reroll plays the same round again from the same decisions, without asking the AI twice; the round's plan is kept with the player's message.

### Enemies

The DM never invents enemy numbers. It names what attacks (in the Referee's answer or the FIGHT tag) and how tough, and the engine builds the stat block from one of 24 templates (wolves to wyrms), scaled to the player's level and the **tier**:

| Tier | Health | Attack | Defense | Damage | XP |
|---|---|---|---|---|---|
| Minion | ×0.5 | −1 | −1 | −1 | ×0.4 |
| Standard | ×1 | | | | ×1 |
| Elite | ×1.8 | +2 | +1 | +1 | ×2.5 |
| Boss | ×3.5 | +3 | +2 | +2 | ×6 |

That stops the AI from quietly going easy on the player. Each template has a behavior: **aggressive** foes fight on, **cautious** ones yield or flee when badly hurt, **cowardly** ones run when hurt, **fearless** ones never break, and a lone survivor of a group often gives up. Fallen foes drop loot from the template's table (rolled before narration, so the narrator says "12 copper and a dagger" rather than inventing a fortune), and each kill gives XP.

Once a fight ends (won, fled, yielded, or lost), the tracker closes and the story carries on. A character who goes down or is captured in a fight ends it as a defeat.

### Companions

*Built (0.17.0).* Up to four companions travel with the player: characters from cards brought along (from the first page), and people met in the story who agree to come (the Scribe hears it), or whom the player asks along from the Journal or the Sheet. The DM voices them and decides what they do in the story; in a fight the **engine plays them**, by their role, and rolls every blow like a foe's:

| Role | Health (level 1) | Attack | Defense | Damage | In a fight |
|---|---|---|---|---|---|
| Fighter | 16 | +4 | 14 | 1d8+1 | Goes for the player's target; draws the foes' blows |
| Archer | 12 | +4 | 13 | 1d8 | Shoots from range; seldom targeted |
| Healer | 12 | +2 | 12 | 1d6 | First heals whoever is worst hurt (below half) for 1d8+2 |
| Mage | 10 | +4 | 11 | 1d10+1 | Hits hard; seldom targeted, easily hurt |
| Scout | 12 | +4 | 14 | 1d6+2 | Quick and hard to pin down |

- A role is guessed from who they are ("a priestess of the dawn" is a healer) and can be changed on the Sheet. Their numbers grow with the player's level, as foes' do (health ×1.2 per level, attack +1 every two levels, defense and damage +1 every three).
- Companions act after the player each round. They hold back while the player talks or yields, and when the party is ambushed in the first round. Each foe goes for the player twice as often as for an average companion. A fighter draws 1.2 times an average share; archers and mages, half.
- A companion at 0 health is knocked out for the rest of the fight and gets up with 1 health when it's over. Only the story kills a companion (the Scribe hears it). A short rest mends a quarter of their health, a night's sleep all of it.
- Their kills give the player XP. When the player falls and a healer companion is on their feet, the healer brings them round (1 health, wounded) instead of a death roll.
- The DM sees each companion's card or Journal record, their role and how they're faring, and the fight log says what each did.

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

*Built (0.10.0)*: what happens after a death is in [03](03-characters-and-cards.md#when-a-character-dies).

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

*Built (0.8.0)* (`src/shared/rules/items.ts`, `gear.ts`): about a hundred item templates (weapons, armour, shields, clothing, tools, food, medicine, crafting materials). A name from the story is matched to the template whose name or alias it contains ("Rusty iron sword" → Sword), so the engine knows its weight, damage, armour and use. Starting kits are equipped automatically, and a weapon or armour found goes straight into an empty slot. Defense = 10 + Defense level / 5 + armour + AGI modifier (capped by the armour). Over STR × 5 kg: encumbered (disadvantage on AGI checks); over half again: overloaded (also STR and END checks). Heavy armour: disadvantage on Stealth. No tool for mining, woodcutting, fishing, hunting, smithing, alchemy or fletching: disadvantage. Coins weigh 1 kg per 100. The Bag tab equips, takes off, uses and drops things (events from the player). Not yet: per-item stat limits on DM-made items, and buying at listed prices.

- **Equipment slots:** head, body, hands, feet, main hand, off hand, neck, 2 rings, back.
- **Carrying capacity:** STR × 5 kg. Over the limit = Encumbered (disadvantage on AGI checks, slower travel).
- **Items:** name, icon, type, weight, value, slot, stats (damage die, armor, effects), and an optional image. Item templates live in `tables/items.ts`. The DM can create unique items through a request; the engine checks their stats against limits for the character's level.
- **Money:** stored as copper. Displayed as gold / silver / copper (10 copper = 1 silver, 10 silver = 1 gold).
- **Crafting recipes** (`tables/recipes.ts`): inputs, tool, skill + minimum level, DC, output, XP. **Gathering nodes** (`tables/nodes.ts`): skill, level, DC, yield.

*Built (0.10.0)* (`src/shared/rules/crafting.ts`): 16 **gathering spots** (ores, coal and gems; logs, oak and yew; fish and eels; game, fowl and hides; herbs, healing moss and nightshade), each with the kinds of place it's found in, a minimum skill level and a difficulty; and 28 **recipes** across Cooking, Alchemy, Fletching, Crafting (leather and cloth) and Smithing, each with inputs, a minimum level, a difficulty, and sometimes a station (a fire: anywhere in town, or with a tinderbox; a forge: in a town or village).

- **Gathering:** the Referee names the work ("firewood", "iron ore", "game"), and the engine finds the spot: what the words name, else the skill the words suggest, preferring spots that suit the place (the place is a hint, not a wall: the story may be on its way there). Then one roll: a narrow success brings the low end of the yield, a clean one the middle, an overwhelming one the top, a critical one a bit more. Mining, woodcutting and hunting can hurt a little on a failure. A plain gathering-skill check from the Referee counts as gathering too.
- **Crafting:** from the Referee ("I brew a healing draught", "I roast the meat": what it makes, or how and from what) or the Bag's **Make** list, which shows what the character can make now, has materials for or is trained in, with what's missing. Too little skill, missing materials or no station: nothing is rolled or used, and the narrator says why. Otherwise one roll: success uses the materials and makes the thing (a critical success makes extra of anything stackable); a narrow failure wastes only time; a worse one spoils half the materials, a critical one all of them. No proper tools: disadvantage, as for every tool skill.
- The engine moves the items and tells the narrator ("GATHERING: the character gets 2 × Logs"), and the Scribe is told not to record them again.

## Spells (v1, simple)

- Spells are learned from tomes, teachers or backgrounds.
- Each spell: mana cost, effect template (damage / heal / buff / debuff / utility), DC or attack, and a scaling rule.
- Casting = Spellcasting check. A critical failure is a **backfire** (rolled on a backfire table).

*Built (0.13.0)* (`src/shared/rules/spells.ts`): 17 spells in 11 schools, each with a mana cost, a minimum Spellcasting level (below it, the roll is at a disadvantage), and an effect:

| Kind | Spells |
|---|---|
| Harm | Spark (2 mana, 1d8), Thorn Lash (2, 1d6+1), Chill Touch (2, 1d6, heals half of it back), Frost Shard (3, 1d10), Firebolt (4, 2d6), Chain Lightning (6, 1d8 at every foe) |
| Healing | Mend (2, 1d8, stops bleeding), Rejuvenate (5, 3d8, also poison) |
| Protection | Stoneskin (3, +2 Defense for the fight), Moonveil (3: hidden, or +2 Defense in a fight), Courage (2: inspired, fear gone) |
| Curses | Hex (2: a foe at −2 for the fight), Sleep (4: a weak or ordinary foe drops asleep; not leaders, legends or the dead), Dread (3: a foe who knows fear runs) |
| Small magics | Light, Whisper (1), Ward Rune (3) |

Damage and healing add the Arcane modifier and +1 every four Spellcasting levels; a critical doubles the dice. Harmful spells roll against the foe's Defense; the rest against a difficulty. A natural 1 backfires (d4): 1d6 damage to the caster, more mana lost, frightened, or a loud fizzle.

- **Learning:** magical callings start with two (Hedge Witch: Mend, Hex; Loreward: Spark, Light; Moonsinger: Moonveil, Courage; Grove-Healer: Mend, Thorn Lash; Bone-Caller: Chill Touch, Dread; Runecarver: Light, Ward Rune; Temple Acolyte: Mend), and elves know Light. More come from the story: the narrator is told which spells exist and to name one plainly when a teacher or a tome passes it on, and the Scribe records it (`learn_spell`).
- **Casting:** in a fight, from the tracker (a spell list when more than one is known; harmful ones at the chosen foe). Outside one, from the **Spells** list on the Sheet (healing, protection and small magics), or in words: the Referee names the spell and the engine rolls it. Casting a harmful spell at someone starts a fight like any attack, opening with that spell. Characters with no spells but some training can still throw raw magic (2 mana, 1d8) as before.
- Sleep restores mana; casting spends it even when the spell fails.

## NPC relationships

- Each NPC has a **disposition toward the player from −100 to +100**: Hostile, Unfriendly, Neutral, Friendly, Trusted, Devoted.
- The Scribe proposes changes after each scene. The engine limits the size of each change.
- Mechanical effects: shop prices, Persuasion DC modifiers, whether they'll help, and whether they'll betray you.

### Factions

*Built (0.18.0).* Named groups (a guild, an order, a noble house, a gang, a temple, the town watch) are remembered like people and places, with a **standing** toward the character from −3 to +3: Hated, Hostile, Distrusted, Neutral, Liked, Trusted, Honoured.

- **What moves it:** the character's own deeds, as the Scribe reads them: +1 for a favour, +2 for a great service, −1 for a slight or an insult, −2 for violence against them or a betrayal. Each change is noted with its reason. The player can set it outright in the Journal.
- **Who belongs:** people are recorded with the group they belong to ("Sergeant Pell, of the Town Watch"), and the Journal can change it.
- **Social checks:** a Persuasion, Deception, Intimidation (or other social) check with a group's people gets its standing as a bonus or penalty, shown as "Standing with the Town Watch +2". The Referee names the group; failing that, the engine finds it from the person or group the check is about.
- **The DM** is told what the groups that think well or ill of the character think, and lets it show in how their people treat them: a welcome or a cold shoulder, help or hindrance, prices, trust.

---

## Player overrides

Story first, so the player can always overrule the dice, but openly:
- **Edit any number** on the sheet (pencil icon). This is logged as a "manual edit" event (visible, can be undone).
- **Free reroll** on any roll. It's logged but has no penalty.
- **Ironman mode** (optional campaign setting): turns off manual edits and rerolls for players who want real stakes.
