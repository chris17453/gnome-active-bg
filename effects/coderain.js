// CodeRain
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.appendChild(cv);
const host = document.body;
const cx = cv.getContext('2d');

const C = window.AB_CFG || {};
const SPEED_MUL = C.speed ?? 1.0;
const FONT_SIZE = Math.round(C.fontSize ?? 13);
const DENSITY = C.density ?? 1.0;
const CHARSET = C.charset ?? 'code';
const HUE_SHIFT = C.paletteShift ?? 0;
const SAT_MUL = C.saturation ?? 1.0;
const _H = h => ((Math.round(h + HUE_SHIFT) % 360) + 360) % 360;
const _S = s => Math.max(0, Math.min(100, s * SAT_MUL));

const CHARSETS = {
  code:    '01{}[]()=>const let fn type import export default async await'.replace(/\s+/g,''),
  binary:  '01',
  katakana:'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズヅブプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン',
  hex:     '0123456789ABCDEF',
};
const CHARS = (CHARSETS[CHARSET] || CHARSETS.code).split('');

let W=0,H=0;
const COL_W = Math.max(8, Math.round((FONT_SIZE + 5) / DENSITY));
const cols=[];

function mkCol(x,y){
  const len=8+Math.floor(Math.random()*16);
  return {x,y:y??-Math.random()*H*1.5,speed:(1.2+Math.random()*2)*SPEED_MUL,len,
    chars:Array.from({length:len},()=>CHARS[Math.floor(Math.random()*CHARS.length)]),
    hue:190+Math.random()*40};
}
function build(){cols.length=0;const n=Math.ceil(W/COL_W);for(let i=0;i<n;i++) cols.push(mkCol(i*COL_W,-Math.random()*H));}
function resize(){const w=cv.offsetWidth,h=cv.offsetHeight;if(w===W&&h===H)return;W=cv.width=w;H=cv.height=h;build();}

function draw(){
  cx.clearRect(0,0,W,H);
  cx.font=`${FONT_SIZE}px 'JetBrains Mono',monospace`;
  cx.textAlign='center';
  for(const col of cols){
    col.y+=col.speed;
    if(Math.random()<0.03) col.chars[Math.floor(Math.random()*col.chars.length)]=CHARS[Math.floor(Math.random()*CHARS.length)];
    for(let i=0;i<col.chars.length;i++){
      const cy=col.y-i*FONT_SIZE;
      if(cy<-FONT_SIZE||cy>H+FONT_SIZE) continue;
      const frac=1-i/col.chars.length;
      let alpha;
      if(i===0) alpha=0.9;
      else if(i<3) alpha=0.5*frac;
      else alpha=0.12*frac;
      cx.fillStyle=i===0?`hsla(${_H(col.hue)},${_S(90)}%,85%,${alpha})`:`hsla(${_H(col.hue)},${_S(70)}%,60%,${alpha})`;
      cx.fillText(col.chars[i],col.x+COL_W/2,cy);
    }
    if(col.y-col.len*FONT_SIZE>H) Object.assign(col,mkCol(col.x,-FONT_SIZE*col.len));
  }
  requestAnimationFrame(draw);
}
let _go=false;
new ResizeObserver(()=>{resize();if(!_go){_go=true;draw();}}).observe(host);
