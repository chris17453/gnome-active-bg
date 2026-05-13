// Particles (GJS port)
export default function particles(cfg, W, H) {
    const COUNT     = Math.round(cfg.count ?? 90);
    const MAX_DIST  = cfg.linkDist ?? 130;
    const MOUSE_R   = cfg.mouseRadius ?? 110;
    const MOUSE_PUSH = 2.8;
    const SPEED     = 0.45 * (cfg.speed ?? 1.0);
    const HSH       = cfg.paletteShift ?? 0;
    const SMUL      = cfg.saturation ?? 1.0;
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
    const COLORS = ['#00C2FF','#60A5FF','#818CF8','#a78bfa','#67E3FF'].map(hex2hsl);
    const tint = (hsl, a) => `hsla(${_H(hsl[0])},${_S(hsl[1])}%,${hsl[2]}%,${a})`;

    const refW = W, refH = H;
    const parts = [];
    let pendingMx = -9999, pendingMy = -9999;
    function rand(a, b) { return a + Math.random() * (b - a); }
    (function init() {
        for (let i = 0; i < COUNT; i++) {
            parts.push({
                x: rand(0, refW), y: rand(0, refH),
                vx: rand(-SPEED, SPEED), vy: rand(-SPEED, SPEED),
                r: rand(1.5, 3.2),
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                alpha: rand(0.4, 0.85),
            });
        }
    })();

    return {
        update(dt) {
            const step = dt * 60;
            for (const p of parts) {
                if (pendingMx >= 0) {
                    const dx = p.x - pendingMx, dy = p.y - pendingMy;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < MOUSE_R && dist > 0) {
                        const force = (1 - dist / MOUSE_R) * MOUSE_PUSH;
                        p.vx += (dx / dist) * force * 0.08 * step;
                        p.vy += (dy / dist) * force * 0.08 * step;
                    }
                }
                p.vx *= Math.pow(0.995, step);
                p.vy *= Math.pow(0.995, step);
                const spd = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
                if (spd > SPEED * 2.5) { p.vx *= SPEED * 2.5 / spd; p.vy *= SPEED * 2.5 / spd; }
                if (spd < 0.05) { p.vx += rand(-0.05, 0.05); p.vy += rand(-0.05, 0.05); }
                p.x += p.vx * step;
                p.y += p.vy * step;
                if (p.x < -10) p.x = refW + 10;
                if (p.x > refW + 10) p.x = -10;
                if (p.y < -10) p.y = refH + 10;
                if (p.y > refH + 10) p.y = -10;
            }
        },
        paint(ctx, w, h, _t, mx, my) {
            if (mx >= 0) { pendingMx = mx * refW / w; pendingMy = my * refH / h; }
            else { pendingMx = pendingMy = -9999; }
            ctx.save();
            ctx.scale(w / refW, h / refH);
            for (const p of parts) {
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
                ctx.fillStyle = tint(p.color, p.alpha); ctx.fill();
            }
            for (let i = 0; i < parts.length; i++) for (let j = i+1; j < parts.length; j++) {
                const a = parts[i], b = parts[j];
                const dx = a.x - b.x, dy = a.y - b.y, dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < MAX_DIST) {
                    const alpha = (1 - dist / MAX_DIST) * 0.25;
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                    ctx.strokeStyle = tint(a.color, alpha); ctx.lineWidth = 0.8; ctx.stroke();
                }
            }
            ctx.restore();
        },
    };
}
