// SignalRings
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const SPAWN_INTERVAL = 0.55 / (C.spawnRate ?? 1.0);
const EXPAND_MUL = C.expandSpeed ?? 1.0;
const RINGS_PER_BURST = Math.max(1, Math.round(C.ringsPerBurst ?? 3));
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));

let W=0,H=0;
let mx=-9999,my=-9999;
const rings=[];

function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;seed();}
function addRings(x,y,count=1){
  for(let i=0;i<count;i++) rings.push({x,y,r:i*22,alpha:0.7-i*0.06,hue:185+Math.random()*40,speed:(0.9+Math.random()*1.1)*EXPAND_MUL});
}
function seed(){
  rings.length=0;
  const pts=[[W*0.38,H*0.52],[W*0.62,H*0.48]];
  for(const [px,py] of pts) for(let i=0;i<7;i++) rings.push({x:px,y:py,r:i*55,alpha:Math.max(0,0.62-i*0.08),hue:190+Math.random()*35,speed:(1.0+Math.random()*0.8)*EXPAND_MUL});
}

let autoT=0;
function draw(){
  cx.clearRect(0,0,W,H);autoT+=0.014;
  if(autoT>SPAWN_INTERVAL){
    autoT=0;
    const tx=mx>0?mx:W*(0.25+Math.random()*0.5);
    const ty=mx>0?my:H*(0.3+Math.random()*0.4);
    addRings(tx,ty,RINGS_PER_BURST);
  }
  for(let i=rings.length-1;i>=0;i--){
    const rg=rings[i];
    rg.r+=rg.speed;rg.alpha-=0.0016;
    if(rg.alpha<=0||rg.r>Math.max(W,H)*0.9){rings.splice(i,1);continue;}
    cx.beginPath();cx.arc(rg.x,rg.y,rg.r,0,Math.PI*2);
    cx.strokeStyle=`hsla(${_H(rg.hue)},${_S(85)}%,65%,${rg.alpha})`;
    cx.lineWidth=1.4*(rg.alpha/0.7);cx.stroke();
    const dotAngle=Date.now()*0.0007*(i%2?1:-1)+i*0.5;
    const dotX=rg.x+Math.cos(dotAngle)*rg.r;
    const dotY=rg.y+Math.sin(dotAngle)*rg.r;
    cx.beginPath();cx.arc(dotX,dotY,2.5,0,Math.PI*2);
    cx.fillStyle=`hsla(${_H(rg.hue)},${_S(90)}%,82%,${rg.alpha*2})`;cx.fill();
  }
  if(mx>0){
    cx.beginPath();cx.arc(mx,my,6,0,Math.PI*2);cx.strokeStyle=`hsla(${_H(192)},${_S(100)}%,50%,0.45)`;cx.lineWidth=1.5;cx.stroke();
    cx.beginPath();cx.arc(mx,my,2.5,0,Math.PI*2);cx.fillStyle=`hsla(${_H(192)},${_S(100)}%,50%,0.8)`;cx.fill();
  }
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
host.addEventListener('mousemove',(e)=>{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;});
host.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;});
host.addEventListener('click',(e)=>{const r=cv.getBoundingClientRect();addRings(e.clientX-r.left,e.clientY-r.top,4);});
