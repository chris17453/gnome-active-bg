// LinkField
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const LINE_HEIGHT = Math.round(C.lineHeight ?? 22);
const SCROLL_SPEED = 0.35 * (C.scrollSpeed ?? 1.0);
const LINK_CHANCE = C.linkChance ?? 0.7;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));
const HUE_BASE = _H(200);
const SAT_BASE = _S(100);

let W=0,H=0,t=0;
let mx=-9999,my=-9999;
const citations=[];

function makeCitation(y,idx){
  const segCount=4+Math.floor(Math.random()*5);
  const segments=[];
  for(let i=0;i<segCount;i++) segments.push({w:28+Math.random()*85,gap:4+Math.random()*4});
  return {y,num:String(idx).padStart(2,'0'),indent:60,segments,hasLink:Math.random()<LINK_CHANCE,glow:0,phase:Math.random()*Math.PI*2};
}
let counter=1;
function build(){citations.length=0;counter=1;const rows=Math.ceil(H/LINE_HEIGHT)+4;for(let i=0;i<rows;i++) citations.push(makeCitation(i*LINE_HEIGHT,counter++));}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;build();}
function maybeActivate(){if(Math.random()<0.04){const c=citations[Math.floor(Math.random()*citations.length)];c.glow=1;}}

function draw(){
  cx.clearRect(0,0,W,H);t+=0.01;maybeActivate();
  cx.globalCompositeOperation='lighter';
  for(const c of citations){
    c.y-=SCROLL_SPEED;
    if(c.y<-LINE_HEIGHT){c.y+=Math.ceil(H/LINE_HEIGHT+4)*LINE_HEIGHT;Object.assign(c,makeCitation(c.y,counter++));}
    const idle=0.18+Math.sin(t*0.8+c.phase)*0.04;
    const bright=Math.max(idle,c.glow*0.9);
    const mouseDist=mx>0?Math.abs(c.y-my):9999;
    const mouseBoost=mouseDist<40?(1-mouseDist/40)*0.45:0;
    const finalBright=Math.min(1,bright+mouseBoost);
    const numColor=c.glow>0.3?`hsla(${HUE_BASE},${SAT_BASE}%,78%,${0.9*c.glow+0.3})`:`hsla(${HUE_BASE},${SAT_BASE}%,70%,${finalBright*0.8})`;
    cx.fillStyle=numColor;
    cx.font='600 10px ui-monospace, "JetBrains Mono", monospace';
    cx.textBaseline='middle';
    cx.fillText(`[${c.num}]`,18,c.y);
    let x=c.indent;
    cx.fillStyle=`hsla(${HUE_BASE},${SAT_BASE}%,65%,${finalBright*0.55})`;
    for(const s of c.segments){if(x+s.w>W-60) break; cx.fillRect(x,c.y-2,s.w,3);x+=s.w+s.gap;}
    if(c.hasLink){
      const lx=Math.min(x+6,W-50), ly=c.y;
      const linkC=c.glow>0.3?`hsla(${HUE_BASE},${SAT_BASE}%,80%,${0.9*c.glow+0.4})`:`hsla(${HUE_BASE},${SAT_BASE}%,70%,${finalBright*0.7})`;
      cx.strokeStyle=linkC;cx.lineWidth=1;
      cx.beginPath();cx.rect(lx,ly-4.5,14,9);cx.stroke();
      cx.beginPath();cx.moveTo(lx+10,ly-4.5);cx.lineTo(lx+16,ly-10.5);cx.stroke();
      cx.beginPath();cx.moveTo(lx+16,ly-10.5);cx.lineTo(lx+12.5,ly-10.5);cx.moveTo(lx+16,ly-10.5);cx.lineTo(lx+16,ly-7);cx.stroke();
    }
    if(c.glow>0.1){
      const g=cx.createLinearGradient(0,c.y-8,0,c.y+8);
      g.addColorStop(0,`hsla(${HUE_BASE},${SAT_BASE}%,78%,0)`);
      g.addColorStop(0.5,`hsla(${HUE_BASE},${SAT_BASE}%,78%,${0.08*c.glow})`);
      g.addColorStop(1,`hsla(${HUE_BASE},${SAT_BASE}%,78%,0)`);
      cx.fillStyle=g;cx.fillRect(0,c.y-8,W,16);
    }
    c.glow*=0.95;
  }
  if(mx>0){
    const halo=cx.createRadialGradient(mx,my,0,mx,my,90);
    halo.addColorStop(0,`hsla(${_H(192)},${_S(100)}%,50%,0.08)`);halo.addColorStop(1,`hsla(${_H(192)},${_S(100)}%,50%,0)`);
    cx.fillStyle=halo;cx.beginPath();cx.arc(mx,my,90,0,Math.PI*2);cx.fill();
  }
  cx.globalCompositeOperation='source-over';
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
host.addEventListener('mousemove',(e)=>{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;});
host.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;});
