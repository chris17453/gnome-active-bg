// cairo-shim.js
// Canvas-2D-shaped façade over Cairo. Used by both the in-shell renderer
// (runtime.js) and the prefs window's live preview. Pure GJS — no
// gnome-shell-only imports — so it loads fine in the prefs process.

import Cairo from 'gi://cairo';

// ───────────────────────────────────────────────────────────── color parsing
// Returns [r,g,b,a] floats in [0,1]. Supports:
//   #rgb, #rrggbb, #rrggbbaa
//   rgba(r,g,b,a) / rgb(r,g,b)
//   hsla(h,s%,l%,a) / hsl(h,s%,l%)
// Anything else → opaque white (so a typo shows up, not silent black).
export function parseColor(str) {
    if (!str) return [1, 1, 1, 1];
    if (typeof str !== 'string') return [1, 1, 1, 1];
    const s = str.trim();

    if (s.startsWith('#')) {
        const hex = s.slice(1);
        if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16) / 255;
            const g = parseInt(hex[1] + hex[1], 16) / 255;
            const b = parseInt(hex[2] + hex[2], 16) / 255;
            return [r, g, b, 1];
        }
        if (hex.length === 6 || hex.length === 8) {
            const r = parseInt(hex.slice(0, 2), 16) / 255;
            const g = parseInt(hex.slice(2, 4), 16) / 255;
            const b = parseInt(hex.slice(4, 6), 16) / 255;
            const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
            return [r, g, b, a];
        }
    }

    let m = s.match(/^rgba?\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*(?:,\s*([+-]?\d*\.?\d+))?\s*\)$/);
    if (m) {
        return [
            (+m[1]) / 255,
            (+m[2]) / 255,
            (+m[3]) / 255,
            m[4] !== undefined ? +m[4] : 1,
        ];
    }

    m = s.match(/^hsla?\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)%\s*,\s*([+-]?\d*\.?\d+)%\s*(?:,\s*([+-]?\d*\.?\d+))?\s*\)$/);
    if (m) {
        const h = ((+m[1]) % 360 + 360) % 360;
        const s2 = (+m[2]) / 100;
        const l = (+m[3]) / 100;
        const a = m[4] !== undefined ? +m[4] : 1;
        const c = (1 - Math.abs(2 * l - 1)) * s2;
        const hh = h / 60;
        const x = c * (1 - Math.abs(hh % 2 - 1));
        let r1 = 0, g1 = 0, b1 = 0;
        if (hh < 1)      { r1 = c; g1 = x; }
        else if (hh < 2) { r1 = x; g1 = c; }
        else if (hh < 3) { g1 = c; b1 = x; }
        else if (hh < 4) { g1 = x; b1 = c; }
        else if (hh < 5) { r1 = x; b1 = c; }
        else             { r1 = c; b1 = x; }
        const m2 = l - c / 2;
        return [r1 + m2, g1 + m2, b1 + m2, a];
    }
    return [1, 1, 1, 1];
}

// ───────────────────────────────────────────────────────────────── gradient
class Gradient {
    constructor(kind, params) {
        this._kind = kind;
        this._params = params;
        this._stops = [];
    }
    addColorStop(offset, color) {
        this._stops.push([offset, parseColor(color)]);
    }
    _build() {
        let pat;
        if (this._kind === 'linear') {
            const [x0, y0, x1, y1] = this._params;
            pat = new Cairo.LinearGradient(x0, y0, x1, y1);
        } else {
            const [x0, y0, r0, x1, y1, r1] = this._params;
            pat = new Cairo.RadialGradient(x0, y0, r0, x1, y1, r1);
        }
        for (const [off, [r, g, b, a]] of this._stops) {
            pat.addColorStopRGBA(off, r, g, b, a);
        }
        return pat;
    }
}

// ─────────────────────────────────────────────────────────────── Canvas2D
export class Canvas2D {
    constructor(cr, w, h) {
        this._cr = cr;
        this.width = w;
        this.height = h;
        this._fill = [1, 1, 1, 1];
        this._stroke = [1, 1, 1, 1];
        this._fillIsGrad = false;
        this._strokeIsGrad = false;
        this._lineWidth = 1;
        this._globalAlpha = 1;
        this._font = { size: 13, family: 'sans-serif', weight: 'normal' };
        this._textAlign = 'start';
        this._textBaseline = 'alphabetic';
        cr.setLineWidth(1);
        cr.setAntialias(Cairo.Antialias.GOOD);
    }

    set fillStyle(v)   { if (v instanceof Gradient) { this._fill = v; this._fillIsGrad = true; }
                        else { this._fill = parseColor(v); this._fillIsGrad = false; } }
    set strokeStyle(v) { if (v instanceof Gradient) { this._stroke = v; this._strokeIsGrad = true; }
                        else { this._stroke = parseColor(v); this._strokeIsGrad = false; } }
    set lineWidth(v)   { this._lineWidth = v; this._cr.setLineWidth(v); }
    set globalAlpha(v) { this._globalAlpha = Math.max(0, Math.min(1, v)); }
    set globalCompositeOperation(v) {
        const map = {
            'source-over': Cairo.Operator.OVER,
            'lighter':     Cairo.Operator.ADD,
            'destination-out': Cairo.Operator.DEST_OUT,
            'multiply':    Cairo.Operator.MULTIPLY,
            'screen':      Cairo.Operator.SCREEN,
        };
        if (map[v] !== undefined) this._cr.setOperator(map[v]);
    }
    set shadowBlur(_)    {}
    set shadowColor(_)   {}
    set shadowOffsetX(_) {}
    set shadowOffsetY(_) {}
    set font(v) {
        if (typeof v !== 'string') return;
        const m = v.match(/(?:(bold|[1-9]\d{2})\s+)?(\d+(?:\.\d+)?)px\s+(.+)/);
        if (!m) return;
        const weight = m[1];
        const size = parseFloat(m[2]);
        const family = m[3].split(',')[0].replace(/['"]/g, '').trim();
        this._font = { size, family, weight: weight || 'normal' };
        const slant = Cairo.FontSlant.NORMAL;
        const wt = (weight === 'bold' || (+weight >= 600))
            ? Cairo.FontWeight.BOLD : Cairo.FontWeight.NORMAL;
        this._cr.selectFontFace(family, slant, wt);
        this._cr.setFontSize(size);
    }
    set textAlign(v)    { this._textAlign = v; }
    set textBaseline(v) { this._textBaseline = v; }

    beginPath()         { this._cr.newPath(); }
    closePath()         { this._cr.closePath(); }
    moveTo(x, y)        { this._cr.moveTo(x, y); }
    lineTo(x, y)        { this._cr.lineTo(x, y); }
    arc(x, y, r, a1, a2, ccw) {
        if (ccw) this._cr.arcNegative(x, y, r, a1, a2);
        else     this._cr.arc(x, y, r, a1, a2);
    }
    rect(x, y, w, h)    { this._cr.rectangle(x, y, w, h); }
    quadraticCurveTo(cx, cy, x, y) { this._cr.curveTo(cx, cy, cx, cy, x, y); }

    fill() { this._applyFill(); this._cr.fill(); }
    stroke() { this._applyStroke(); this._cr.stroke(); }
    fillRect(x, y, w, h) {
        this._cr.rectangle(x, y, w, h);
        this._applyFill(); this._cr.fill();
    }
    strokeRect(x, y, w, h) {
        this._cr.rectangle(x, y, w, h);
        this._applyStroke(); this._cr.stroke();
    }
    clearRect(x, y, w, h) {
        this._cr.save();
        this._cr.rectangle(x, y, w, h);
        this._cr.setOperator(Cairo.Operator.CLEAR);
        this._cr.fill();
        this._cr.restore();
    }

    save()             { this._cr.save(); }
    restore()          { this._cr.restore(); }
    translate(x, y)    { this._cr.translate(x, y); }
    rotate(a)          { this._cr.rotate(a); }
    scale(sx, sy)      { this._cr.scale(sx, sy); }

    fillText(text, x, y) {
        if (text == null) return;
        text = String(text);
        const ext = this._cr.textExtents(text);
        let dx = 0;
        if (this._textAlign === 'center') dx = -ext.width / 2 - ext.xBearing;
        else if (this._textAlign === 'right' || this._textAlign === 'end')
            dx = -ext.width - ext.xBearing;
        let dy = 0;
        if (this._textBaseline === 'middle')
            dy = -ext.yBearing / 2 - ext.height / 2 + this._font.size * 0.35;
        else if (this._textBaseline === 'top') dy = this._font.size * 0.85;
        this._applyFill();
        this._cr.moveTo(x + dx, y + dy);
        this._cr.showText(text);
        this._cr.newPath();
    }
    measureText(text) {
        const e = this._cr.textExtents(String(text || ''));
        return { width: e.width };
    }

    createLinearGradient(x0, y0, x1, y1) {
        return new Gradient('linear', [x0, y0, x1, y1]);
    }
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
        return new Gradient('radial', [x0, y0, r0, x1, y1, r1]);
    }

    _applyFill() {
        if (this._fillIsGrad) {
            this._cr.setSource(this._fill._build());
        } else {
            const [r, g, b, a] = this._fill;
            this._cr.setSourceRGBA(r, g, b, a * this._globalAlpha);
        }
    }
    _applyStroke() {
        if (this._strokeIsGrad) {
            this._cr.setSource(this._stroke._build());
        } else {
            const [r, g, b, a] = this._stroke;
            this._cr.setSourceRGBA(r, g, b, a * this._globalAlpha);
        }
    }
}
