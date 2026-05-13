// NeuralFire
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const LAYERS = Math.round(C.layers ?? 7);
const PER_LAYER = Math.round(C.perLayer ?? 9);
const CONNECTIVITY = C.connectivity ?? 0.4;
const FIRE_MUL = C.fireRate ?? 1.0;
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));
// rgba(167,139,250) ≈ hsl(252,95%,76%); rgba(129,140,248) ≈ hsl(234,89%,74%)
const HUE_FIRE = _H(252);
const SAT_FIRE = _S(95);
const HUE_SYN  = _H(234);
const SAT_SYN  = _S(89);

let W=0,H=0,t=0;
let mx=-9999,my=-9999;
const neurons=[], synapses=[], signals=[];

function build(){
  neurons.length=0;synapses.length=0;signals.length=0;
  for(let l=0;l<LAYERS;l++) for(let n=0;n<PER_LAYER;n++)
    neurons.push({x:(l+0.5)/LAYERS*W+(Math.random()-0.5)*W*0.06,y:(n+0.5)/PER_LAYER*H+(Math.random()-0.5)*H*0.06,fire:0,charge:0,layer:l});
  for(let l=0;l<LAYERS-1;l++) for(let a=0;a<PER_LAYER;a++){
    const from=l*PER_LAYER+a;
    for(let b=0;b<PER_LAYER;b++) if(Math.random()<CONNECTIVITY) synapses.push({from,to:(l+1)*PER_LAYER+b});
  }
}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;build();}
function maybeFireRandom(){if(Math.random()<0.015*FIRE_MUL){const n=neurons[Math.floor(Math.random()*PER_LAYER)];n.fire=1;}}

function draw(){
  cx.clearRect(0,0,W,H);t+=0.008;maybeFireRandom();
  if(mx>0) for(const n of neurons){const dx=n.x-mx,dy=n.y-my;if(Math.sqrt(dx*dx+dy*dy)<80&&Math.random()<0.08) n.fire=1;}
  for(const n of neurons){
    if(n.fire>0){
      n.charge=Math.min(1,n.charge+0.15);
      for(const s of synapses){
        if(s.from===neurons.indexOf(n)&&n.fire>0.5&&Math.random()<0.08)
          signals.push({syn:synapses.indexOf(s),pos:0,speed:0.02+Math.random()*0.015});
      }
      n.fire=Math.max(0,n.fire-0.04);
    }
    n.charge=Math.max(0,n.charge-0.008);
  }
  for(let i=signals.length-1;i>=0;i--){
    const sig=signals[i];sig.pos+=sig.speed;
    if(sig.pos>=1){const s=synapses[sig.syn];if(s)neurons[s.to].fire=Math.max(neurons[s.to].fire,0.8);signals.splice(i,1);continue;}
    const s=synapses[sig.syn];if(!s)continue;
    const a=neurons[s.from],b=neurons[s.to];
    const px=a.x+(b.x-a.x)*sig.pos, py=a.y+(b.y-a.y)*sig.pos;
    const g=cx.createRadialGradient(px,py,0,px,py,6);
    g.addColorStop(0,`hsla(${HUE_FIRE},${SAT_FIRE}%,76%,0.9)`);g.addColorStop(1,`hsla(${HUE_FIRE},${SAT_FIRE}%,76%,0)`);
    cx.beginPath();cx.arc(px,py,6,0,Math.PI*2);cx.fillStyle=g;cx.fill();
  }
  for(const s of synapses){
    const a=neurons[s.from],b=neurons[s.to];
    cx.beginPath();cx.moveTo(a.x,a.y);cx.lineTo(b.x,b.y);
    cx.strokeStyle=`hsla(${HUE_SYN},${SAT_SYN}%,74%,0.07)`;cx.lineWidth=0.6;cx.stroke();
  }
  for(const n of neurons){
    const c=n.charge, baseR=4;
    if(c>0.1){
      const grd=cx.createRadialGradient(n.x,n.y,0,n.x,n.y,baseR+c*16);
      grd.addColorStop(0,`hsla(${HUE_FIRE},${SAT_FIRE}%,76%,${c*0.8})`);grd.addColorStop(1,`hsla(${HUE_FIRE},${SAT_FIRE}%,76%,0)`);
      cx.beginPath();cx.arc(n.x,n.y,baseR+c*16,0,Math.PI*2);cx.fillStyle=grd;cx.fill();
    }
    cx.beginPath();cx.arc(n.x,n.y,baseR,0,Math.PI*2);
    cx.fillStyle=`hsla(${HUE_FIRE},${SAT_FIRE}%,76%,${0.25+c*0.7})`;cx.fill();
  }
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
host.addEventListener('mousemove',(e)=>{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;});
host.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;});
