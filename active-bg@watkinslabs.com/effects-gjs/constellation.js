// Constellation (GJS port). The original pre-rendered a circular star
// sprite; here we inline a radial gradient per draw — Cairo handles it
// fine and we avoid adding drawImage support to the shim.
export default function constellation(cfg, W, H) {
    const N         = Math.round(cfg.stars ?? 70);
    const CONN      = cfg.linkDist ?? 140;
    const CONN_SQ   = CONN * CONN;
    const SPEED     = cfg.speed ?? 1.0;
    const HSH       = cfg.paletteShift ?? 0;
    const SMUL      = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));

    const refW = W, refH = H;
    const stars = [];
    let t = 0;

    (function build() {
        for (let i = 0; i < N; i++) {
            stars.push({
                x: Math.random() * refW,
                y: Math.random() * refH,
                vx: (Math.random() - 0.5) * 0.15 * SPEED,
                vy: (Math.random() - 0.5) * 0.15 * SPEED,
                r: Math.random() * 7 + 6,
                hue: 195 + Math.random() * 35,
                alpha: 0.55 + Math.random() * 0.4,
                phase: Math.random() * Math.PI * 2,
            });
        }
    })();

    return {
        update(dt) {
            t += dt * 0.18; // original: t+=0.003 at 60fps
            const step = dt * 60;
            for (const s of stars) {
                s.x += s.vx * step;
                s.y += s.vy * step;
                if (s.x < 0) s.x = refW; else if (s.x > refW) s.x = 0;
                if (s.y < 0) s.y = refH; else if (s.y > refH) s.y = 0;
            }
        },
        paint(ctx, w, h, _t, mx, my) {
            ctx.save();
            ctx.scale(w / refW, h / refH);
            // Translate cursor into the same logical (refW × refH) space.
            const lmx = mx >= 0 ? mx * refW / w : -9999;
            const lmy = mx >= 0 ? my * refH / h : -9999;
            ctx.globalCompositeOperation = 'lighter';

            // Connection lines (star-to-star and star-to-cursor)
            for (let i = 0; i < stars.length; i++) {
                const a = stars[i];
                for (let j = i + 1; j < stars.length; j++) {
                    const b = stars[j];
                    const dx = a.x - b.x, dy = a.y - b.y, dSq = dx*dx + dy*dy;
                    if (dSq > CONN_SQ) continue;
                    const k = 1 - Math.sqrt(dSq) / CONN;
                    ctx.strokeStyle = `hsla(${_H(204)},${_S(100)}%,66%,${0.28 * k})`;
                    ctx.lineWidth = 1.2 * k + 0.3;
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                }
                if (lmx >= 0) {
                    const dx = a.x - lmx, dy = a.y - lmy, dSq = dx*dx + dy*dy;
                    if (dSq < 40000) {
                        const k = 1 - Math.sqrt(dSq) / 200;
                        ctx.strokeStyle = `hsla(${_H(204)},${_S(100)}%,75%,${0.6 * k})`;
                        ctx.lineWidth = 1.4 * k + 0.4;
                        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(lmx, lmy); ctx.stroke();
                    }
                }
            }

            // Stars (radial gradient sprite, inline)
            for (const s of stars) {
                const twinkle = s.alpha * (0.75 + Math.sin(t * 2 + s.phase) * 0.25);
                const r = s.r;
                const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
                grd.addColorStop(0,    `hsla(${_H(204)},${_S(100)}%,93%,${twinkle})`);
                grd.addColorStop(0.15, `hsla(${_H(204)},${_S(100)}%,77%,${twinkle*0.85})`);
                grd.addColorStop(0.4,  `hsla(${_H(204)},${_S(100)}%,62%,${twinkle*0.35})`);
                grd.addColorStop(1,    `hsla(${_H(204)},${_S(100)}%,43%,0)`);
                ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI*2);
                ctx.fillStyle = grd; ctx.fill();
            }

            // Cursor "star" — a small twinkling node at the pointer
            if (lmx >= 0) {
                const grd = ctx.createRadialGradient(lmx, lmy, 0, lmx, lmy, 14);
                grd.addColorStop(0,    `hsla(${_H(204)},${_S(100)}%,93%,0.95)`);
                grd.addColorStop(0.4,  `hsla(${_H(204)},${_S(100)}%,62%,0.4)`);
                grd.addColorStop(1,    `hsla(${_H(204)},${_S(100)}%,43%,0)`);
                ctx.beginPath(); ctx.arc(lmx, lmy, 14, 0, Math.PI*2);
                ctx.fillStyle = grd; ctx.fill();
            }

            ctx.globalCompositeOperation = 'source-over';
            ctx.restore();
        },
    };
}
