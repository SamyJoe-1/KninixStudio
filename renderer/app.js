'use strict';
// Kninix editor front end. Preview plays an ffmpeg H.264 proxy (any codec works).
// Sections sidebar (Media/Text/Shapes/Widgets/Sticker/Filters/Audio), a clickable/
// draggable/trimmable timeline with zoom, a canvas for text+shapes+widgets with IN/OUT
// animations, a Layers panel (z-order/visibility/lock), marquee multi-select, and clip
// transitions. Heavy work runs in separate ffmpeg processes — the FPS meter proves smooth.

window.addEventListener('error', (e) => console.error('UI error:', e.message, 'at', e.filename + ':' + e.lineno));
const el = (id) => document.getElementById(id);
const PW = 1280, PH = 720;
let pxPerSec = 80;

let state = { media:{}, tracks:[], objects:[], duration:0, canUndo:false, canRedo:false };
let selection = { kind:null, id:null, ids:[] };
let playhead = 0, playing = false;
const jobs = new Map();

const vid = el('vid'), overlay = el('overlay'), octx = overlay.getContext('2d');
let interacting = false, pendingState = null;

async function rpc(method, params){ const r = await window.kx.rpc(method, params); if(!r.ok){ setStatus('⚠ '+r.error); throw new Error(r.error);} return r.result; }
function setStatus(m){ el('status').textContent = m; }
function fmt(s){ s=Math.max(0,s||0); const m=Math.floor(s/60); return `${m}:${(s%60).toFixed(1).padStart(4,'0')}`; }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); const lerp=(a,b,t)=>a+(b-a)*t;
const easeOut=p=>1-Math.pow(1-clamp(p,0,1),3);
const easeOutBack=p=>{ const c=1.70158+1; p=clamp(p,0,1); return 1+ (c+1)*Math.pow(p-1,3)+c*Math.pow(p-1,2); };

// ===================================================== FPS meter
(function(){ let f=0,last=performance.now(); (function t(now){ f++; if(now-last>=500){ const v=Math.round(f*1000/(now-last)); el('fps').textContent=v; el('fps').style.color=v>=50?'var(--pos)':v>=30?'var(--warn)':'var(--danger)'; f=0; last=now; } requestAnimationFrame(t); })(performance.now()); })();

// ===================================================== FILTERS / ANIM
const FILTERS=[{id:'none',label:'None',css:''},{id:'bw',label:'B&W',css:'grayscale(1)'},{id:'sepia',label:'Sepia',css:'sepia(.8)'},{id:'warm',label:'Warm',css:'saturate(1.3) brightness(1.05) hue-rotate(-10deg)'},{id:'cool',label:'Cool',css:'saturate(1.2) hue-rotate(15deg)'},{id:'vivid',label:'Vivid',css:'saturate(1.7) contrast(1.1)'},{id:'vintage',label:'Vintage',css:'sepia(.4) contrast(.9) saturate(.85) brightness(1.05)'},{id:'cinematic',label:'Cinematic',css:'contrast(1.18) saturate(1.1) brightness(.95)'},{id:'fade',label:'Fade',css:'contrast(.85) brightness(1.1) saturate(.8)'},{id:'invert',label:'Invert',css:'invert(1)'}];
const FILTER_CSS=Object.fromEntries(FILTERS.map(f=>[f.id,f.css]));
const ANIM=['none','fade','slideL','slideR','slideUp','slideDown','pop','zoom','spin','bounce'];

// ===================================================== PLAYBACK
function videoClips(){ const t=(state.tracks||[]).find(t=>t.kind==='video'); return t?[...t.clips].sort((a,b)=>a.timelineIn-b.timelineIn):[]; }
function clipAt(time){ return videoClips().find(c=>time>=c.timelineIn-1e-3 && time<c.timelineOut-1e-3)||null; }
function totalDuration(){ return Math.max(state.duration||0,0); }
function clipSrc(clip){ const m=state.media[clip.mediaId]; if(!m) return null; const p=m.proxy||m.path; return 'file:///'+String(p).replace(/\\/g,'/'); }

let curClipId=null, pendingSeek=null, wantPlay=false;
function applyPending(){ if(pendingSeek!=null&&isFinite(pendingSeek)&&vid.readyState>=1){ try{vid.currentTime=Math.max(0,pendingSeek);}catch(_){} pendingSeek=null; } }
vid.addEventListener('loadedmetadata',applyPending);
vid.addEventListener('canplay',()=>{ applyPending(); if(wantPlay&&vid.paused) vid.play().catch(()=>{}); });
function loadClip(clip,at){ const src=clipSrc(clip); if(!src) return; const srcTime=Math.max(0,clip.sourceIn+(at-clip.timelineIn)); el('noclip').style.display='none'; vid.style.visibility='visible';
  if(curClipId!==clip.id||vid.getAttribute('data-src')!==src){ curClipId=clip.id; vid.setAttribute('data-src',src); pendingSeek=srcTime; vid.src=src; } else { try{vid.currentTime=srcTime;}catch(_){} } }
function showNoClip(){ vid.pause(); vid.style.visibility='hidden'; el('noclip').style.display='grid'; el('noclip').textContent='▶ Add a clip and press play'; curClipId=null; vid.removeAttribute('data-src'); }
function play(){ let c=clipAt(playhead)||videoClips().find(x=>x.timelineIn>=playhead-1e-3); if(!c){ setStatus('Nothing to play.'); return; } if(playhead<c.timelineIn)playhead=c.timelineIn; playing=true; wantPlay=true; el('btnPlay').textContent='⏸'; loadClip(c,playhead); vid.play().catch(()=>{}); }
function pause(){ playing=false; wantPlay=false; vid.pause(); el('btnPlay').textContent='▶'; }
function togglePlay(){ playing?pause():play(); }
function stop(){ pause(); seekTo(0); }
function seekTo(time){ playhead=Math.max(0,Math.min(time,Math.max(totalDuration(),0.001))); const c=clipAt(playhead); if(c) loadClip(c,playhead); else showNoClip(); }

(function loop(){
  if(playing){ const c=clipAt(playhead);
    if(c){ const t=c.timelineIn+(vid.currentTime-c.sourceIn); if(isFinite(t))playhead=t;
      if(playhead>=c.timelineOut-0.04){ const next=videoClips().find(x=>x.timelineIn>=c.timelineOut-1e-2); if(next){playhead=next.timelineIn; loadClip(next,playhead);} else { pause(); playhead=totalDuration(); } } }
    else { const next=videoClips().find(x=>x.timelineIn>playhead); if(next){playhead=next.timelineIn; loadClip(next,playhead);} else pause(); } }
  const ac=clipAt(playhead); vid.style.filter=ac?(FILTER_CSS[ac.filter||'none']||''):'';
  drawOverlay(); el('tcur').textContent=fmt(playhead); el('tdur').textContent=fmt(totalDuration()); positionPlayhead();
  requestAnimationFrame(loop);
})();
function positionPlayhead(){ const ph=el('playhead'); ph.style.left=(playhead*pxPerSec)+'px'; ph.style.height=(22+el('tracks').offsetHeight)+'px'; }

// ===================================================== CANVAS DRAW
function objVisible(o){ return !o.hidden && playhead>=(o.start||0)-1e-3 && playhead<=(o.end||1e9)+1e-3; }
function findObj(id){ return (state.objects||[]).find(o=>o.id===id); }

function animFactor(o){ const res={alpha:1,tx:0,ty:0,sx:1,sy:1,rot:0}; const D=320;
  const apply=(type,e)=>{ switch(type){
    case 'fade': res.alpha*=e; break;
    case 'slideL': res.tx+=-D*(1-e); res.alpha*=clamp(e+0.2,0,1); break;
    case 'slideR': res.tx+=D*(1-e); res.alpha*=clamp(e+0.2,0,1); break;
    case 'slideUp': res.ty+=D*(1-e); res.alpha*=clamp(e+0.2,0,1); break;
    case 'slideDown': res.ty+=-D*(1-e); res.alpha*=clamp(e+0.2,0,1); break;
    case 'pop': { const s=lerp(0.5,1,e); res.sx*=s; res.sy*=s; res.alpha*=e; break; }
    case 'zoom': { const s=lerp(1.6,1,e); res.sx*=s; res.sy*=s; res.alpha*=e; break; }
    case 'spin': { res.rot+=(1-e)*Math.PI; res.alpha*=e; break; }
    case 'bounce': { const s=easeOutBack(e); res.sx*=s; res.sy*=s; res.alpha*=clamp(e+0.2,0,1); break; }
  }};
  if(o.animIn&&o.animIn.type!=='none'&&(o.animIn.dur||0)>0){ const p=(playhead-(o.start||0))/o.animIn.dur; if(p<1) apply(o.animIn.type, easeOut(p)); }
  if(o.animOut&&o.animOut.type!=='none'&&(o.animOut.dur||0)>0){ const p=((o.end||0)-playhead)/o.animOut.dur; if(p<1) apply(o.animOut.type, easeOut(p)); }
  return res;
}

function drawOverlay(){
  octx.clearRect(0,0,PW,PH);
  // clip transition (dip to black/white)
  const tr=clipTrans(); if(tr.a>0){ octx.globalAlpha=tr.a; octx.fillStyle=tr.color; octx.fillRect(0,0,PW,PH); octx.globalAlpha=1; }
  for(const o of state.objects||[]){ if(!objVisible(o)) continue; drawObject(o); }
  // selection chrome
  if(selection.kind==='object'){ const o=findObj(selection.id); if(o&&objVisible(o)) drawHandles(o,true); }
  else if(selection.kind==='multi'){ for(const id of selection.ids){ const o=findObj(id); if(o&&objVisible(o)) drawHandles(o,false); } }
}
function clipTrans(){ const c=clipAt(playhead); if(!c) return {a:0}; let a=0,color='#000';
  if(c.transIn&&c.transIn.type&&c.transIn.type!=='none'){ const d=c.transIn.dur||0.5; const p=(playhead-c.timelineIn)/d; if(p<1){ a=Math.max(a,1-clamp(p,0,1)); color=c.transIn.type==='dipwhite'?'#fff':'#000'; } }
  if(c.transOut&&c.transOut.type&&c.transOut.type!=='none'){ const d=c.transOut.dur||0.5; const p=(c.timelineOut-playhead)/d; if(p<1){ const aa=1-clamp(p,0,1); if(aa>a){a=aa; color=c.transOut.type==='dipwhite'?'#fff':'#000';} } }
  return {a,color}; }

function drawObject(o){ const f=animFactor(o); octx.save(); const cx=o.x+o.w/2, cy=o.y+o.h/2;
  octx.translate(cx+f.tx,cy+f.ty); octx.rotate(f.rot); octx.scale(f.sx,f.sy); octx.translate(-cx,-cy);
  octx.globalAlpha=(o.opacity!=null?o.opacity:1)*clamp(f.alpha,0,1);
  if(o.type==='text') drawText(o); else if(o.type==='widget') drawWidget(o); else drawShape(o);
  octx.restore(); octx.globalAlpha=1; }

function drawText(o){ octx.fillStyle=o.color; octx.textBaseline='top'; octx.font=`bold ${o.fontSize}px "Segoe UI",system-ui,sans-serif`; octx.textAlign=o.align||'center'; const tx=o.align==='left'?o.x:o.align==='right'?o.x+o.w:o.x+o.w/2; wrapText(o.text||'',tx,o.y,o.w,o.fontSize*1.12); }
function wrapText(text,x,y,maxW,lh){ const words=String(text).split(/\s+/); let line='',yy=y; for(const w of words){ const test=line?line+' '+w:w; if(octx.measureText(test).width>maxW&&line){octx.fillText(line,x,yy); line=w; yy+=lh;} else line=test; } if(line)octx.fillText(line,x,yy); }

function drawShape(o){ const c=octx,x=o.x,y=o.y,w=o.w,h=o.h; c.fillStyle=o.color; c.strokeStyle=o.color;
  switch(o.shape){ case 'rect': c.fillRect(x,y,w,h); break;
    case 'roundrect': roundRect(c,x,y,w,h,Math.min(o.radius||32,Math.min(w,h)/2)); c.fill(); break;
    case 'ellipse': c.beginPath(); c.ellipse(x+w/2,y+h/2,Math.abs(w/2),Math.abs(h/2),0,0,7); c.fill(); break;
    case 'triangle': poly(c,[[x+w/2,y],[x+w,y+h],[x,y+h]]); c.fill(); break;
    case 'diamond': poly(c,[[x+w/2,y],[x+w,y+h/2],[x+w/2,y+h],[x,y+h/2]]); c.fill(); break;
    case 'star': starPath(c,x+w/2,y+h/2,Math.min(w,h)/2,Math.min(w,h)/4.4,5); c.fill(); break;
    case 'pentagon': regPoly(c,x+w/2,y+h/2,Math.min(w,h)/2,5,-Math.PI/2); c.fill(); break;
    case 'hexagon': regPoly(c,x+w/2,y+h/2,Math.min(w,h)/2,6,-Math.PI/2); c.fill(); break;
    case 'heart': heartPath(c,x,y,w,h); c.fill(); break;
    case 'arrow': arrowPath(c,x,y,w,h); c.fill(); break;
    case 'line': c.lineWidth=Math.max(6,h*0.2); c.beginPath(); c.moveTo(x,y+h/2); c.lineTo(x+w,y+h/2); c.stroke(); break;
    case 'ring': { const lw=Math.max(8,Math.min(w,h)*0.16); c.lineWidth=lw; c.beginPath(); c.ellipse(x+w/2,y+h/2,Math.abs(w/2)-lw/2,Math.abs(h/2)-lw/2,0,0,7); c.stroke(); break; }
    default: c.fillRect(x,y,w,h); } }

function drawWidget(o){ const c=octx,x=o.x,y=o.y,w=o.w,h=o.h;
  if(o.widget==='lowerthird'){ c.fillStyle='rgba(10,12,16,.82)'; roundRect(c,x,y,w,h,14); c.fill(); c.fillStyle=o.color; c.fillRect(x,y+14,8,h-28);
    c.fillStyle='#fff'; c.textAlign='left'; c.textBaseline='alphabetic'; c.font=`bold ${o.fontSize||46}px "Segoe UI",sans-serif`; c.fillText(o.title||'',x+28,y+h*0.46);
    c.fillStyle='#A7AEBC'; c.font=`${(o.fontSize||46)*0.55}px "Segoe UI",sans-serif`; c.fillText(o.subtitle||'',x+28,y+h*0.78); }
  else if(o.widget==='progressbar'){ const fr=clamp(((playhead-(o.start||0))/Math.max(0.1,(o.end||0)-(o.start||0))),0,1); c.fillStyle='rgba(255,255,255,.18)'; roundRect(c,x,y,w,h,h/2); c.fill(); c.fillStyle=o.color; roundRect(c,x,y,Math.max(h,w*fr),h,h/2); c.fill();
    c.fillStyle='#fff'; c.textAlign='right'; c.textBaseline='bottom'; c.font='bold 24px "Segoe UI",sans-serif'; c.fillText(Math.round(fr*100)+'%',x+w,y-6); }
  else if(o.widget==='timer'){ const left=Math.max(0,Math.ceil((o.end||0)-playhead)); const mm=Math.floor(left/60), ss=left%60; c.fillStyle=o.color; c.textAlign='center'; c.textBaseline='middle'; c.font=`bold ${o.fontSize||130}px "JetBrains Mono",Consolas,monospace`; c.fillText(`${mm}:${String(ss).padStart(2,'0')}`,x+w/2,y+h/2); }
  else if(o.widget==='badge'){ c.fillStyle=o.color; roundRect(c,x,y,w,h,h/2); c.fill(); c.fillStyle='#111418'; c.textAlign='center'; c.textBaseline='middle'; c.font=`bold ${o.fontSize||48}px "Segoe UI",sans-serif`; c.fillText(o.title||'',x+w/2,y+h/2); }
  else if(o.widget==='titlecard'){ c.fillStyle=o.color; c.textAlign='center'; c.textBaseline='middle'; c.font=`bold ${o.fontSize||104}px "Segoe UI",sans-serif`; c.fillText(o.title||'',x+w/2,y+h*0.4); c.fillStyle='#A7AEBC'; c.font=`${(o.fontSize||104)*0.32}px "Segoe UI",sans-serif`; c.fillText(o.subtitle||'',x+w/2,y+h*0.78); c.strokeStyle=o.color; c.lineWidth=4; c.beginPath(); c.moveTo(x+w*0.35,y+h*0.6); c.lineTo(x+w*0.65,y+h*0.6); c.stroke(); }
  else if(o.widget==='bars'){ const n=5,bw=w/(n*1.6); for(let i=0;i<n;i++){ const a=Math.abs(Math.sin(performance.now()/240+i*0.7)); const bh=h*(0.25+0.75*a); c.fillStyle=o.color; roundRect(c,x+i*bw*1.6,y+h-bh,bw,bh,4); c.fill(); } } }

function roundRect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function poly(c,pts){ c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); }
function regPoly(c,cx,cy,r,n,a0){ c.beginPath(); for(let i=0;i<n;i++){ const a=a0+i*2*Math.PI/n,px=cx+r*Math.cos(a),py=cy+r*Math.sin(a); i?c.lineTo(px,py):c.moveTo(px,py);} c.closePath(); }
function starPath(c,cx,cy,R,r,n){ c.beginPath(); for(let i=0;i<n*2;i++){ const rad=i%2?r:R,a=-Math.PI/2+i*Math.PI/n,px=cx+rad*Math.cos(a),py=cy+rad*Math.sin(a); i?c.lineTo(px,py):c.moveTo(px,py);} c.closePath(); }
function heartPath(c,x,y,w,h){ c.beginPath(); const t=y+h*0.3; c.moveTo(x+w/2,y+h); c.bezierCurveTo(x-w*0.1,y+h*0.55,x+w*0.15,y,x+w/2,t); c.bezierCurveTo(x+w*0.85,y,x+w*1.1,y+h*0.55,x+w/2,y+h); c.closePath(); }
function arrowPath(c,x,y,w,h){ const s=h*0.3,m=h/2; poly(c,[[x,y+m-s/2],[x+w*0.6,y+m-s/2],[x+w*0.6,y],[x+w,y+m],[x+w*0.6,y+h],[x+w*0.6,y+m+s/2],[x,y+m+s/2]]); }

function drawHandles(o,full){ octx.save(); octx.globalAlpha=1; octx.strokeStyle='#36C5F0'; octx.lineWidth=2; octx.strokeRect(o.x,o.y,o.w,o.h); if(full) for(const h of handlePts(o)){ octx.fillStyle='#36C5F0'; octx.fillRect(h.x-7,h.y-7,14,14); } octx.restore(); }
function handlePts(o){ return [{n:'nw',x:o.x,y:o.y},{n:'n',x:o.x+o.w/2,y:o.y},{n:'ne',x:o.x+o.w,y:o.y},{n:'e',x:o.x+o.w,y:o.y+o.h/2},{n:'se',x:o.x+o.w,y:o.y+o.h},{n:'s',x:o.x+o.w/2,y:o.y+o.h},{n:'sw',x:o.x,y:o.y+o.h},{n:'w',x:o.x,y:o.y+o.h/2}]; }
function canvasPos(ev){ const r=overlay.getBoundingClientRect(); return {x:(ev.clientX-r.left)*(PW/r.width),y:(ev.clientY-r.top)*(PH/r.height)}; }
function hitObject(p){ const arr=state.objects||[]; for(let i=arr.length-1;i>=0;i--){ const o=arr[i]; if(!objVisible(o)||o.locked) continue; if(p.x>=o.x&&p.x<=o.x+o.w&&p.y>=o.y&&p.y<=o.y+o.h) return o; } return null; }
function rectsOverlap(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by; }

// ---- canvas mouse: handles / move / group-move / marquee ----
let oDrag=null;
overlay.addEventListener('mousedown',(ev)=>{ const p=canvasPos(ev);
  if(selection.kind==='object'){ const o=findObj(selection.id); if(o){ for(const h of handlePts(o)){ if(Math.abs(p.x-h.x)<12&&Math.abs(p.y-h.y)<12){ startODrag([o],'resize',h.n,p); return; } } } }
  const hit=hitObject(p);
  if(hit){ if(selection.kind==='multi'&&selection.ids.includes(hit.id)){ startODrag(selection.ids.map(findObj).filter(Boolean),'move',null,p); }
    else { select('object',hit.id); startODrag([hit],'move',null,p); } }
  else startMarquee(ev); });

function startODrag(objs,mode,handle,p){ interacting=true; oDrag={objs,mode,handle,s:p,g:objs.map(o=>({o,x:o.x,y:o.y,w:o.w,h:o.h}))}; window.addEventListener('mousemove',oMove); window.addEventListener('mouseup',oUp); }
function oMove(ev){ if(!oDrag) return; const p=canvasPos(ev),dx=p.x-oDrag.s.x,dy=p.y-oDrag.s.y;
  if(oDrag.mode==='move'){ for(const g of oDrag.g){ g.o.x=g.x+dx; g.o.y=g.y+dy; } }
  else { const g=oDrag.g[0],o=g.o,h=oDrag.handle; if(h.includes('e'))o.w=Math.max(20,g.w+dx); if(h.includes('s'))o.h=Math.max(20,g.h+dy); if(h.includes('w')){o.w=Math.max(20,g.w-dx); o.x=g.x+dx;} if(h.includes('n')){o.h=Math.max(20,g.h-dy); o.y=g.y+dy;} } }
function oUp(){ window.removeEventListener('mousemove',oMove); window.removeEventListener('mouseup',oUp); if(oDrag){ for(const g of oDrag.g){ const o=g.o; rpc('update_object',{id:o.id,patch:{x:Math.round(o.x),y:Math.round(o.y),w:Math.round(o.w),h:Math.round(o.h)}}).catch(()=>{}); } } interacting=false; oDrag=null; }
overlay.addEventListener('dblclick',(ev)=>{ const o=hitObject(canvasPos(ev)); if(o&&o.type==='text'){ select('object',o.id); const ta=el('f_text'); if(ta){ta.focus(); ta.select();} } });

let marquee=null;
function startMarquee(ev){ const vp=el('viewport'),r=vp.getBoundingClientRect(),sx=ev.clientX,sy=ev.clientY; vp.classList.add('marqueeing');
  const div=document.createElement('div'); div.className='marquee'; vp.appendChild(div); marquee={sx,sy,div,r,box:null};
  const mv=(e)=>{ const x=Math.min(e.clientX,sx)-r.left,y=Math.min(e.clientY,sy)-r.top,w=Math.abs(e.clientX-sx),h=Math.abs(e.clientY-sy); div.style.left=x+'px'; div.style.top=y+'px'; div.style.width=w+'px'; div.style.height=h+'px'; marquee.box={x,y,w,h}; };
  const up=()=>{ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); finishMarquee(); };
  window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up); }
function finishMarquee(){ const m=marquee; marquee=null; el('viewport').classList.remove('marqueeing'); if(!m) return; m.div.remove();
  if(!m.box||(m.box.w<6&&m.box.h<6)){ select(null); return; }
  const ovr=overlay.getBoundingClientRect(),sX=PW/ovr.width,sY=PH/ovr.height; const bx=m.box.x*sX,by=m.box.y*sY,bw=m.box.w*sX,bh=m.box.h*sY;
  const ids=(state.objects||[]).filter(o=>objVisible(o)&&!o.locked&&rectsOverlap(bx,by,bw,bh,o.x,o.y,o.w,o.h)).map(o=>o.id);
  if(ids.length>1) selectMulti(ids); else if(ids.length===1) select('object',ids[0]); else select(null); }

// ===================================================== SIDEBAR SECTIONS
const TEXT_PRESETS=[{label:'Heading',fontSize:104,color:'#FFFFFF',text:'Heading'},{label:'Title',fontSize:80,color:'#FFFFFF',text:'Title'},{label:'Subtitle',fontSize:52,color:'#E2E6EE',text:'Subtitle'},{label:'Body',fontSize:38,color:'#FFFFFF',text:'Body text'},{label:'Yellow',fontSize:88,color:'#F5D90A',text:'POP'},{label:'Cyan',fontSize:88,color:'#36C5F0',text:'NEON'},{label:'Red',fontSize:88,color:'#FF5C72',text:'ALERT'},{label:'Black',fontSize:80,color:'#111418',text:'Black'},{label:'Caption',fontSize:46,color:'#FFFFFF',text:'Caption goes here'}];
const SHAPES=[{shape:'rect',label:'Rectangle',ic:'▭'},{shape:'roundrect',label:'Rounded',ic:'▢'},{shape:'ellipse',label:'Circle',ic:'⬤'},{shape:'triangle',label:'Triangle',ic:'▲'},{shape:'diamond',label:'Diamond',ic:'◆'},{shape:'star',label:'Star',ic:'★'},{shape:'pentagon',label:'Pentagon',ic:'⬠'},{shape:'hexagon',label:'Hexagon',ic:'⬡'},{shape:'heart',label:'Heart',ic:'♥'},{shape:'arrow',label:'Arrow',ic:'➜'},{shape:'line',label:'Line',ic:'▬'},{shape:'ring',label:'Ring',ic:'◯'}];
const WIDGETS=[{widget:'lowerthird',label:'Lower Third',ic:'🏷'},{widget:'titlecard',label:'Title Card',ic:'🅣'},{widget:'progressbar',label:'Progress',ic:'▰'},{widget:'timer',label:'Countdown',ic:'⏱'},{widget:'badge',label:'Badge',ic:'🔖'},{widget:'bars',label:'Audio Bars',ic:'📊'}];
const STICKERS='😀 😎 🔥 ✨ ❤️ 👍 🎉 💯 😂 🥳 ⭐ 💡 📌 ✅ ❓ 💬 🚀 🌈 ☀️ 🎵 📷 🏆 👀 🤔 😍 🙌 💀 🎬 ⚡ 🍿'.split(' ');
let activeSection='media';
const SECTIONS=[
  {id:'media',ic:'🎬',label:'Media',render:renderMediaSection},
  {id:'text',ic:'🅣',label:'Text',render:()=>grid('Text styles',TEXT_PRESETS.map(p=>({html:`<div class="gi-ic" style="color:${p.color}">T</div><div class="gi-label">${p.label}</div>`,on:()=>rpc('add_object',{type:'text',text:p.text,fontSize:p.fontSize,color:p.color}).then(o=>select('object',o.id))})))},
  {id:'widgets',ic:'🧩',label:'Widgets',render:()=>grid('Widgets (animated)',WIDGETS.map(w=>({html:`<div class="gi-ic">${w.ic}</div><div class="gi-label">${w.label}</div>`,on:()=>rpc('add_widget',{widget:w.widget}).then(o=>select('object',o.id))})),'g2')},
  {id:'shapes',ic:'◆',label:'Shapes',render:()=>grid('Shapes',SHAPES.map(s=>({html:`<div class="gi-ic">${s.ic}</div><div class="gi-label">${s.label}</div>`,on:()=>rpc('add_object',{type:'shape',shape:s.shape}).then(o=>select('object',o.id))})))},
  {id:'stickers',ic:'😀',label:'Sticker',render:()=>grid('Stickers',STICKERS.map(e=>({html:`<div class="gi-ic">${e}</div>`,on:()=>rpc('add_object',{type:'text',text:e,fontSize:160}).then(o=>select('object',o.id))})))},
  {id:'filters',ic:'🎨',label:'Filters',render:()=>grid('Filters (selected/playing clip)',FILTERS.map(f=>({html:`<div class="gi-swatch" style="background:#3a86ff;filter:${f.css}"></div><div class="gi-label">${f.label}</div>`,on:()=>applyFilter(f.id)})),'g2')},
  {id:'audio',ic:'🔊',label:'Audio',render:renderAudioSection},
];
function renderTabs(){ const t=el('tabs'); t.innerHTML=''; for(const s of SECTIONS){ const b=document.createElement('button'); b.className='tab'+(s.id===activeSection?' on':''); b.innerHTML=`<span class="ic">${s.ic}</span>${s.label}`; b.onclick=()=>{activeSection=s.id; renderTabs(); renderSection();}; t.appendChild(b);} }
function renderSection(){ el('sectionBody').innerHTML=''; SECTIONS.find(x=>x.id===activeSection).render(); }
function grid(title,items,cls){ const body=el('sectionBody'); const h=document.createElement('h3'); h.textContent=title; body.appendChild(h); const g=document.createElement('div'); g.className='grid'+(cls?' '+cls:''); for(const it of items){ const d=document.createElement('div'); d.className='grid-item'; d.innerHTML=it.html; d.onclick=it.on; g.appendChild(d);} body.appendChild(g); }
function renderMediaSection(){ const body=el('sectionBody'); body.innerHTML=`<button class="btn block accent" id="s_import">⬆ Import video / image</button><button class="btn block" id="s_demo">+ Add demo clip</button><h3 style="margin-top:14px">Library <span class="muted">${Object.keys(state.media).length}</span></h3><div class="media-list" id="s_medialist"></div>`;
  el('s_import').onclick=doImport; el('s_demo').onclick=()=>rpc('generate_sample',{duration:6}).then(()=>setStatus('Generating demo clip…'));
  const list=el('s_medialist'); for(const m of Object.values(state.media)){ const c=document.createElement('div'); c.className='media-card'; const ts=m.thumbnail?`style="background-image:url('file:///${String(m.thumbnail).replace(/\\/g,'/')}')"`:''; c.innerHTML=`<div class="thumb" ${ts}>${m.thumbnail?'':(m.kind==='audio'?'♪':'▦')}</div><div class="info"><div class="name" title="${m.name}">${m.name}</div><div class="sub">${fmt(m.duration)}${m.kind==='audio'?' · audio':` · ${m.width}×${m.height}`}${m.proxy||!m.hasVideo?'':' · ⏳preview'}</div></div><button class="btn ghost tiny add">＋</button>`; c.querySelector('.add').onclick=()=>rpc('add_clip',{mediaId:m.id}).then(()=>setStatus('Added '+m.name)); list.appendChild(c);} }
function renderAudioSection(){ const body=el('sectionBody'); body.innerHTML=`<button class="btn block accent" id="a_import">⬆ Import audio</button><h3 style="margin-top:14px">Music tones</h3><div class="grid g2" id="a_tones"></div>`; el('a_import').onclick=doImport; const tones=[['Bass',110],['Low',220],['Mid',330],['High',440],['Higher',554],['Top',660]]; const g=el('a_tones'); for(const[name,freq]of tones){ const d=document.createElement('div'); d.className='grid-item'; d.innerHTML=`<div class="gi-ic">🎵</div><div class="gi-label">${name}<br>${freq}Hz</div>`; d.onclick=()=>rpc('generate_tone',{duration:8,freq}).then(()=>setStatus('Generating '+name+' tone…')); g.appendChild(d);} }
function applyFilter(id){ let clip=null; if(selection.kind==='clip') clip=findClipById(selection.id); if(!clip) clip=clipAt(playhead); if(!clip) clip=videoClips()[0]; if(!clip){ setStatus('Add a video clip first.'); return; } rpc('set_filter',{clipId:clip.id,filter:id}).then(()=>{select('clip',clip.id); setStatus('Filter: '+id);}).catch(()=>{}); }
function doImport(){ window.kx.pickFile().then(files=>{ for(const f of files){ setStatus('Importing '+f+'…'); rpc('import_media',{path:f}).catch(()=>{}); } }); }

// ===================================================== TIMELINE
function renderTimeline(){ const dur=Math.max(totalDuration(),12),width=dur*pxPerSec+40; const ruler=el('ruler'); ruler.style.width=width+'px'; ruler.innerHTML=''; const step=dur>120?20:dur>40?10:dur>15?5:1; for(let s=0;s<=dur;s+=step){ const t=document.createElement('div'); t.className='tick'; t.style.left=(s*pxPerSec)+'px'; t.textContent=s+'s'; ruler.appendChild(t);} const tracks=el('tracks'); tracks.style.width=width+'px'; tracks.innerHTML=''; tracks.appendChild(objectLane()); for(const tr of state.tracks||[]) tracks.appendChild(clipLane(tr)); positionPlayhead(); }
function clipSel(id){ return selection.kind==='clip'&&selection.id===id; }
function objSel(id){ return (selection.kind==='object'&&selection.id===id)||(selection.kind==='multi'&&selection.ids.includes(id)); }
function clipLane(tr){ const lane=document.createElement('div'); lane.className='lane'; lane.dataset.kind=tr.kind; lane.innerHTML=`<span class="lane-label">${tr.name}</span>`; for(const c of tr.clips){ const n=document.createElement('div'); n.className='clip'+(clipSel(c.id)?' sel':''); n.style.left=(c.timelineIn*pxPerSec)+'px'; n.style.width=Math.max(10,(c.timelineOut-c.timelineIn)*pxPerSec)+'px'; n.innerHTML=`<div class="cl-name">${c.name}${c.filter&&c.filter!=='none'?' · '+c.filter:''}</div><div class="edge l"></div><div class="edge r"></div>`; n.addEventListener('mousedown',(ev)=>onClipDown(ev,c,n)); lane.appendChild(n);} return lane; }
function objectLane(){ const lane=document.createElement('div'); lane.className='lane'; lane.dataset.kind='object'; lane.innerHTML=`<span class="lane-label">Text / Shapes</span>`; for(const o of state.objects||[]){ const b=document.createElement('div'); b.className='clip'+(objSel(o.id)?' sel':''); b.style.left=((o.start||0)*pxPerSec)+'px'; b.style.width=Math.max(20,((o.end||0)-(o.start||0))*pxPerSec)+'px'; b.innerHTML=`<div class="cl-name">${objName(o)}</div><div class="edge l"></div><div class="edge r"></div>`; b.addEventListener('mousedown',(ev)=>onObjBlockDown(ev,o,b)); lane.appendChild(b);} return lane; }
function objName(o){ return o.type==='text'?('“'+(o.text||'').slice(0,14)+'”'):o.type==='widget'?o.widget:(o.shape||'shape'); }

function onClipDown(ev,clip,node){ ev.stopPropagation(); select('clip',clip.id); const edge=ev.target.classList.contains('edge')?(ev.target.classList.contains('l')?'l':'r'):null; interacting=true; const x0=ev.clientX,g={tin:clip.timelineIn,sin:clip.sourceIn,sout:clip.sourceOut}; const m=state.media[clip.mediaId],maxDur=m?m.duration:1e9;
  const move=(e)=>{ const dt=(e.clientX-x0)/pxPerSec; if(!edge){ const nin=Math.max(0,g.tin+dt); node.style.left=(nin*pxPerSec)+'px'; node._nin=nin; } else if(edge==='r'){ const ns=Math.min(maxDur,Math.max(g.sin+0.1,g.sout+dt)); node._nsout=ns; node.style.width=Math.max(10,(ns-g.sin)*pxPerSec)+'px'; } else { const ns=Math.min(g.sout-0.1,Math.max(0,g.sin+dt)); node._nsin=ns; node.style.width=Math.max(10,(g.sout-ns)*pxPerSec)+'px'; } };
  const up=()=>{ window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up); if(!edge&&node._nin!=null)commit('move_clip',{clipId:clip.id,at:+node._nin.toFixed(3)}); else if(edge==='r'&&node._nsout!=null)commit('trim_clip',{clipId:clip.id,sourceOut:+node._nsout.toFixed(3)}); else if(edge==='l'&&node._nsin!=null)commit('trim_clip',{clipId:clip.id,sourceIn:+node._nsin.toFixed(3)}); else interacting=false; };
  window.addEventListener('mousemove',move); window.addEventListener('mouseup',up); }
function onObjBlockDown(ev,obj,node){ ev.stopPropagation(); select('object',obj.id); interacting=true; const x0=ev.clientX,g={start:obj.start||0,end:obj.end||0,len:(obj.end||0)-(obj.start||0)}; const edge=ev.target.classList.contains('edge')?(ev.target.classList.contains('l')?'l':'r'):null;
  const move=(e)=>{ const dt=(e.clientX-x0)/pxPerSec; if(!edge){ const ns=Math.max(0,g.start+dt); node.style.left=(ns*pxPerSec)+'px'; node._ns=ns; node._ne=ns+g.len; } else if(edge==='r'){ const ne=Math.max(g.start+0.2,g.end+dt); node._ne=ne; node.style.width=Math.max(20,(ne-g.start)*pxPerSec)+'px'; } else { const ns=Math.max(0,Math.min(g.end-0.2,g.start+dt)); node._ns=ns; node.style.left=(ns*pxPerSec)+'px'; node.style.width=Math.max(20,(g.end-ns)*pxPerSec)+'px'; } };
  const up=()=>{ window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up); const patch={}; if(node._ns!=null)patch.start=+node._ns.toFixed(3); if(node._ne!=null)patch.end=+node._ne.toFixed(3); if(Object.keys(patch).length)commit('update_object',{id:obj.id,patch}); else interacting=false; };
  window.addEventListener('mousemove',move); window.addEventListener('mouseup',up); }
function scrub(ev){ const r=el('timeline').getBoundingClientRect(); const x=ev.clientX-r.left+el('timeline').scrollLeft; seekTo(x/pxPerSec); }
el('ruler').addEventListener('mousedown',(ev)=>{ pause(); scrub(ev); const mv=(e)=>scrub(e),up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up);}; window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up); });
el('tracks').addEventListener('mousedown',(ev)=>{ if(ev.target===el('tracks')||ev.target.classList.contains('lane')){ select(null); pause(); scrub(ev); } });
el('zoom').addEventListener('input',(e)=>{ pxPerSec=+e.target.value; renderTimeline(); });

// ===================================================== SELECTION / INSPECTOR / LAYERS
function select(kind,id){ selection=kind?{kind,id,ids:id?[id]:[]}:{kind:null,id:null,ids:[]}; renderTimeline(); renderInspector(); renderLayers(); }
function selectMulti(ids){ selection={kind:'multi',id:null,ids}; renderTimeline(); renderInspector(); renderLayers(); }
function findClipById(id){ for(const t of state.tracks||[]){ const c=t.clips.find(c=>c.id===id); if(c) return c; } return null; }
function animOpts(sel){ return ANIM.map(a=>`<option ${a===sel?'selected':''}>${a}</option>`).join(''); }

function renderInspector(){ const box=el('inspector');
  if(selection.kind==='multi'){ box.innerHTML=`<div class="insp-title"><span class="tag">${selection.ids.length} selected</span></div><div class="field"><label>Animate in (all)</label><select id="m_in">${animOpts('none')}</select></div><div class="field"><label>Animate out (all)</label><select id="m_out">${animOpts('none')}</select></div><button class="btn del" id="m_del">Delete all</button>`;
    el('m_in').onchange=e=>{ for(const id of selection.ids) rpc('update_object',{id,patch:{animIn:{type:e.target.value,dur:0.5}}}); };
    el('m_out').onchange=e=>{ for(const id of selection.ids) rpc('update_object',{id,patch:{animOut:{type:e.target.value,dur:0.5}}}); };
    el('m_del').onclick=()=>{ for(const id of selection.ids) rpc('remove_object',{id}); select(null); }; return; }
  if(selection.kind==='clip'){ const c=findClipById(selection.id); if(!c){ box.innerHTML='<p class="muted small">—</p>'; return; }
    box.innerHTML=`<div class="insp-title"><span class="tag">clip</span> ${c.name}</div>
      <div class="field row"><div><label>Source in</label><input id="f_sin" type="number" step="0.1" value="${c.sourceIn}"></div><div><label>Source out</label><input id="f_sout" type="number" step="0.1" value="${c.sourceOut}"></div></div>
      <div class="field"><label>Position (s)</label><input id="f_tin" type="number" step="0.1" value="${c.timelineIn}"></div>
      <div class="field"><label>Filter</label><select id="f_filt">${FILTERS.map(f=>`<option value="${f.id}" ${(c.filter||'none')===f.id?'selected':''}>${f.label}</option>`).join('')}</select></div>
      <div class="field row"><div><label>Transition in</label><select id="f_ti"><option ${!c.transIn||c.transIn.type==='none'?'selected':''} value="none">none</option><option ${c.transIn&&c.transIn.type==='fade'?'selected':''} value="fade">fade</option><option ${c.transIn&&c.transIn.type==='dipwhite'?'selected':''} value="dipwhite">dip white</option></select></div><div><label>Transition out</label><select id="f_to"><option ${!c.transOut||c.transOut.type==='none'?'selected':''} value="none">none</option><option ${c.transOut&&c.transOut.type==='fade'?'selected':''} value="fade">fade</option><option ${c.transOut&&c.transOut.type==='dipwhite'?'selected':''} value="dipwhite">dip white</option></select></div></div>
      <div class="small muted">Length ${(c.timelineOut-c.timelineIn).toFixed(2)}s</div>
      <button class="btn" id="b_split">✂ Split at playhead</button><button class="btn del" id="b_del">Delete clip</button>`;
    el('f_sin').onchange=e=>commit('trim_clip',{clipId:c.id,sourceIn:+e.target.value}); el('f_sout').onchange=e=>commit('trim_clip',{clipId:c.id,sourceOut:+e.target.value}); el('f_tin').onchange=e=>commit('move_clip',{clipId:c.id,at:+e.target.value}); el('f_filt').onchange=e=>commit('set_filter',{clipId:c.id,filter:e.target.value});
    el('f_ti').onchange=e=>commit('set_clip_transition',{clipId:c.id,which:'in',type:e.target.value,dur:0.6}); el('f_to').onchange=e=>commit('set_clip_transition',{clipId:c.id,which:'out',type:e.target.value,dur:0.6});
    el('b_split').onclick=splitSel; el('b_del').onclick=()=>{commit('remove_clip',{clipId:c.id}); select(null);}; return; }
  if(selection.kind==='object'){ const o=findObj(selection.id); if(!o){ box.innerHTML='<p class="muted small">—</p>'; return; }
    let html=`<div class="insp-title"><span class="tag">${o.type==='text'?'text':o.type==='widget'?o.widget:o.shape}</span></div>`;
    if(o.type==='text'){ html+=`<div class="field"><label>Text</label><textarea id="f_text">${o.text||''}</textarea></div><div class="field row"><div><label>Font size</label><input id="f_fs" type="number" value="${o.fontSize}"></div><div><label>Align</label><select id="f_al"><option ${o.align==='left'?'selected':''}>left</option><option ${(!o.align||o.align==='center')?'selected':''}>center</option><option ${o.align==='right'?'selected':''}>right</option></select></div></div>`; }
    if(o.type==='widget'&&(o.title!=null)) html+=`<div class="field"><label>Title</label><input id="f_title" value="${o.title||''}"></div>`;
    if(o.type==='widget'&&(o.subtitle!=null)) html+=`<div class="field"><label>Subtitle</label><input id="f_sub" value="${o.subtitle||''}"></div>`;
    html+=`<div class="field"><label>Color</label><input id="f_col" type="color" value="${(o.color||'#ffffff').slice(0,7)}"></div>
      <div class="field row"><div><label>X</label><input id="f_x" type="number" value="${Math.round(o.x)}"></div><div><label>Y</label><input id="f_y" type="number" value="${Math.round(o.y)}"></div></div>
      <div class="field row"><div><label>W</label><input id="f_w" type="number" value="${Math.round(o.w)}"></div><div><label>H</label><input id="f_h" type="number" value="${Math.round(o.h)}"></div></div>
      <div class="field row"><div><label>Start (s)</label><input id="f_st" type="number" step="0.1" value="${o.start||0}"></div><div><label>End (s)</label><input id="f_en" type="number" step="0.1" value="${o.end||0}"></div></div>
      <div class="field"><label>Animate IN</label><div class="anim-grid"><select id="f_ain">${animOpts(o.animIn?o.animIn.type:'none')}</select><input id="f_aind" type="number" step="0.1" value="${o.animIn?o.animIn.dur:0.5}"></div></div>
      <div class="field"><label>Animate OUT</label><div class="anim-grid"><select id="f_aout">${animOpts(o.animOut?o.animOut.type:'none')}</select><input id="f_aoutd" type="number" step="0.1" value="${o.animOut?o.animOut.dur:0.5}"></div></div>
      <button class="btn del" id="b_delo">Delete object</button>`;
    box.innerHTML=html; const u=(patch)=>commit('update_object',{id:o.id,patch});
    if(o.type==='text'){ el('f_text').oninput=e=>{o.text=e.target.value;}; el('f_text').onchange=e=>u({text:e.target.value}); el('f_fs').onchange=e=>u({fontSize:+e.target.value}); el('f_al').onchange=e=>u({align:e.target.value}); }
    if(el('f_title')) el('f_title').onchange=e=>u({title:e.target.value}); if(el('f_sub')) el('f_sub').onchange=e=>u({subtitle:e.target.value});
    el('f_col').oninput=e=>{o.color=e.target.value;}; el('f_col').onchange=e=>u({color:e.target.value});
    el('f_x').onchange=e=>u({x:+e.target.value}); el('f_y').onchange=e=>u({y:+e.target.value}); el('f_w').onchange=e=>u({w:+e.target.value}); el('f_h').onchange=e=>u({h:+e.target.value}); el('f_st').onchange=e=>u({start:+e.target.value}); el('f_en').onchange=e=>u({end:+e.target.value});
    el('f_ain').onchange=e=>u({animIn:{type:e.target.value,dur:+el('f_aind').value}}); el('f_aind').onchange=e=>u({animIn:{type:el('f_ain').value,dur:+e.target.value}});
    el('f_aout').onchange=e=>u({animOut:{type:e.target.value,dur:+el('f_aoutd').value}}); el('f_aoutd').onchange=e=>u({animOut:{type:el('f_aout').value,dur:+e.target.value}});
    el('b_delo').onclick=()=>{commit('remove_object',{id:o.id}); select(null);}; return; }
  box.innerHTML='<p class="muted small">Select a clip or an object — or drag a box on the preview to multi-select.</p>'; }

function renderLayers(){ const list=el('layerList'); const objs=[...(state.objects||[])].reverse(); el('layerCount').textContent=objs.length; list.innerHTML='';
  for(const o of objs){ const row=document.createElement('div'); row.className='layer-row'+(objSel(o.id)?' sel':'')+(o.hidden?' hidden':'');
    const ic=o.type==='text'?'🅣':o.type==='widget'?'🧩':'◆';
    row.innerHTML=`<span class="lic">${ic}</span><span class="lname">${objName(o)}</span><span class="lbtn" data-vis>${o.hidden?'🚫':'👁'}</span><span class="lbtn" data-lock>${o.locked?'🔒':'🔓'}</span><span class="lbtn" data-up>▲</span><span class="lbtn" data-down>▼</span><span class="lbtn" data-del>✕</span>`;
    row.onclick=(e)=>{ if(e.target.classList.contains('lbtn')) return; select('object',o.id); };
    row.querySelector('[data-vis]').onclick=()=>rpc('update_object',{id:o.id,patch:{hidden:!o.hidden}});
    row.querySelector('[data-lock]').onclick=()=>rpc('update_object',{id:o.id,patch:{locked:!o.locked}});
    row.querySelector('[data-up]').onclick=()=>rpc('reorder_object',{id:o.id,dir:'up'});
    row.querySelector('[data-down]').onclick=()=>rpc('reorder_object',{id:o.id,dir:'down'});
    row.querySelector('[data-del]').onclick=()=>{ rpc('remove_object',{id:o.id}); if(selection.id===o.id) select(null); };
    list.appendChild(row); } }

function splitSel(){ if(selection.kind!=='clip') return; rpc('split_clip',{clipId:selection.id,at:+playhead.toFixed(3)}).then(()=>setStatus('Split at '+fmt(playhead))).catch(e=>setStatus('⚠ '+e.message)); }
function duplicateSel(){ if(selection.kind==='clip'){ const c=findClipById(selection.id); if(c) rpc('add_clip',{mediaId:c.mediaId}); } else if(selection.kind==='object'){ const o=findObj(selection.id); if(o){ if(o.type==='text') rpc('add_object',{type:'text',text:o.text,fontSize:o.fontSize,color:o.color,x:(o.x||0)+30,y:(o.y||0)+30}); else if(o.type==='widget') rpc('add_widget',{widget:o.widget,text:o.title,subtitle:o.subtitle,color:o.color}); else rpc('add_object',{type:'shape',shape:o.shape,color:o.color,x:(o.x||0)+30,y:(o.y||0)+30,w:o.w,h:o.h}); } } }
function deleteSel(){ if(selection.kind==='clip'){ commit('remove_clip',{clipId:selection.id}); select(null); } else if(selection.kind==='object'){ commit('remove_object',{id:selection.id}); select(null); } else if(selection.kind==='multi'){ for(const id of selection.ids) rpc('remove_object',{id}); select(null); } }
function commit(method,params){ interacting=false; return rpc(method,params).catch(()=>{}); }

// ===================================================== JOBS
function renderJobs(){ const arr=[...jobs.values()].sort((a,b)=>(b.startedAt||0)-(a.startedAt||0)); el('jobActive').textContent=arr.filter(j=>j.status==='running'||j.status==='queued').length; const list=el('jobList'); list.innerHTML='';
  for(const j of arr){ const e=document.createElement('div'); e.className='job '+j.status; const pct=Math.round((j.progress||0)*100); const can=j.status==='running'||j.status==='queued'; const open=(j.status==='done'&&j.result&&j.result.out)?`<span class="open" data-open="${String(j.result.out).replace(/\\/g,'/')}">reveal</span>`:''; e.innerHTML=`<div class="row"><span class="label" title="${j.label}">${j.label}</span><span class="pct">${j.status==='done'?'✓':j.status==='error'?'✕':pct+'%'}</span>${can?'<span class="cancel" data-c="'+j.id+'">cancel</span>':open}</div><div class="bar"><div class="fill" style="width:${pct}%"></div></div>`; list.appendChild(e);} list.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>rpc('cancel_job',{jobId:b.dataset.c})); list.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>window.kx.reveal(b.dataset.open)); }

// ===================================================== ENGINE EVENTS
function applyState(s){ state=s; renderTabs(); renderSection(); renderTimeline(); renderInspector(); renderLayers(); el('btnUndo').disabled=!s.canUndo; el('btnRedo').disabled=!s.canRedo; if(!playing) seekTo(playhead); }
window.kx.onState((s)=>{ if(interacting){ pendingState=s; return; } applyState(s); });
window.kx.onJob((j)=>{ jobs.set(j.id,j); renderJobs(); if(activeSection==='media'&&['preview','thumbnail','sample','audio'].includes(j.type)&&j.status==='done') renderSection(); if(j.status==='done'&&j.type==='export') setStatus('Export complete → '+(j.result&&j.result.out)); if(j.status==='error') setStatus('⚠ '+j.label+': '+j.error); });
setInterval(()=>{ if(!interacting&&pendingState){ const s=pendingState; pendingState=null; applyState(s); } },80);

// ===================================================== TOOLBAR + KEYS
el('btnSplit').onclick=splitSel; el('btnDup').onclick=duplicateSel; el('btnDel').onclick=deleteSel; el('btnUndo').onclick=()=>rpc('undo'); el('btnRedo').onclick=()=>rpc('redo'); el('btnExport').onclick=()=>rpc('export',{}).then(r=>setStatus('Export queued → '+r.out)).catch(()=>{}); el('btnPlay').onclick=togglePlay; el('btnStop').onclick=stop; el('btnClearJobs').onclick=()=>{ rpc('clear_jobs'); for(const[id,j]of jobs) if(['done','error','canceled'].includes(j.status)) jobs.delete(id); renderJobs(); };
window.addEventListener('keydown',(e)=>{ const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement&&document.activeElement.tagName); if(typing) return;
  if(e.code==='Space'){ e.preventDefault(); togglePlay(); } else if(e.key==='s'||e.key==='S'){ splitSel(); } else if((e.ctrlKey||e.metaKey)&&e.key==='d'){ e.preventDefault(); duplicateSel(); } else if(e.key==='Delete'||e.key==='Backspace'){ deleteSel(); } else if((e.ctrlKey||e.metaKey)&&e.key==='z'){ rpc('undo'); } else if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&(e.key==='Z'||e.key==='z')))){ rpc('redo'); } });

renderTabs();
rpc('get_state').then(s=>{ applyState(s); seekTo(0); setStatus('Ready. Sections on the left · Layers + animations on the right · drag a box on the preview to multi-select.'); });
