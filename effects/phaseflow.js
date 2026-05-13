// PhaseFlow
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const STREAM_COUNT = Math.max(1, Math.round(C.streams ?? 4));
const SPEED_MUL = C.speed ?? 1.0;
const AMP_MUL = C.amplitude ?? 1.0;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
function _hex2hsl(hex){
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
  let h=0, s=0;
  if(mx!==mn){const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    if(mx===r) h=(g-b)/d+(g<b?6:0); else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60;}
  return [h, s*100, l*100];
}
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));
const _tint = (hsl, a) => `hsla(${_H(hsl[0])},${_S(hsl[1])}%,${hsl[2]}%,${a})`;

let W=0,H=0,t=0;
const PALETTE=['#00C2FF','#60A5FF','#818CF8','#a78bfa','#67E3FF','#34D399','#F472B6','#FBBF24','#22D3EE','#A78BFA'].map(_hex2hsl);
const PHASES = Array.from({length: STREAM_COUNT}, (_, i) => PALETTE[i % PALETTE.length]);
const streams=[];

function build(){streams.length=0;PHASES.forEach((_,i)=>{const yBase=(i+1)/(PHASES.length+1)*H;streams.push({phase:i,y:yBase,pts:[],speed:(0.6+i*0.15)*SPEED_MUL,amp:(18+i*8)*AMP_MUL,freq:0.008-i*0.0005});});}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;build();}

function draw(){
  cx.clearRect(0,0,W,H);t+=0.012;
  for(const s of streams){
    const col=PHASES[s.phase];
    cx.beginPath();
    for(let x=0;x<=W;x+=4){
      const offset=Math.sin(x*s.freq+t*s.speed+s.phase)*s.amp+Math.sin(x*s.freq*0.5+t*s.speed*0.7)*s.amp*0.4;
      const y=s.y+offset;
      x===0?cx.moveTo(x,y):cx.lineTo(x,y);
    }
    cx.strokeStyle=_tint(col, 0.19);cx.lineWidth=1.5;cx.stroke();
    cx.beginPath();
    for(let x=0;x<=W;x+=4){
      const offset=Math.sin(x*s.freq+t*s.speed+s.phase)*s.amp+Math.sin(x*s.freq*0.5+t*s.speed*0.7)*s.amp*0.4;
      const y=s.y+offset;
      x===0?cx.moveTo(x,y):cx.lineTo(x,y);
    }
    cx.strokeStyle=_tint(col, 0.56);cx.lineWidth=0.6;cx.stroke();
    const dotX=(t*s.speed*60)%(W+40)-20;
    const dotOffset=Math.sin(dotX*s.freq+t*s.speed+s.phase)*s.amp+Math.sin(dotX*s.freq*0.5+t*s.speed*0.7)*s.amp*0.4;
    const dotY=s.y+dotOffset;
    const grd=cx.createRadialGradient(dotX,dotY,0,dotX,dotY,8);
    grd.addColorStop(0,_tint(col, 0.93));grd.addColorStop(1,_tint(col, 0));
    cx.beginPath();cx.arc(dotX,dotY,8,0,Math.PI*2);cx.fillStyle=grd;cx.fill();
  }
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
