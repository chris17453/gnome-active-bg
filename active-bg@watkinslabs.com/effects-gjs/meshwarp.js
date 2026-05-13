// Mesh warp (GJS port)
export default function meshwarp(cfg, W, H) {
    const COLS = Math.round(cfg.cols ?? 18);
    const ROWS = Math.round(cfg.rows ?? 12);
    const BASE = 0.004 * (cfg.speed ?? 1.0);
    const HSH  = cfg.paletteShift ?? 0;
    const SMUL = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));

    const refW = W, refH = H;
    let t = 0;
    const cols1 = COLS + 1;
    // Allocate positions once; recompute at paint time from refW/refH.
    const pts = [];
    for (let r = 0; r <= ROWS; r++)
        for (let c = 0; c <= COLS; c++)
            pts.push({bx: c / COLS * refW, by: r / ROWS * refH, x: 0, y: 0});

    return {
        update(dt) {
            t += dt * BASE * 60;
        },
        paint(ctx, w, h, _t, mx, my) {
            ctx.save();
            ctx.scale(w / refW, h / refH);
            const lmx = mx >= 0 ? mx * refW / w : -9999;
            const lmy = mx >= 0 ? my * refH / h : -9999;
            const dx = refW / COLS, dy = refH / ROWS;
            for (const p of pts) {
                const ox = (Math.sin(p.bx * 0.008 + t) * 0.6 + Math.sin(p.by * 0.01 + t * 1.3) * 0.4) * dx * 0.55;
                const oy = (Math.cos(p.by * 0.009 + t * 0.9) * 0.6 + Math.cos(p.bx * 0.007 + t * 1.1) * 0.4) * dy * 0.55;
                let pullX = 0, pullY = 0;
                if (lmx >= 0) {
                    const ddx = p.bx - lmx, ddy = p.by - lmy;
                    const dist = Math.sqrt(ddx*ddx + ddy*ddy);
                    const pull = Math.max(0, 1 - dist / 200) * 28;
                    if (pull > 0 && dist > 0) {
                        pullX = ddx / dist * -pull;
                        pullY = ddy / dist * -pull;
                    }
                }
                p.x = p.bx + ox + pullX;
                p.y = p.by + oy + pullY;
            }
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
                const tl = pts[r * cols1 + c];
                const tr = pts[r * cols1 + c + 1];
                const bl = pts[(r + 1) * cols1 + c];
                const br = pts[(r + 1) * cols1 + c + 1];
                const cx2 = (tl.x + tr.x + bl.x + br.x) / 4;
                const cy2 = (tl.y + tr.y + bl.y + br.y) / 4;
                const dd = lmx >= 0 ? Math.sqrt((cx2 - lmx) ** 2 + (cy2 - lmy) ** 2) : 9999;
                const glow = lmx >= 0 ? Math.max(0, 1 - dd / 220) : 0;
                const alpha = 0.08 + glow * 0.28;
                const hue = 210 + c / COLS * 45 + Math.sin(t + r * 0.3) * 8;
                ctx.strokeStyle = `hsla(${_H(hue)},${_S(80)}%,65%,${alpha})`;
                ctx.lineWidth = 0.8 + glow * 1.2;
                ctx.beginPath();
                ctx.moveTo(tl.x, tl.y);
                ctx.lineTo(tr.x, tr.y);
                ctx.lineTo(br.x, br.y);
                ctx.lineTo(bl.x, bl.y);
                ctx.closePath();
                ctx.stroke();
                if (glow > 0.15) {
                    ctx.fillStyle = `hsla(${_H(hue)},${_S(80)}%,65%,${glow * 0.06})`;
                    ctx.fill();
                }
            }
            ctx.restore();
        },
    };
}
