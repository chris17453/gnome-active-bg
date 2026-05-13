// CircuitBoard
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const TRACE_COUNT = Math.round(C.traceCount ?? 22);
const PULSE_MUL = C.pulseRate ?? 1.0;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const HUE_BASE = (((C.hue ?? 200) + HUE_SHIFT) % 360 + 360) % 360;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));

let W=0,H=0;
const GRID=48;
const traces=[]; const pulses=[];

function buildTraces(){
  traces.length=0;
  const cols=Math.ceil(W/GRID)+1, rows=Math.ceil(H/GRID)+1;
  for(let i=0;i<TRACE_COUNT;i++){
    const pts=[{x:Math.floor(Math.random()*cols)*GRID,y:Math.floor(Math.random()*rows)*GRID}];
    const steps=4+Math.floor(Math.random()*6);
    for(let s=0;s<steps;s++){
      const last=pts[pts.length-1];
      const dir=Math.floor(Math.random()*4);
      const len=(1+Math.floor(Math.random()*3))*GRID;
      let nx=last.x,ny=last.y;
      if(dir===0)nx+=len; if(dir===1)nx-=len;
      if(dir===2)ny+=len; if(dir===3)ny-=len;
      if(nx<0||nx>W||ny<0||ny>H) break;
      pts.push({x:nx,y:ny});
    }
    if(pts.length>1) traces.push({pts,hue:HUE_BASE-5+Math.random()*35});
  }
}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;buildTraces();}
function maybeAddPulse(){if(pulses.length<18&&Math.random()<0.06*PULSE_MUL) pulses.push({trace:Math.floor(Math.random()*traces.length),pos:0,speed:(0.6+Math.random()*1)*PULSE_MUL,len:0.15+Math.random()*0.2});}
function traceTotalLen(t){let l=0;for(let i=1;i<t.pts.length;i++){const dx=t.pts[i].x-t.pts[i-1].x,dy=t.pts[i].y-t.pts[i-1].y;l+=Math.sqrt(dx*dx+dy*dy);}return l;}
function ptAt(t,frac){const total=traceTotalLen(t);let dist=frac*total,acc=0;for(let i=1;i<t.pts.length;i++){const dx=t.pts[i].x-t.pts[i-1].x,dy=t.pts[i].y-t.pts[i-1].y;const seg=Math.sqrt(dx*dx+dy*dy);if(acc+seg>=dist){const r=(dist-acc)/seg;return{x:t.pts[i-1].x+dx*r,y:t.pts[i-1].y+dy*r};}acc+=seg;}return t.pts[t.pts.length-1];}

function draw(){
  cx.clearRect(0,0,W,H);
  maybeAddPulse();
  for(const tr of traces){
    cx.beginPath();cx.moveTo(tr.pts[0].x,tr.pts[0].y);
    for(let i=1;i<tr.pts.length;i++) cx.lineTo(tr.pts[i].x,tr.pts[i].y);
    cx.strokeStyle=`hsla(${_H(tr.hue)},${_S(70)}%,55%,0.1)`;cx.lineWidth=1;cx.stroke();
    for(const p of tr.pts){cx.beginPath();cx.arc(p.x,p.y,2,0,Math.PI*2);cx.fillStyle=`hsla(${_H(tr.hue)},${_S(70)}%,65%,0.2)`;cx.fill();}
  }
  for(let i=pulses.length-1;i>=0;i--){
    const p=pulses[i];const tr=traces[p.trace];
    if(!tr){pulses.splice(i,1);continue;}
    const head=Math.min(p.pos,1),tail=Math.max(0,p.pos-p.len);
    if(p.pos>=1+p.len){pulses.splice(i,1);continue;}
    const hx=ptAt(tr,head),tx=ptAt(tr,tail);
    const grd=cx.createLinearGradient(tx.x,tx.y,hx.x,hx.y);
    grd.addColorStop(0,`hsla(${_H(tr.hue)},${_S(90)}%,70%,0)`);
    grd.addColorStop(1,`hsla(${_H(tr.hue)},${_S(90)}%,70%,0.9)`);
    cx.beginPath();cx.moveTo(tx.x,tx.y);
    const steps=20;
    for(let s=1;s<=steps;s++){const f=tail+(head-tail)*s/steps;const pt=ptAt(tr,Math.min(f,1));cx.lineTo(pt.x,pt.y);}
    cx.strokeStyle=grd;cx.lineWidth=2;cx.stroke();
    cx.beginPath();cx.arc(hx.x,hx.y,3,0,Math.PI*2);cx.fillStyle=`hsla(${_H(tr.hue)},${_S(90)}%,80%,0.95)`;cx.fill();
    p.pos+=p.speed*0.008;
  }
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
