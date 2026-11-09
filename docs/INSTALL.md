# Getting Emberlight running (no command line needed)

This takes about five minutes. You only need a web browser and a Windows PC.

## 1. Accept the GitHub invite

Emberlight lives in a private GitHub project, so you need a (free) GitHub account to download it.

1. Check your email for an invitation from GitHub (or go to [github.com/notifications](https://github.com/notifications)).
2. Click **Accept invitation**.

## 2. Download the installer

1. On the project page, look at the right-hand side for **Releases** and click the newest one (it has a green **Latest** label).
2. Under **Assets**, click **Emberlight-Setup-…exe** to download it (about 120 MB).
3. If your browser warns that the file "isn't commonly downloaded", choose **Keep** (in Edge: click the **…** next to the download, then **Keep**).

## 3. Install it

1. Double-click the downloaded file.
2. Windows may show a blue box saying **"Windows protected your PC."** This appears for any new app that hasn't paid for a Microsoft certificate yet. Click **More info**, then **Run anyway**.
3. Click through the installer (**Next**, **Install**, **Finish**). It puts an **Emberlight** shortcut on your desktop and in the Start menu.

## 4. Connect a model

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

- Type what your character does. Put anything they **say** in "quotation marks". You can do both in one turn:
  `"Stay back," I warn, drawing my sword.`
- To tell the Dungeon Master something directly, out of character, use double brackets: `((make it start raining))`.
- **Reroll response** writes the DM's last reply again. **New** (top right) starts a fresh adventure.

## Updating

Emberlight checks for new versions by itself. When one is out, a glowing **Update** button appears in the top bar (and on the title screen):

1. Click **Update**. It downloads in the background while you keep playing.
2. When it says **Restart to update**, click it. Emberlight closes, updates itself, and opens again a few seconds later. Your settings and keys are kept.

(Versions older than 0.0.3 don't have the button. If you have one of those, install the newest version from **Releases** by hand once.)

## Something went wrong?

- **"Couldn't reach LM Studio / Ollama…"**: the model app isn't running, or its server is switched off (see step 4).
- **"…no models are available"**: the model app is running but no model is loaded or downloaded.
- **"rejected the API key"**: the key was mistyped or has expired. Paste it again.

Anything else: take a screenshot and send it over.
