// Circuit board (GJS port)
export default function circuit(cfg, W, H) {
    const TRACES = Math.round(cfg.traceCount ?? 22);
    const PMUL   = cfg.pulseRate ?? 1.0;
    const HSH    = cfg.paletteShift ?? 0;
    const SMUL   = cfg.saturation ?? 1.0;
    const HBASE  = (((cfg.hue ?? 200) + HSH) % 360 + 360) % 360;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));

    const GRID = 48;
    const refW = W, refH = H;
    const traces = [];
    const pulses = [];

    (function buildTraces() {
        const cols = Math.ceil(refW / GRID) + 1;
        const rows = Math.ceil(refH / GRID) + 1;
        for (let i = 0; i < TRACES; i++) {
            const pts = [{x: Math.floor(Math.random() * cols) * GRID, y: Math.floor(Math.random() * rows) * GRID}];
            const steps = 4 + Math.floor(Math.random() * 6);
            for (let s = 0; s < steps; s++) {
                const last = pts[pts.length - 1];
                const dir = Math.floor(Math.random() * 4);
                const len = (1 + Math.floor(Math.random() * 3)) * GRID;
                let nx = last.x, ny = last.y;
                if (dir === 0) nx += len;
                if (dir === 1) nx -= len;
                if (dir === 2) ny += len;
                if (dir === 3) ny -= len;
                if (nx < 0 || nx > refW || ny < 0 || ny > refH) break;
                pts.push({x: nx, y: ny});
            }
            if (pts.length > 1) traces.push({pts, hue: HBASE - 5 + Math.random() * 35});
        }
    })();

    function traceLen(t) {
        let l = 0;
        for (let i = 1; i < t.pts.length; i++) {
            const dx = t.pts[i].x - t.pts[i-1].x, dy = t.pts[i].y - t.pts[i-1].y;
            l += Math.sqrt(dx*dx + dy*dy);
        }
        return l;
    }
    function ptAt(t, frac) {
        const total = traceLen(t);
        let dist = frac * total, acc = 0;
        for (let i = 1; i < t.pts.length; i++) {
            const dx = t.pts[i].x - t.pts[i-1].x, dy = t.pts[i].y - t.pts[i-1].y;
            const seg = Math.sqrt(dx*dx + dy*dy);
            if (acc + seg >= dist) {
                const r = (dist - acc) / seg;
                return {x: t.pts[i-1].x + dx*r, y: t.pts[i-1].y + dy*r};
            }
            acc += seg;
        }
        return t.pts[t.pts.length - 1];
    }

    return {
        update(dt) {
            const step = dt * 60;
            if (pulses.length < 18 && Math.random() < 0.06 * PMUL * step) {
                pulses.push({
                    trace: Math.floor(Math.random() * traces.length),
                    pos: 0,
                    speed: (0.6 + Math.random() * 1) * PMUL,
                    len: 0.15 + Math.random() * 0.2,
                });
            }
            for (let i = pulses.length - 1; i >= 0; i--) {
                pulses[i].pos += pulses[i].speed * 0.008 * step;
                if (pulses[i].pos >= 1 + pulses[i].len) pulses.splice(i, 1);
            }
        },
        paint(ctx, w, h) {
            ctx.save();
            ctx.scale(w / refW, h / refH);
            for (const tr of traces) {
                ctx.beginPath();
                ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
                for (let i = 1; i < tr.pts.length; i++) ctx.lineTo(tr.pts[i].x, tr.pts[i].y);
                ctx.strokeStyle = `hsla(${_H(tr.hue)},${_S(70)}%,55%,0.1)`;
                ctx.lineWidth = 1; ctx.stroke();
                for (const p of tr.pts) {
                    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2);
                    ctx.fillStyle = `hsla(${_H(tr.hue)},${_S(70)}%,65%,0.2)`; ctx.fill();
                }
            }
            for (const p of pulses) {
                const tr = traces[p.trace];
                if (!tr) continue;
                const head = Math.min(p.pos, 1), tail = Math.max(0, p.pos - p.len);
                const hx = ptAt(tr, head), tx = ptAt(tr, tail);
                const grd = ctx.createLinearGradient(tx.x, tx.y, hx.x, hx.y);
                grd.addColorStop(0, `hsla(${_H(tr.hue)},${_S(90)}%,70%,0)`);
                grd.addColorStop(1, `hsla(${_H(tr.hue)},${_S(90)}%,70%,0.9)`);
                ctx.beginPath(); ctx.moveTo(tx.x, tx.y);
                const steps = 20;
                for (let s = 1; s <= steps; s++) {
                    const f = tail + (head - tail) * s / steps;
                    const pt = ptAt(tr, Math.min(f, 1));
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.strokeStyle = grd; ctx.lineWidth = 2; ctx.stroke();
                ctx.beginPath(); ctx.arc(hx.x, hx.y, 3, 0, Math.PI*2);
                ctx.fillStyle = `hsla(${_H(tr.hue)},${_S(90)}%,80%,0.95)`; ctx.fill();
            }
            ctx.restore();
        },
    };
}
