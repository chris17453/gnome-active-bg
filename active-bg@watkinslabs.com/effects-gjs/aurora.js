// Aurora (GJS port). The math/look matches effects/aurora.js exactly;
// only the host plumbing changes — instead of self-attaching a canvas,
// we expose a factory that returns { update, paint }.

const PALETTE_HEX = [
    '#00C2FF','#0055FF','#6366F1','#7C3AED','#818CF8','#0088DD','#4338CA','#2dd4bf',
];

function hex2hsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return [h, s * 100, l * 100];
}

export default function aurora(cfg, W, H) {
    const N_BANDS  = Math.max(1, Math.round(cfg.bands ?? 14));
    const SPEED    = cfg.speed ?? 1.0;
    const AMP      = cfg.amplitude ?? 1.0;
    const GLOW     = cfg.nodeGlow ?? 1.0;
    const HUE_SH   = cfg.paletteShift ?? 0;
    const SAT_MUL  = cfg.saturation ?? 1.0;

    const _H = h => ((Math.round(h + HUE_SH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));
    const COLS = PALETTE_HEX.map(hex2hsl);
    const tint = (hsl, a) => `hsla(${_H(hsl[0])},${_S(hsl[1])}%,${hsl[2]}%,${a})`;

    // Bands hold no pixel-space data; `bandY` mixes in the current w/h on
    // each draw. Build ONCE — otherwise multi-actor rendering (desktop +
    // thumbnails + apps-view) re-randomizes every frame and the motion
    // looks chaotically fast.
    let bands = [];
    let t = 0;
    let smx = -9999, smy = -9999; // smoothed mouse pos (latched across frames)

    function build() {
        bands = [];
        for (let i = 0; i < N_BANDS; i++) {
            bands.push({
                y: (i + 0.5) / N_BANDS,
                speed: (0.10 + Math.random() * 0.14) * SPEED,
                amp:   (0.04 + Math.random() * 0.06) * AMP,
                freq: 1.2 + Math.random() * 2,
                phase: Math.random() * Math.PI * 2,
                colorIdx: i % COLS.length,
                alpha: 0.14 + Math.random() * 0.13,
            });
        }
    }

    function bandY(b, x, w, h) {
        const nx = x / w;
        const base = b.y * h
            + Math.sin(nx * b.freq * Math.PI * 2 + t * b.speed + b.phase) * b.amp * h
            + Math.sin(nx * b.freq * 0.5 * Math.PI * 2 + t * b.speed * 0.7 + b.phase * 1.3) * b.amp * 0.5 * h;
        if (smx < 0) return base;
        // Gaussian falloff around the cursor X plus a vertical falloff,
        // lifting bands closer to the cursor.
        const mouseWarp = Math.exp(-((x - smx) ** 2) / (w * w * 0.03))
                        * Math.max(0, 1 - Math.abs(b.y * h - smy) / h * 3)
                        * 0.08 * h;
        return base + mouseWarp;
    }

    build();

    return {
        update(dt) {
            t += dt * 0.25; // original ran at ~0.004 per frame * 60fps ≈ 0.24/s
        },
        paint(ctx, w, h, _t, mx, my) {
            // Smooth the mouse pos so warp doesn't jitter; latch a centre
            // when cursor leaves so the warp eases out instead of snapping.
            if (mx >= 0) {
                if (smx < 0) { smx = mx; smy = my; }
                else { smx += (mx - smx) * 0.18; smy += (my - smy) * 0.18; }
            } else if (smx >= 0) {
                // ease toward an invalid sentinel
                smx = -9999; smy = -9999;
            }
            for (const b of bands) {
                const col = COLS[b.colorIdx];
                const pts = [];
                for (let x = 0; x <= w; x += 6) pts.push([x, bandY(b, x, w, h)]);

                // Main line
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
                ctx.strokeStyle = tint(col, Math.min(0.7, b.alpha * 1.3));
                ctx.lineWidth = 1.6;
                ctx.stroke();

                // Soft second pass (replaces shadowBlur halo)
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
                ctx.strokeStyle = tint(col, b.alpha * 0.6);
                ctx.lineWidth = 3.0;
                ctx.stroke();

                // Pulse nodes along each band
                const nodeCount = 3;
                for (let n = 0; n < nodeCount; n++) {
                    const phase = (t * b.speed * 0.4 + n / nodeCount + b.phase * 0.2) % 1;
                    const nx = phase * w;
                    const ny = bandY(b, nx, w, h);
                    const pulse = 0.75 + Math.sin(t * 3 + n + b.phase) * 0.25;

                    const outerR = 36 * pulse * GLOW;
                    const og = ctx.createRadialGradient(nx, ny, 0, nx, ny, outerR);
                    og.addColorStop(0,   tint(col, 0.18 * pulse));
                    og.addColorStop(0.5, tint(col, 0.05 * pulse));
                    og.addColorStop(1,   tint(col, 0));
                    ctx.beginPath();
                    ctx.arc(nx, ny, outerR, 0, Math.PI * 2);
                    ctx.fillStyle = og;
                    ctx.fill();

                    const innerR = 10 * pulse * GLOW;
                    const ig = ctx.createRadialGradient(nx, ny, 0, nx, ny, innerR);
                    ig.addColorStop(0, tint(col, 0.55 * pulse));
                    ig.addColorStop(1, tint(col, 0));
                    ctx.beginPath();
                    ctx.arc(nx, ny, innerR, 0, Math.PI * 2);
                    ctx.fillStyle = ig;
                    ctx.fill();

                    ctx.beginPath();
                    ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,255,255,0.75)';
                    ctx.fill();
                }
            }
        },
    };
}
