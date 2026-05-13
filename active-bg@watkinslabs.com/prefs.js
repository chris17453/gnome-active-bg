import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {Canvas2D, parseColor} from './cairo-shim.js';
import {getEffectFactory} from './effects-gjs/index.js';

const EFFECT_ORDER = [
    'aurora','blueprint','circuit','coderain','constellation',
    'linkfield','meshwarp','neural','nodegraph','particles',
    'phaseflow','radar','scanner','signalrings','wavegrid',
];

function loadManifest(extPath) {
    const path = GLib.build_filenamev([extPath, 'effects', 'manifest.json']);
    const [ok, contents] = GLib.file_get_contents(path);
    if (!ok) return {};
    try {
        const text = new TextDecoder('utf-8').decode(contents);
        return JSON.parse(text);
    } catch (e) {
        return {};
    }
}

function readEffectConfig(settings) {
    try {
        const parsed = JSON.parse(settings.get_string('effect-config') || '{}');
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writeEffectConfig(settings, full) {
    settings.set_string('effect-config', JSON.stringify(full));
}

function patchEffectKnob(settings, effect, key, value) {
    const full = readEffectConfig(settings);
    const sub = (full[effect] && typeof full[effect] === 'object') ? full[effect] : {};
    sub[key] = value;
    full[effect] = sub;
    writeEffectConfig(settings, full);
}

function resetEffectKnobs(settings, effect) {
    const full = readEffectConfig(settings);
    delete full[effect];
    writeEffectConfig(settings, full);
}

// Mix knob defaults from the manifest with the user's per-effect overrides.
function resolveCfg(manifest, effect, overrides) {
    const out = {};
    const entry = manifest[effect];
    if (entry && entry.knobs) {
        for (const k of entry.knobs) out[k.key] = k.default;
    }
    if (overrides && typeof overrides === 'object')
        Object.assign(out, overrides);
    return out;
}

export default class ActiveBgPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const manifest = loadManifest(this.path);

        window.set_default_size(820, 720);

        const page = new Adw.PreferencesPage({
            title: 'Active BG',
            icon_name: 'preferences-desktop-wallpaper-symbolic',
        });
        window.add(page);

        // ── Effect picker + preview ─────────────────────────────────────
        const effectGroup = new Adw.PreferencesGroup({
            title: 'Effect',
            description: 'Pick the animation to display behind your desktop.',
        });
        page.add(effectGroup);

        const model = new Gtk.StringList();
        for (const name of EFFECT_ORDER) {
            const label = (manifest[name] && manifest[name].label) || name;
            model.append(label);
        }
        const cur = EFFECT_ORDER.indexOf(settings.get_string('effect'));
        const effectRow = new Adw.ComboRow({
            title: 'Animation',
            subtitle: 'Each effect is a self-contained canvas animation.',
            model,
            selected: cur >= 0 ? cur : 0,
        });
        effectGroup.add(effectRow);

        // Embedded live preview — same Cairo runtime the shell uses, so
        // what you see here is exactly what the desktop will render.
        // No WebKit subprocess, no fd storm, no D-Bus chatter.
        const previewFrame = new Gtk.Frame({
            margin_top: 6, margin_bottom: 6,
            margin_start: 6, margin_end: 6,
        });
        const previewArea = new Gtk.DrawingArea({
            hexpand: true,
            height_request: 260,
            content_width: 640,
            content_height: 260,
        });
        previewFrame.set_child(previewArea);
        effectGroup.add(previewFrame);

        // Reference logical size used by the effect; the DrawingArea
        // renders into its actual size and effects scale themselves.
        const PREVIEW_REF_W = 1600, PREVIEW_REF_H = 900;
        let previewEffect = null;
        let previewEffectName = null;
        let previewLastTick = 0;
        let previewT = 0;

        function rebuildPreviewEffect() {
            const name = settings.get_string('effect');
            const factory = getEffectFactory(name);
            if (!factory) { previewEffect = null; previewEffectName = name; return; }
            const cfg = resolveCfg(manifest, name, readEffectConfig(settings)[name]);
            try {
                previewEffect = factory(cfg, PREVIEW_REF_W, PREVIEW_REF_H);
            } catch (e) {
                logError(e, `active-bg prefs: failed to build effect ${name}`);
                previewEffect = null;
            }
            previewEffectName = name;
            previewT = 0;
        }
        rebuildPreviewEffect();

        previewArea.set_draw_func((_area, cr, w, h) => {
            // Background fill matches the runtime's choices.
            const bgMode = settings.get_string('background-mode') || 'solid';
            if (bgMode === 'solid') {
                const [r, g, b, a] = parseColor(settings.get_string('background-color') || '#000000');
                cr.setSourceRGBA(r, g, b, a);
                cr.rectangle(0, 0, w, h);
                cr.fill();
            } else {
                // For prefs we just paint a checkerboard so the user can see
                // the effect against a transparency-implying backdrop.
                cr.setSourceRGBA(0.12, 0.12, 0.14, 1);
                cr.rectangle(0, 0, w, h);
                cr.fill();
            }
            if (previewEffect && previewEffect.paint) {
                const ctx = new Canvas2D(cr, w, h);
                try { previewEffect.paint(ctx, w, h, previewT, -9999, -9999); }
                catch (e) { logError(e, 'active-bg prefs: paint threw'); }
            }
        });

        // Drive the preview at ~24 fps from a single tick timer scoped to
        // the prefs window. Pauses automatically when the window closes.
        const PREVIEW_FPS = 24;
        const PREVIEW_INTERVAL_MS = Math.round(1000 / PREVIEW_FPS);
        let previewTimerId = 0;
        function startPreviewLoop() {
            if (previewTimerId) return;
            previewTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE,
                PREVIEW_INTERVAL_MS, () => {
                    const now = GLib.get_monotonic_time();
                    const dt = previewLastTick ? (now - previewLastTick) / 1e6 : 1 / PREVIEW_FPS;
                    previewLastTick = now;
                    previewT += dt;
                    if (previewEffect && previewEffect.update) {
                        try { previewEffect.update(dt, previewT); }
                        catch (e) { logError(e, 'active-bg prefs: update threw'); }
                    }
                    previewArea.queue_draw();
                    return GLib.SOURCE_CONTINUE;
                });
        }
        startPreviewLoop();

        const stopPreviewLoop = () => {
            if (previewTimerId) {
                GLib.source_remove(previewTimerId);
                previewTimerId = 0;
            }
        };

        // ── Per-effect knob group (rebuilt on effect change) ──────────────
        const knobGroup = new Adw.PreferencesGroup({
            title: 'Effect options',
            description: 'Fine-tune the currently selected animation.',
        });
        page.add(knobGroup);

        let knobRows = [];
        const removeKnobRows = () => {
            for (const row of knobRows) knobGroup.remove(row);
            knobRows = [];
        };

        // Debounce effect-rebuild on rapid setting changes (knob drags).
        let _previewTimer = 0;
        const refreshPreview = () => {
            if (_previewTimer) GLib.source_remove(_previewTimer);
            _previewTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
                _previewTimer = 0;
                rebuildPreviewEffect();
                previewArea.queue_draw();
                return GLib.SOURCE_REMOVE;
            });
        };

        const buildKnobsFor = (effect) => {
            removeKnobRows();
            const entry = manifest[effect];
            if (!entry || !entry.knobs || entry.knobs.length === 0) {
                const empty = new Adw.ActionRow({
                    title: 'No options',
                    subtitle: 'This effect has no tunable knobs.',
                });
                knobGroup.add(empty);
                knobRows.push(empty);
                return;
            }

            const currentSub = readEffectConfig(settings)[effect] || {};
            for (const knob of entry.knobs) {
                const row = makeKnobRow(settings, manifest, effect, knob, currentSub, refreshPreview);
                knobGroup.add(row);
                knobRows.push(row);
            }

            const resetRow = new Adw.ActionRow({
                title: 'Reset to defaults',
                subtitle: 'Clear any overrides for this effect.',
            });
            const resetBtn = new Gtk.Button({
                label: 'Reset',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            resetBtn.connect('clicked', () => {
                resetEffectKnobs(settings, effect);
                buildKnobsFor(effect);
                refreshPreview();
            });
            resetRow.add_suffix(resetBtn);
            resetRow.activatable_widget = resetBtn;
            knobGroup.add(resetRow);
            knobRows.push(resetRow);
        };

        effectRow.connect('notify::selected', () => {
            const name = EFFECT_ORDER[effectRow.selected];
            settings.set_string('effect', name);
        });
        settings.connect('changed::effect', () => {
            const name = settings.get_string('effect');
            const idx = EFFECT_ORDER.indexOf(name);
            if (idx >= 0 && idx !== effectRow.selected) effectRow.selected = idx;
            buildKnobsFor(name);
            refreshPreview();
        });
        settings.connect('changed::effect-config', () => refreshPreview());
        settings.connect('changed::opacity', () => refreshPreview());

        buildKnobsFor(settings.get_string('effect'));
        refreshPreview();

        window.connect('close-request', () => {
            if (_previewTimer) {
                GLib.source_remove(_previewTimer);
                _previewTimer = 0;
            }
            stopPreviewLoop();
            previewEffect = null;
            return false;
        });

        // ── Appearance group ───────────────────────────────────────────
        const appearanceGroup = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Choose the backdrop the effect paints over.',
        });
        page.add(appearanceGroup);

        // Background mode (solid color vs. show real wallpaper)
        const bgModes = ['solid', 'transparent'];
        const bgModeLabels = ['Solid color', 'Show GNOME wallpaper'];
        const bgModeList = new Gtk.StringList();
        for (const lbl of bgModeLabels) bgModeList.append(lbl);
        const curBgMode = bgModes.indexOf(settings.get_string('background-mode'));
        const bgModeRow = new Adw.ComboRow({
            title: 'Background',
            subtitle: 'Use a solid color, or let the real desktop wallpaper bleed through (requires layer-shell support).',
            model: bgModeList,
            selected: curBgMode >= 0 ? curBgMode : 0,
        });
        bgModeRow.connect('notify::selected', () => {
            settings.set_string('background-mode', bgModes[bgModeRow.selected]);
        });
        settings.connect('changed::background-mode', () => {
            const i = bgModes.indexOf(settings.get_string('background-mode'));
            if (i >= 0 && i !== bgModeRow.selected) bgModeRow.selected = i;
            bgColorRow.set_sensitive(bgModes[bgModeRow.selected] === 'solid');
        });
        appearanceGroup.add(bgModeRow);

        // Background color
        const bgColorRow = new Adw.ActionRow({
            title: 'Background color',
            subtitle: 'Only used when Background = Solid color.',
        });
        const bgColorBtn = new Gtk.ColorDialogButton({
            valign: Gtk.Align.CENTER,
            dialog: new Gtk.ColorDialog({with_alpha: false}),
        });
        const initialRgba = new Gdk.RGBA();
        if (!initialRgba.parse(settings.get_string('background-color') || '#000000'))
            initialRgba.parse('#000000');
        bgColorBtn.set_rgba(initialRgba);
        bgColorBtn.connect('notify::rgba', () => {
            const c = bgColorBtn.get_rgba();
            // Hex string #RRGGBB
            const hex =
                '#' + [c.red, c.green, c.blue]
                    .map(v => Math.round(v * 255).toString(16).padStart(2, '0'))
                    .join('').toUpperCase();
            settings.set_string('background-color', hex);
        });
        settings.connect('changed::background-color', () => {
            const rgba = new Gdk.RGBA();
            if (rgba.parse(settings.get_string('background-color') || '#000000'))
                bgColorBtn.set_rgba(rgba);
        });
        bgColorRow.add_suffix(bgColorBtn);
        bgColorRow.set_sensitive(settings.get_string('background-mode') === 'solid');
        appearanceGroup.add(bgColorRow);

        const opacityRow = new Adw.ActionRow({
            title: 'Opacity',
            subtitle: '0% lets the real wallpaper show through completely.',
        });
        const opacityScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 100, step_increment: 1, page_increment: 10,
                value: settings.get_int('opacity'),
            }),
            digits: 0,
            draw_value: true,
            value_pos: Gtk.PositionType.RIGHT,
            hexpand: true,
            width_request: 260,
            valign: Gtk.Align.CENTER,
        });
        opacityScale.add_mark(0, Gtk.PositionType.BOTTOM, '0');
        opacityScale.add_mark(50, Gtk.PositionType.BOTTOM, '50');
        opacityScale.add_mark(100, Gtk.PositionType.BOTTOM, '100');
        opacityScale.connect('value-changed', () => {
            settings.set_int('opacity', Math.round(opacityScale.get_value()));
        });
        settings.connect('changed::opacity', () => {
            const v = settings.get_int('opacity');
            if (Math.round(opacityScale.get_value()) !== v)
                opacityScale.set_value(v);
        });
        opacityRow.add_suffix(opacityScale);
        appearanceGroup.add(opacityRow);

        // FPS row — lower values dramatically reduce CPU/GPU cost.
        const fpsRow = new Adw.ActionRow({
            title: 'Framerate',
            subtitle: 'Frames per second the renderer targets. 24 is plenty for ambient motion; lower if you want to save battery.',
        });
        const fpsScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 5, upper: 60, step_increment: 1, page_increment: 5,
                value: settings.get_int('fps'),
            }),
            digits: 0,
            draw_value: true,
            value_pos: Gtk.PositionType.RIGHT,
            hexpand: true,
            width_request: 260,
            valign: Gtk.Align.CENTER,
        });
        fpsScale.add_mark(10, Gtk.PositionType.BOTTOM, '10');
        fpsScale.add_mark(30, Gtk.PositionType.BOTTOM, '30');
        fpsScale.add_mark(60, Gtk.PositionType.BOTTOM, '60');
        fpsScale.connect('value-changed', () => {
            settings.set_int('fps', Math.round(fpsScale.get_value()));
        });
        settings.connect('changed::fps', () => {
            const v = settings.get_int('fps');
            if (Math.round(fpsScale.get_value()) !== v) fpsScale.set_value(v);
        });
        fpsRow.add_suffix(fpsScale);
        appearanceGroup.add(fpsRow);

        // ── Daemon group ───────────────────────────────────────────────
        const daemonGroup = new Adw.PreferencesGroup({title: 'Daemon'});
        page.add(daemonGroup);

        const restartRow = new Adw.ActionRow({
            title: 'Restart effect',
            subtitle: 'Force a fresh daemon process. Use if the effect freezes.',
        });
        const restartBtn = new Gtk.Button({
            label: 'Restart',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        restartBtn.connect('clicked', () => {
            // Bump-then-restore to force a changed::effect signal.
            const cur = settings.get_string('effect');
            const tmp = EFFECT_ORDER.find(e => e !== cur) || cur;
            settings.set_string('effect', tmp);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                settings.set_string('effect', cur);
                return GLib.SOURCE_REMOVE;
            });
        });
        restartRow.add_suffix(restartBtn);
        restartRow.activatable_widget = restartBtn;
        daemonGroup.add(restartRow);

        const previewRow = new Adw.ActionRow({
            title: 'Preview all effects',
            subtitle: 'Open the browser grid (index.html) to compare every effect at full size.',
        });
        const previewBtn = new Gtk.Button({
            label: 'Open Grid',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        previewBtn.connect('clicked', () => {
            const indexPath = GLib.build_filenamev([this.path, 'index.html']);
            Gtk.show_uri(window, GLib.filename_to_uri(indexPath, null), 0);
        });
        previewRow.add_suffix(previewBtn);
        previewRow.activatable_widget = previewBtn;
        daemonGroup.add(previewRow);
    }
}

function makeKnobRow(settings, manifest, effect, knob, currentSub, onPreview) {
    const initial = (currentSub[knob.key] !== undefined)
        ? currentSub[knob.key]
        : knob.default;

    if (knob.type === 'choice') {
        const list = new Gtk.StringList();
        for (const opt of knob.options) list.append(opt);
        const idx = Math.max(0, knob.options.indexOf(initial));
        const row = new Adw.ComboRow({
            title: knob.label,
            subtitle: knob.help || '',
            model: list,
            selected: idx,
        });
        row.connect('notify::selected', () => {
            patchEffectKnob(settings, effect, knob.key, knob.options[row.selected]);
        });
        return row;
    }

    // Numeric (int or float) → Adw.ActionRow with a Gtk.Scale suffix.
    const row = new Adw.ActionRow({
        title: knob.label,
        subtitle: knob.help || '',
    });
    const step = knob.step ?? (knob.type === 'int' ? 1 : 0.1);
    const digits = knob.type === 'int' ? 0 : 2;
    const scale = new Gtk.Scale({
        orientation: Gtk.Orientation.HORIZONTAL,
        adjustment: new Gtk.Adjustment({
            lower: knob.min, upper: knob.max,
            step_increment: step, page_increment: step * 10,
            value: initial,
        }),
        digits,
        draw_value: true,
        value_pos: Gtk.PositionType.RIGHT,
        hexpand: true,
        width_request: 240,
        valign: Gtk.Align.CENTER,
    });
    // Debounce writes so slider drags don't flood the daemon.
    let writeTimer = 0;
    scale.connect('value-changed', () => {
        const raw = scale.get_value();
        const v = knob.type === 'int' ? Math.round(raw) : Math.round(raw * 100) / 100;
        if (writeTimer) GLib.source_remove(writeTimer);
        writeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            writeTimer = 0;
            patchEffectKnob(settings, effect, knob.key, v);
            return GLib.SOURCE_REMOVE;
        });
    });
    row.add_suffix(scale);
    return row;
}
