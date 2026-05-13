// Code rain (GJS port)
export default function coderain(cfg, W, H) {
    const SPEED = cfg.speed ?? 1.0;
    const FONT  = Math.round(cfg.fontSize ?? 13);
    const DEN   = cfg.density ?? 1.0;
    const SET   = cfg.charset ?? 'code';
    const HSH   = cfg.paletteShift ?? 0;
    const SMUL  = cfg.saturation ?? 1.0;
    const _H = h => ((Math.round(h + HSH) % 360) + 360) % 360;
    const _S = s => Math.max(0, Math.min(100, s * SMUL));

    const CHARSETS = {
        code:    '01{}[]()=>const let fn type import export default async await'.replace(/\s+/g,''),
        binary:  '01',
        katakana:'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズヅブプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン',
        hex:     '0123456789ABCDEF',
    };
    const CHARS = (CHARSETS[SET] || CHARSETS.code).split('');
    const COL_W = Math.max(8, Math.round((FONT + 5) / DEN));

    const refW = W, refH = H;
    const cols = [];

    function mkCol(x, y) {
        const len = 8 + Math.floor(Math.random() * 16);
        return {
            x,
            y: y == null ? -Math.random() * refH * 1.5 : y,
            speed: (1.2 + Math.random() * 2) * SPEED,
            len,
            chars: Array.from({length: len}, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
            hue: 190 + Math.random() * 40,
        };
    }
    (function build() {
        const n = Math.ceil(refW / COL_W);
        for (let i = 0; i < n; i++) cols.push(mkCol(i * COL_W, -Math.random() * refH));
    })();

    return {
        update(dt) {
            const step = dt * 60;
            for (const col of cols) {
                col.y += col.speed * step;
                if (Math.random() < 0.03 * step)
                    col.chars[Math.floor(Math.random() * col.chars.length)] =
                        CHARS[Math.floor(Math.random() * CHARS.length)];
                if (col.y - col.len * FONT > refH) Object.assign(col, mkCol(col.x, -FONT * col.len));
            }
        },
        paint(ctx, w, h) {
            ctx.save();
            ctx.scale(w / refW, h / refH);
            ctx.font = `${FONT}px monospace`;
            ctx.textAlign = 'center';
            for (const col of cols) {
                for (let i = 0; i < col.chars.length; i++) {
                    const cy = col.y - i * FONT;
                    if (cy < -FONT || cy > refH + FONT) continue;
                    const frac = 1 - i / col.chars.length;
                    let alpha;
                    if (i === 0) alpha = 0.9;
                    else if (i < 3) alpha = 0.5 * frac;
                    else alpha = 0.12 * frac;
                    ctx.fillStyle = i === 0
                        ? `hsla(${_H(col.hue)},${_S(90)}%,85%,${alpha})`
                        : `hsla(${_H(col.hue)},${_S(70)}%,60%,${alpha})`;
                    ctx.fillText(col.chars[i], col.x + COL_W / 2, cy);
                }
            }
            ctx.restore();
        },
    };
}
