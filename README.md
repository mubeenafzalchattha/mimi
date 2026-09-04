# Mimi 🐾

*your task list got paws*

Mimi keeps an eye on you. Pixel cats live on top of every window on your Mac and guard your
Apple Reminders — you cannot ignore that pending task forever now.

- A reminder gets a cat. The cat shows up **15 minutes before it's due** (configurable).
- The pet you pick in the gallery takes the **most urgent** task. Every extra task gets a
  random cat, so a pile-up of deadlines is a pile-up of strangers on your desktop.
- It walks around the bottom of your screen, wiggles its tail, blinks, sits, and meows.
- Miss the deadline and it gets **loud**: red `!`, angry brows, faster pacing, meows every 10s.
- Ten reminders = ten cats. There is no way to hide them except doing the work.
- Hover a cat → it stops, looks at your pointer, and shows a speech bubble with the task and how long you have. Click the ✓ → the cat says *yay*, sparkles, and runs off screen, and the reminder is ticked in Apple Reminders.
- Click the cat's body instead → you pet it (purr + hearts). It does not leave.
- Tick it off in the Reminders app and the cat notices within ~20s and leaves happily.
- Menu bar cat + home screen both list every cat on duty so you can finish tasks from there too.

## Install

Mimi is **unsigned** — there's no $99/yr Apple Developer certificate behind her —
so macOS blocks the first launch. You only do this once:

1. Grab `Mimi-0.1.0-arm64-mac.zip` from
   [Releases](https://github.com/mubeenafzalchattha/mimi/releases), unzip it, and drag
   **Mimi** into Applications.
2. Launch it from Applications. macOS refuses: *"Mimi can't be opened because Apple
   cannot check it for malicious software"* (or *"is damaged"*). Click **Done**.
3. Open **System Settings → Privacy & Security**, scroll down to **Security**. There's
   a line saying Mimi was blocked — click **Open Anyway**, then confirm.
4. Launch Mimi again and click **Open**. That's the last time you'll see any of this.
5. Mimi asks for permission to control Reminders — click **OK**. Say no and she has
   nothing to nag you about.

Still stuck at step 3? macOS quarantine can be cleared directly:

```bash
xattr -dr com.apple.quarantine /Applications/Mimi.app
```

**Mimi has no Dock icon** — she lives in the menu bar. Look for the cat up top, not
down below.

Apple Silicon only for now. Intel Macs aren't supported by these builds.

## Run it

```bash
cd ~/petpet
npm install
npm start
```

The home screen opens on first run. After that it lives in the menu bar (cat head icon) —
*Open Mimi…* brings the home screen back. There's no dock icon unless the home screen is open.

**First run:** macOS asks for permission to control Reminders. Say yes. If you miss the prompt,
System Settings → Privacy & Security → Automation → switch on **Reminders** under *Electron*
(dev) or *Mimi* (packaged). The home screen shows a red dot and an *Open Privacy settings*
button whenever this is the problem.

Don't want to wait for a real deadline? **Summon a test cat.**

## When Reminders won't answer

```bash
npm run doctor
```

Runs the same AppleScript Mimi uses and prints the real error, the number of reminders
found, and how long the query took. Common answers:

| what you see | what it means |
|---|---|
| `not authorized` / `-1743` | the Automation permission above is off |
| `did not answer within 90s` | Reminders is still syncing — open the app once and let it settle |
| `0 found` | your reminders have no *time*, only a date. All-day reminders are skipped by default (`includeAllDay`) because they'd send cats at midnight |

## The home screen

- **Status** — how many cats are out, what they're nagging about, tick them off from here.
- **Choose your pet** — 13 coats, each animated: Marmalade, Ash, Domino, Biscuit, Mocha, Patch,
  Void, Blizzard, Bubblegum, Matcha, Blueberry, Honey, Ghost. Or *Surprise me*, which gives every
  reminder its own cat.
- **Habits** — arrival time, cat size, meowing + volume, what a click on the body does,
  and start-with-the-Mac.
- **Lists to watch** — limit the cats to certain Reminders lists.

## Build a real .app

```bash
npm run dist        # signed .app and shareable .zip in dist/
```

`build/after-pack.js` ad-hoc signs the bundle on the way out. The distributable is
`dist/Mimi-<version>-arm64-mac.zip`; do not send the raw `.app`, which can lose bundle
metadata when transferred. This isn't notarisation —
it only stops macOS refusing to run a bundle whose signature packing invalidated. Users
still walk the Gatekeeper steps in [Install](#install).

To share an app that opens without Apple's malware warning, it must be signed with a
paid Apple Developer **Developer ID Application** certificate and notarized by Apple.
An ad-hoc signature is intentionally not trusted by Gatekeeper.

One consequence worth knowing: an ad-hoc signature changes on every build, so macOS sees
each release as a different app and re-asks for Reminders permission. If a grant gets
wedged, reset it with:

```bash
tccutil reset AppleEvents com.mubeen.mimi
```

Turn on *Start with the Mac* on the home screen and you never think about it again.

## Her voice

The meows, the chirp and the purr are real waveforms in `src/assets/`, generated by a
source-filter vocal model (harmonic source → four moving formants → mouth-opening filter):

```bash
python3 tools/make-sounds.py     # needs numpy; rewrites src/assets/*.wav
```

Four meows (one short mew, one long insistent one), a chirp for *yay*, and a purr for when you
pet a cat. Late cats use the longer, pushier calls. Every meow is panned to where the cat is
standing on your screen.

**Want a real recorded cat?** Drop your own mono 44.1 kHz WAVs into `src/assets/` with the same
file names — `meow-1.wav` … `meow-4.wav`, `chirp.wav`, `purr.wav` — and Mimi plays those instead.
No code change.

## Settings file

Menu bar → *Open config file…* opens `~/Library/Application Support/Mimi/config.json`:

| key | default | what it does |
|---|---|---|
| `leadMinutes` | 15 | how early a cat arrives before the due time |
| `pollSeconds` | 20 | how often Reminders is checked |
| `ignoreOlderThanHours` | 24 | reminders older than this don't summon cats |
| `maxPets` | 10 | hard cap on simultaneous cats |
| `sound` / `volume` | true / 0.5 | 8-bit meows (synthesised, no audio files) |
| `meowEverySeconds` | 25 | meow interval before the deadline |
| `overdueMeowEverySeconds` | 10 | meow interval once you're late |
| `scale` | 3 | pixel size — 3 is a 48×42 cat, 5 is a chonk |
| `coat` | `"random"` | the pet for the most urgent task; `random` means every cat is a surprise |
| `clickBodyToComplete` | false | true = clicking anywhere on the cat finishes the task |
| `includeAllDay` | false | all-day reminders have no time, so they'd arrive at midnight |
| `lists` | `[]` | e.g. `["Work"]` to only watch some Reminders lists |

## How it's put together

```
src/
  main/
    main.js       overlay windows (one per display), polling, cursor tracking, IPC, home window
    reminders.js  AppleScript bridge: read due reminders, mark one complete
    tray.js       menu bar cat
    store.js      config.json
  preload.js       bridge for the overlay
  preload-home.js  bridge for the home screen
  home/           the home screen (index.html / home.css / home.js)
  renderer/
    sprites.js    the pixel art, as character grids (see below)
    cat.js        one cat: state machine + drawing
    app.js        canvas loop, speech bubbles, hover + click hit testing
    audio.js      meow / purr / yay, synthesised with WebAudio
tools/
  check-reminders.js   npm run doctor
```

The overlay is a transparent, frameless, `screen-saver`-level panel per display, click-through by
default. The main process watches the cursor and only makes a window clickable while the pointer
is actually over a cat, so the cats never eat a click meant for the app underneath.

Reminders is read over AppleScript, asking for whole columns at once
(`id of every reminder of list whose completed is false`) rather than property-by-property —
the naive version times out on a real database.

### Editing the art

Sprites are strings, one character per pixel, in `src/renderer/sprites.js`:

```
'.......oBBEBBEBo'   . transparent   o outline   B coat   D shade
                     W belly         P pink      E eye
```

Body is 16×11, legs 16×3 (drawn under the body), tail 6×8 (drawn behind, to the left).
Add a coat by adding a palette to `COATS` — it shows up in the home screen gallery on its own.
Add a walk frame by adding a row to `LEGS.walk`.
