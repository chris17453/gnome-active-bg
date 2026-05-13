// Scanner (GJS port)
export default function scanner(cfg, W, H) {
    const SPEED  = 1.2 * (cfg.speed ?? 1.0);
    const COUNT  = Math.round(cfg.points ?? 32);
    const HSH    = cfg.paletteShift ?? 0;
    const SMUL   = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));
    const HS = _H(192), SS = _S(100);
    const HD = _H(167), SD = _S(100);

    const LABELS = ['READY','OK','✓','92%','PASS','DATA','●','◆','▲','98%','VALID','SYNC'];
    const refW = W, refH = H;
    let scanY = 0;
    let elapsed = 0;
    const points = [];

    (function build() {
        for (let i = 0; i < COUNT; i++) points.push({
            x: Math.random() * refW,
            y: Math.random() * refH,
            label: LABELS[Math.floor(Math.random() * LABELS.length)],
            revealed: false,
            alpha: 0,
        });
    })();

    return {
        update(dt) {
            elapsed += dt;
            const step = dt * 60;
            for (const p of points) {
                if (p.y <= scanY && !p.revealed) p.revealed = true;
                if (p.revealed) p.alpha = Math.min(1, p.alpha + 0.04 * step);
            }
            scanY += SPEED * step;
            if (scanY > refH + 20) {
                scanY = 0;
                for (const p of points) { p.revealed = false; p.alpha = 0; }
            }
        },
        paint(ctx, w, h) {
            ctx.save();
            ctx.scale(w / refW, h / refH);

            ctx.font = '11px monospace';
            for (const p of points) {
                if (p.alpha > 0) {
                    ctx.fillStyle = `hsla(${HS},${SS}%,50%,${p.alpha*0.7})`;
                    ctx.fillText(p.label, p.x, p.y);
                }
            }

            // Scan line gradient
            const grd = ctx.createLinearGradient(0, scanY-30, 0, scanY+4);
            grd.addColorStop(0,   `hsla(${HS},${SS}%,50%,0)`);
            grd.addColorStop(0.7, `hsla(${HS},${SS}%,50%,0.08)`);
            grd.addColorStop(1,   `hsla(${HS},${SS}%,50%,0.35)`);
            ctx.fillStyle = grd;
            ctx.fillRect(0, scanY-30, refW, 34);

            ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(refW, scanY);
            ctx.strokeStyle = `hsla(${HS},${SS}%,50%,0.7)`; ctx.lineWidth = 1; ctx.stroke();

            // Moving green dot
            const dotX = (elapsed * 120) % refW;
            ctx.beginPath(); ctx.arc(dotX, scanY, 3, 0, Math.PI*2);
            ctx.fillStyle = `hsla(${HD},${SD}%,47%,0.9)`; ctx.fill();

            ctx.restore();
        },
    };
}
