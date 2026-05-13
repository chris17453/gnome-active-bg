// Scanner
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const SPEED = 1.2 * (C.speed ?? 1.0);
const POINT_COUNT = Math.round(C.points ?? 32);
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));
const HUE_SCAN = _H(192);
const SAT_SCAN = _S(100);
const HUE_DOT = _H(167);
const SAT_DOT = _S(100);

let W=0,H=0;
let scanY=0;
const points=[];
const LABELS=['READY','OK','✓','92%','PASS','DATA','●','◆','▲','98%','VALID','SYNC'];

function build(){
  points.length=0;scanY=0;
  for(let i=0;i<POINT_COUNT;i++) points.push({x:Math.random()*W,y:Math.random()*H,label:LABELS[Math.floor(Math.random()*LABELS.length)],revealed:false,alpha:0});
}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;build();}

function draw(){
  cx.clearRect(0,0,W,H);
  cx.font='11px monospace';
  for(const p of points){
    if(p.y<=scanY&&!p.revealed) p.revealed=true;
    if(p.revealed) p.alpha=Math.min(1,p.alpha+0.04);
    if(p.alpha>0){cx.fillStyle=`hsla(${HUE_SCAN},${SAT_SCAN}%,50%,${p.alpha*0.7})`;cx.fillText(p.label,p.x,p.y);}
  }
  const lineGrd=cx.createLinearGradient(0,scanY-30,0,scanY+4);
  lineGrd.addColorStop(0,`hsla(${HUE_SCAN},${SAT_SCAN}%,50%,0)`);
  lineGrd.addColorStop(0.7,`hsla(${HUE_SCAN},${SAT_SCAN}%,50%,0.08)`);
  lineGrd.addColorStop(1,`hsla(${HUE_SCAN},${SAT_SCAN}%,50%,0.35)`);
  cx.fillStyle=lineGrd;cx.fillRect(0,scanY-30,W,34);
  cx.beginPath();cx.moveTo(0,scanY);cx.lineTo(W,scanY);
  cx.strokeStyle=`hsla(${HUE_SCAN},${SAT_SCAN}%,50%,0.7)`;cx.lineWidth=1;cx.stroke();
  const dotX=(Date.now()*0.12)%W;
  cx.beginPath();cx.arc(dotX,scanY,3,0,Math.PI*2);cx.fillStyle=`hsla(${HUE_DOT},${SAT_DOT}%,47%,0.9)`;cx.fill();
  scanY+=SPEED;
  if(scanY>H+20){scanY=0;for(const p of points){p.revealed=false;p.alpha=0;}}
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
