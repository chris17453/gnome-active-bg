// Blueprint
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const GRID = Math.round(C.gridSize ?? 80);
const MINOR = Math.max(4, Math.round(GRID / 4));
const SPAWN_MUL = C.spawnRate ?? 1.0;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const HUE = (((C.hue ?? 195) + HUE_SHIFT) % 360 + 360) % 360;
const SAT = Math.max(0, Math.min(100, 85 * SAT_MUL));

let W=0,H=0,t=0;
let mx=-9999,my=-9999;
const crosshairs=[], buildLines=[], measures=[];

function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;}

function drawGrid(){
  cx.strokeStyle=`hsla(${HUE},${SAT}%,55%,0.025)`;cx.lineWidth=0.5;
  for(let x=0;x<=W;x+=MINOR){cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,H);cx.stroke();}
  for(let y=0;y<=H;y+=MINOR){cx.beginPath();cx.moveTo(0,y);cx.lineTo(W,y);cx.stroke();}
  cx.strokeStyle=`hsla(${HUE},${SAT}%,55%,0.06)`;cx.lineWidth=0.7;
  for(let x=0;x<=W;x+=GRID){cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,H);cx.stroke();}
  for(let y=0;y<=H;y+=GRID){cx.beginPath();cx.moveTo(0,y);cx.lineTo(W,y);cx.stroke();}
  cx.fillStyle=`hsla(${HUE},${SAT}%,55%,0.18)`;
  for(let x=0;x<=W;x+=GRID) for(let y=0;y<=H;y+=GRID){cx.beginPath();cx.arc(x,y,1.4,0,Math.PI*2);cx.fill();}
}
function snapToGrid(){
  const cols=Math.max(1,Math.floor(W/GRID)), rows=Math.max(1,Math.floor(H/GRID));
  return {x:Math.floor(Math.random()*(cols+1))*GRID,y:Math.floor(Math.random()*(rows+1))*GRID};
}
function maybeSpawn(){
  if(crosshairs.length<3 && Math.random()<0.012*SPAWN_MUL){const p=snapToGrid();crosshairs.push({x:p.x,y:p.y,age:0,maxAge:60+Math.random()*50});}
  if(buildLines.length<4 && Math.random()<0.008*SPAWN_MUL){
    const p=snapToGrid();const dir=Math.floor(Math.random()*4);
    const dist=GRID*(1+Math.floor(Math.random()*3));
    let x2=p.x,y2=p.y;
    if(dir===0) x2+=dist; else if(dir===1) y2+=dist; else if(dir===2) x2-=dist; else y2-=dist;
    if(x2<0||x2>W||y2<0||y2>H) return;
    buildLines.push({x1:p.x,y1:p.y,x2,y2,progress:0,life:0,maxLife:100});
  }
  if(measures.length<2 && Math.random()<0.006*SPAWN_MUL){
    const p=snapToGrid();const dir=Math.random()<0.5?0:1;
    const w=GRID*(1+Math.floor(Math.random()*3));
    measures.push({x:p.x,y:p.y,w,dir,age:0,maxAge:90});
  }
}
function drawCrosshair(x,y,alpha,size){
  cx.strokeStyle=`hsla(${HUE},${SAT}%,55%,${alpha})`;cx.lineWidth=0.9;
  cx.beginPath();cx.moveTo(x-size,y);cx.lineTo(x+size,y);cx.moveTo(x,y-size);cx.lineTo(x,y+size);cx.stroke();
  cx.fillStyle=`hsla(${HUE},${SAT}%,55%,${alpha*1.4})`;cx.beginPath();cx.arc(x,y,1.8,0,Math.PI*2);cx.fill();
}
function drawMeasure(m,alpha){
  cx.strokeStyle=`hsla(${HUE},${SAT}%,55%,${alpha})`;cx.lineWidth=0.7;
  if(m.dir===0){cx.beginPath();cx.moveTo(m.x,m.y-4);cx.lineTo(m.x,m.y+4);cx.moveTo(m.x+m.w,m.y-4);cx.lineTo(m.x+m.w,m.y+4);cx.moveTo(m.x,m.y);cx.lineTo(m.x+m.w,m.y);cx.stroke();}
  else {cx.beginPath();cx.moveTo(m.x-4,m.y);cx.lineTo(m.x+4,m.y);cx.moveTo(m.x-4,m.y+m.w);cx.lineTo(m.x+4,m.y+m.w);cx.moveTo(m.x,m.y);cx.lineTo(m.x,m.y+m.w);cx.stroke();}
}
function draw(){
  cx.clearRect(0,0,W,H);t+=0.01;
  maybeSpawn();drawGrid();
  for(let i=crosshairs.length-1;i>=0;i--){
    const c=crosshairs[i];c.age++;
    if(c.age>=c.maxAge){crosshairs.splice(i,1);continue;}
    const k=c.age<10?(c.age/10):(1-(c.age-10)/(c.maxAge-10));
    drawCrosshair(c.x,c.y,0.55*k,8+6*k);
  }
  for(let i=buildLines.length-1;i>=0;i--){
    const l=buildLines[i];l.progress=Math.min(1,l.progress+0.028);l.life++;
    if(l.life>=l.maxLife){buildLines.splice(i,1);continue;}
    const fadeOut=Math.max(0,1-(l.life/l.maxLife));
    const alpha=Math.min(1,l.progress)*fadeOut*0.5;
    const xCur=l.x1+(l.x2-l.x1)*l.progress, yCur=l.y1+(l.y2-l.y1)*l.progress;
    cx.strokeStyle=`hsla(${HUE},${SAT}%,55%,${alpha})`;cx.lineWidth=1;
    cx.beginPath();cx.moveTo(l.x1,l.y1);cx.lineTo(xCur,yCur);cx.stroke();
    cx.fillStyle=`hsla(${HUE},${SAT}%,55%,${alpha*1.5})`;
    cx.beginPath();cx.arc(xCur,yCur,2,0,Math.PI*2);cx.fill();
    if(l.progress>=1){cx.beginPath();cx.arc(l.x1,l.y1,2,0,Math.PI*2);cx.fill();}
  }
  for(let i=measures.length-1;i>=0;i--){
    const m=measures[i];m.age++;
    if(m.age>=m.maxAge){measures.splice(i,1);continue;}
    const k=m.age<15?(m.age/15):(1-(m.age-15)/(m.maxAge-15));
    drawMeasure(m,0.32*k);
  }
  if(mx>0){
    const gx=Math.round(mx/GRID)*GRID, gy=Math.round(my/GRID)*GRID;
    const dist=Math.hypot(mx-gx,my-gy);
    if(dist<GRID*0.7){const k=1-dist/(GRID*0.7);drawCrosshair(gx,gy,0.4*k,8+8*k);}
  }
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
host.addEventListener('mousemove',(e)=>{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;});
host.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;});
