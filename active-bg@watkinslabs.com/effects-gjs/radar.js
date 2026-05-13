// Radar sweep (GJS port)
export default function radar(cfg, W, H) {
    const BLIPS = Math.round(cfg.blips ?? 55);
    const SMULT = cfg.sweepSpeed ?? 1.0;
    const GRID  = Math.round(cfg.gridSize ?? 52);
    const HSH   = cfg.paletteShift ?? 0;
    const SMUL  = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));
    const HSW  = _H(192), SSW = _S(100);    // sweep cyan
    const HHIT = _H(167), SHIT = _S(100);   // hit green

    const refW = W, refH = H;
    let angle = 0;
    const blips = [];
    function newBlip() {
        return {
            x: Math.random() * refW, y: Math.random() * refH,
            age: 0, maxAge: 220 + Math.random() * 280,
            size: 1.2 + Math.random() * 2.8,
        };
    }
    (function build() {
        for (let i = 0; i < BLIPS; i++) blips.push(newBlip());
    })();

    return {
        update(dt) {
            const step = dt * 60;
            angle += 0.01 * SMULT * step;
            const sweepLen = Math.PI * 0.5;
            const OX = refW * 0.5, OY = refH * 0.5;
            for (let i = 0; i < blips.length; i++) {
                const b = blips[i];
                const bAng = Math.atan2(b.y - OY, b.x - OX);
                let diff = ((angle - bAng) % (Math.PI*2) + Math.PI*2) % (Math.PI*2);
                if (diff < sweepLen) b.age = 0;
                b.age += step;
                if (b.age > b.maxAge) blips[i] = newBlip();
            }
        },
        paint(ctx, w, h) {
            ctx.save();
            ctx.scale(w / refW, h / refH);

            // Grid
            ctx.strokeStyle = `hsla(${HSW},${SSW}%,50%,0.04)`;
            ctx.lineWidth = 0.5;
            for (let x = 0; x < refW; x += GRID) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,refH); ctx.stroke(); }
            for (let y = 0; y < refH; y += GRID) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(refW,y); ctx.stroke(); }

            // Sweep wedge
            const OX = refW * 0.5, OY = refH * 0.5;
            const R = Math.hypot(refW, refH) * 0.62;
            const sweepLen = Math.PI * 0.5;
            ctx.save(); ctx.translate(OX, OY);
            for (let i = 0; i < 30; i++) {
                const a = angle - sweepLen * (1 - i / 30);
                const al = 0.006 * i;
                ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,a-0.04,a+0.04); ctx.closePath();
                ctx.fillStyle = `hsla(${HSW},${SSW}%,50%,${al})`; ctx.fill();
            }
            ctx.restore();

            // Sweep lines
            ctx.beginPath(); ctx.moveTo(OX,OY);
            ctx.lineTo(OX + Math.cos(angle)*R, OY + Math.sin(angle)*R);
            ctx.strokeStyle = `hsla(${HSW},${SSW}%,50%,0.5)`; ctx.lineWidth = 1.2; ctx.stroke();
            const startA = angle - sweepLen;
            ctx.beginPath(); ctx.moveTo(OX,OY);
            ctx.lineTo(OX + Math.cos(startA)*R, OY + Math.sin(startA)*R);
            ctx.strokeStyle = `hsla(${HSW},${SSW}%,50%,0.08)`; ctx.lineWidth = 0.5; ctx.stroke();

            // Blips
            for (const b of blips) {
                const fade = Math.max(0, 1 - b.age / b.maxAge);
                if (fade <= 0) continue;
                const bAng = Math.atan2(b.y - OY, b.x - OX);
                let diff = ((angle - bAng) % (Math.PI*2) + Math.PI*2) % (Math.PI*2);
                const hit = (diff < sweepLen && b.age < 10);
                const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size*4);
                grd.addColorStop(0, hit
                    ? `hsla(${HHIT},${SHIT}%,50%,${fade})`
                    : `hsla(${HHIT},${SHIT}%,43%,${fade*0.85})`);
                grd.addColorStop(1, `hsla(${HHIT},${SHIT}%,43%,0)`);
                ctx.beginPath(); ctx.arc(b.x, b.y, b.size*4, 0, Math.PI*2);
                ctx.fillStyle = grd; ctx.fill();
                if (hit) {
                    ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI*2);
                    ctx.fillStyle = `hsla(${HHIT},${SHIT}%,50%,${fade*0.9})`; ctx.fill();
                }
            }
            ctx.restore();
        },
    };
}
