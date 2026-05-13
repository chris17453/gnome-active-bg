// runtime.js
// Canvas-2D-shaped shim over Cairo and per-monitor actor host. The goal
// is to let the ported effects keep using familiar API
// (`ctx.beginPath()`, `ctx.fillStyle = 'hsla(…)'`, gradients, etc.)
// without knowing they're talking to Cairo on a Clutter.Canvas.

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Cairo from 'gi://cairo';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import {Canvas2D, parseColor} from './cairo-shim.js';
export {Canvas2D, parseColor};

// ─────────────────────────────────────────── per-monitor actor + frame loop
//
// EffectRunner owns one Clutter.Actor per monitor, mounted in the
// background group (between the GNOME wallpaper and your windows).
// On each tick it invalidates the Clutter.Canvas, which fires the draw
// signal with a Cairo.Context; we wrap that in Canvas2D and hand it to
// the active effect.

const DEFAULT_FPS = 30;
const FPS_MIN = 5, FPS_MAX = 60;

// Watchdog thresholds. Tuned to "if you're hitting these, you're past the
// point of usability — back off automatically".
const HARD_KILL_MS = 2000;      // single paint over this → emergency pause
const SLOW_PAINT_RATIO = 1.5;   // avg paint time vs frame budget that triggers throttle
const SLOW_PAINT_WINDOW = 30;   // recent paints to average over
const SLOW_PAINT_SUSTAINED = 15; // consecutive slow ticks before throttling
const THROTTLE_FLOOR_FPS = 5;
const CONTEXT_UNSTABLE_MS = 250;
const CONTEXT_FAIL_BACKOFF_MS = 1000;

export class EffectRunner {
    constructor() {
        this._actors = [];     // [{actor, bgActor, alive}]
        this._masters = [];    // subset of _actors that own a real DrawingArea
        this._clones = [];     // [{actor, bgActor}]
        this._monitorsChangedId = 0;
        this._timeoutId = 0;
        this._effect = null;   // { state, paint } produced by effect.create()
        this._effectName = null;
        this._cfg = {};
        this._bgMode = 'solid';
        this._bgColor = [0, 0, 0, 1];
        this._opacity = 1.0;
        this._lastTick = 0;
        this._t = 0;
        this._fps = DEFAULT_FPS;
        this._effectiveFps = DEFAULT_FPS;  // after watchdog throttling
        this._paused = false;
        this._paintTimes = new Array(SLOW_PAINT_WINDOW).fill(0);
        this._paintIdx = 0;
        this._slowStreak = 0;
        this._killed = false;             // set by hard-kill watchdog
    }

    start() {
        // Install a global hook: every Meta.BackgroundActor created by
        // anyone (desktop, workspace thumbnails, apps-view, lock screen…)
        // gets our overlay child added to it. That's why the effect
        // follows the wallpaper into Activities/Apps view.
        this._installBackgroundHook();

        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed', () => this._rebuild());
        this._rebuild();
        this._startTimer();
    }

    _startTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._paused || this._killed) return;
        const interval = Math.max(16, Math.round(1000 / this._effectiveFps));
        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, interval, () => this._tick());
    }

    setFps(fps) {
        const f = Math.max(FPS_MIN, Math.min(FPS_MAX, Math.round(fps)));
        if (f === this._fps) return;
        this._fps = f;
        // Throttle resets on manual change — user just told us what they want.
        this._effectiveFps = f;
        this._slowStreak = 0;
        this._paintTimes.fill(0);
        this._killed = false;
        if (this._timeoutId || (!this._paused && !this._killed)) this._startTimer();
    }

    setPaused(paused) {
        paused = !!paused;
        if (paused === this._paused) return;
        this._paused = paused;
        if (paused) {
            if (this._timeoutId) {
                GLib.source_remove(this._timeoutId);
                this._timeoutId = 0;
            }
        } else {
            this._killed = false;
            this._effectiveFps = this._fps;
            this._slowStreak = 0;
            this._paintTimes.fill(0);
            this._startTimer();
        }
    }

    isPaused()      { return this._paused; }
    wasKilled()     { return this._killed; }
    effectiveFps()  { return this._effectiveFps; }

    _installBackgroundHook() {
        const proto = Background.BackgroundManager.prototype;
        if (proto.__activeBgPatched) return;
        const orig = proto._createBackgroundActor;
        if (typeof orig !== 'function') {
            log('active-bg: BackgroundManager._createBackgroundActor missing; '
                + 'thumbnails/apps-view will lack the effect overlay.');
            return;
        }
        const runner = this;
        proto._createBackgroundActor = function () {
            const actor = orig.call(this);
            try { runner._attachToBackgroundActor(actor); }
            catch (e) { logError(e, 'active-bg: attach hook failed'); }
            return actor;
        };
        proto.__activeBgPatched = orig;
    }

    _uninstallBackgroundHook() {
        const proto = Background.BackgroundManager.prototype;
        if (proto.__activeBgPatched) {
            proto._createBackgroundActor = proto.__activeBgPatched;
            delete proto.__activeBgPatched;
        }
    }

    stop() {
        this._uninstallBackgroundHook();
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        if (this._bgAddedId) {
            try { Main.layoutManager._backgroundGroup.disconnect(this._bgAddedId); } catch (_) {}
            this._bgAddedId = 0;
        }
        for (const c of this._clones.slice()) {
            try { c.actor.destroy(); } catch (_) {}
        }
        for (const a of this._actors.slice()) {
            try { a.actor.destroy(); } catch (_) {}
        }
        this._actors = [];
        this._masters = [];
        this._clones = [];
        this._effect = null;
    }

    setEffect(name, factory, cfg) {
        this._effectName = name;
        this._cfg = cfg || {};
        const firstMonitor = this._actors[0]?.monitor
            || { width: 800, height: 600 };
        // Effects re-init on every effect/cfg change.
        try {
            this._effect = factory(this._cfg, firstMonitor.width, firstMonitor.height);
        } catch (e) {
            logError(e, `active-bg: failed to construct effect '${name}'`);
            this._effect = null;
        }
        this._t = 0;
        for (const a of this._actors) a.actor.queue_repaint();
    }

    setBackground(mode, colorStr) {
        this._bgMode = mode === 'transparent' ? 'transparent' : 'solid';
        this._bgColor = parseColor(colorStr || '#000000');
        for (const a of this._actors) a.actor.queue_repaint();
    }

    setOpacity(pct) {
        this._opacity = Math.max(0, Math.min(1, (pct ?? 100) / 100));
        const o = Math.round(this._opacity * 255);
        for (const a of this._actors) a.actor.opacity = o;
        for (const c of this._clones) c.actor.opacity = o;
    }

    _rebuild() {
        // Tear down existing actors. We don't touch get_parent() — the entries
        // may already have been disposed C-side (their destroy handler removes
        // them, but we may be racing it). Just attempt destroy() and ignore.
        for (const c of this._clones.slice()) {
            try { c.actor.destroy(); } catch (_) {}
        }
        for (const a of this._actors.slice()) {
            try { a.actor.destroy(); } catch (_) {}
        }
        this._actors = [];
        this._masters = [];
        this._clones = [];
        if (this._bgAddedId) {
            try { Main.layoutManager._backgroundGroup.disconnect(this._bgAddedId); } catch (_) {}
            this._bgAddedId = 0;
        }

        // Attach an overlay as a child of each Meta.BackgroundActor so the
        // effect rides along with the wallpaper into overview/apps/workspace
        // thumbnails. If the background actors aren't built yet (extension
        // enabled before LayoutManager finished), fall back to the group
        // and re-attach when actors get added.
        this._attachOverlays();
        this._bgAddedId = Main.layoutManager._backgroundGroup.connect(
            'child-added', () => this._attachOverlays());
    }

    _attachOverlays() {
        // Catch up with any BackgroundActors that already exist on the
        // visible desktop. Workspace-thumbnail / apps-view actors will be
        // caught later by the BackgroundManager hook as they're created.
        const bgGroup = Main.layoutManager._backgroundGroup;
        for (const child of bgGroup.get_children()) {
            this._attachToBackgroundActor(child);
        }
    }

    _attachToBackgroundActor(bgActor) {
        if (!bgActor || bgActor.__activeBgOverlay) return;
        this._attachOverlay(bgActor);
    }

    // ORIGINAL approach: attach an St.DrawingArea as a direct child of
    // every BackgroundActor, sized to match its parent via BindConstraint.
    // The repaint handler asks for `get_surface_size()` and hands those
    // dimensions to the effect's paint function, so the effect renders
    // at whatever size the parent ends up being.
    _attachOverlay(bgActor) {
        if (bgActor.__activeBgOverlay) return;

        const area = new St.DrawingArea({
            reactive: false,
            opacity: Math.round(this._opacity * 255),
        });

        area.add_constraint(new Clutter.BindConstraint({
            source: bgActor,
            coordinate: Clutter.BindCoordinate.ALL,
        }));

        const entry = {
            actor: area,
            bgActor,
            alive: true,
            unstableUntil: GLib.get_monotonic_time() + CONTEXT_UNSTABLE_MS * 1000,
        };
        const markUnstable = (ms = CONTEXT_UNSTABLE_MS) => {
            entry.unstableUntil = GLib.get_monotonic_time() + ms * 1000;
        };

        area.connect('notify::parent', () => {
            if (!area.get_parent()) entry.alive = false;
            markUnstable();
        });
        area.connect('notify::allocation', () => markUnstable());
        area.connect('destroy', () => {
            entry.alive = false;
            if (bgActor.__activeBgOverlay === area)
                delete bgActor.__activeBgOverlay;
            const idx = this._actors.indexOf(entry);
            if (idx >= 0) this._actors.splice(idx, 1);
        });
        // Parent teardown can happen while paint is inflight. Mark as dead
        // and let normal destruction cascade from the parent actor.
        bgActor.connect('destroy', () => {
            entry.alive = false;
            if (bgActor.__activeBgOverlay === area)
                delete bgActor.__activeBgOverlay;
        });

        area.connect('repaint', function (...args) {
            const a = args[0];
            let cr = args[1] ?? null;
            let ownContext = false;

            if (!entry.alive) return;
            if (GLib.get_monotonic_time() < entry.unstableUntil) return;
            try {
                if (!a || !a.get_parent() || !a.get_stage() || !a.mapped)
                    return;
            } catch (_) {
                return;
            }

            let w, h;
            try { [w, h] = a.get_surface_size(); } catch (_) { return; }
            if (!w || !h || w <= 0 || h <= 0) return;

            // Local mouse coords (only meaningful for actors on the live
            // desktop — thumbnails/apps-view transforms confuse pointer
            // mapping enough that we just disable mouse there).
            let mx = -9999, my = -9999;
            if (this._pointerStage) {
                try {
                    const [ok, ax, ay] = a.transform_stage_point(
                        this._pointerStage[0], this._pointerStage[1]);
                    if (ok && ax >= 0 && ay >= 0 && ax < w && ay < h) {
                        mx = ax; my = ay;
                    }
                } catch (_) {}
            }

            if (!entry.alive) return;
            if (!cr) {
                try {
                    cr = a.get_context();
                    ownContext = true;
                } catch (e) {
                    markUnstable(CONTEXT_FAIL_BACKOFF_MS);
                    logError(e, 'active-bg: get_context() failed');
                    return;
                }
            }
            if (!cr) {
                markUnstable(CONTEXT_FAIL_BACKOFF_MS);
                return;
            }
            try { this._drawFrame(cr, w, h, mx, my); }
            catch (e) { logError(e, 'active-bg: _drawFrame threw'); }
            finally {
                if (ownContext) {
                    try { if (typeof cr.$dispose === 'function') cr.$dispose(); } catch (_) {}
                }
            }
        }.bind(this));

        bgActor.add_child(area);
        bgActor.__activeBgOverlay = area;
        area.queue_repaint();
        this._actors.push(entry);
    }

    _tick() {
        const now = GLib.get_monotonic_time();
        const dt = this._lastTick ? (now - this._lastTick) / 1e6 : 1 / this._fps;
        this._lastTick = now;
        this._t += dt;

        // Sample the cursor once per tick; each repaint translates this
        // into actor-local coords (so thumbnails react when hovered too).
        try {
            this._pointerStage = global.get_pointer();
        } catch (_) {
            this._pointerStage = null;
        }

        if (this._effect && this._effect.update) {
            try { this._effect.update(dt, this._t); }
            catch (e) { logError(e, `active-bg: effect update threw`); }
        }
        // Tickle every actor — both masters AND transient overlays.
        for (const a of this._actors) {
            try {
                if (!a.alive) continue;
                if (GLib.get_monotonic_time() < (a.unstableUntil || 0)) continue;
                if (!a.actor.mapped) continue;
                a.actor.queue_repaint();
            }
            catch (_) { /* actor torn down; destroy handler cleans up */ }
        }
        for (const c of this._clones) {
            try { c.actor.queue_repaint(); }
            catch (_) {}
        }
        return GLib.SOURCE_CONTINUE;
    }

    _drawFrame(cr, w, h, mx, my) {
        const start = GLib.get_monotonic_time();

        // Background fill
        if (this._bgMode === 'solid') {
            const [r, g, b, a] = this._bgColor;
            cr.setOperator(Cairo.Operator.SOURCE);
            cr.setSourceRGBA(r, g, b, a);
            cr.rectangle(0, 0, w, h);
            cr.fill();
        } else {
            cr.setOperator(Cairo.Operator.CLEAR);
            cr.rectangle(0, 0, w, h);
            cr.fill();
        }
        cr.setOperator(Cairo.Operator.OVER);

        if (this._effect && this._effect.paint) {
            const ctx = new Canvas2D(cr, w, h);
            try {
                this._effect.paint(ctx, w, h, this._t, mx ?? -9999, my ?? -9999);
            } catch (e) {
                logError(e, `active-bg: effect paint threw`);
            }
        }

        const elapsedMs = (GLib.get_monotonic_time() - start) / 1000;
        this._recordPaint(elapsedMs);
    }

    // Watchdog. Called after every actor paint. Two failure modes:
    //   (a) one paint exploded (> HARD_KILL_MS) — pause immediately
    //   (b) sustained slowness — halve the effective FPS, repeat down to a floor.
    _recordPaint(ms) {
        if (this._killed || this._paused) return;

        if (ms >= HARD_KILL_MS) {
            log(`active-bg: WATCHDOG — single paint took ${ms.toFixed(0)} ms; `
                + `pausing renderer to keep the desktop responsive.`);
            this._killed = true;
            this.setPaused(true);
            // Persist the pause if we have a settings handle, so a re-enable
            // doesn't immediately fall into the same trap.
            if (this._settings) {
                try { this._settings.set_boolean('paused', true); } catch (_) {}
            }
            return;
        }

        this._paintTimes[this._paintIdx] = ms;
        this._paintIdx = (this._paintIdx + 1) % SLOW_PAINT_WINDOW;

        const budget = 1000 / this._effectiveFps;
        let sum = 0;
        for (const v of this._paintTimes) sum += v;
        const avg = sum / SLOW_PAINT_WINDOW;

        if (avg > budget * SLOW_PAINT_RATIO) {
            this._slowStreak++;
            if (this._slowStreak >= SLOW_PAINT_SUSTAINED) {
                const next = Math.max(THROTTLE_FLOOR_FPS,
                                       Math.floor(this._effectiveFps / 2));
                if (next < this._effectiveFps) {
                    log(`active-bg: WATCHDOG — paints averaging ${avg.toFixed(0)} ms `
                        + `(budget ${budget.toFixed(0)} ms); throttling `
                        + `${this._effectiveFps} → ${next} fps.`);
                    this._effectiveFps = next;
                    this._slowStreak = 0;
                    this._paintTimes.fill(0);
                    this._startTimer();
                }
            }
        } else {
            this._slowStreak = 0;
        }
    }

    // Lets extension.js give the runner access to its settings so the
    // watchdog can persist a "paused" state when it kills.
    setSettings(settings) { this._settings = settings; }
}
