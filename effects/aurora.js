// AuroraFlow
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const N_BANDS = Math.round(C.bands ?? 14);
const SPEED_MUL = C.speed ?? 1.0;
const AMP_MUL = C.amplitude ?? 1.0;
const GLOW_MUL = C.nodeGlow ?? 1.0;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));
function _hex2hsl(hex){
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
  let h=0, s=0;
  if(mx!==mn){const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    if(mx===r) h=(g-b)/d+(g<b?6:0);
    else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60;}
  return [h, s*100, l*100];
}

let W=0,H=0,t=0;
let mx=-9999,my=-9999,smx=0,smy=0;
const COLS = ['#00C2FF','#0055FF','#6366F1','#7C3AED','#818CF8','#0088DD','#4338CA','#2dd4bf']
  .map(_hex2hsl);  // [[h,s,l], ...]
const bands=[];

function build(){
  bands.length=0;
  for(let i=0;i<N_BANDS;i++) bands.push({
    y:(i+0.5)/N_BANDS,
    speed:(0.10+Math.random()*0.14)*SPEED_MUL,
    amp:(0.04+Math.random()*0.06)*AMP_MUL,
    freq:1.2+Math.random()*2,
    phase:Math.random()*Math.PI*2,
    colorIdx:i%COLS.length,
    alpha:0.14+Math.random()*0.13
  });
}
function bandY(b,x){
  const nx=x/W;
  const mouseWarp=(mx>0?1:0)*Math.exp(-((x-smx)**2)/(W*W*0.03))*Math.max(0,1-Math.abs(b.y*H-smy)/H*3)*0.08*H;
  return b.y*H
    +Math.sin(nx*b.freq*Math.PI*2+t*b.speed+b.phase)*b.amp*H
    +Math.sin(nx*b.freq*0.5*Math.PI*2+t*b.speed*0.7+b.phase*1.3)*b.amp*0.5*H
    +mouseWarp;
}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;smx=W/2;smy=H/2;build();}
function hexAlpha(hsl,a){return `hsla(${_H(hsl[0])},${_S(hsl[1])}%,${hsl[2]}%,${a})`;}

function draw(){
  cx.clearRect(0,0,W,H);
  t+=0.004;
  if(mx>0){smx+=(mx-smx)*0.04;smy+=(my-smy)*0.04;}
  for(const b of bands){
    const pts=[];
    for(let x=0;x<=W;x+=6) pts.push([x,bandY(b,x)]);
    const col=COLS[b.colorIdx];
    cx.save();
    cx.shadowColor=hexAlpha(col,1);cx.shadowBlur=10;
    cx.beginPath();cx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++) cx.lineTo(pts[i][0],pts[i][1]);
    cx.strokeStyle=hexAlpha(col,Math.min(0.7,b.alpha*1.3));cx.lineWidth=1.6;cx.stroke();
    cx.shadowBlur=20;cx.strokeStyle=hexAlpha(col,b.alpha*0.6);cx.lineWidth=1.0;cx.stroke();
    cx.restore();
    const nodeCount=3;
    for(let n=0;n<nodeCount;n++){
      const phase=(t*b.speed*0.4+n/nodeCount+b.phase*0.2)%1;
      const nodeX=phase*W;
      const nodeY=bandY(b,nodeX);
      const pulse=0.75+Math.sin(t*3+n+b.phase)*0.25;
      const outerR=36*pulse*GLOW_MUL;
      const outerHalo=cx.createRadialGradient(nodeX,nodeY,0,nodeX,nodeY,outerR);
      outerHalo.addColorStop(0,hexAlpha(col,0.18*pulse));
      outerHalo.addColorStop(0.5,hexAlpha(col,0.05*pulse));
      outerHalo.addColorStop(1,hexAlpha(col,0));
      cx.beginPath();cx.arc(nodeX,nodeY,outerR,0,Math.PI*2);cx.fillStyle=outerHalo;cx.fill();
      const innerR=10*pulse*GLOW_MUL;
      const innerHalo=cx.createRadialGradient(nodeX,nodeY,0,nodeX,nodeY,innerR);
      innerHalo.addColorStop(0,hexAlpha(col,0.55*pulse));
      innerHalo.addColorStop(1,hexAlpha(col,0));
      cx.beginPath();cx.arc(nodeX,nodeY,innerR,0,Math.PI*2);cx.fillStyle=innerHalo;cx.fill();
      cx.beginPath();cx.arc(nodeX,nodeY,2.5,0,Math.PI*2);cx.fillStyle='rgba(255,255,255,0.75)';cx.fill();
    }
  }
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
host.addEventListener('mousemove',(e)=>{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;});
host.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;});
