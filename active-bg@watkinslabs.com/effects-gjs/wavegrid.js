// Wave grid (GJS port). Original used mouse-driven ripples; the wallpaper
// layer doesn't receive mouse events, so the ripple term degenerates to 0
// and we keep only the base wave pattern. Plenty of motion already.
export default function wavegrid(cfg, W, H) {
    const SPACING  = Math.round(cfg.spacing ?? 38);
    const WAVE_SPD = 0.018 * (cfg.speed ?? 1.0);
    const BASE_R   = 1.8;
    const HSH      = cfg.paletteShift ?? 0;
    const SMUL     = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));

    const RIPPLE_R    = cfg.rippleRadius ?? 160;
    const RIPPLE_LIFT = 22;

    const refW = W, refH = H;
    let t = 0;
    let smx = -9999, smy = -9999;

    return {
        update(dt) {
            t += dt * WAVE_SPD * 60;
        },
        paint(ctx, w, h, _t, mx, my) {
            // Smooth cursor pos so ripple eases in/out rather than snapping.
            const lmx = mx >= 0 ? mx * refW / w : -9999;
            const lmy = mx >= 0 ? my * refH / h : -9999;
            if (lmx >= 0) {
                if (smx < 0) { smx = lmx; smy = lmy; }
                else { smx += (lmx - smx) * 0.18; smy += (lmy - smy) * 0.18; }
            } else {
                smx = smy = -9999;
            }

            ctx.save();
            ctx.scale(w / refW, h / refH);
            const cols = Math.ceil(refW / SPACING) + 2;
            const rows = Math.ceil(refH / SPACING) + 2;
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                const bx = c * SPACING, by = r * SPACING;
                const wave = Math.sin(c * 0.38 + r * 0.22 + t) * 0.5
                           + Math.sin(c * 0.18 - r * 0.42 + t * 1.4) * 0.35
                           + Math.sin((c + r) * 0.25 + t * 0.7) * 0.15;
                let pull = 0, ripple = 0;
                if (smx >= 0) {
                    const dx = bx - smx, dy = by - smy;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    pull = Math.max(0, 1 - dist / RIPPLE_R);
                    ripple = pull * Math.sin(dist * 0.07 - t * 4) * RIPPLE_LIFT;
                }
                const bright = (wave + 1) * 0.5;
                const r2 = BASE_R * (0.35 + bright * 0.9 + pull * 1.1);
                const alpha = 0.12 + bright * 0.42 + pull * 0.42;
                const hue = 190 + (c / cols) * 55 + wave * 12 + pull * 20;
                const light = 55 + bright * 20;
                ctx.beginPath();
                ctx.arc(bx, by + ripple * 0.4, r2, 0, Math.PI*2);
                ctx.fillStyle = `hsla(${_H(hue)},${_S(85)}%,${light}%,${alpha})`;
                ctx.fill();
            }
            ctx.restore();
        },
    };
}
