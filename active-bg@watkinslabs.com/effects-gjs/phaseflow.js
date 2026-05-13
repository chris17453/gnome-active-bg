// Phase flow (GJS port)
export default function phaseflow(cfg, W, H) {
    const STREAMS = Math.max(1, Math.round(cfg.streams ?? 4));
    const SMULT   = cfg.speed ?? 1.0;
    const AMULT   = cfg.amplitude ?? 1.0;
    const HSH     = cfg.paletteShift ?? 0;
    const SMUL    = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));

    function hex2hsl(hex) {
        const r = parseInt(hex.slice(1,3), 16)/255, g = parseInt(hex.slice(3,5), 16)/255, b = parseInt(hex.slice(5,7), 16)/255;
        const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2;
        let h = 0, s = 0;
        if (mx !== mn) {
            const d = mx - mn;
            s = l > 0.5 ? d / (2-mx-mn) : d / (mx+mn);
            if (mx === r) h = (g-b)/d + (g<b ? 6 : 0);
            else if (mx === g) h = (b-r)/d + 2;
            else h = (r-g)/d + 4;
            h *= 60;
        }
        return [h, s*100, l*100];
    }
    const PALETTE = [
        '#00C2FF','#60A5FF','#818CF8','#a78bfa','#67E3FF',
        '#34D399','#F472B6','#FBBF24','#22D3EE','#A78BFA',
    ].map(hex2hsl);
    const tint = (hsl, a) => `hsla(${_H(hsl[0])},${_S(hsl[1])}%,${hsl[2]}%,${a})`;

    const refW = W, refH = H;
    const streams = [];
    (function build() {
        for (let i = 0; i < STREAMS; i++) {
            const yBase = (i + 1) / (STREAMS + 1) * refH;
            streams.push({
                phase: i,
                col: PALETTE[i % PALETTE.length],
                y: yBase,
                speed: (0.6 + i * 0.15) * SMULT,
                amp: (18 + i * 8) * AMULT,
                freq: 0.008 - i * 0.0005,
            });
        }
    })();

    let t = 0;
    return {
        update(dt) {
            t += dt * 0.72; // original t+=0.012 at 60fps
        },
        paint(ctx, w, h) {
            ctx.save();
            ctx.scale(w / refW, h / refH);
            for (const s of streams) {
                const col = s.col;
                // outer stroke
                ctx.beginPath();
                for (let x = 0; x <= refW; x += 4) {
                    const off = Math.sin(x*s.freq + t*s.speed + s.phase) * s.amp
                              + Math.sin(x*s.freq*0.5 + t*s.speed*0.7) * s.amp * 0.4;
                    const y = s.y + off;
                    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = tint(col, 0.19); ctx.lineWidth = 1.5; ctx.stroke();
                // inner crisp line
                ctx.beginPath();
                for (let x = 0; x <= refW; x += 4) {
                    const off = Math.sin(x*s.freq + t*s.speed + s.phase) * s.amp
                              + Math.sin(x*s.freq*0.5 + t*s.speed*0.7) * s.amp * 0.4;
                    const y = s.y + off;
                    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = tint(col, 0.56); ctx.lineWidth = 0.6; ctx.stroke();
                // moving dot
                const dotX = (t * s.speed * 60) % (refW + 40) - 20;
                const dotOff = Math.sin(dotX*s.freq + t*s.speed + s.phase) * s.amp
                             + Math.sin(dotX*s.freq*0.5 + t*s.speed*0.7) * s.amp * 0.4;
                const dotY = s.y + dotOff;
                const grd = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 8);
                grd.addColorStop(0, tint(col, 0.93));
                grd.addColorStop(1, tint(col, 0));
                ctx.beginPath(); ctx.arc(dotX, dotY, 8, 0, Math.PI*2);
                ctx.fillStyle = grd; ctx.fill();
            }
            ctx.restore();
        },
    };
}
