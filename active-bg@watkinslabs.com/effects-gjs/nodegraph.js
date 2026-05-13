// Node graph (GJS port)
export default function nodegraph(cfg, W, H) {
    const N         = Math.round(cfg.count ?? 42);
    const LDIST     = cfg.linkDist ?? 180;
    const SMULT     = cfg.speed ?? 1.0;
    const HSH       = cfg.paletteShift ?? 0;
    const SMUL      = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));

    const refW = W, refH = H;
    const nodes = [];
    const edges = [];
    const pulses = [];
    let pendingMx = -9999, pendingMy = -9999;

    (function build() {
        for (let i = 0; i < N; i++) {
            const tier = Math.floor(Math.random() * 3);
            const r = tier === 0 ? 5 : tier === 1 ? 3.5 : 2;
            nodes.push({
                x: Math.random() * refW,
                y: Math.random() * refH,
                vx: (Math.random() - 0.5) * 0.3 * SMULT,
                vy: (Math.random() - 0.5) * 0.3 * SMULT,
                r, hue: 200 + Math.random() * 50, tier,
            });
        }
        for (let i = 0; i < N; i++) {
            const conns = nodes[i].tier === 0 ? 4 : nodes[i].tier === 1 ? 2 : 1;
            let made = 0;
            for (let j = 0; j < N && made < conns; j++) {
                if (i === j) continue;
                const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
                if (Math.sqrt(dx*dx + dy*dy) < LDIST &&
                    !edges.find(e => (e.a===i && e.b===j) || (e.a===j && e.b===i))) {
                    edges.push({a: i, b: j});
                    made++;
                }
            }
        }
    })();

    return {
        update(dt) {
            const step = dt * 60;
            for (const n of nodes) {
                if (pendingMx >= 0) {
                    const ddx = n.x - pendingMx, ddy = n.y - pendingMy;
                    const dist = Math.sqrt(ddx*ddx + ddy*ddy);
                    if (dist < 120 && dist > 0) {
                        const f = (1 - dist / 120) * 0.4;
                        n.vx += ddx / dist * f * step;
                        n.vy += ddy / dist * f * step;
                    }
                }
                n.x += n.vx * step;
                n.y += n.vy * step;
                if (n.x < 0 || n.x > refW) n.vx *= -1;
                if (n.y < 0 || n.y > refH) n.vy *= -1;
            }
            if (pulses.length < 12 && Math.random() < 0.04 * step) {
                pulses.push({
                    edge: Math.floor(Math.random() * edges.length),
                    pos: 0,
                    speed: 0.008 + Math.random() * 0.01,
                });
            }
            for (let i = pulses.length - 1; i >= 0; i--) {
                pulses[i].pos += pulses[i].speed * step;
                if (pulses[i].pos >= 1) pulses.splice(i, 1);
            }
        },
        paint(ctx, w, h, _t, mx, my) {
            if (mx >= 0) { pendingMx = mx * refW / w; pendingMy = my * refH / h; }
            else { pendingMx = pendingMy = -9999; }
            ctx.save();
            ctx.scale(w / refW, h / refH);
            for (const e of edges) {
                const a = nodes[e.a], b = nodes[e.b];
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = `hsla(${_H(214)},${_S(100)}%,69%,0.35)`;
                ctx.lineWidth = 1; ctx.stroke();
            }
            for (const p of pulses) {
                const e = edges[p.edge];
                if (!e) continue;
                const a = nodes[e.a], b = nodes[e.b];
                const px = a.x + (b.x - a.x) * p.pos;
                const py = a.y + (b.y - a.y) * p.pos;
                const grd = ctx.createRadialGradient(px, py, 0, px, py, 5);
                grd.addColorStop(0, `hsla(${_H(214)},${_S(100)}%,69%,0.9)`);
                grd.addColorStop(1, `hsla(${_H(214)},${_S(100)}%,69%,0)`);
                ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2);
                ctx.fillStyle = grd; ctx.fill();
            }
            for (const n of nodes) {
                const glow = n.tier === 0 ? 12 : n.tier === 1 ? 8 : 5;
                const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glow);
                g.addColorStop(0, `hsla(${_H(n.hue)},${_S(80)}%,70%,0.9)`);
                g.addColorStop(1, `hsla(${_H(n.hue)},${_S(80)}%,70%,0)`);
                ctx.beginPath(); ctx.arc(n.x, n.y, glow, 0, Math.PI*2);
                ctx.fillStyle = g; ctx.fill();
                ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
                ctx.fillStyle = `hsla(${_H(n.hue)},${_S(80)}%,72%,0.95)`; ctx.fill();
            }
            ctx.restore();
        },
    };
}
