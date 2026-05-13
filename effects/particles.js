// Particles
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(canvas);
const host = document.body;
const ctx = canvas.getContext('2d');

const C = window.AB_CFG || {};
const COUNT = Math.round(C.count ?? 90);
const MAX_DIST = C.linkDist ?? 130;
const MOUSE_R = C.mouseRadius ?? 110;
const MOUSE_PUSH = 2.8;
const SPEED = 0.45 * (C.speed ?? 1.0);
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
const COLORS = ['#00C2FF','#60A5FF','#818CF8','#a78bfa','#67E3FF'].map(_hex2hsl);

let W=0,H=0;
let mx=-9999,my=-9999;
let particles=[];
function rand(a,b){return a+Math.random()*(b-a);}
function init(){particles=Array.from({length:COUNT},()=>({x:rand(0,W),y:rand(0,H),vx:rand(-SPEED,SPEED),vy:rand(-SPEED,SPEED),r:rand(1.5,3.2),color:COLORS[Math.floor(Math.random()*COLORS.length)],alpha:rand(0.4,0.85)}));}
function resize(){W=canvas.width=canvas.offsetWidth;H=canvas.height=canvas.offsetHeight;init();}
function _tint(hsl, a){return `hsla(${_H(hsl[0])},${_S(hsl[1])}%,${hsl[2]}%,${a})`;}

function draw(){
  ctx.clearRect(0,0,W,H);
  for(const p of particles){
    const dx=p.x-mx, dy=p.y-my, dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<MOUSE_R&&dist>0){const force=(1-dist/MOUSE_R)*MOUSE_PUSH;p.vx+=(dx/dist)*force*0.08;p.vy+=(dy/dist)*force*0.08;}
    p.vx*=0.995;p.vy*=0.995;
    const spd=Math.sqrt(p.vx*p.vx+p.vy*p.vy);
    if(spd>SPEED*2.5){p.vx*=SPEED*2.5/spd;p.vy*=SPEED*2.5/spd;}
    if(spd<0.05){p.vx+=rand(-0.05,0.05);p.vy+=rand(-0.05,0.05);}
    p.x+=p.vx;p.y+=p.vy;
    if(p.x<-10)p.x=W+10; if(p.x>W+10)p.x=-10;
    if(p.y<-10)p.y=H+10; if(p.y>H+10)p.y=-10;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fillStyle=_tint(p.color, p.alpha);
    ctx.fill();
  }
  for(let i=0;i<particles.length;i++) for(let j=i+1;j<particles.length;j++){
    const a=particles[i],b=particles[j];
    const dx=a.x-b.x, dy=a.y-b.y, dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<MAX_DIST){
      const alpha=(1-dist/MAX_DIST)*0.25;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
      ctx.strokeStyle=_tint(a.color, alpha);ctx.lineWidth=0.8;ctx.stroke();
    }
  }
  requestAnimationFrame(draw);
}
resize();
new ResizeObserver(resize).observe(host);
host.addEventListener('mousemove',(e)=>{const rect=canvas.getBoundingClientRect();mx=e.clientX-rect.left;my=e.clientY-rect.top;});
host.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;});
draw();
