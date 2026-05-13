// WaveGrid
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(canvas);
const host = document.body;
const ctx = canvas.getContext('2d');

const C = window.AB_CFG || {};
const SPACING = Math.round(C.spacing ?? 38);
const BASE_R = 1.8;
const WAVE_SPD = 0.018 * (C.speed ?? 1.0);
const RIPPLE_R = C.rippleRadius ?? 160;
const RIPPLE_LIFT = 22;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));
let W=0,H=0,t=0;
let mx=-9999,my=-9999;
let hasMoused=false;
let smx=-9999,smy=-9999;

function resize(){W=canvas.width=canvas.offsetWidth;H=canvas.height=canvas.offsetHeight;}

function draw(){
  ctx.clearRect(0,0,W,H);
  smx+=(mx-smx)*0.12;smy+=(my-smy)*0.12;
  const cols=Math.ceil(W/SPACING)+2, rows=Math.ceil(H/SPACING)+2;
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const bx=c*SPACING, by=r*SPACING;
    const wave=Math.sin(c*0.38+r*0.22+t)*0.5+Math.sin(c*0.18-r*0.42+t*1.4)*0.35+Math.sin((c+r)*0.25+t*0.7)*0.15;
    const dx=bx-smx, dy=by-smy, dist=Math.sqrt(dx*dx+dy*dy);
    const pull=hasMoused?Math.max(0,1-dist/RIPPLE_R):0;
    const ripple=pull*Math.sin(dist*0.07-t*4)*RIPPLE_LIFT;
    const bright=(wave+1)*0.5;
    const r2=BASE_R*(0.35+bright*0.9+pull*1.1);
    const alpha=0.12+bright*0.42+pull*0.42;
    const hue=190+(c/cols)*55+wave*12+pull*20;
    const light=55+bright*20;
    ctx.beginPath();ctx.arc(bx,by+ripple*0.4,r2,0,Math.PI*2);
    ctx.fillStyle=`hsla(${_H(hue)},${_S(85)}%,${light}%,${alpha})`;ctx.fill();
  }
  t+=WAVE_SPD;requestAnimationFrame(draw);
}
resize();
new ResizeObserver(resize).observe(host);
host.addEventListener('mousemove',(e)=>{hasMoused=true;const rect=canvas.getBoundingClientRect();mx=e.clientX-rect.left;my=e.clientY-rect.top;});
host.addEventListener('mouseleave',()=>{hasMoused=false;mx=-9999;my=-9999;});
draw();
