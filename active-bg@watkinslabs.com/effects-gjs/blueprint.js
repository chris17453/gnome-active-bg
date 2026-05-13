// Blueprint (GJS port)
export default function blueprint(cfg, W, H) {
    const GRID  = Math.round(cfg.gridSize ?? 80);
    const MINOR = Math.max(4, Math.round(GRID / 4));
    const SPAWN = cfg.spawnRate ?? 1.0;
    const HSH   = cfg.paletteShift ?? 0;
    const SMUL  = cfg.saturation ?? 1.0;
    const HUE   = (((cfg.hue ?? 195) + HSH) % 360 + 360) % 360;
    const SAT   = Math.max(0, Math.min(100, 85 * SMUL));

    const crosshairs = [];
    const buildLines = [];
    const measures = [];

    function snap(w, h) {
        const cols = Math.max(1, Math.floor(w / GRID));
        const rows = Math.max(1, Math.floor(h / GRID));
        return {
            x: Math.floor(Math.random() * (cols + 1)) * GRID,
            y: Math.floor(Math.random() * (rows + 1)) * GRID,
        };
    }

    function maybeSpawn(w, h, dt) {
        const k = 60 * dt; // probability scaled to "events per frame at 60fps"
        if (crosshairs.length < 3 && Math.random() < 0.012 * SPAWN * k) {
            const p = snap(w, h);
            crosshairs.push({x: p.x, y: p.y, age: 0, maxAge: 60 + Math.random() * 50});
        }
        if (buildLines.length < 4 && Math.random() < 0.008 * SPAWN * k) {
            const p = snap(w, h);
            const dir = Math.floor(Math.random() * 4);
            const dist = GRID * (1 + Math.floor(Math.random() * 3));
            let x2 = p.x, y2 = p.y;
            if (dir === 0) x2 += dist;
            else if (dir === 1) y2 += dist;
            else if (dir === 2) x2 -= dist;
            else y2 -= dist;
            if (x2 < 0 || x2 > w || y2 < 0 || y2 > h) return;
            buildLines.push({x1: p.x, y1: p.y, x2, y2, progress: 0, life: 0, maxLife: 100});
        }
        if (measures.length < 2 && Math.random() < 0.006 * SPAWN * k) {
            const p = snap(w, h);
            const dir = Math.random() < 0.5 ? 0 : 1;
            const wseg = GRID * (1 + Math.floor(Math.random() * 3));
            measures.push({x: p.x, y: p.y, w: wseg, dir, age: 0, maxAge: 90});
        }
    }

    function drawGrid(ctx, w, h) {
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = `hsla(${HUE},${SAT}%,55%,0.025)`;
        for (let x = 0; x <= w; x += MINOR) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
        for (let y = 0; y <= h; y += MINOR) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = `hsla(${HUE},${SAT}%,55%,0.06)`;
        for (let x = 0; x <= w; x += GRID) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
        for (let y = 0; y <= h; y += GRID) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
        ctx.fillStyle = `hsla(${HUE},${SAT}%,55%,0.18)`;
        for (let x = 0; x <= w; x += GRID)
            for (let y = 0; y <= h; y += GRID) { ctx.beginPath(); ctx.arc(x,y,1.4,0,Math.PI*2); ctx.fill(); }
    }

    function drawCrosshair(ctx, x, y, alpha, size) {
        ctx.strokeStyle = `hsla(${HUE},${SAT}%,55%,${alpha})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(x-size,y); ctx.lineTo(x+size,y); ctx.moveTo(x,y-size); ctx.lineTo(x,y+size); ctx.stroke();
        ctx.fillStyle = `hsla(${HUE},${SAT}%,55%,${alpha*1.4})`;
        ctx.beginPath(); ctx.arc(x,y,1.8,0,Math.PI*2); ctx.fill();
    }

    function drawMeasure(ctx, m, alpha) {
        ctx.strokeStyle = `hsla(${HUE},${SAT}%,55%,${alpha})`;
        ctx.lineWidth = 0.7;
        if (m.dir === 0) {
            ctx.beginPath();
            ctx.moveTo(m.x,m.y-4); ctx.lineTo(m.x,m.y+4);
            ctx.moveTo(m.x+m.w,m.y-4); ctx.lineTo(m.x+m.w,m.y+4);
            ctx.moveTo(m.x,m.y); ctx.lineTo(m.x+m.w,m.y);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(m.x-4,m.y); ctx.lineTo(m.x+4,m.y);
            ctx.moveTo(m.x-4,m.y+m.w); ctx.lineTo(m.x+4,m.y+m.w);
            ctx.moveTo(m.x,m.y); ctx.lineTo(m.x,m.y+m.w);
            ctx.stroke();
        }
    }

    let lastDt = 1 / 60;
    let curW = W, curH = H;

    return {
        update(dt) {
            lastDt = dt;
            const step = dt * 60;
            maybeSpawn(curW, curH, dt);
            for (let i = crosshairs.length - 1; i >= 0; i--) {
                crosshairs[i].age += step;
                if (crosshairs[i].age >= crosshairs[i].maxAge) crosshairs.splice(i, 1);
            }
            for (let i = buildLines.length - 1; i >= 0; i--) {
                const l = buildLines[i];
                l.progress = Math.min(1, l.progress + 0.028 * step);
                l.life += step;
                if (l.life >= l.maxLife) buildLines.splice(i, 1);
            }
            for (let i = measures.length - 1; i >= 0; i--) {
                measures[i].age += step;
                if (measures[i].age >= measures[i].maxAge) measures.splice(i, 1);
            }
        },
        paint(ctx, w, h, _t, mx, my) {
            curW = w; curH = h;
            drawGrid(ctx, w, h);
            if (mx >= 0) {
                const gx = Math.round(mx / GRID) * GRID;
                const gy = Math.round(my / GRID) * GRID;
                const dist = Math.hypot(mx - gx, my - gy);
                if (dist < GRID * 0.7) {
                    const k = 1 - dist / (GRID * 0.7);
                    drawCrosshair(ctx, gx, gy, 0.4 * k, 8 + 8 * k);
                }
            }
            for (const c of crosshairs) {
                const k = c.age < 10 ? (c.age / 10) : (1 - (c.age - 10) / (c.maxAge - 10));
                drawCrosshair(ctx, c.x, c.y, 0.55 * k, 8 + 6 * k);
            }
            for (const l of buildLines) {
                const fadeOut = Math.max(0, 1 - l.life / l.maxLife);
                const alpha = Math.min(1, l.progress) * fadeOut * 0.5;
                const xCur = l.x1 + (l.x2 - l.x1) * l.progress;
                const yCur = l.y1 + (l.y2 - l.y1) * l.progress;
                ctx.strokeStyle = `hsla(${HUE},${SAT}%,55%,${alpha})`;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(xCur, yCur); ctx.stroke();
                ctx.fillStyle = `hsla(${HUE},${SAT}%,55%,${alpha*1.5})`;
                ctx.beginPath(); ctx.arc(xCur, yCur, 2, 0, Math.PI*2); ctx.fill();
                if (l.progress >= 1) { ctx.beginPath(); ctx.arc(l.x1, l.y1, 2, 0, Math.PI*2); ctx.fill(); }
            }
            for (const m of measures) {
                const k = m.age < 15 ? (m.age / 15) : (1 - (m.age - 15) / (m.maxAge - 15));
                drawMeasure(ctx, m, 0.32 * k);
            }
        },
    };
}
