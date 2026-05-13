# active-bg

Live, animated desktop wallpapers for GNOME — rendered natively in the shell
via Cairo, no WebKit, no daemon, no `<canvas>`. Originally ported from the
watkinslabs.com hero effects.

15 effects, each fully knob-driven and palette-shiftable.

| effect          | description                                              |
|-----------------|----------------------------------------------------------|
| `aurora`        | flowing horizontal aurora bands with travelling nodes    |
| `blueprint`     | architectural blueprint grid w/ crosshairs + build lines |
| `circuit`       | circuit traces with pulses crawling along them           |
| `coderain`      | matrix-style code rain                                   |
| `constellation` | drifting stars connected by proximity lines              |
| `linkfield`     | scrolling citation-style links with random highlights    |
| `meshwarp`      | warping color mesh that reacts to the cursor             |
| `neural`        | layered neural net with random firing + signal pulses    |
| `nodegraph`     | floating graph nodes with edge pulses                    |
| `particles`     | classic linked particle field                            |
| `phaseflow`     | configurable count of phase-shifted sine streams         |
| `radar`         | rotating radar sweep painting blips                      |
| `scanner`       | vertical scanline revealing data points                  |
| `signalrings`   | expanding signal rings with orbiting dots                |
| `wavegrid`      | layered sine wave grid of dots                           |

## Architecture

The renderer lives **inside the shell extension** (no external daemon). Each
`Meta.BackgroundActor` GNOME creates — for your desktop, every workspace
thumbnail, the apps-view, and the lock screen — gets an `St.DrawingArea`
overlay attached as a child. A single `GLib.timeout` drives all overlays
through a shared effect instance, painting via Cairo through a small
Canvas-2D-shaped shim (`cairo-shim.js`).

    active-bg@watkinslabs.com/
      extension.js                   # panel menu, settings glue, panic key
      prefs.js                       # Adw prefs window + Cairo-backed preview
      runtime.js                     # EffectRunner: overlays, frame loop, watchdog
      cairo-shim.js                  # Canvas-2D-on-Cairo (shared by runtime + prefs)
      effects-gjs/                   # 15 ported effects + registry + manifest
        index.js, manifest.json
        aurora.js, blueprint.js, …
      schemas/
        org.gnome.shell.extensions.active-bg.gschema.xml

## Install

GNOME 45+ is required. From a checkout of this repo:

    make install
    make enable
    # then log out / back in on Wayland

`make check-deps` verifies you have `python3-gobject`, GTK4 typelibs, and
WebKit6 (the legacy daemon still uses these — see below). The main GJS
renderer needs only what gnome-shell already ships.

## Day-to-day controls

**Panel icon (Active BG)**:
- *Effect ▸ …* — switch animations live (15 listed)
- *Paused* toggle — instant 0% CPU
- *Opacity / FPS sliders* — drag-tune; the FPS slider is the most
  effective performance knob
- *Restart effect / Preferences…*

**Preferences window** (`gnome-extensions prefs active-bg@watkinslabs.com`):
- Live Cairo preview pane (no WebKit; reflects every change instantly)
- Per-effect knob editor, dynamically built from `effects-gjs/manifest.json`
- Hue-shift + saturation sliders apply to every effect
- Background mode: *Solid color* (default) or *Show GNOME wallpaper*
- Background color picker (when in solid mode)
- Framerate row with 5–60 fps scale

**Panic key** (default `<Super>Escape`): toggles pause from anywhere.
Designed as an always-reachable escape hatch when an effect+FPS combo bogs
the machine down. Customisable via `gsettings`:

    gsettings --schemadir ~/.local/share/gnome-shell/extensions/active-bg@watkinslabs.com/schemas \
      set org.gnome.shell.extensions.active-bg panic-key "['<Super><Alt>w']"

## Performance & safety

The renderer carries a built-in watchdog so you can't lock the machine by
cranking effect knobs:

- **Auto-throttle** — if average paint time exceeds the frame budget for
  ~half a second, effective FPS is halved (down to a floor of 5). Setting a
  new FPS manually resets this.
- **Hard kill** — any single paint exceeding **2 seconds** of wall-clock
  time pauses the renderer entirely and persists `paused = true` so the
  next shell start doesn't fall into the same trap. Toggle paused off
  (panel or panic key) to retry.
- **Pause toggle / panic key** — always-available manual brake.

CPU/GPU tips: drop to **15–20 fps** for ambient motion. Mesh-warp at
24×16 grid and Neural with 10 layers × 12 per-layer are by far the most
expensive effects on weak hardware.

## Per-effect knobs

Every effect declares its tunable parameters in
`effects-gjs/manifest.json`. Format:

```json
"aurora": {
  "label": "Aurora",
  "knobs": [
    {"key": "bands", "label": "Bands", "type": "int", "min": 2, "max": 30, "default": 14},
    {"key": "speed", "label": "Speed", "type": "float", "min": 0.1, "max": 3.0, "default": 1.0, "step": 0.1},
    …,
    {"key": "paletteShift", "label": "Hue shift", "type": "int", "min": -180, "max": 180, "default": 0},
    {"key": "saturation",   "label": "Saturation","type": "float", "min": 0.0, "max": 1.5, "default": 1.0, "step": 0.05}
  ]
}
```

Saved overrides live in the `effect-config` gsetting as a JSON dict keyed
by effect name; missing keys fall through to manifest defaults.

## Mouse interactions

Wallpaper actors are non-reactive (they don't intercept clicks), but the
runtime polls `global.get_pointer()` each tick and converts to actor-local
coords via `Clutter.Actor.transform_stage_point()`. That means:

- Effects respond to your cursor on the live desktop.
- They *also* respond inside workspace thumbnails and the apps-view —
  hover a thumbnail and the effect reacts within it.

Nine of the fifteen effects use mouse: `aurora`, `blueprint`,
`constellation`, `linkfield`, `meshwarp`, `neural`, `nodegraph`,
`particles`, `wavegrid`.

## Legacy daemon (deprecated)

The original architecture spawned a separate Python/GTK4/WebKit daemon
that used `gtk4-layer-shell` to pin a window to the wlr-background layer.
**This does not work on GNOME** — mutter doesn't implement
`wlr_layer_shell_v1`. The daemon is still in `daemon/` and the extension
falls back to it for any effect not (yet) ported to the GJS runtime.
On stock GNOME it exits cleanly with a "compositor doesn't implement
wlr-layer-shell" message and the extension stops respawning it after one
quick-exit. If you happen to run a wlroots compositor (sway, hyprland,
river, niri), the daemon path *does* work — though you'll get the same
effects faster from the GJS runtime.

## Development

    make dev          # nested gnome-shell with an isolated XDG_DATA_HOME
    make reload       # re-stage + disable/enable in your live session
    make build        # zip suitable for extensions.gnome.org
    make release      # bump version + build
    make preview      # open the browser-grid preview of all 15 effects

`make dev` opens a nested gnome-shell with `GTK_A11Y=none` set, the
extension auto-enabled, and our schema compiled into the dev home. Add
`DEV_EXTRA_EXTENSIONS="uuid1 uuid2"` to mirror host-installed extensions
into the dev session.

## Settings reference

| key                  | type | default       | notes                                            |
|----------------------|------|---------------|--------------------------------------------------|
| `effect`             | s    | `'aurora'`    | active effect id                                 |
| `effect-config`      | s    | `'{}'`        | JSON dict, per-effect knob overrides             |
| `opacity`            | i    | `100`         | 0–100, alpha multiplier on the overlay actor     |
| `fps`                | i    | `30`          | 5–60 target framerate                            |
| `paused`             | b    | `false`       | runner stopped; auto-set by watchdog on hard kill |
| `panic-key`          | as   | `<Super>Esc`  | keybinding to toggle pause                       |
| `background-mode`    | s    | `'solid'`     | `solid` or `transparent`                         |
| `background-color`   | s    | `'#000000'`   | CSS color, used when mode = solid                |
