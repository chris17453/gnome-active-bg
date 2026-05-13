// Neural fire (GJS port)
export default function neural(cfg, W, H) {
    const LAYERS = Math.round(cfg.layers ?? 7);
    const PER    = Math.round(cfg.perLayer ?? 9);
    const CONN   = cfg.connectivity ?? 0.4;
    const FIRE   = cfg.fireRate ?? 1.0;
    const HSH    = cfg.paletteShift ?? 0;
    const SMUL   = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));
    const HF = _H(252), SF = _S(95);     // fire (purple)
    const HS = _H(234), SS = _S(89);     // synapse (indigo)

    const refW = W, refH = H;
    const neurons = [];
    const synapses = [];
    const signals = [];
    let pendingMx = -9999, pendingMy = -9999;

    (function build() {
        for (let l = 0; l < LAYERS; l++)
            for (let n = 0; n < PER; n++)
                neurons.push({
                    x: (l + 0.5) / LAYERS * refW + (Math.random() - 0.5) * refW * 0.06,
                    y: (n + 0.5) / PER  * refH + (Math.random() - 0.5) * refH * 0.06,
                    fire: 0, charge: 0, layer: l,
                });
        for (let l = 0; l < LAYERS - 1; l++)
            for (let a = 0; a < PER; a++) {
                const from = l * PER + a;
                for (let b = 0; b < PER; b++)
                    if (Math.random() < CONN)
                        synapses.push({from, to: (l + 1) * PER + b});
            }
    })();

    return {
        update(dt) {
            const step = dt * 60;
            if (Math.random() < 0.015 * FIRE * step) {
                const n = neurons[Math.floor(Math.random() * PER)];
                n.fire = 1;
            }
            // Mouse: random nearby neurons fire when cursor is over the scene.
            if (pendingMx >= 0) {
                for (const n of neurons) {
                    const dx = n.x - pendingMx, dy = n.y - pendingMy;
                    if (Math.sqrt(dx*dx + dy*dy) < 80 && Math.random() < 0.08 * step) {
                        n.fire = 1;
                    }
                }
            }
            for (const n of neurons) {
                if (n.fire > 0) {
                    n.charge = Math.min(1, n.charge + 0.15 * step);
                    if (n.fire > 0.5) {
                        for (let si = 0; si < synapses.length; si++) {
                            if (synapses[si].from === neurons.indexOf(n) && Math.random() < 0.08 * step)
                                signals.push({syn: si, pos: 0, speed: 0.02 + Math.random() * 0.015});
                        }
                    }
                    n.fire = Math.max(0, n.fire - 0.04 * step);
                }
                n.charge = Math.max(0, n.charge - 0.008 * step);
            }
            for (let i = signals.length - 1; i >= 0; i--) {
                const sig = signals[i];
                sig.pos += sig.speed * step;
                if (sig.pos >= 1) {
                    const s = synapses[sig.syn];
                    if (s) neurons[s.to].fire = Math.max(neurons[s.to].fire, 0.8);
                    signals.splice(i, 1);
                }
            }
        },
        paint(ctx, w, h, _t, mx, my) {
            // Latch mouse pos so update() (which fires once per tick before
            // any paint) can see the most recent cursor.
            if (mx >= 0) {
                pendingMx = mx * refW / w;
                pendingMy = my * refH / h;
            } else {
                pendingMx = pendingMy = -9999;
            }
            ctx.save();
            ctx.scale(w / refW, h / refH);

            // Synapse lines (faint)
            for (const s of synapses) {
                const a = neurons[s.from], b = neurons[s.to];
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = `hsla(${HS},${SS}%,74%,0.07)`;
                ctx.lineWidth = 0.6; ctx.stroke();
            }
            // Signals travelling
            for (const sig of signals) {
                const s = synapses[sig.syn];
                if (!s) continue;
                const a = neurons[s.from], b = neurons[s.to];
                const px = a.x + (b.x - a.x) * sig.pos;
                const py = a.y + (b.y - a.y) * sig.pos;
                const g = ctx.createRadialGradient(px, py, 0, px, py, 6);
                g.addColorStop(0, `hsla(${HF},${SF}%,76%,0.9)`);
                g.addColorStop(1, `hsla(${HF},${SF}%,76%,0)`);
                ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI*2);
                ctx.fillStyle = g; ctx.fill();
            }
            // Neurons
            for (const n of neurons) {
                const c = n.charge;
                if (c > 0.1) {
                    const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 4 + c * 16);
                    grd.addColorStop(0, `hsla(${HF},${SF}%,76%,${c * 0.8})`);
                    grd.addColorStop(1, `hsla(${HF},${SF}%,76%,0)`);
                    ctx.beginPath(); ctx.arc(n.x, n.y, 4 + c * 16, 0, Math.PI*2);
                    ctx.fillStyle = grd; ctx.fill();
                }
                ctx.beginPath(); ctx.arc(n.x, n.y, 4, 0, Math.PI*2);
                ctx.fillStyle = `hsla(${HF},${SF}%,76%,${0.25 + c * 0.7})`; ctx.fill();
            }
            ctx.restore();
        },
    };
}
