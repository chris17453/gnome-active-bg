// Constellation
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const N = Math.round(C.stars ?? 70);
const CONN_DIST = C.linkDist ?? 140;
const CONN_DIST_SQ = CONN_DIST*CONN_DIST;
const STAR_SPEED = C.speed ?? 1.0;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));

let W=0,H=0,t=0;
let mx=-9999,my=-9999;
const stars=[];

const sprite=document.createElement('canvas');
const SPRITE_SIZE=32;
sprite.width=sprite.height=SPRITE_SIZE;
const sx=sprite.getContext('2d');
const sr=SPRITE_SIZE/2;
const sgrd=sx.createRadialGradient(sr,sr,0,sr,sr,sr);
sgrd.addColorStop(0,'rgba(220,240,255,1)');
sgrd.addColorStop(0.15,'rgba(140,210,255,0.85)');
sgrd.addColorStop(0.4,'rgba(60,160,255,0.35)');
sgrd.addColorStop(1,'rgba(0,100,220,0)');
sx.fillStyle=sgrd;
sx.beginPath();sx.arc(sr,sr,sr,0,Math.PI*2);sx.fill();

function build(){
  stars.length=0;
  for(let i=0;i<N;i++) stars.push({
    x:Math.random()*W,y:Math.random()*H,
    vx:(Math.random()-0.5)*0.15*STAR_SPEED,vy:(Math.random()-0.5)*0.15*STAR_SPEED,
    r:Math.random()*7+6,hue:195+Math.random()*35,
    alpha:0.55+Math.random()*0.4,phase:Math.random()*Math.PI*2
  });
}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;build();}

function draw(){
  cx.clearRect(0,0,W,H);t+=0.003;
  cx.globalCompositeOperation='lighter';
  for(let i=0;i<stars.length;i++){
    const a=stars[i];
    for(let j=i+1;j<stars.length;j++){
      const b=stars[j];
      const dx=a.x-b.x,dy=a.y-b.y, dSq=dx*dx+dy*dy;
      if(dSq>CONN_DIST_SQ) continue;
      const k=1-Math.sqrt(dSq)/CONN_DIST;
      cx.strokeStyle=`hsla(${_H(204)},${_S(100)}%,66%,${0.28*k})`;cx.lineWidth=1.2*k+0.3;
      cx.beginPath();cx.moveTo(a.x,a.y);cx.lineTo(b.x,b.y);cx.stroke();
    }
    if(mx>0){
      const dx=a.x-mx,dy=a.y-my, dSq=dx*dx+dy*dy;
      if(dSq<40000){const k=1-Math.sqrt(dSq)/200;cx.strokeStyle=`hsla(${_H(204)},${_S(100)}%,75%,${0.6*k})`;cx.lineWidth=1.4*k+0.4;cx.beginPath();cx.moveTo(a.x,a.y);cx.lineTo(mx,my);cx.stroke();}
    }
  }
  for(const s of stars){
    s.x+=s.vx;s.y+=s.vy;
    if(s.x<0)s.x=W; else if(s.x>W)s.x=0;
    if(s.y<0)s.y=H; else if(s.y>H)s.y=0;
    const twinkle=s.alpha*(0.75+Math.sin(t*2+s.phase)*0.25);
    const d=s.r*2;
    cx.globalAlpha=twinkle;
    cx.drawImage(sprite,s.x-s.r,s.y-s.r,d,d);
  }
  cx.globalAlpha=1;
  if(mx>0) cx.drawImage(sprite,mx-14,my-14,28,28);
  cx.globalCompositeOperation='source-over';
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
host.addEventListener('mousemove',(e)=>{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;});
host.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;});
