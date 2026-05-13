// MeshWarp
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const COLS = Math.round(C.cols ?? 18);
const ROWS = Math.round(C.rows ?? 12);
const SPEED = 0.004 * (C.speed ?? 1.0);
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));

let W=0,H=0,t=0;
let mx=-9999,my=-9999;
let pts=[];

function build(){pts=[];for(let r=0;r<=ROWS;r++) for(let c=0;c<=COLS;c++) pts.push({bx:c/COLS*W,by:r/ROWS*H,x:0,y:0});}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;build();}

function draw(){
  cx.clearRect(0,0,W,H);
  const dx=W/COLS,dy=H/ROWS;
  for(const p of pts){
    const ox=(Math.sin(p.bx*0.008+t)*0.6+Math.sin(p.by*0.01+t*1.3)*0.4)*dx*0.55;
    const oy=(Math.cos(p.by*0.009+t*0.9)*0.6+Math.cos(p.bx*0.007+t*1.1)*0.4)*dy*0.55;
    const ddx=p.bx-mx, ddy=p.by-my;
    const dist=Math.sqrt(ddx*ddx+ddy*ddy);
    const pull=Math.max(0,1-dist/200)*28;
    p.x=p.bx+ox+(mx>0?ddx/Math.max(dist,1)*-pull:0);
    p.y=p.by+oy+(my>0?ddy/Math.max(dist,1)*-pull:0);
  }
  const cols1=COLS+1;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const tl=pts[r*cols1+c],tr=pts[r*cols1+c+1];
    const bl=pts[(r+1)*cols1+c],br=pts[(r+1)*cols1+c+1];
    const cx2=(tl.x+tr.x+bl.x+br.x)/4, cy2=(tl.y+tr.y+bl.y+br.y)/4;
    const dd=Math.sqrt((cx2-mx)**2+(cy2-my)**2);
    const glow=mx>0?Math.max(0,1-dd/220):0;
    const alpha=0.08+glow*0.28;
    const hue=210+c/COLS*45+Math.sin(t+r*0.3)*8;
    cx.strokeStyle=`hsla(${_H(hue)},${_S(80)}%,65%,${alpha})`;
    cx.lineWidth=0.8+glow*1.2;
    cx.beginPath();cx.moveTo(tl.x,tl.y);cx.lineTo(tr.x,tr.y);cx.lineTo(br.x,br.y);cx.lineTo(bl.x,bl.y);cx.closePath();cx.stroke();
    if(glow>0.15){cx.fillStyle=`hsla(${_H(hue)},${_S(80)}%,65%,${glow*0.06})`;cx.fill();}
  }
  t+=SPEED;requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
host.addEventListener('mousemove',(e)=>{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;});
host.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;});
