// Signal rings (GJS port)
export default function signalrings(cfg, W, H) {
    const SPAWN_INT = 0.55 / (cfg.spawnRate ?? 1.0);   // seconds-equivalent
    const EXPAND    = cfg.expandSpeed ?? 1.0;
    const PER_BURST = Math.max(1, Math.round(cfg.ringsPerBurst ?? 3));
    const HSH       = cfg.paletteShift ?? 0;
    const SMUL      = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));

    const refW = W, refH = H;
    const rings = [];
    let autoT = 0;
    let elapsed = 0;

    function addRings(x, y, count) {
        for (let i = 0; i < count; i++)
            rings.push({
                x, y, r: i * 22,
                alpha: 0.7 - i * 0.06,
                hue: 185 + Math.random() * 40,
                speed: (0.9 + Math.random() * 1.1) * EXPAND,
                spinDir: i % 2 ? 1 : -1,
                idx: i,
            });
    }
    (function seed() {
        const pts = [[refW * 0.38, refH * 0.52], [refW * 0.62, refH * 0.48]];
        for (const [px, py] of pts)
            for (let i = 0; i < 7; i++)
                rings.push({
                    x: px, y: py, r: i * 55,
                    alpha: Math.max(0, 0.62 - i * 0.08),
                    hue: 190 + Math.random() * 35,
                    speed: (1.0 + Math.random() * 0.8) * EXPAND,
                    spinDir: i % 2 ? 1 : -1,
                    idx: i,
                });
    })();

    return {
        update(dt) {
            elapsed += dt;
            const step = dt * 60;
            autoT += dt * 0.84; // original autoT += 0.014/frame at 60fps
            if (autoT > SPAWN_INT) {
                autoT = 0;
                const tx = refW * (0.25 + Math.random() * 0.5);
                const ty = refH * (0.3 + Math.random() * 0.4);
                addRings(tx, ty, PER_BURST);
            }
            for (let i = rings.length - 1; i >= 0; i--) {
                const rg = rings[i];
                rg.r += rg.speed * step;
                rg.alpha -= 0.0016 * step;
                if (rg.alpha <= 0 || rg.r > Math.max(refW, refH) * 0.9) rings.splice(i, 1);
            }
        },
        paint(ctx, w, h) {
            ctx.save();
            ctx.scale(w / refW, h / refH);
            for (const rg of rings) {
                ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI*2);
                ctx.strokeStyle = `hsla(${_H(rg.hue)},${_S(85)}%,65%,${rg.alpha})`;
                ctx.lineWidth = 1.4 * (rg.alpha / 0.7); ctx.stroke();
                const dotAng = elapsed * 0.7 * rg.spinDir + rg.idx * 0.5;
                const dotX = rg.x + Math.cos(dotAng) * rg.r;
                const dotY = rg.y + Math.sin(dotAng) * rg.r;
                ctx.beginPath(); ctx.arc(dotX, dotY, 2.5, 0, Math.PI*2);
                ctx.fillStyle = `hsla(${_H(rg.hue)},${_S(90)}%,82%,${rg.alpha*2})`; ctx.fill();
            }
            ctx.restore();
        },
    };
}
