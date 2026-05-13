// NodeGraph
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const N = Math.round(C.count ?? 42);
const LINK_DIST = C.linkDist ?? 180;
const SPEED_MUL = C.speed ?? 1.0;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));

let W=0,H=0,t=0;
let mx=-9999,my=-9999;
const nodes=[], edges=[];

function build(){
  nodes.length=0;edges.length=0;
  for(let i=0;i<N;i++){
    const tier=Math.floor(Math.random()*3);
    const r=tier===0?5:tier===1?3.5:2;
    nodes.push({x:Math.random()*W,y:Math.random()*H,ox:0,oy:0,
      vx:(Math.random()-0.5)*0.3*SPEED_MUL,vy:(Math.random()-0.5)*0.3*SPEED_MUL,
      r,hue:200+Math.random()*50,tier});
  }
  for(let i=0;i<N;i++){
    const conns=nodes[i].tier===0?4:nodes[i].tier===1?2:1;
    let made=0;
    for(let j=0;j<N&&made<conns;j++){
      if(i===j) continue;
      const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y;
      if(Math.sqrt(dx*dx+dy*dy)<LINK_DIST && !edges.find(e=>(e.a===i&&e.b===j)||(e.a===j&&e.b===i))){
        edges.push({a:i,b:j});made++;
      }
    }
  }
}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;build();}
const pulses=[];
function maybeAddPulse(){if(pulses.length<12&&Math.random()<0.04) pulses.push({edge:Math.floor(Math.random()*edges.length),pos:0,speed:0.008+Math.random()*0.01});}

function draw(){
  cx.clearRect(0,0,W,H);t+=0.005;maybeAddPulse();
  for(const n of nodes){
    n.x+=n.vx;n.y+=n.vy;
    if(n.x<0||n.x>W) n.vx*=-1;
    if(n.y<0||n.y>H) n.vy*=-1;
    if(mx>0){const ddx=n.x-mx,ddy=n.y-my,dist=Math.sqrt(ddx*ddx+ddy*ddy);if(dist<120){const f=(1-dist/120)*0.4;n.vx+=ddx/dist*f;n.vy+=ddy/dist*f;}}
  }
  for(const e of edges){
    const a=nodes[e.a],b=nodes[e.b];
    cx.beginPath();cx.moveTo(a.x,a.y);cx.lineTo(b.x,b.y);
    cx.strokeStyle=`hsla(${_H(214)},${_S(100)}%,69%,0.35)`;cx.lineWidth=1.0;cx.stroke();
  }
  for(let i=pulses.length-1;i>=0;i--){
    const p=pulses[i];p.pos+=p.speed;
    if(p.pos>=1){pulses.splice(i,1);continue;}
    const e=edges[p.edge];if(!e)continue;
    const a=nodes[e.a],b=nodes[e.b];
    const px=a.x+(b.x-a.x)*p.pos, py=a.y+(b.y-a.y)*p.pos;
    const grd=cx.createRadialGradient(px,py,0,px,py,5);
    grd.addColorStop(0,`hsla(${_H(214)},${_S(100)}%,69%,0.9)`);grd.addColorStop(1,`hsla(${_H(214)},${_S(100)}%,69%,0)`);
    cx.beginPath();cx.arc(px,py,5,0,Math.PI*2);cx.fillStyle=grd;cx.fill();
  }
  for(const n of nodes){
    const glow=n.tier===0?12:n.tier===1?8:5;
    const g=cx.createRadialGradient(n.x,n.y,0,n.x,n.y,glow);
    g.addColorStop(0,`hsla(${_H(n.hue)},${_S(80)}%,70%,0.9)`);
    g.addColorStop(1,`hsla(${_H(n.hue)},${_S(80)}%,70%,0)`);
    cx.beginPath();cx.arc(n.x,n.y,glow,0,Math.PI*2);cx.fillStyle=g;cx.fill();
    cx.beginPath();cx.arc(n.x,n.y,n.r,0,Math.PI*2);
    cx.fillStyle=`hsla(${_H(n.hue)},${_S(80)}%,72%,0.95)`;cx.fill();
  }
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
host.addEventListener('mousemove',(e)=>{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;});
host.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;});
