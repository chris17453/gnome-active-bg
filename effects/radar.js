// RadarSweep
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const BLIP_COUNT = Math.round(C.blips ?? 55);
const SWEEP_MUL = C.sweepSpeed ?? 1.0;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));
// rgba(0,194,255) ≈ hsl(192,100%,50%); rgba(0,255,200) ≈ hsl(167,100%,50%);
// rgba(0,220,170) ≈ hsl(166,100%,43%)
const HUE_SWEEP = _H(192);
const SAT_SWEEP = _S(100);
const HUE_HIT = _H(167);
const SAT_HIT = _S(100);

let W=0,H=0;
let angle=0;
const blips=[];

function rndBlip(){return {x:Math.random()*W,y:Math.random()*H,age:0,maxAge:220+Math.random()*280,size:1.2+Math.random()*2.8};}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;blips.length=0;for(let i=0;i<BLIP_COUNT;i++) blips.push(rndBlip());}

const GRID = Math.round(C.gridSize ?? 52);
function drawGrid(){
  cx.strokeStyle=`hsla(${HUE_SWEEP},${SAT_SWEEP}%,50%,0.04)`;cx.lineWidth=0.5;
  for(let x=0;x<W;x+=GRID){cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,H);cx.stroke();}
  for(let y=0;y<H;y+=GRID){cx.beginPath();cx.moveTo(0,y);cx.lineTo(W,y);cx.stroke();}
}

function draw(){
  cx.clearRect(0,0,W,H);drawGrid();
  const OX=W*0.5,OY=H*0.5;
  const R=Math.hypot(W,H)*0.62;
  const sweepLen=Math.PI*0.5;
  cx.save();cx.translate(OX,OY);
  for(let i=0;i<30;i++){
    const a=angle-sweepLen*(1-i/30);
    const alpha=0.006*i;
    cx.beginPath();cx.moveTo(0,0);cx.arc(0,0,R,a-0.04,a+0.04);cx.closePath();
    cx.fillStyle=`hsla(${HUE_SWEEP},${SAT_SWEEP}%,50%,${alpha})`;cx.fill();
  }
  cx.restore();
  cx.beginPath();cx.moveTo(OX,OY);cx.lineTo(OX+Math.cos(angle)*R,OY+Math.sin(angle)*R);
  cx.strokeStyle=`hsla(${HUE_SWEEP},${SAT_SWEEP}%,50%,0.5)`;cx.lineWidth=1.2;cx.stroke();
  const sweepStart=angle-sweepLen;
  const x1=OX+Math.cos(sweepStart)*R, y1=OY+Math.sin(sweepStart)*R;
  cx.beginPath();cx.moveTo(OX,OY);cx.lineTo(x1,y1);
  cx.strokeStyle=`hsla(${HUE_SWEEP},${SAT_SWEEP}%,50%,0.08)`;cx.lineWidth=0.5;cx.stroke();
  for(const b of blips){
    const bAngle=Math.atan2(b.y-OY,b.x-OX);
    let diff=((angle-bAngle)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    if(diff<sweepLen) b.age=0;
    b.age++;
    const fade=Math.max(0,1-b.age/b.maxAge);
    if(fade<=0) continue;
    const grd=cx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.size*4);
    const hit=(diff<sweepLen&&b.age<10);
    grd.addColorStop(0,hit?`hsla(${HUE_HIT},${SAT_HIT}%,50%,${fade})`:`hsla(${HUE_HIT},${SAT_HIT}%,43%,${fade*0.85})`);
    grd.addColorStop(1,`hsla(${HUE_HIT},${SAT_HIT}%,43%,0)`);
    cx.beginPath();cx.arc(b.x,b.y,b.size*4,0,Math.PI*2);cx.fillStyle=grd;cx.fill();
    if(hit){cx.beginPath();cx.arc(b.x,b.y,b.size,0,Math.PI*2);cx.fillStyle=`hsla(${HUE_HIT},${SAT_HIT}%,50%,${fade*0.9})`;cx.fill();}
  }
  for(let i=0;i<blips.length;i++) if(blips[i].age>blips[i].maxAge) blips[i]=rndBlip();
  angle+=0.01*SWEEP_MUL;
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
