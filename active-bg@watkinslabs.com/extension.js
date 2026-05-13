import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {EffectRunner} from './runtime.js';
import {getEffectFactory, isPorted} from './effects-gjs/index.js';

const EFFECTS = [
    'aurora','blueprint','circuit','coderain','constellation',
    'linkfield','meshwarp','neural','nodegraph','particles',
    'phaseflow','radar','scanner','signalrings','wavegrid',
];

const RESTART_DEBOUNCE_MS = 250;

// Slider for any int-typed gsetting. opts:
//   { settings, key, min, max, label, icon, suffix, format }
const SettingSliderItem = GObject.registerClass(
class SettingSliderItem extends PopupMenu.PopupBaseMenuItem {
    _init(opts) {
        super._init({activate: false, can_focus: false});

        this._settings = opts.settings;
        this._key = opts.key;
        this._min = opts.min;
        this._max = opts.max;
        this._fmt = opts.format || (v => `${v}${opts.suffix || ''}`);

        const icon = new St.Icon({
            icon_name: opts.icon || 'preferences-system-symbolic',
            style_class: 'popup-menu-icon',
        });
        this.add_child(icon);

        const label = new St.Label({
            text: opts.label,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(label);

        const cur = this._settings.get_int(this._key);
        const norm = (cur - this._min) / Math.max(1, (this._max - this._min));
        this._slider = new Slider.Slider(norm);
        this._slider.x_expand = true;
        this.add_child(this._slider);

        this._value = new St.Label({
            text: this._fmt(cur),
            y_align: Clutter.ActorAlign.CENTER,
            style: 'min-width: 3.5em; text-align: right;',
        });
        this.add_child(this._value);

        this._sliderId = this._slider.connect('notify::value', () => {
            const v = Math.round(this._min + this._slider.value * (this._max - this._min));
            this._value.text = this._fmt(v);
            if (this._settings) this._settings.set_int(this._key, v);
        });

        this._changedId = this._settings.connect(`changed::${this._key}`, () => {
            const v = this._settings.get_int(this._key);
            const n = (v - this._min) / Math.max(1, (this._max - this._min));
            GObject.signal_handler_block(this._slider, this._sliderId);
            this._slider.value = n;
            GObject.signal_handler_unblock(this._slider, this._sliderId);
            this._value.text = this._fmt(v);
        });

        this.connect('destroy', () => {
            if (this._changedId && this._settings)
                this._settings.disconnect(this._changedId);
            this._changedId = 0;
            this._settings = null;
        });
    }
});

export default class ActiveBgExtension extends Extension {
    enable() {
        try {
            this._enableImpl();
        } catch (e) {
            logError(e, 'active-bg: enable() crashed');
            throw e;
        }
    }

    _enableImpl() {
        this._settings = this.getSettings();
        this._pid = 0;
        this._restartTimer = 0;
        this._daemonBroken = false;

        // GJS-side renderer (Phase 1: only effects in effects-gjs/ go here;
        // anything not yet ported still falls back to the python daemon).
        this._runner = new EffectRunner();
        this._runner.setSettings(this._settings);
        this._runner.setFps(this._settings.get_int('fps'));
        if (this._settings.get_boolean('paused')) this._runner.setPaused(true);
        this._runner.start();

        // Panic keybinding — always-on escape hatch when an effect/FPS combo
        // is bogging the machine down. Toggles the `paused` gsetting; the
        // settings watcher below pushes it into the runner.
        try {
            Main.wm.addKeybinding(
                'panic-key',
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => {
                    const newPaused = !this._settings.get_boolean('paused');
                    this._settings.set_boolean('paused', newPaused);
                    Main.notify('Active BG',
                        newPaused ? 'Paused (panic shortcut)' : 'Resumed');
                });
            this._panicKeyBound = true;
        } catch (e) {
            logError(e, 'active-bg: failed to register panic keybinding');
            this._panicKeyBound = false;
        }

        this._indicator = new PanelMenu.Button(0.0, 'Active BG', false);
        this._indicator.add_child(new St.Icon({
            icon_name: 'preferences-desktop-wallpaper-symbolic',
            style_class: 'system-status-icon',
        }));

        // Effect submenu
        this._effectMenu = new PopupMenu.PopupSubMenuMenuItem(
            `Effect: ${this._settings.get_string('effect')}`);
        this._effectItems = new Map();
        for (const name of EFFECTS) {
            const item = new PopupMenu.PopupMenuItem(name);
            item.connect('activate', () => this._settings.set_string('effect', name));
            this._effectMenu.menu.addMenuItem(item);
            this._effectItems.set(name, item);
        }
        this._markActiveEffect(this._settings.get_string('effect'));
        this._indicator.menu.addMenuItem(this._effectMenu);

        // Pause toggle — also the panic-shortcut target.
        this._pauseToggle = new PopupMenu.PopupSwitchMenuItem(
            'Paused', this._settings.get_boolean('paused'));
        this._pauseToggle.connect('toggled', (_item, state) => {
            this._settings.set_boolean('paused', state);
        });
        this._indicator.menu.addMenuItem(this._pauseToggle);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Opacity slider
        this._opacityItem = new SettingSliderItem({
            settings: this._settings,
            key: 'opacity',
            min: 0, max: 100,
            label: 'Opacity',
            icon: 'display-brightness-symbolic',
            suffix: '%',
        });
        this._indicator.menu.addMenuItem(this._opacityItem);

        // FPS slider
        this._fpsItem = new SettingSliderItem({
            settings: this._settings,
            key: 'fps',
            min: 5, max: 60,
            label: 'FPS',
            icon: 'preferences-system-time-symbolic',
            format: v => `${v} fps`,
        });
        this._indicator.menu.addMenuItem(this._fpsItem);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Restart + Preferences
        const restart = new PopupMenu.PopupMenuItem('Restart effect');
        restart.connect('activate', () => this._restart());
        this._indicator.menu.addMenuItem(restart);

        const prefs = new PopupMenu.PopupMenuItem('Preferences…');
        prefs.connect('activate', () => this.openPreferences());
        this._indicator.menu.addMenuItem(prefs);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._effectChangedId = this._settings.connect('changed::effect', () => {
            const name = this._settings.get_string('effect');
            this._effectMenu.label.text = `Effect: ${name}`;
            this._markActiveEffect(name);
            this._scheduleApply();
        });
        this._opacityChangedId = this._settings.connect('changed::opacity', () => {
            this._scheduleApply();
        });
        this._configChangedId = this._settings.connect('changed::effect-config', () => {
            this._scheduleApply();
        });
        this._bgModeChangedId = this._settings.connect('changed::background-mode', () => {
            this._scheduleApply();
        });
        this._bgColorChangedId = this._settings.connect('changed::background-color', () => {
            this._scheduleApply();
        });
        this._fpsChangedId = this._settings.connect('changed::fps', () => {
            if (this._runner) this._runner.setFps(this._settings.get_int('fps'));
        });
        this._pausedChangedId = this._settings.connect('changed::paused', () => {
            const p = this._settings.get_boolean('paused');
            if (this._runner) this._runner.setPaused(p);
            if (this._pauseToggle) this._pauseToggle.setToggleState(p);
        });

        this._applyEffect();
    }

    // Routes the currently-selected effect to whichever backend can
    // actually draw it. Phase 1: ported effects (effects-gjs/) render
    // in-shell via Cairo on Clutter.Canvas; everything else falls back
    // to the python daemon — which on GNOME mutter will exit-with-message
    // because no layer-shell, but that's harmless.
    _applyEffect() {
        const name = this._effect();
        const cfgFull = this._readEffectConfig();
        const cfg = cfgFull[name] || {};
        const bgMode = this._settings.get_string('background-mode') || 'solid';
        const bgColor = this._settings.get_string('background-color') || '#000000';

        if (isPorted(name)) {
            // Daemon would be redundant; make sure no stale daemon is left over.
            this._kill();
            this._runner.setBackground(bgMode, bgColor);
            this._runner.setOpacity(this._opacity());
            this._runner.setEffect(name, getEffectFactory(name), cfg);
        } else {
            // Hand off to daemon. Tell runner to render nothing so the
            // background group is clean if user just switched away from a
            // ported effect.
            this._runner.setEffect(null, () => ({update(){}, paint(){}}), {});
            this._runner.setBackground('transparent', '#000000');
            this._spawn();
        }
    }

    _readEffectConfig() {
        try {
            const parsed = JSON.parse(this._settings.get_string('effect-config') || '{}');
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (_) { return {}; }
    }

    disable() {
        if (this._restartTimer) {
            GLib.source_remove(this._restartTimer);
            this._restartTimer = 0;
        }
        if (this._effectChangedId) {
            this._settings.disconnect(this._effectChangedId);
            this._effectChangedId = 0;
        }
        if (this._opacityChangedId) {
            this._settings.disconnect(this._opacityChangedId);
            this._opacityChangedId = 0;
        }
        if (this._configChangedId) {
            this._settings.disconnect(this._configChangedId);
            this._configChangedId = 0;
        }
        if (this._bgModeChangedId) {
            this._settings.disconnect(this._bgModeChangedId);
            this._bgModeChangedId = 0;
        }
        if (this._bgColorChangedId) {
            this._settings.disconnect(this._bgColorChangedId);
            this._bgColorChangedId = 0;
        }
        if (this._fpsChangedId) {
            this._settings.disconnect(this._fpsChangedId);
            this._fpsChangedId = 0;
        }
        if (this._pausedChangedId) {
            this._settings.disconnect(this._pausedChangedId);
            this._pausedChangedId = 0;
        }
        if (this._panicKeyBound) {
            try { Main.wm.removeKeybinding('panic-key'); } catch (_) {}
            this._panicKeyBound = false;
        }
        this._settings = null;

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._effectItems = null;
        this._effectMenu = null;
        this._opacityItem = null;
        this._fpsItem = null;
        this._pauseToggle = null;

        if (this._runner) {
            this._runner.stop();
            this._runner = null;
        }
        this._kill();
    }

    _markActiveEffect(name) {
        if (!this._effectItems) return;
        for (const [n, item] of this._effectItems) {
            item.setOrnament(n === name
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE);
        }
    }

    _effect() {
        return this._settings ? this._settings.get_string('effect') : 'aurora';
    }

    _opacity() {
        return this._settings ? this._settings.get_int('opacity') : 100;
    }

    _spawn() {
        // If the daemon died in under 1.5s last time, it's almost certainly
        // bailing on missing layer-shell / atspi-loop. Stop respawning until
        // disable/re-enable so we don't spam the journal on every knob drag.
        if (this._daemonBroken) return;

        const daemon = GLib.build_filenamev([this.path, 'daemon', 'active-bg-daemon.py']);
        const cfg = this._settings.get_string('effect-config') || '{}';
        const bgMode = this._settings.get_string('background-mode') || 'solid';
        const bgColor = this._settings.get_string('background-color') || '#000000';
        const env = GLib.get_environ()
            .concat([
                `ACTIVE_BG_EFFECT=${this._effect()}`,
                `ACTIVE_BG_OPACITY=${this._opacity()}`,
                `ACTIVE_BG_CONFIG_JSON=${cfg}`,
                `ACTIVE_BG_MODE=${bgMode}`,
                `ACTIVE_BG_COLOR=${bgColor}`,
            ]);

        const spawnTime = GLib.get_monotonic_time();
        try {
            const [, pid] = GLib.spawn_async(
                null,
                ['python3', daemon],
                env,
                GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                null
            );
            this._pid = pid;
            GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {
                GLib.spawn_close_pid(pid);
                if (this._pid === pid) this._pid = 0;
                const aliveMs = (GLib.get_monotonic_time() - spawnTime) / 1000;
                if (aliveMs < 1500) {
                    log(`active-bg: daemon died after ${Math.round(aliveMs)}ms — `
                        + `not respawning automatically (re-enable the extension to retry).`);
                    this._daemonBroken = true;
                }
            });
        } catch (e) {
            logError(e, 'active-bg: failed to spawn daemon');
            this._daemonBroken = true;
        }
    }

    _kill() {
        if (this._pid > 0) {
            try { GLib.spawn_command_line_sync(`kill ${this._pid}`); } catch (_) {}
            this._pid = 0;
        }
    }

    // Debounced re-apply — slider drags otherwise rebuild the runner
    // / respawn the daemon dozens of times per second.
    _scheduleApply() {
        if (this._restartTimer) GLib.source_remove(this._restartTimer);
        this._restartTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, RESTART_DEBOUNCE_MS, () => {
                this._restartTimer = 0;
                if (this._settings) this._applyEffect();
                return GLib.SOURCE_REMOVE;
            });
    }
}
