# active-bg

Live, canvas-animated desktop wallpapers for GNOME, extracted from the watkinslabs.com hero effects.

15 effects ported to plain JS/HTML (no framework, no build step):

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
| `phaseflow`     | four phase-shifted sine streams                          |
| `radar`         | rotating radar sweep painting blips                      |
| `scanner`       | vertical scanline revealing data points                  |
| `signalrings`   | expanding signal rings with orbiting dots                |
| `wavegrid`      | layered sine wave grid of dots                           |

## Project layout

    active-bg/
      frame.html               # loads ?effect=NAME and runs effects/NAME.js
      index.html               # preview grid of all 15 effects in iframes
      effects/*.js             # one self-contained canvas animation each
      daemon/active-bg-daemon.py   # GTK4 + WebKit6 wallpaper-layer renderer
      extension/               # GNOME shell extension (toggles + selects)

## Quick preview (no install)

    cd active-bg
    python3 -m http.server 8080
    # then open http://localhost:8080/index.html

## Wallpaper daemon (standalone)

Requires GTK4, WebKitGTK 6.0, and (Wayland) `gtk4-layer-shell`.

Fedora:

    sudo dnf install python3-gobject gtk4 webkitgtk6.0 gtk4-layer-shell

Then:

    ./daemon/active-bg-daemon.py --effect aurora

Other effect names: see the table above.

On X11, `gtk4-layer-shell` is unavailable; the daemon falls back to a
fullscreen window. To actually pin it to the desktop layer on X11 you'll
want to set `_NET_WM_WINDOW_TYPE_DESKTOP` (e.g. via `wmctrl` or by extending
the daemon to use `Gdk.X11.Window` directly).

## GNOME shell extension

Install into the user-extensions dir, compile the schema, and enable:

    UUID=active-bg@watkinslabs.com
    DEST=~/.local/share/gnome-shell/extensions/$UUID
    mkdir -p $DEST
    cp -r extension/* $DEST/
    # daemon is referenced by relative path from the extension dir:
    mkdir -p $DEST/daemon
    cp daemon/active-bg-daemon.py $DEST/daemon/
    # bring the html along too so file:// URIs resolve from the daemon dir's parent:
    cp frame.html $DEST/
    cp -r effects $DEST/

    glib-compile-schemas $DEST/schemas
    gnome-extensions enable $UUID
    # log out / log back in on Wayland, or restart the shell on X11 (Alt+F2 -> r)

Pick an effect from the panel icon, or:

    gsettings --schemadir $DEST/schemas \
      set org.gnome.shell.extensions.active-bg effect wavegrid

## Source

Effects originally written as Astro components in
`watkinslabs.com/web/src/components/effects/`. Each was stripped of
TypeScript annotations and the Astro wrapper, and converted to a
self-contained script that creates its own canvas attached to `document.body`.
# gnome-active-bg
