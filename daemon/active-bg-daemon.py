#!/usr/bin/env python3
"""
active-bg desktop wallpaper daemon.

Renders one of the canvas effects in frame.html on the Wayland background
layer via gtk4-layer-shell. If the running compositor does not advertise
the wlr-layer-shell protocol (e.g. a nested gnome-shell test session, or
a stock GNOME mutter without layer-shell support), we exit cleanly rather
than turning into a topmost fullscreen window that blocks the desktop.

Usage:
    ACTIVE_BG_EFFECT=aurora ACTIVE_BG_OPACITY=80 ./active-bg-daemon.py
    ./active-bg-daemon.py --effect wavegrid --opacity 70

Effects: aurora blueprint circuit coderain constellation linkfield meshwarp
         neural nodegraph particles phaseflow radar scanner signalrings wavegrid
"""

import base64
import glob
import json
import os
import sys
import argparse
import urllib.parse

# Disable accessibility integration *before* importing Gtk. In nested
# gnome-shell sessions (and some sandboxed setups) the at-spi registry
# can't be activated, which makes Gtk.Application.register() retry-loop
# on D-Bus. A wallpaper renderer has no use for a11y anyway.
os.environ.setdefault("GTK_A11Y", "none")
os.environ.setdefault("NO_AT_BRIDGE", "1")
os.environ.setdefault("GTK_MODULES", "")


def _find_layer_shell_lib():
    """Locate libgtk4-layer-shell.so for LD_PRELOAD."""
    # 1. Ask ldconfig (covers any distro that uses glibc's loader cache).
    try:
        import subprocess
        out = subprocess.check_output(
            ["ldconfig", "-p"], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            if "libgtk4-layer-shell.so" in line:
                # format: "  libgtk4-layer-shell.so.0 (libc6,x86-64) => /usr/lib64/libgtk4-layer-shell.so.0"
                parts = line.split("=>")
                if len(parts) == 2:
                    return parts[1].strip()
    except Exception:
        pass
    # 2. Fall back to common multilib paths.
    for pattern in (
        "/usr/lib64/libgtk4-layer-shell.so*",
        "/usr/lib/x86_64-linux-gnu/libgtk4-layer-shell.so*",
        "/usr/lib/libgtk4-layer-shell.so*",
        "/usr/local/lib/libgtk4-layer-shell.so*",
    ):
        hits = sorted(glob.glob(pattern))
        if hits:
            # Prefer versioned soname (libfoo.so.0) over dev symlink (libfoo.so).
            for h in hits:
                if ".so." in h:
                    return h
            return hits[0]
    return None


# gtk4-layer-shell MUST be loaded before libwayland-client. When we're
# imported via python's gi machinery, libwayland is already in the address
# space, so the layer-surface upgrade silently fails. Re-exec ourselves
# with LD_PRELOAD pointed at the library to fix it.
if not os.environ.get("ACTIVE_BG_PRELOADED"):
    _lib = _find_layer_shell_lib()
    if _lib is not None:
        cur = os.environ.get("LD_PRELOAD", "")
        if _lib not in cur:
            os.environ["LD_PRELOAD"] = (_lib + (":" + cur if cur else ""))
        os.environ["ACTIVE_BG_PRELOADED"] = "1"
        os.execv(sys.executable, [sys.executable] + sys.argv)

import gi
gi.require_version("Gtk", "4.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gtk, WebKit, Gdk, GLib  # noqa: E402

HAVE_LAYER_SHELL = True
LAYER_SHELL_ERR = None
try:
    gi.require_version("Gtk4LayerShell", "1.0")
    from gi.repository import Gtk4LayerShell as LayerShell  # noqa: E402
except Exception as _e:  # ValueError, ImportError, RuntimeError, …
    HAVE_LAYER_SHELL = False
    LAYER_SHELL_ERR = _e


HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)
FRAME_PATH = os.path.join(PROJECT_ROOT, "frame.html")

EFFECTS = [
    "aurora", "blueprint", "circuit", "coderain", "constellation",
    "linkfield", "meshwarp", "neural", "nodegraph", "particles",
    "phaseflow", "radar", "scanner", "signalrings", "wavegrid",
]


def layer_shell_works():
    """True only if the compositor actually advertises wlr-layer-shell."""
    if not HAVE_LAYER_SHELL:
        return False
    try:
        return bool(LayerShell.is_supported())
    except Exception:
        return False


def _parse_css_color(css):
    """Best-effort CSS color → (r,g,b,a) floats in [0,1]. Falls back to black."""
    rgba = Gdk.RGBA()
    if rgba.parse(css):
        return rgba
    rgba.parse("#000000")
    return rgba


def make_window(effect, opacity, cfg_b64, bg_mode, bg_color, monitor):
    win = Gtk.Window()
    win.set_decorated(False)

    LayerShell.init_for_window(win)
    LayerShell.set_layer(win, LayerShell.Layer.BACKGROUND)
    if monitor is not None:
        LayerShell.set_monitor(win, monitor)
    for edge in (LayerShell.Edge.TOP, LayerShell.Edge.BOTTOM,
                 LayerShell.Edge.LEFT, LayerShell.Edge.RIGHT):
        LayerShell.set_anchor(win, edge, True)
    LayerShell.set_exclusive_zone(win, -1)
    LayerShell.set_keyboard_mode(win, LayerShell.KeyboardMode.NONE)

    webview = WebKit.WebView()
    try:
        if bg_mode == "transparent":
            # alpha=0 so the GNOME wallpaper bleeds through
            webview.set_background_color(Gdk.RGBA(red=0, green=0, blue=0, alpha=0))
        else:
            webview.set_background_color(_parse_css_color(bg_color))
    except Exception:
        pass

    settings = webview.get_settings()
    settings.set_enable_javascript(True)
    settings.set_hardware_acceleration_policy(
        WebKit.HardwareAccelerationPolicy.ALWAYS)
    settings.set_enable_smooth_scrolling(False)

    win.set_child(webview)

    url = (f"file://{FRAME_PATH}"
           f"?effect={urllib.parse.quote(effect)}"
           f"&opacity={opacity}"
           f"&bg={urllib.parse.quote(bg_mode)}"
           f"&bgColor={urllib.parse.quote(bg_color)}")
    if cfg_b64:
        url += f"&cfg={urllib.parse.quote(cfg_b64)}"
    webview.load_uri(url)

    win.present()
    return win


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--effect", default=os.environ.get("ACTIVE_BG_EFFECT", "aurora"),
                    choices=EFFECTS)
    ap.add_argument("--opacity", type=int,
                    default=int(os.environ.get("ACTIVE_BG_OPACITY", "100")))
    ap.add_argument("--config-json",
                    default=os.environ.get("ACTIVE_BG_CONFIG_JSON", ""),
                    help="Per-effect knob overrides as a JSON dict keyed by effect name.")
    ap.add_argument("--bg-mode", default=os.environ.get("ACTIVE_BG_MODE", "solid"),
                    choices=["solid", "transparent"])
    ap.add_argument("--bg-color", default=os.environ.get("ACTIVE_BG_COLOR", "#000000"))
    args = ap.parse_args()

    if not HAVE_LAYER_SHELL:
        print("active-bg: gtk4-layer-shell library not available; "
              "refusing to spawn a fullscreen toplevel.\n"
              f"  reason: {type(LAYER_SHELL_ERR).__name__}: {LAYER_SHELL_ERR}\n"
              f"  GI_TYPELIB_PATH={os.environ.get('GI_TYPELIB_PATH', '<unset>')}\n"
              f"  LD_LIBRARY_PATH={os.environ.get('LD_LIBRARY_PATH', '<unset>')}",
              file=sys.stderr)
        sys.exit(0)

    # Hard exit if the compositor doesn't speak wlr-layer-shell. GNOME's
    # mutter does NOT implement this protocol (it has its own background
    # actor system), so the daemon-on-background approach simply won't
    # work there. Better to exit cleanly than become a topmost blocker.
    try:
        if not LayerShell.is_supported():
            print(
                "active-bg: this compositor doesn't implement wlr-layer-shell;\n"
                "  the daemon can't pin a window to the desktop background here.\n"
                "  Stock GNOME (mutter) does not support this protocol.\n"
                "  Works on: sway, hyprland, river, niri, and other wlroots-based\n"
                "  compositors. See README.md for the GNOME caveat.",
                file=sys.stderr)
            sys.exit(0)
    except Exception:
        pass

    opacity = max(0, min(100, args.opacity))

    cfg_b64 = ""
    if args.config_json:
        try:
            full = json.loads(args.config_json)
            sub = full.get(args.effect, {}) if isinstance(full, dict) else {}
            if sub:
                cfg_b64 = base64.b64encode(
                    json.dumps(sub).encode("utf-8")).decode("ascii")
        except (ValueError, TypeError):
            pass

    # Plain Gtk.Window + GLib.MainLoop. We deliberately avoid Gtk.Application
    # so we never hit the D-Bus registration retry-loop that the at-spi
    # failure was triggering in nested sessions.
    display = Gdk.Display.get_default()
    monitors = display.get_monitors() if display is not None else None
    windows = []
    if monitors is None or monitors.get_n_items() == 0:
        windows.append(make_window(args.effect, opacity, cfg_b64,
                                   args.bg_mode, args.bg_color, None))
    else:
        for i in range(monitors.get_n_items()):
            windows.append(make_window(args.effect, opacity, cfg_b64,
                                       args.bg_mode, args.bg_color,
                                       monitors.get_item(i)))

    loop = GLib.MainLoop()
    # Quit cleanly if all windows close (e.g. compositor restart).
    for w in windows:
        w.connect("close-request", lambda *_: (loop.quit(), False)[1])
    loop.run()


if __name__ == "__main__":
    main()
