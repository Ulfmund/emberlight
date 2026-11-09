# Getting Emberlight running (no command line needed)

This takes about five minutes. You only need a web browser and a Windows PC.

## 1. Download the installer

No account is needed.

1. Open the [latest release](https://github.com/Ulfmund/emberlight/releases/latest) (or, on the project page, click **Releases** on the right-hand side and pick the one with the green **Latest** label).
2. Under **Assets**, click **Emberlight-Setup-…exe** to download it (about 120 MB).
3. If your browser warns that the file "isn't commonly downloaded", choose **Keep** (in Edge: click the **…** next to the download, then **Keep**).

## 2. Install it

1. Double-click the downloaded file.
2. Windows may show a blue box saying **"Windows protected your PC."** This appears for any new app that hasn't paid for a Microsoft certificate yet. Click **More info**, then **Run anyway**.
3. Click through the installer (**Next**, **Install**, **Finish**). It puts an **Emberlight** shortcut on your desktop and in the Start menu.

## 3. Connect a model

Open Emberlight and click **Connect a Model**, then pick where your model runs:

| You use… | What to do first |
|---|---|
| **LM Studio** | In LM Studio, load a model, then open the **Developer** tab (the `>_` icon on the left) and switch the server **on** so it says *Running*. |
| **Ollama** | Nothing. Ollama runs in the background once installed. |
| **Strata** | Start Strata. If Emberlight can't find it, copy the address Strata shows (it looks like `http://localhost:8080/v1`) into the **Address** box. |
| **KoboldCpp** | Start KoboldCpp with a model loaded. |
| **Claude** or **OpenRouter** | Paste your API key into the **API key** box. It's stored encrypted on your PC and never shared. |

Emberlight tests the connection by itself and fills in the model list. If it shows an **amber warning about context**, your model has been loaded with very little memory, so the story will forget things quickly. The warning says how to fix it (in LM Studio, raise **Context Length** in the model's load settings).

Click **Save connection**, then **Begin**.

## How to play

1. **New Adventure** opens the character creator. Pick a race, sex, age and calling, spread your attribute points and starting skill levels, and name your character. Or press **🎲 Roll a New Adventurer** to have it all chosen for you. The **ember line** on each bar is that attribute's lifetime limit for this character.
2. Choose how the Dungeon Master runs things (tone, how deadly, when you throw the dice), then **Begin the Adventure**.
3. Type what your character does. Put anything they **say** in "quotation marks"; you can do both in one turn: `"Stay back," I warn, drawing my sword.` To tell the DM something out of character, use double brackets: `((make it start raining))`.
4. When an action is risky, the game asks for a roll. For big moments the **dice tray** appears: click to throw. The result (from Critical failure to Critical success) decides what happens, and the DM writes it that way. Failures can hurt, and your character can die.
5. Your adventure saves itself after every turn. **Continue** on the title screen picks up where you left off; **Load Adventure** lists them all.

### Worlds and lorebooks

On the **Adventure** step of the character creator:
- **World**: pick **The Cinder Marches** to start in a ready-made region (a grey border country twenty years after a volcano buried its capital), or let the DM invent one.
- **Lorebooks**: add world knowledge of your own. Import SillyTavern lorebooks (World Info `.json` files), or write one: each entry has a few **keywords** and the text the DM is told when the story mentions them. The **Test** box shows which entries a sentence would wake up.

During an adventure, **Journal → Lore** adds or removes lorebooks; changes apply from the next turn.

### The DM's memory

The DM keeps a record of the people and places you meet (what they're like, what they owe you, how they feel about you) and, in long adventures, writes summaries of older events. So even on a small local model it remembers what happened long after those messages stop fitting.

To see exactly what the DM was given for its last reply, click **What the DM saw** under it.

To rename your character, click the pencil next to their name (in the Journal, **Edit**, then **Rename…** for anyone else). Choose whether they were *always* called that (the name is replaced everywhere, and you can check each change) or have *taken* a new name in the story.

Open the **Journal** (left panel) to see all of it: **People**, **Places** and the **Story** so far. If the DM got something wrong, click **Edit** on it and fix it; the DM goes by the Journal. Under **Pinned**, write anything the DM must never forget or contradict ("Mira is secretly the baron's daughter"). Pinned notes and corrections stay even if you rewind. On the **Connect** screen, under **Advanced**, you can set the model's context size; for Claude, a lower number costs less per turn.

### Character cards (from SillyTavern, Chub…)

In the character creator, click **Character Cards** (bottom left), then drop card files onto the box, or click it to pick them. PNG cards, `.json` and `.charx` all work, several at once. You can also drop cards anywhere on the creator. Your SillyTavern cards live in `SillyTavern\data\default-user\characters`.

Each card in the library has two buttons:
- **Play as**: you become that character. Their name, description and personality fill in, the app guesses their race and sex (check the Origin step), and the card's picture becomes your portrait. Stats are still yours to choose. If you rename them, their description follows the new name.
- **Bring along** (up to 3): they travel with you and the DM plays them. Their picture shows on their speech bubbles. On the **Adventure** step you can start with their greeting (extra greetings can be flipped through with **‹ ›**) or let the DM set the scene.

Lorebooks inside cards work too: an entry is given to the DM when its keyword comes up in the story. A card stays in the library for next time; removing it from the library doesn't affect adventures that already use it.

Handy buttons:
- **↻ on a roll card**: a free reroll (rewrites the DM's response to match).
- **Rewrite**: the DM writes its last response again; **‹ 1/2 ›** flips between versions.
- **Return here** (on older DM messages) or **undo** (on your own turns): go back in the story. The other branch is kept.
- **Sheet / Bag / Log / Saves** on the right: your skills and caps, your items, everything that's changed, and save slots plus campaign settings.

## Playing on your phone

Your phone can play the same adventures as this computer, as long as Emberlight is open here.

1. On the title screen, click **Play on Phone** and switch on **Allow phones on this Wi-Fi**.
2. If Windows asks whether Emberlight may use the network, choose **Allow**.
3. Point the phone's camera at the code and tap the link. Emberlight opens in the phone's browser. (Optional: **Add to Home Screen** for an app icon.)

The phone must be on the same Wi-Fi. API keys can only be entered on the computer. **Disconnect all phones** in the same window locks every phone out again (they can scan the new code).

## Updating

Emberlight checks for new versions by itself. When one is out, a glowing **Update** button appears in the top bar (and on the title screen):

1. Click **Update**. It downloads in the background while you keep playing.
2. When it says **Restart to update**, click it. Emberlight closes, updates itself, and opens again a few seconds later. Your settings and keys are kept.

(Versions older than 0.0.3 don't have the button. If you have one of those, install the newest version from **Releases** by hand once.)

## Something went wrong?

- **"Couldn't reach LM Studio / Ollama…"**: the model app isn't running, or its server is switched off (see step 3).
- **"…no models are available"**: the model app is running but no model is loaded or downloaded.
- **"rejected the API key"**: the key was mistyped or has expired. Paste it again.

Anything else: take a screenshot and send it over.
