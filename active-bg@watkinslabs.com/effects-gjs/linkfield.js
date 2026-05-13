// Link field (GJS port)
export default function linkfield(cfg, W, H) {
    const LINE    = Math.round(cfg.lineHeight ?? 22);
    const SCROLL  = 0.35 * (cfg.scrollSpeed ?? 1.0);
    const LINKP   = cfg.linkChance ?? 0.7;
    const HSH     = cfg.paletteShift ?? 0;
    const SMUL    = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));
    const HUE = _H(200);
    const SAT = _S(100);

    const refW = W, refH = H;
    const citations = [];
    let counter = 1;
    let t = 0;

    function mkCitation(y, idx) {
        const segCount = 4 + Math.floor(Math.random() * 5);
        const segments = [];
        for (let i = 0; i < segCount; i++)
            segments.push({w: 28 + Math.random() * 85, gap: 4 + Math.random() * 4});
        return {
            y,
            num: String(idx).padStart(2, '0'),
            indent: 60,
            segments,
            hasLink: Math.random() < LINKP,
            glow: 0,
            phase: Math.random() * Math.PI * 2,
        };
    }
    (function build() {
        const rows = Math.ceil(refH / LINE) + 4;
        for (let i = 0; i < rows; i++) citations.push(mkCitation(i * LINE, counter++));
    })();

    return {
        update(dt) {
            t += dt * 0.6;
            const step = dt * 60;
            for (const c of citations) {
                c.y -= SCROLL * step;
                if (c.y < -LINE) {
                    c.y += Math.ceil(refH / LINE + 4) * LINE;
                    Object.assign(c, mkCitation(c.y, counter++));
                }
                c.glow *= Math.pow(0.95, step);
            }
            if (Math.random() < 0.04 * step) {
                const c = citations[Math.floor(Math.random() * citations.length)];
                c.glow = 1;
            }
        },
        paint(ctx, w, h, _t, mx, my) {
            ctx.save();
            ctx.scale(w / refW, h / refH);
            const lmx = mx >= 0 ? mx * refW / w : -9999;
            const lmy = mx >= 0 ? my * refH / h : -9999;
            ctx.globalCompositeOperation = 'lighter';
            for (const c of citations) {
                const idle = 0.18 + Math.sin(t * 0.8 + c.phase) * 0.04;
                const mouseDist = lmx >= 0 ? Math.abs(c.y - lmy) : 9999;
                const mouseBoost = mouseDist < 40 ? (1 - mouseDist / 40) * 0.45 : 0;
                const bright = Math.max(idle, c.glow * 0.9) + mouseBoost;
                const fb = Math.min(1, bright);

                const numColor = c.glow > 0.3
                    ? `hsla(${HUE},${SAT}%,78%,${0.9*c.glow + 0.3})`
                    : `hsla(${HUE},${SAT}%,70%,${fb*0.8})`;
                ctx.fillStyle = numColor;
                ctx.font = '10px monospace';
                ctx.textBaseline = 'middle';
                ctx.fillText(`[${c.num}]`, 18, c.y);

                let x = c.indent;
                ctx.fillStyle = `hsla(${HUE},${SAT}%,65%,${fb*0.55})`;
                for (const s of c.segments) {
                    if (x + s.w > refW - 60) break;
                    ctx.fillRect(x, c.y - 2, s.w, 3);
                    x += s.w + s.gap;
                }
                if (c.hasLink) {
                    const lx = Math.min(x + 6, refW - 50), ly = c.y;
                    ctx.strokeStyle = c.glow > 0.3
                        ? `hsla(${HUE},${SAT}%,80%,${0.9*c.glow + 0.4})`
                        : `hsla(${HUE},${SAT}%,70%,${fb*0.7})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.rect(lx, ly - 4.5, 14, 9); ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(lx+10, ly-4.5); ctx.lineTo(lx+16, ly-10.5); ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(lx+16, ly-10.5); ctx.lineTo(lx+12.5, ly-10.5);
                    ctx.moveTo(lx+16, ly-10.5); ctx.lineTo(lx+16, ly-7);
                    ctx.stroke();
                }
                if (c.glow > 0.1) {
                    const g = ctx.createLinearGradient(0, c.y - 8, 0, c.y + 8);
                    g.addColorStop(0,   `hsla(${HUE},${SAT}%,78%,0)`);
                    g.addColorStop(0.5, `hsla(${HUE},${SAT}%,78%,${0.08*c.glow})`);
                    g.addColorStop(1,   `hsla(${HUE},${SAT}%,78%,0)`);
                    ctx.fillStyle = g;
                    ctx.fillRect(0, c.y - 8, refW, 16);
                }
            }
            // Cursor halo
            if (lmx >= 0) {
                const halo = ctx.createRadialGradient(lmx, lmy, 0, lmx, lmy, 90);
                halo.addColorStop(0, `hsla(${_H(192)},${_S(100)}%,50%,0.08)`);
                halo.addColorStop(1, `hsla(${_H(192)},${_S(100)}%,50%,0)`);
                ctx.fillStyle = halo;
                ctx.beginPath(); ctx.arc(lmx, lmy, 90, 0, Math.PI*2); ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.restore();
        },
    };
}
