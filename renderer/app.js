'use strict';
// Kninix editor front end. Preview plays an ffmpeg H.264 proxy (any codec works).
// Sections sidebar (Media/Text/Shapes/Widgets/Sticker/Filters/Audio), a clickable/
// draggable/trimmable timeline with zoom, a canvas for text+shapes+widgets with IN/OUT
// animations, a Layers panel (z-order/visibility/lock), marquee multi-select, and clip
// transitions. Heavy work runs in separate ffmpeg processes — the FPS meter proves smooth.

window.addEventListener('error', (e) => console.error('UI error:', e.message, 'at', e.filename + ':' + e.lineno));
const el = (id) => document.getElementById(id);
let PW = 1280, PH = 720;            // canvas/frame size — follows project.resolution
let pxPerSec = 80;

// Common export ratios. Recommended ready-made profiles for converting/cropping.
const RES_PROFILES = [
  { label:'YouTube — 16:9',            w:1920, h:1080 },
  { label:'Landscape HD — 16:9',       w:1280, h:720  },
  { label:'Short / Reels / TikTok — 9:16', w:1080, h:1920 },
  { label:'Mobile · iPhone 17 — 9:19.5',   w:1080, h:2340 },
  { label:'Apple Tablet · iPad — 3:4', w:1536, h:2048 },
  { label:'Square — 1:1',              w:1080, h:1080 },
  { label:'Classic — 4:3',             w:1440, h:1080 },
  { label:'Cinematic — 21:9',          w:2560, h:1080 },
];

let state = { media:{}, tracks:[], objects:[], resolution:{w:1280,h:720}, frame:{scale:1,x:0,y:0}, duration:0, canUndo:false, canRedo:false };
let selection = { kind:null, id:null, ids:[] };
let activeTrackId = null;   // which numbered track new media/overlays land on
let playhead = 0, playing = false;
const jobs = new Map();
let exportJobId = null;

const vid = el('vid'), overlay = el('overlay');
let octx = overlay.getContext('2d');   // reassignable: export rasterises objects to an OffscreenCanvas using these same draw fns
vid.style.visibility='hidden';   // the canvas is the only display surface; <video> is just a decoder/audio source
let interacting = false, pendingState = null;

async function rpc(method, params){ const r = await window.kx.rpc(method, params); if(!r.ok){ setStatus('⚠ '+r.error); throw new Error(r.error);} return r.result; }
function setStatus(m){ el('status').textContent = m; }
// Add an overlay (3s block) onto the active track at the playhead, then select it.
function addObj(p){ const start=+playhead.toFixed(2); return rpc('add_object',Object.assign({trackId:activeTrackId,start,end:start+3},p)).then(o=>{ select('object',o.id); return o; }).catch(()=>{}); }
function addWid(p){ const start=+playhead.toFixed(2); return rpc('add_widget',Object.assign({trackId:activeTrackId,start,end:start+3},p)).then(o=>{ select('object',o.id); return o; }).catch(()=>{}); }
function withTime(p,trackId,at){ const start=+Math.max(0,at).toFixed(3); return Object.assign({trackId,start,end:start+3},p); }
function fmt(s){ s=Math.max(0,s||0); const m=Math.floor(s/60); return `${m}:${(s%60).toFixed(1).padStart(4,'0')}`; }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); const lerp=(a,b,t)=>a+(b-a)*t;
function gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ [a,b]=[b,a%b]; } return a||1; }
function ratioTag(w,h){ const g=gcd(w,h); return `${Math.round(w/g)}:${Math.round(h/g)}`; }

// ----- two-window preview -----
// The working canvas is bigger than the export frame, so media/overlays can spill past
// the frame. The inner "crop window" (the chosen resolution) is the only thing that
// exports — everything outside it is dimmed. Object coords are in EXPORT space (0..PW/PH);
// the canvas just adds a margin around that so overflow is visible.
const MARGIN=0.28;
let workW=PW, workH=PH, cropX=0, cropY=0;
function recomputeWork(){ workW=Math.round(PW*(1+2*MARGIN)); workH=Math.round(PH*(1+2*MARGIN)); cropX=Math.round(PW*MARGIN); cropY=Math.round(PH*MARGIN); }
function fitWorking(){ const vp=el('viewport'), fr=el('frame'); if(!vp||!fr) return; const ar=workW/workH, availW=vp.clientWidth, availH=vp.clientHeight; if(!availW||!availH) return; let w=availW, h=w/ar; if(h>availH){ h=availH; w=h*ar; } fr.style.width=Math.round(w)+'px'; fr.style.height=Math.round(h)+'px'; placeCropWin(); }
function placeCropWin(){ const cw=el('cropwin'), v=el('vid'), nc=el('noclip'); const L=cropX/workW*100, T=cropY/workH*100, Wp=PW/workW*100, Hp=PH/workH*100;
  for(const e of [cw,v,nc]){ if(!e) continue; e.style.left=L+'%'; e.style.top=T+'%'; e.style.width=Wp+'%'; e.style.height=Hp+'%'; } }
window.addEventListener('resize', ()=>{ fitWorking(); if(typeof previewZoom!=='undefined'&&previewZoom===1){ previewPanX=0; previewPanY=0; } });
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

// ----- Camtasia-style timeline clock -----
// The playhead is driven by a WALL CLOCK, not by the video element. So playback always
// runs 0 -> totalDuration in real time: empty stretches render as black, a still image
// holds for its full block, and the playhead never "skips" to the first clip. The <video>
// tag is used only as a frame/audio SOURCE for whichever video clip is live; every pixel
// is composited onto the canvas in drawOverlay().
let curClipId=null, pendingSeek=null;
let playAnchor=null; // { wall:performance.now ms, head:playhead seconds } while playing
function applyPending(){ if(pendingSeek!=null&&isFinite(pendingSeek)&&vid.readyState>=1){ try{vid.currentTime=Math.max(0,pendingSeek);}catch(_){} pendingSeek=null; } }
vid.addEventListener('loadedmetadata',applyPending);
vid.addEventListener('canplay',()=>{ applyPending(); if(playing&&vid.paused) vid.play().catch(()=>{}); });

// Top-most *video* clip live at `time`, scanning every track (bottom track first, so a
// higher track wins). Images/audio/gaps return null -> the canvas shows the still / black.
function activeVideoClip(time){ const trks=state.tracks||[]; let best=null;
  for(let i=0;i<trks.length;i++){ for(const c of (trks[i].clips||[])){ const m=state.media[c.mediaId];
    if(!m||!m.hasVideo||isImageMedia(m)) continue;
    if(time>=c.timelineIn-1e-3 && time<c.timelineOut-1e-3) best=c; } }
  return best; }

// Keep the <video> element pointed at the live video clip and seeked to the right source
// time. Called every frame; only reseeks on clip change or real drift, so it stays smooth.
function syncVideo(force){
  const c=activeVideoClip(playhead);
  if(!c){ if(!vid.paused) vid.pause(); curClipId=null; return; }
  const src=clipSrc(c); if(!src){ curClipId=null; return; }
  const want=Math.max(0, c.sourceIn+(playhead-c.timelineIn));
  if(curClipId!==c.id || vid.getAttribute('data-src')!==src){ curClipId=c.id; vid.setAttribute('data-src',src); pendingSeek=want; vid.src=src; }
  else if(force || Math.abs(vid.currentTime-want)>0.3){ try{vid.currentTime=want;}catch(_){} }
  if(playing && vid.paused) vid.play().catch(()=>{});
  if(!playing && !vid.paused) vid.pause();
}

function play(){ if(totalDuration()<=0){ setStatus('Timeline is empty — add media first.'); return; }
  if(playhead>=totalDuration()-1e-3) playhead=0;
  playing=true; playAnchor={ wall:performance.now(), head:playhead }; el('btnPlay').textContent='⏸'; syncVideo(true); }
function pause(){ playing=false; playAnchor=null; vid.pause(); el('btnPlay').textContent='▶'; }
function togglePlay(){ playing?pause():play(); }
function stop(){ pause(); seekTo(0); }
function seekTo(time){ playhead=Math.max(0,Math.min(time,Math.max(totalDuration(),0.001)));
  if(playing) playAnchor={ wall:performance.now(), head:playhead }; syncVideo(true); }

(function loop(){
  if(playing && playAnchor){ playhead=playAnchor.head + (performance.now()-playAnchor.wall)/1000;
    if(playhead>=totalDuration()){ playhead=totalDuration(); pause(); } }
  syncVideo(false);
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

// ---- compositor: draw media (video frames + images) + overlays onto one canvas ----
const imgCache=new Map();
function isImageMedia(m){ return !!m && /\.(png|jpe?g|gif|webp|bmp)$/i.test(m.path||m.name||''); }
function getImg(m){ if(!m) return null; let im=imgCache.get(m.id); if(!im){ im=new Image(); im.src='file:///'+String(m.path).replace(/\\/g,'/'); imgCache.set(m.id,im); } return im; }
function activeClipOf(track){ return [...(track.clips||[])].sort((a,b)=>a.timelineIn-b.timelineIn).find(c=>playhead>=c.timelineIn-1e-3 && playhead<c.timelineOut-1e-3)||null; }
function drawSrc(src,r,sw,sh){ if(!sw||!sh) return; const ar=sw/sh, rar=r.w/r.h; let w,h; if(ar>rar){ h=r.h; w=h*ar; } else { w=r.w; h=w/ar; } octx.drawImage(src, r.x+(r.w-w)/2, r.y+(r.h-h)/2, w, h); }
function drawMediaClip(c){ const m=state.media[c.mediaId]; if(!m) return; const r=c.rect||{x:0,y:0,w:PW,h:PH}; octx.save(); octx.globalAlpha=c.opacity!=null?c.opacity:1; octx.filter=FILTER_CSS[c.filter||'none']||'none';
  if(isImageMedia(m)){ const img=getImg(m); if(img&&img.complete&&img.naturalWidth) drawSrc(img,r,img.naturalWidth,img.naturalHeight); }
  else if(m.hasVideo){ if(curClipId===c.id && vid.readyState>=2 && vid.videoWidth) drawSrc(vid,r,vid.videoWidth,vid.videoHeight); }
  octx.restore(); }
function objsOfTrack(tid,isTop){ return (state.objects||[]).filter(o=>o.trackId===tid||(isTop&&!o.trackId)); }
function drawOverlay(){
  octx.setTransform(1,0,0,1,0,0); octx.clearRect(0,0,workW,workH);
  octx.translate(cropX,cropY);                 // export-space (0,0) = crop-window top-left
  octx.fillStyle='#000'; octx.fillRect(0,0,PW,PH);   // black base = empty timeline stretches render black
  const trks=state.tracks||[]; const topId=(trks[trks.length-1]||{}).id;
  // bottom track first → higher tracks composite on top
  for(const t of trks){ const c=activeClipOf(t); if(c) drawMediaClip(c); for(const o of objsOfTrack(t.id,t.id===topId)){ if(objVisible(o)) drawObject(o); } }
  // clip transition (dip to black/white) over the export frame
  const tr=clipTrans(); if(tr.a>0){ octx.globalAlpha=tr.a; octx.fillStyle=tr.color; octx.fillRect(0,0,PW,PH); octx.globalAlpha=1; }
  // selection chrome
  if(selection.kind==='object'){ const o=findObj(selection.id); if(o&&objVisible(o)) drawHandles(o,true); }
  else if(selection.kind==='clip'){ const c=findClipById(selection.id); if(c&&c.rect) drawHandles(c.rect,true); }
  else if(selection.kind==='multi'){ for(const id of selection.ids){ const o=findObj(id); if(o&&objVisible(o)) drawHandles(o,false); } }
}
function clipTrans(){ const c=clipAt(playhead); if(!c) return {a:0}; let a=0,color='#000';
  if(c.transIn&&c.transIn.type&&c.transIn.type!=='none'){ const d=c.transIn.dur||0.5; const p=(playhead-c.timelineIn)/d; if(p<1){ a=Math.max(a,1-clamp(p,0,1)); color=c.transIn.type==='dipwhite'?'#fff':'#000'; } }
  if(c.transOut&&c.transOut.type&&c.transOut.type!=='none'){ const d=c.transOut.dur||0.5; const p=(c.timelineOut-playhead)/d; if(p<1){ const aa=1-clamp(p,0,1); if(aa>a){a=aa; color=c.transOut.type==='dipwhite'?'#fff':'#000';} } }
  return {a,color}; }

function drawObject(o){ const f=animFactor(o); octx.save(); const cx=o.x+o.w/2, cy=o.y+o.h/2;
  octx.translate(cx+f.tx,cy+f.ty); octx.rotate(f.rot); octx.scale(f.sx,f.sy); octx.translate(-cx,-cy);
  octx.globalAlpha=(o.opacity!=null?o.opacity:1)*clamp(f.alpha,0,1);
  if(o.type==='text') drawText(o); else if(o.type==='caption') drawCaption(o); else if(o.type==='widget') drawWidget(o); else drawShape(o);
  octx.restore(); octx.globalAlpha=1; }

function drawText(o){ octx.fillStyle=o.color; octx.textBaseline='top'; octx.font=`bold ${o.fontSize}px "Segoe UI",system-ui,sans-serif`; octx.textAlign=o.align||'center'; const tx=o.align==='left'?o.x:o.align==='right'?o.x+o.w:o.x+o.w/2; wrapText(o.text||'',tx,o.y,o.w,o.fontSize*1.12); }
function wrapText(text,x,y,maxW,lh){ const words=String(text).split(/\s+/); let line='',yy=y; for(const w of words){ const test=line?line+' '+w:w; if(octx.measureText(test).width>maxW&&line){octx.fillText(line,x,yy); line=w; yy+=lh;} else line=test; } if(line)octx.fillText(line,x,yy); }

// ===================================================== CAPTION (karaoke-style rich text)
function hexFromColor(c){ if(!c) return '#000000'; if(/^#/.test(c)) return c.slice(0,7); const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return m?'#'+[m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join(''):'#000000'; }
function hexToRgba(hex,a){ const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex||'#000'); return m?`rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a??1})`:'rgba(0,0,0,1)'; }
function lerpHex(a,b,t){ const pa=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(a), pb=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(b); if(!pa||!pb) return t>.5?b:a; return '#'+[0,1,2].map(i=>Math.round(parseInt(pa[i+1],16)+(parseInt(pb[i+1],16)-parseInt(pa[i+1],16))*t).toString(16).padStart(2,'0')).join(''); }
function captionWordBlend(w,t){ const FADE=0.08; if(w.start==null||w.end==null||!w.color) return 0; if(t<w.start-FADE||t>w.end+FADE) return 0; return Math.min(clamp((t-w.start)/FADE,0,1),clamp((w.end-t)/FADE,0,1)); }

function drawCaption(o){
  const c=octx, x=o.x, y=o.y, maxW=o.w, fs=o.fontSize||88, lh=fs*1.18;
  const align=o.align||'center', base=o.color||'#FFFFFF';
  const wds=(o.words&&o.words.length)?o.words:String(o.text||'').split(/\s+/).map(t=>({text:t}));
  c.font=`bold ${fs}px "Segoe UI",system-ui,sans-serif`; c.textBaseline='top'; c.textAlign='left';
  const spW=c.measureText(' ').width;
  // lay out into word-wrapped lines
  const lines=[]; let cur=[],cw=0;
  for(const wd of wds){ const ww=c.measureText(wd.text).width;
    if(cur.length&&cw+spW+ww>maxW){ lines.push({words:cur,width:cw}); cur=[{word:wd,w:ww}]; cw=ww; }
    else{ if(cur.length) cw+=spW; cur.push({word:wd,w:ww}); cw+=ww; } }
  if(cur.length) lines.push({words:cur,width:cw});
  const totalH=lines.length*lh;
  // optional background shape
  if(o.bgShape&&o.bgShape!=='none'){
    const pad=o.bgPadding??20, bgMaxW=Math.max(...lines.map(l=>l.width));
    const bgX=(align==='left'?x:align==='right'?x+maxW-bgMaxW:x+maxW/2-bgMaxW/2)-pad;
    const bgY=y-pad, bgW=bgMaxW+pad*2, bgH=totalH+pad*2;
    c.save(); c.shadowBlur=0; c.shadowColor='transparent';
    c.fillStyle=hexToRgba(o.bgColor||'#000000',o.bgAlpha??0.6);
    if(o.bgShape==='rect') c.fillRect(bgX,bgY,bgW,bgH);
    else if(o.bgShape==='roundrect'){ roundRect(c,bgX,bgY,bgW,bgH,16); c.fill(); }
    else if(o.bgShape==='pill'){ roundRect(c,bgX,bgY,bgW,bgH,bgH/2); c.fill(); }
    c.restore();
  }
  // draw lines word-by-word so each word can have its own highlight color
  let lineY=y;
  for(const line of lines){
    const lx=align==='left'?x:align==='right'?x+maxW-line.width:x+maxW/2-line.width/2;
    let wx=lx;
    for(const {word,w} of line.words){
      const blend=captionWordBlend(word,playhead);
      const wordColor=blend>0?lerpHex(base,hexFromColor(word.color||base),blend):base;
      // box-highlight mode: draw a colored pill BEHIND the active word
      if(blend>0&&o.highlightMode==='box'){
        const bp=o.boxPadding??10, br=(fs+bp)/2;
        c.save(); c.shadowBlur=0; c.shadowColor='transparent';
        c.fillStyle=hexToRgba(hexFromColor(word.color||'#2BD9A8'),blend);
        roundRect(c,wx-bp,lineY-bp*0.5,w+bp*2,fs+bp,br); c.fill();
        c.restore();
      }
      // stroke/border first (no shadow on stroke so it stays clean)
      const sw=o.strokeWidth??8;
      if(sw>0){ c.save(); c.shadowBlur=0; c.shadowColor='transparent'; c.strokeStyle=hexFromColor(o.strokeColor||'#000000'); c.lineWidth=sw*2; c.lineJoin='round'; c.strokeText(word.text,wx,lineY); c.restore(); }
      // optional glow on the active word (color mode only)
      if(blend>0&&o.wordGlow&&o.highlightMode!=='box'){ c.save(); c.shadowColor=hexToRgba(hexFromColor(word.color||base),blend*0.9); c.shadowBlur=fs*0.55; c.fillStyle=wordColor; c.fillText(word.text,wx,lineY); c.restore(); }
      // fill with drop shadow (in box mode keep word color unchanged)
      const fillColor=o.highlightMode==='box'?base:wordColor;
      c.save(); c.shadowColor=hexToRgba(o.shadowColor||'#000000',o.shadowAlpha??0.9); c.shadowBlur=o.shadowBlur??10; c.shadowOffsetX=o.shadowOffsetX??2; c.shadowOffsetY=o.shadowOffsetY??3;
      c.fillStyle=fillColor; c.fillText(word.text,wx,lineY); c.restore();
      wx+=w+spW;
    }
    lineY+=lh;
  }
}

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

function htol(){ return Math.max(12, PW*0.013); }   // grab tolerance scales with export resolution
function drawHandles(o,full){ const s=htol()*1.15; octx.save(); octx.globalAlpha=1; octx.strokeStyle='#36C5F0'; octx.lineWidth=Math.max(2,PW*0.0016); octx.strokeRect(o.x,o.y,o.w,o.h); if(full) for(const h of handlePts(o)){ octx.fillStyle='#fff'; octx.fillRect(h.x-s/2,h.y-s/2,s,s); octx.fillStyle='#36C5F0'; octx.fillRect(h.x-s/2+2,h.y-s/2+2,s-4,s-4); } octx.restore(); }
function handlePts(o){ return [{n:'nw',x:o.x,y:o.y},{n:'n',x:o.x+o.w/2,y:o.y},{n:'ne',x:o.x+o.w,y:o.y},{n:'e',x:o.x+o.w,y:o.y+o.h/2},{n:'se',x:o.x+o.w,y:o.y+o.h},{n:'s',x:o.x+o.w/2,y:o.y+o.h},{n:'sw',x:o.x,y:o.y+o.h},{n:'w',x:o.x,y:o.y+o.h/2}]; }
function canvasPos(ev){ const r=overlay.getBoundingClientRect(); return {x:(ev.clientX-r.left)*(workW/r.width)-cropX, y:(ev.clientY-r.top)*(workH/r.height)-cropY}; }
function hitObject(p){ const arr=state.objects||[]; for(let i=arr.length-1;i>=0;i--){ const o=arr[i]; if(!objVisible(o)||o.locked) continue; if(p.x>=o.x&&p.x<=o.x+o.w&&p.y>=o.y&&p.y<=o.y+o.h) return o; } return null; }
function rectsOverlap(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by; }
function resizeCentered(g,handle,dx,dy){
  const sx=handle.includes('w')?-dx:handle.includes('e')?dx:0;
  const sy=handle.includes('n')?-dy:handle.includes('s')?dy:0;
  const base=Math.max(1,Math.max(g.w,g.h));
  const delta=Math.abs(sx)>Math.abs(sy)?sx:sy;
  const scale=Math.max(0.05,1+(delta*2)/base);
  const w=Math.max(20,g.w*scale), h=Math.max(20,g.h*scale);
  return { x:g.x+(g.w-w)/2, y:g.y+(g.h-h)/2, w, h };
}

// ---- canvas mouse: handles / move / group-move / marquee ----
function hitMediaClip(p){ const trks=state.tracks||[]; for(let i=trks.length-1;i>=0;i--){ const c=activeClipOf(trks[i]); if(c){ const r=c.rect||{x:0,y:0,w:PW,h:PH}; if(p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h) return c; } } return null; }

let oDrag=null, cDrag=null;
overlay.addEventListener('mousedown',(ev)=>{ if(typeof previewMode!=='undefined'&&previewMode==='pan') return; const p=canvasPos(ev);
  // resize handles of the current selection (object or media clip)
  const tol=htol();
  if(selection.kind==='object'){ const o=findObj(selection.id); if(o){ for(const h of handlePts(o)){ if(Math.abs(p.x-h.x)<tol&&Math.abs(p.y-h.y)<tol){ startODrag([o],'resize',h.n,p); return; } } } }
  if(selection.kind==='clip'){ const c=findClipById(selection.id); if(c&&c.rect){ for(const h of handlePts(c.rect)){ if(Math.abs(p.x-h.x)<tol&&Math.abs(p.y-h.y)<tol){ startClipDrag(c,'resize',h.n,p); return; } } } }
  const hit=hitObject(p);
  if(hit){ if(selection.kind==='multi'&&selection.ids.includes(hit.id)){ startODrag(selection.ids.map(findObj).filter(Boolean),'move',null,p); }
    else { select('object',hit.id); startODrag([hit],'move',null,p); } return; }
  const mc=hitMediaClip(p);
  if(mc){ select('clip',mc.id); startClipDrag(mc,'move',null,p); }
  else select(null); });

// Move/resize a media clip's placement (rect) directly on the canvas.
function startClipDrag(clip,mode,handle,p){ interacting=true; const r=clip.rect||{x:0,y:0,w:PW,h:PH}; cDrag={clip,mode,handle,s:p,g:{x:r.x,y:r.y,w:r.w,h:r.h}}; window.addEventListener('mousemove',cMove); window.addEventListener('mouseup',cUp); }
function cMove(ev){ if(!cDrag) return; const p=canvasPos(ev),dx=p.x-cDrag.s.x,dy=p.y-cDrag.s.y,g=cDrag.g,r=Object.assign({},g);
  if(cDrag.mode==='move'){ r.x=g.x+dx; r.y=g.y+dy; } else Object.assign(r, resizeCentered(g,cDrag.handle,dx,dy));
  cDrag.clip.rect=r; }
function cUp(){ window.removeEventListener('mousemove',cMove); window.removeEventListener('mouseup',cUp); if(cDrag){ const r=cDrag.clip.rect; rpc('update_clip',{clipId:cDrag.clip.id,patch:{rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.w),h:Math.round(r.h)}}}).catch(()=>{}); } interacting=false; cDrag=null; }

function startODrag(objs,mode,handle,p){ interacting=true; oDrag={objs,mode,handle,s:p,g:objs.map(o=>({o,x:o.x,y:o.y,w:o.w,h:o.h}))}; window.addEventListener('mousemove',oMove); window.addEventListener('mouseup',oUp); }
function oMove(ev){ if(!oDrag) return; const p=canvasPos(ev),dx=p.x-oDrag.s.x,dy=p.y-oDrag.s.y;
  if(oDrag.mode==='move'){ for(const g of oDrag.g){ g.o.x=g.x+dx; g.o.y=g.y+dy; } }
  else { const g=oDrag.g[0],o=g.o; Object.assign(o, resizeCentered(g,oDrag.handle,dx,dy)); } }
function oUp(){ window.removeEventListener('mousemove',oMove); window.removeEventListener('mouseup',oUp); if(oDrag){ for(const g of oDrag.g){ const o=g.o; rpc('update_object',{id:o.id,patch:{x:Math.round(o.x),y:Math.round(o.y),w:Math.round(o.w),h:Math.round(o.h)}}).catch(()=>{}); } } interacting=false; oDrag=null; }
overlay.addEventListener('dblclick',(ev)=>{ const o=hitObject(canvasPos(ev)); if(o&&o.type==='text'){ select('object',o.id); const ta=el('f_text'); if(ta){ta.focus(); ta.select();} } });

// ===================================================== SIDEBAR SECTIONS
const TEXT_PRESETS=[{label:'Heading',fontSize:104,color:'#FFFFFF',text:'Heading'},{label:'Title',fontSize:80,color:'#FFFFFF',text:'Title'},{label:'Subtitle',fontSize:52,color:'#E2E6EE',text:'Subtitle'},{label:'Body',fontSize:38,color:'#FFFFFF',text:'Body text'},{label:'Yellow',fontSize:88,color:'#F5D90A',text:'POP'},{label:'Cyan',fontSize:88,color:'#36C5F0',text:'NEON'},{label:'Red',fontSize:88,color:'#FF5C72',text:'ALERT'},{label:'Black',fontSize:80,color:'#111418',text:'Black'},{label:'Caption',fontSize:46,color:'#FFFFFF',text:'Caption goes here'}];
const SHAPES=[{shape:'rect',label:'Rectangle',ic:'▭'},{shape:'roundrect',label:'Rounded',ic:'▢'},{shape:'ellipse',label:'Circle',ic:'⬤'},{shape:'triangle',label:'Triangle',ic:'▲'},{shape:'diamond',label:'Diamond',ic:'◆'},{shape:'star',label:'Star',ic:'★'},{shape:'pentagon',label:'Pentagon',ic:'⬠'},{shape:'hexagon',label:'Hexagon',ic:'⬡'},{shape:'heart',label:'Heart',ic:'♥'},{shape:'arrow',label:'Arrow',ic:'➜'},{shape:'line',label:'Line',ic:'▬'},{shape:'ring',label:'Ring',ic:'◯'}];
const WIDGETS=[{widget:'lowerthird',label:'Lower Third',ic:'🏷'},{widget:'titlecard',label:'Title Card',ic:'🅣'},{widget:'progressbar',label:'Progress',ic:'▰'},{widget:'timer',label:'Countdown',ic:'⏱'},{widget:'badge',label:'Badge',ic:'🔖'},{widget:'bars',label:'Audio Bars',ic:'📊'}];
const CAPTION_PRESETS=[
  {label:'Classic',ic:'🔤',p:{strokeWidth:8,strokeColor:'#000000',shadowBlur:0,shadowAlpha:0,bgShape:'none',wordGlow:false,color:'#FFFFFF'}},
  {label:'YouTube',ic:'▶',p:{strokeWidth:5,strokeColor:'#000000',shadowBlur:8,shadowAlpha:0.7,bgShape:'none',wordGlow:false,color:'#FFFFFF'}},
  {label:'Netflix',ic:'N',p:{strokeWidth:0,shadowBlur:0,bgShape:'roundrect',bgColor:'#000000',bgAlpha:0.78,wordGlow:false,color:'#FFFFFF'}},
  {label:'Neon Glow',ic:'✨',p:{strokeWidth:0,shadowBlur:18,shadowColor:'#FF5C72',shadowAlpha:0.9,bgShape:'none',wordGlow:true,color:'#FFFFFF'}},
  {label:'Pill Box',ic:'💊',p:{strokeWidth:4,strokeColor:'#000000',shadowBlur:6,bgShape:'pill',bgColor:'#6C5CE7',bgAlpha:0.85,color:'#FFFFFF'}},
  {label:'Drop Shadow',ic:'🌑',p:{strokeWidth:0,shadowBlur:20,shadowOffsetX:5,shadowOffsetY:5,shadowAlpha:0.95,bgShape:'none',wordGlow:false,color:'#FFFFFF'}},
  {label:'Box Pop',ic:'📦',p:{strokeWidth:6,strokeColor:'#000000',shadowBlur:8,shadowAlpha:0.6,bgShape:'none',wordGlow:false,highlightMode:'box',boxPadding:12,color:'#FFFFFF'}},
];
function renderCaptionSection(){
  const body=el('sectionBody'); body.innerHTML='<h3>Caption Styles — click to add at playhead</h3>';
  const g=document.createElement('div'); g.className='grid';
  CAPTION_PRESETS.forEach(p=>{
    const item=document.createElement('div'); item.className='grid-item'; item.draggable=true;
    item.innerHTML=`<div class="gi-ic" style="font-size:22px">${p.ic}</div><div class="gi-label">${p.label}</div>`;
    const payload={kind:'caption',params:{type:'caption',...p.p}};
    item.onclick=()=>{ const s=+playhead.toFixed(2); rpc('add_object',Object.assign({type:'caption',trackId:activeTrackId,start:s,end:s+3},p.p)).then(o=>select('object',o.id)).catch(()=>{}); };
    item.addEventListener('dragstart',e=>e.dataTransfer.setData('application/x-kninix-item',JSON.stringify(payload)));
    g.appendChild(item);
  });
  body.appendChild(g);
}
const STICKERS='😀 😎 🔥 ✨ ❤️ 👍 🎉 💯 😂 🥳 ⭐ 💡 📌 ✅ ❓ 💬 🚀 🌈 ☀️ 🎵 📷 🏆 👀 🤔 😍 🙌 💀 🎬 ⚡ 🍿'.split(' ');
let activeSection='media';
const SECTIONS=[
  {id:'media',ic:'🎬',label:'Media',render:renderMediaSection},
  {id:'text',ic:'🅣',label:'Text',render:()=>grid('Text styles',TEXT_PRESETS.map(p=>({html:`<div class="gi-ic" style="color:${p.color}">T</div><div class="gi-label">${p.label}</div>`,payload:{kind:'object',params:{type:'text',text:p.text,fontSize:p.fontSize,color:p.color}}})))},
  {id:'captions',ic:'💬',label:'Captions',render:renderCaptionSection},
  {id:'widgets',ic:'🧩',label:'Widgets',render:()=>grid('Widgets (animated)',WIDGETS.map(w=>({html:`<div class="gi-ic">${w.ic}</div><div class="gi-label">${w.label}</div>`,payload:{kind:'widget',params:{widget:w.widget}}})),'g2')},
  {id:'shapes',ic:'◆',label:'Shapes',render:()=>grid('Shapes',SHAPES.map(s=>({html:`<div class="gi-ic">${s.ic}</div><div class="gi-label">${s.label}</div>`,payload:{kind:'object',params:{type:'shape',shape:s.shape}}})))},
  {id:'stickers',ic:'😀',label:'Sticker',render:()=>grid('Stickers',STICKERS.map(e=>({html:`<div class="gi-ic">${e}</div>`,payload:{kind:'object',params:{type:'text',text:e,fontSize:160}}})))},
  {id:'filters',ic:'🎨',label:'Filters',render:()=>grid('Filters (selected/playing clip)',FILTERS.map(f=>({html:`<div class="gi-swatch" style="background:#3a86ff;filter:${f.css}"></div><div class="gi-label">${f.label}</div>`,on:()=>applyFilter(f.id)})),'g2')},
  {id:'audio',ic:'🔊',label:'Audio',render:renderAudioSection},
];
function renderTabs(){ const t=el('tabs'); t.innerHTML=''; for(const s of SECTIONS){ const b=document.createElement('button'); b.className='tab'+(s.id===activeSection?' on':''); b.innerHTML=`<span class="ic">${s.ic}</span>${s.label}`; b.onclick=()=>{activeSection=s.id; renderTabs(); renderSection();}; t.appendChild(b);} }
function renderSection(){ el('sectionBody').innerHTML=''; SECTIONS.find(x=>x.id===activeSection).render(); }
function makeDrag(elm,payload){ elm.draggable=true; elm.title='Drag into a track'; elm.addEventListener('dragstart',ev=>{ const data=JSON.stringify(payload); ev.dataTransfer.effectAllowed='copy'; ev.dataTransfer.setData('application/x-kninix-item',data); ev.dataTransfer.setData('text/plain',data); }); }
function grid(title,items,cls){ const body=el('sectionBody'); const h=document.createElement('h3'); h.textContent=title; body.appendChild(h); const g=document.createElement('div'); g.className='grid'+(cls?' '+cls:''); for(const it of items){ const d=document.createElement('div'); d.className='grid-item'; d.innerHTML=it.html; if(it.payload){ makeDrag(d,it.payload); d.onclick=()=>setStatus('Drag it into a track.'); } else d.onclick=it.on; g.appendChild(d);} body.appendChild(g); }
function renderMediaSection(){ const body=el('sectionBody'); body.innerHTML=`<button class="btn block accent" id="s_import">⬆ Import video / image</button><button class="btn block" id="s_demo">+ Add demo clip</button><h3 style="margin-top:14px">Library <span class="muted">${Object.keys(state.media).length}</span></h3><div class="media-list" id="s_medialist"></div>`;
  el('s_import').onclick=doImport; el('s_demo').onclick=()=>rpc('generate_sample',{duration:6}).then(()=>setStatus('Generating demo clip…'));
  const list=el('s_medialist'); for(const m of Object.values(state.media)){ const c=document.createElement('div'); c.className='media-card'; const ts=m.thumbnail?`style="background-image:url('file:///${String(m.thumbnail).replace(/\\/g,'/')}')"`:''; c.innerHTML=`<div class="thumb" ${ts}>${m.thumbnail?'':(m.kind==='audio'?'♪':'▦')}</div><div class="info"><div class="name" title="${m.name}">${m.name}</div><div class="sub">${fmt(m.duration)}${m.kind==='audio'?' · audio':` · ${m.width}×${m.height}`}${m.proxy||!m.hasVideo?'':' · ⏳preview'}</div></div>`; makeDrag(c,{kind:'media',mediaId:m.id}); c.onclick=()=>setStatus('Drag '+m.name+' into a track.'); list.appendChild(c);} }
function renderAudioSection(){ const body=el('sectionBody'); body.innerHTML=`<button class="btn block accent" id="a_import">⬆ Import audio</button><h3 style="margin-top:14px">Music tones</h3><div class="grid g2" id="a_tones"></div>`; el('a_import').onclick=doImport; const tones=[['Bass',110],['Low',220],['Mid',330],['High',440],['Higher',554],['Top',660]]; const g=el('a_tones'); for(const[name,freq]of tones){ const d=document.createElement('div'); d.className='grid-item'; d.innerHTML=`<div class="gi-ic">🎵</div><div class="gi-label">${name}<br>${freq}Hz</div>`; d.onclick=()=>rpc('generate_tone',{duration:8,freq}).then(()=>setStatus('Generating '+name+' tone…')); g.appendChild(d);} }
function applyFilter(id){ let clip=null; if(selection.kind==='clip') clip=findClipById(selection.id); if(!clip) clip=clipAt(playhead); if(!clip) clip=videoClips()[0]; if(!clip){ setStatus('Add a video clip first.'); return; } rpc('set_filter',{clipId:clip.id,filter:id}).then(()=>{select('clip',clip.id); setStatus('Filter: '+id);}).catch(()=>{}); }
function doImport(){ window.kx.pickFile().then(files=>{ for(const f of files){ setStatus('Importing '+f+'…'); rpc('import_media',{path:f}).catch(()=>{}); } }); }

// ===================================================== TIMELINE
function renderTimeline(){ const dur=Math.max(totalDuration(),12),width=dur*pxPerSec+40; const ruler=el('ruler'); ruler.style.width=width+'px'; ruler.innerHTML=''; const step=dur>120?20:dur>40?10:dur>15?5:1; for(let s=0;s<=dur;s+=step){ const t=document.createElement('div'); t.className='tick'; t.style.left=(s*pxPerSec)+'px'; t.textContent=s+'s'; ruler.appendChild(t);}
  const tracks=el('tracks'); tracks.style.width=width+'px'; tracks.innerHTML='';
  const trks=state.tracks||[];
  // Numbered tracks, stacked with the TOP track (highest number) drawn at the top row.
  for(let i=trks.length-1;i>=0;i--) tracks.appendChild(trackLane(trks[i], i+1, i===trks.length-1));
  positionPlayhead(); }
function clipSel(id){ return selection.kind==='clip'&&selection.id===id; }
function objSel(id){ return (selection.kind==='object'&&selection.id===id)||(selection.kind==='multi'&&selection.ids.includes(id)); }
function objName(o){ return (o.type==='text'||o.type==='caption')?('”'+(o.text||'').slice(0,14)+'”'):o.type==='widget'?o.widget:(o.shape||'shape'); }
function clipNode(c){ const n=document.createElement('div'); n.className='clip'+(clipSel(c.id)?' sel':''); n.style.left=(c.timelineIn*pxPerSec)+'px'; n.style.width=Math.max(10,(c.timelineOut-c.timelineIn)*pxPerSec)+'px'; n.innerHTML=`<div class="cl-name">${c.name}${c.filter&&c.filter!=='none'?' · '+c.filter:''}</div><div class="edge l"></div><div class="edge r"></div>`; return n; }
function objNode(o){ const b=document.createElement('div'); b.className='clip obj'+(objSel(o.id)?' sel':'')+(o.hidden?' off':''); b.style.left=((o.start||0)*pxPerSec)+'px'; b.style.width=Math.max(20,((o.end||0)-(o.start||0))*pxPerSec)+'px'; b.innerHTML=`<div class="cl-name">${objName(o)}</div><div class="edge l"></div><div class="edge r"></div>`; return b; }
function dragPayload(ev){ const raw=ev.dataTransfer.getData('application/x-kninix-item')||ev.dataTransfer.getData('text/plain'); if(!raw) return null; try{return JSON.parse(raw);}catch(_){return null;} }
function dropAt(ev){ const r=el('timeline').getBoundingClientRect(); return Math.max(0,(ev.clientX-r.left+el('timeline').scrollLeft)/pxPerSec); }
function addDroppedItem(payload,trackId,at){
  setActiveTrack(trackId);
  if(payload.kind==='media') return rpc('add_clip',{mediaId:payload.mediaId,trackId,at:+at.toFixed(3)}).then(c=>{ select('clip',c.id); setStatus('Added to Track'); });
  if(payload.kind==='widget') return rpc('add_widget',withTime(payload.params,trackId,at)).then(o=>{ select('object',o.id); setStatus('Added to Track'); });
  if(payload.kind==='object') return rpc('add_object',withTime(payload.params,trackId,at)).then(o=>{ select('object',o.id); setStatus('Added to Track'); });
}
function trackLane(tr,num,isTop){ const lane=document.createElement('div'); lane.className='lane'+(tr.id===activeTrackId?' active':''); lane.dataset.kind='track'; lane.innerHTML=`<span class="lane-label">Track ${num}</span>`;
  for(const c of tr.clips){ const n=clipNode(c); n.addEventListener('mousedown',(ev)=>onClipDown(ev,c,n)); lane.appendChild(n); }
  for(const o of (state.objects||[]).filter(o=>o.trackId===tr.id||(isTop&&!o.trackId))){ const b=objNode(o); b.addEventListener('mousedown',(ev)=>onObjBlockDown(ev,o,b)); lane.appendChild(b); }
  lane.addEventListener('mousedown',(ev)=>{ if(ev.target===lane||ev.target.classList.contains('lane-label')){ setActiveTrack(tr.id); select(null); pause(); scrub(ev); } });
  lane.addEventListener('dragover',(ev)=>{ const t=ev.dataTransfer.types; if(t&&(t.includes('application/x-kninix-item')||t.includes('text/plain'))){ ev.preventDefault(); lane.classList.add('drop'); ev.dataTransfer.dropEffect='copy'; } });
  lane.addEventListener('dragleave',()=>lane.classList.remove('drop'));
  lane.addEventListener('drop',(ev)=>{ const payload=dragPayload(ev); lane.classList.remove('drop'); if(!payload) return; ev.preventDefault(); pause(); addDroppedItem(payload,tr.id,dropAt(ev)).catch(e=>setStatus('⚠ '+e.message)); });
  return lane; }
function setActiveTrack(id){ activeTrackId=id; renderTimeline(); }

function onClipDown(ev,clip,node){ ev.stopPropagation(); select('clip',clip.id); const edge=ev.target.classList.contains('edge')?(ev.target.classList.contains('l')?'l':'r'):null; interacting=true; const x0=ev.clientX,g={tin:clip.timelineIn,sin:clip.sourceIn,sout:clip.sourceOut}; const m=state.media[clip.mediaId],maxDur=(m&&!m.isImage)?m.duration:1e9;
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
// Exponential zoom: slider 0..100 maps to 0.15..600 px/sec, so a 5-hour clip can be
// zoomed all the way out (and a few frames zoomed right in).
const ZMIN=0.15, ZMAX=600, ZK=Math.log(ZMAX/ZMIN);
function zoomToPx(v){ return ZMIN*Math.exp(ZK*clamp(v,0,100)/100); }
function pxToZoom(p){ return clamp(100*Math.log(p/ZMIN)/ZK,0,100); }
el('zoom').addEventListener('input',(e)=>{ pxPerSec=zoomToPx(+e.target.value); renderTimeline(); });
function zoomFit(){ const tl=el('timeline'); const avail=Math.max(200,(tl?tl.clientWidth:1000)-60); pxPerSec=clamp(avail/Math.max(totalDuration(),1),ZMIN,ZMAX); el('zoom').value=pxToZoom(pxPerSec); renderTimeline(); }
el('btnFit').addEventListener('click', zoomFit);
// Ctrl+Scroll on timeline = zoom timeline (same as moving the zoom slider)
el('timeline').addEventListener('wheel',e=>{ if(!e.ctrlKey) return; e.preventDefault(); pxPerSec=Math.max(ZMIN,Math.min(ZMAX,pxPerSec*(e.deltaY<0?1.15:1/1.15))); el('zoom').value=pxToZoom(pxPerSec); renderTimeline(); },{passive:false});

// Playhead grab-handle (the knob at the top of the red line) — hold & drag to scrub.
el('phHandle').addEventListener('mousedown',(ev)=>{ ev.stopPropagation(); pause(); scrub(ev); const mv=(e)=>scrub(e),up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up);}; window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up); });

// ---- resolution / aspect ratio (defines the export window) ----
function populateResProfiles(){ const sel=el('resProfile'); sel.innerHTML=''; for(const p of RES_PROFILES){ const o=document.createElement('option'); o.value=p.w+'x'+p.h; o.textContent=p.label; sel.appendChild(o);} const c=document.createElement('option'); c.value='custom'; c.textContent='Custom…'; sel.appendChild(c); }
function syncResUI(){ const w=state.resolution.w,h=state.resolution.h; const match=RES_PROFILES.find(p=>p.w===w&&p.h===h); el('resProfile').value=match?(w+'x'+h):'custom'; el('resW').value=w; el('resH').value=h; el('ratioTag').textContent=ratioTag(w,h); }
function applyResolution(w,h){ rpc('set_resolution',{w:Math.max(16,Math.round(w)),h:Math.max(16,Math.round(h))}).catch(()=>{}); }
el('resProfile').onchange=e=>{ if(e.target.value==='custom') return; const [w,h]=e.target.value.split('x').map(Number); applyResolution(w,h); };
el('resW').onchange=e=>applyResolution(+e.target.value,state.resolution.h);
el('resH').onchange=e=>applyResolution(state.resolution.w,+e.target.value);
// + Track: add a new numbered track on top and make it the active drop target.
el('btnAddTrack').onclick=()=>rpc('add_track',{}).then(id=>{ activeTrackId=id; }).catch(()=>{});

// ===================================================== SELECTION / INSPECTOR / LAYERS
function select(kind,id){ selection=kind?{kind,id,ids:id?[id]:[]}:{kind:null,id:null,ids:[]}; renderTimeline(); renderInspector(); renderLayers(); }
function selectMulti(ids){ selection={kind:'multi',id:null,ids}; renderTimeline(); renderInspector(); renderLayers(); }
function findClipById(id){ for(const t of state.tracks||[]){ const c=t.clips.find(c=>c.id===id); if(c) return c; } return null; }
function animOpts(sel){ return ANIM.map(a=>`<option ${a===sel?'selected':''}>${a}</option>`).join(''); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ===================================================== CAPTION INSPECTOR
function captionInspHtml(o){
  const wd=o.words||[];
  const rows=wd.map((w,i)=>`<tr>
    <td><input class="cw-text" data-i="${i}" value="${esc(w.text||'')}" style="width:72px;padding:3px 5px"></td>
    <td><input class="cw-col" type="color" data-i="${i}" value="${hexFromColor(w.color||'#FF5C72')}" style="width:38px;height:26px;padding:2px"></td>
    <td><input class="cw-s" type="number" step="0.1" data-i="${i}" value="${+(w.start??0).toFixed(2)}" style="width:58px;padding:3px 5px"></td>
    <td><input class="cw-e" type="number" step="0.1" data-i="${i}" value="${+(w.end??0).toFixed(2)}" style="width:58px;padding:3px 5px"></td>
    <td><button class="btn del tiny cw-del" data-i="${i}" style="padding:2px 6px">✕</button></td>
  </tr>`).join('');
  return `<div class="insp-title"><span class="tag">caption</span></div>
  <div class="field"><label>Text</label><textarea id="f_text" style="min-height:40px">${esc(o.text||'')}</textarea></div>
  <div class="field row"><div><label>Size</label><input id="f_fs" type="number" value="${o.fontSize||88}"></div>
    <div><label>Align</label><select id="f_al"><option ${o.align==='left'?'selected':''}>left</option><option ${(!o.align||o.align==='center')?'selected':''}>center</option><option ${o.align==='right'?'selected':''}>right</option></select></div></div>
  <div class="insp-sub">Style</div>
  <div class="field row"><div><label>Text Color</label><input id="f_col" type="color" value="${(o.color||'#ffffff').slice(0,7)}"></div>
    <div><label>Stroke Color</label><input id="f_scol" type="color" value="${hexFromColor(o.strokeColor||'#000000')}"></div></div>
  <div class="field row"><div><label>Stroke Width</label><input id="f_sw" type="number" min="0" max="40" value="${o.strokeWidth??8}"></div>
    <div><label>Shadow Blur</label><input id="f_shblur" type="number" min="0" max="80" value="${o.shadowBlur??10}"></div></div>
  <div class="field row"><div><label>Shadow Color</label><input id="f_shcol" type="color" value="${hexFromColor(o.shadowColor||'#000000')}"></div>
    <div><label>Shadow α</label><input id="f_shalpha" type="number" step="0.05" min="0" max="1" value="${+(o.shadowAlpha??0.9).toFixed(2)}"></div></div>
  <div class="field row"><div><label>Shadow X</label><input id="f_shox" type="number" value="${o.shadowOffsetX??2}"></div>
    <div><label>Shadow Y</label><input id="f_shoy" type="number" value="${o.shadowOffsetY??3}"></div></div>
  <div class="insp-sub">Background</div>
  <div class="field row"><div><label>Shape</label><select id="f_bgsh"><option value="none" ${(o.bgShape||'none')==='none'?'selected':''}>None</option><option value="rect" ${o.bgShape==='rect'?'selected':''}>Rectangle</option><option value="roundrect" ${o.bgShape==='roundrect'?'selected':''}>Rounded</option><option value="pill" ${o.bgShape==='pill'?'selected':''}>Pill</option></select></div>
    <div><label>Bg Color</label><input id="f_bgcol" type="color" value="${hexFromColor(o.bgColor||'#000000')}"></div></div>
  <div class="field row"><div><label>Bg α</label><input id="f_bgalpha" type="number" step="0.05" min="0" max="1" value="${+(o.bgAlpha??0.6).toFixed(2)}"></div>
    <div><label>Bg Padding</label><input id="f_bgpad" type="number" min="0" max="100" value="${o.bgPadding??20}"></div></div>
  <div class="field row"><div><label>Highlight Mode</label><select id="f_hlmode"><option value="color" ${(o.highlightMode||'color')==='color'?'selected':''}>Color word</option><option value="box" ${o.highlightMode==='box'?'selected':''}>Box behind word</option></select></div>
    <div><label>Box Padding</label><input id="f_bxpad" type="number" min="0" max="40" value="${o.boxPadding??12}"></div></div>
  <div class="field"><label><input id="f_wglow" type="checkbox" ${o.wordGlow?'checked':''}> &nbsp;Word glow on highlight</label></div>
  <div class="insp-sub">Position</div>
  <div class="field row"><div><label>X</label><input id="f_x" type="number" value="${Math.round(o.x)}"></div><div><label>Y</label><input id="f_y" type="number" value="${Math.round(o.y)}"></div></div>
  <div class="field row"><div><label>W</label><input id="f_w" type="number" value="${Math.round(o.w)}"></div><div><label>H</label><input id="f_h" type="number" value="${Math.round(o.h)}"></div></div>
  <div class="field row"><div><label>Start (s)</label><input id="f_st" type="number" step="0.1" value="${o.start||0}"></div><div><label>End (s)</label><input id="f_en" type="number" step="0.1" value="${o.end||0}"></div></div>
  <div class="field"><label>Animate IN</label><div class="anim-grid"><select id="f_ain">${animOpts(o.animIn?o.animIn.type:'none')}</select><input id="f_aind" type="number" step="0.1" value="${o.animIn?o.animIn.dur:0.5}"></div></div>
  <div class="field"><label>Animate OUT</label><div class="anim-grid"><select id="f_aout">${animOpts(o.animOut?o.animOut.type:'none')}</select><input id="f_aoutd" type="number" step="0.1" value="${o.animOut?o.animOut.dur:0.5}"></div></div>
  <div class="insp-sub">Word Highlights &nbsp;<button class="btn ghost tiny" id="c_parse">Auto-parse</button>&nbsp;<button class="btn ghost tiny" id="c_addw">+ Word</button></div>
  <table class="caption-tbl"><thead><tr><th>Word</th><th>Color</th><th>Start</th><th>End</th><th></th></tr></thead><tbody id="cwtbody">${rows}</tbody></table>
  <button class="btn del" id="b_delo" style="margin-top:10px;width:100%">Delete object</button>`;
}
function bindCaptionInspector(o){
  const u=(patch)=>{ Object.assign(o,patch); commit('update_object',{id:o.id,patch}); };
  el('f_text').oninput=e=>{o.text=e.target.value;}; el('f_text').onchange=e=>u({text:e.target.value});
  el('f_fs').onchange=e=>u({fontSize:+e.target.value});
  el('f_al').onchange=e=>u({align:e.target.value});
  el('f_col').oninput=e=>{o.color=e.target.value;}; el('f_col').onchange=e=>u({color:e.target.value});
  el('f_scol').onchange=e=>u({strokeColor:e.target.value});
  el('f_sw').onchange=e=>u({strokeWidth:+e.target.value});
  el('f_shcol').onchange=e=>u({shadowColor:hexToRgba(e.target.value,o.shadowAlpha??0.9)});
  el('f_shalpha').onchange=e=>{ const a=+e.target.value; u({shadowAlpha:a,shadowColor:hexToRgba(hexFromColor(o.shadowColor||'#000000'),a)}); };
  el('f_shblur').onchange=e=>u({shadowBlur:+e.target.value});
  el('f_shox').onchange=e=>u({shadowOffsetX:+e.target.value});
  el('f_shoy').onchange=e=>u({shadowOffsetY:+e.target.value});
  el('f_bgsh').onchange=e=>u({bgShape:e.target.value});
  el('f_bgcol').onchange=e=>u({bgColor:hexToRgba(e.target.value,o.bgAlpha??0.6)});
  el('f_bgalpha').onchange=e=>{ const a=+e.target.value; u({bgAlpha:a,bgColor:hexToRgba(hexFromColor(o.bgColor||'#000000'),a)}); };
  el('f_bgpad').onchange=e=>u({bgPadding:+e.target.value});
  el('f_hlmode').onchange=e=>u({highlightMode:e.target.value});
  el('f_bxpad').onchange=e=>u({boxPadding:+e.target.value});
  el('f_wglow').onchange=e=>u({wordGlow:e.target.checked});
  el('f_x').onchange=e=>u({x:+e.target.value}); el('f_y').onchange=e=>u({y:+e.target.value});
  el('f_w').onchange=e=>u({w:+e.target.value}); el('f_h').onchange=e=>u({h:+e.target.value});
  el('f_st').onchange=e=>u({start:+e.target.value}); el('f_en').onchange=e=>u({end:+e.target.value});
  el('f_ain').onchange=e=>u({animIn:{type:e.target.value,dur:+el('f_aind').value}}); el('f_aind').onchange=e=>u({animIn:{type:el('f_ain').value,dur:+e.target.value}});
  el('f_aout').onchange=e=>u({animOut:{type:e.target.value,dur:+el('f_aoutd').value}}); el('f_aoutd').onchange=e=>u({animOut:{type:el('f_aout').value,dur:+e.target.value}});
  // auto-parse: split text into words, distribute time evenly, assign rotating colors
  el('c_parse').onclick=()=>{
    const ws=String(o.text||'').trim().split(/\s+/).filter(Boolean); if(!ws.length) return;
    const s=o.start||0, e=o.end||s+3, step=(e-s)/ws.length;
    const COLS=['#FF5C72','#36C5F0','#F5D90A','#2BD9A8','#F5A524','#8577F0'];
    o.words=ws.map((t,i)=>({text:t,color:COLS[i%COLS.length],start:+(s+i*step).toFixed(3),end:+(s+(i+1)*step).toFixed(3)}));
    u({words:o.words}); renderInspector();
  };
  // add blank word
  el('c_addw').onclick=()=>{
    if(!o.words) o.words=[];
    const last=o.words[o.words.length-1];
    const ws=last?last.end:(o.start||0); o.words.push({text:'word',color:'#FF5C72',start:ws,end:ws+0.5});
    u({words:[...o.words]}); renderInspector();
  };
  // word table events (delegated)
  const tbody=el('cwtbody');
  if(tbody){
    tbody.addEventListener('change',e=>{
      const i=+e.target.dataset.i; if(isNaN(i)||!o.words||!o.words[i]) return;
      if(e.target.classList.contains('cw-text')) o.words[i].text=e.target.value;
      else if(e.target.classList.contains('cw-col')) o.words[i].color=e.target.value;
      else if(e.target.classList.contains('cw-s')) o.words[i].start=+e.target.value;
      else if(e.target.classList.contains('cw-e')) o.words[i].end=+e.target.value;
      u({words:[...o.words]});
    });
    tbody.addEventListener('click',e=>{
      if(!e.target.classList.contains('cw-del')) return;
      const i=+e.target.dataset.i; if(!isNaN(i)&&o.words){ o.words.splice(i,1); u({words:[...o.words]}); renderInspector(); }
    });
  }
  el('b_delo').onclick=()=>{commit('remove_object',{id:o.id}); select(null);};
}

function renderInspector(){ const box=el('inspector');
  if(selection.kind==='multi'){ box.innerHTML=`<div class="insp-title"><span class="tag">${selection.ids.length} selected</span></div><div class="field"><label>Animate in (all)</label><select id="m_in">${animOpts('none')}</select></div><div class="field"><label>Animate out (all)</label><select id="m_out">${animOpts('none')}</select></div><button class="btn del" id="m_del">Delete all</button>`;
    el('m_in').onchange=e=>{ for(const id of selection.ids) rpc('update_object',{id,patch:{animIn:{type:e.target.value,dur:0.5}}}); };
    el('m_out').onchange=e=>{ for(const id of selection.ids) rpc('update_object',{id,patch:{animOut:{type:e.target.value,dur:0.5}}}); };
    el('m_del').onclick=()=>{ for(const id of selection.ids) rpc('remove_object',{id}); select(null); }; return; }
  if(selection.kind==='clip'){ const c=findClipById(selection.id); if(!c){ box.innerHTML='<p class="muted small">—</p>'; return; } const r=c.rect||{x:0,y:0,w:PW,h:PH};
    box.innerHTML=`<div class="insp-title"><span class="tag">clip</span> ${c.name}</div>
      <div class="field row"><div><label>Source in</label><input id="f_sin" type="number" step="0.1" value="${c.sourceIn}"></div><div><label>Source out</label><input id="f_sout" type="number" step="0.1" value="${c.sourceOut}"></div></div>
      <div class="field"><label>Position (s)</label><input id="f_tin" type="number" step="0.1" value="${c.timelineIn}"></div>
      <div class="insp-sub">Canvas placement (drag/resize on the preview)</div>
      <div class="field row"><div><label>X</label><input id="c_x" type="number" value="${Math.round(r.x)}"></div><div><label>Y</label><input id="c_y" type="number" value="${Math.round(r.y)}"></div></div>
      <div class="field row"><div><label>W</label><input id="c_w" type="number" value="${Math.round(r.w)}"></div><div><label>H</label><input id="c_h" type="number" value="${Math.round(r.h)}"></div></div>
      <div class="field"><label>Opacity</label><input id="c_op" type="range" min="0" max="100" value="${Math.round((c.opacity!=null?c.opacity:1)*100)}"></div>
      <button class="btn ghost tiny" id="c_fit">Fit to frame</button>
      <div class="field"><label>Filter</label><select id="f_filt">${FILTERS.map(f=>`<option value="${f.id}" ${(c.filter||'none')===f.id?'selected':''}>${f.label}</option>`).join('')}</select></div>
      <div class="field row"><div><label>Transition in</label><select id="f_ti"><option ${!c.transIn||c.transIn.type==='none'?'selected':''} value="none">none</option><option ${c.transIn&&c.transIn.type==='fade'?'selected':''} value="fade">fade</option><option ${c.transIn&&c.transIn.type==='dipwhite'?'selected':''} value="dipwhite">dip white</option></select></div><div><label>Transition out</label><select id="f_to"><option ${!c.transOut||c.transOut.type==='none'?'selected':''} value="none">none</option><option ${c.transOut&&c.transOut.type==='fade'?'selected':''} value="fade">fade</option><option ${c.transOut&&c.transOut.type==='dipwhite'?'selected':''} value="dipwhite">dip white</option></select></div></div>
      <div class="small muted">Length ${(c.timelineOut-c.timelineIn).toFixed(2)}s</div>
      <button class="btn" id="b_split">✂ Split at playhead</button><button class="btn del" id="b_del">Delete clip</button>`;
    el('f_sin').onchange=e=>commit('trim_clip',{clipId:c.id,sourceIn:+e.target.value}); el('f_sout').onchange=e=>commit('trim_clip',{clipId:c.id,sourceOut:+e.target.value}); el('f_tin').onchange=e=>commit('move_clip',{clipId:c.id,at:+e.target.value}); el('f_filt').onchange=e=>commit('set_filter',{clipId:c.id,filter:e.target.value});
    const urc=(patch)=>commit('update_clip',{clipId:c.id,patch});
    el('c_x').onchange=e=>urc({rect:{x:+e.target.value}}); el('c_y').onchange=e=>urc({rect:{y:+e.target.value}}); el('c_w').onchange=e=>urc({rect:{w:+e.target.value}}); el('c_h').onchange=e=>urc({rect:{h:+e.target.value}});
    el('c_op').oninput=e=>{ c.opacity=+e.target.value/100; }; el('c_op').onchange=e=>urc({opacity:+e.target.value/100});
    el('c_fit').onclick=()=>urc({rect:{x:0,y:0,w:state.resolution.w,h:state.resolution.h}});
    el('f_ti').onchange=e=>commit('set_clip_transition',{clipId:c.id,which:'in',type:e.target.value,dur:0.6}); el('f_to').onchange=e=>commit('set_clip_transition',{clipId:c.id,which:'out',type:e.target.value,dur:0.6});
    el('b_split').onclick=splitSel; el('b_del').onclick=()=>{commit('remove_clip',{clipId:c.id}); select(null);}; return; }
  if(selection.kind==='object'){ const o=findObj(selection.id); if(!o){ box.innerHTML='<p class="muted small">—</p>'; return; }
    if(o.type==='caption'){ box.innerHTML=captionInspHtml(o); bindCaptionInspector(o); return; }
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
    const ic=o.type==='caption'?'💬':o.type==='text'?'🅣':o.type==='widget'?'🧩':'◆';
    row.innerHTML=`<span class="lic">${ic}</span><span class="lname">${objName(o)}</span><span class="lbtn" data-vis>${o.hidden?'🚫':'👁'}</span><span class="lbtn" data-lock>${o.locked?'🔒':'🔓'}</span><span class="lbtn" data-up>▲</span><span class="lbtn" data-down>▼</span><span class="lbtn" data-del>✕</span>`;
    row.onclick=(e)=>{ if(e.target.classList.contains('lbtn')) return; select('object',o.id); };
    row.querySelector('[data-vis]').onclick=()=>rpc('update_object',{id:o.id,patch:{hidden:!o.hidden}});
    row.querySelector('[data-lock]').onclick=()=>rpc('update_object',{id:o.id,patch:{locked:!o.locked}});
    row.querySelector('[data-up]').onclick=()=>rpc('reorder_object',{id:o.id,dir:'up'});
    row.querySelector('[data-down]').onclick=()=>rpc('reorder_object',{id:o.id,dir:'down'});
    row.querySelector('[data-del]').onclick=()=>{ rpc('remove_object',{id:o.id}); if(selection.id===o.id) select(null); };
    list.appendChild(row); } }

function splitSel(){ if(selection.kind!=='clip') return; rpc('split_clip',{clipId:selection.id,at:+playhead.toFixed(3)}).then(()=>setStatus('Split at '+fmt(playhead))).catch(e=>setStatus('⚠ '+e.message)); }
function duplicateSel(){ if(selection.kind==='clip'){ const c=findClipById(selection.id); if(c) rpc('add_clip',{mediaId:c.mediaId}); } else if(selection.kind==='object'){ const o=findObj(selection.id); if(o){ const tk=o.trackId||activeTrackId, len=Math.max(1,(o.end||0)-(o.start||0)), start=o.end||0, time={start,end:start+len}; if(o.type==='caption') rpc('add_object',Object.assign({},o,{trackId:tk,x:(o.x||0)+30,y:(o.y||0)+30},time)); else if(o.type==='text') rpc('add_object',Object.assign({type:'text',text:o.text,fontSize:o.fontSize,color:o.color,x:(o.x||0)+30,y:(o.y||0)+30,trackId:tk},time)); else if(o.type==='widget') rpc('add_widget',Object.assign({widget:o.widget,text:o.title,subtitle:o.subtitle,color:o.color,trackId:tk},time)); else rpc('add_object',Object.assign({type:'shape',shape:o.shape,color:o.color,x:(o.x||0)+30,y:(o.y||0)+30,w:o.w,h:o.h,trackId:tk},time)); } } }
function deleteSel(){ if(selection.kind==='clip'){ commit('remove_clip',{clipId:selection.id}); select(null); } else if(selection.kind==='object'){ commit('remove_object',{id:selection.id}); select(null); } else if(selection.kind==='multi'){ for(const id of selection.ids) rpc('remove_object',{id}); select(null); } }
function commit(method,params){ interacting=false; return rpc(method,params).catch(()=>{}); }

function setExportOverlay(job){
  const blocker=el('exportBlocker'); if(!blocker) return;
  if(!job){ blocker.classList.add('hidden'); exportJobId=null; return; }
  exportJobId=job.id;
  blocker.classList.remove('hidden');
  const pct=Math.round((job.progress||0)*100);
  el('exportProgress').style.width=pct+'%';
  const pctEl=el('exportPct'); if(pctEl) pctEl.textContent=pct+'%';
  el('exportDetail').textContent=job.detail||job.label||'Working…';
}
function startExport(){ pause(); setExportOverlay({id:'pending',progress:0,detail:'Preparing export'}); rpc('export',{}).then(r=>{ exportJobId=r.jobId; setStatus('Export started → '+r.out); }).catch(()=>setExportOverlay(null)); }
function cancelExport(){ if(exportJobId) rpc('cancel_job',{jobId:exportJobId}).catch(()=>{}); }
function saveProject(){ window.kx.saveProjectAs().then(path=>{ if(path) rpc('save_project',{path}).then(r=>setStatus('Project saved → '+r.path)).catch(()=>{}); }); }
function openProject(){ window.kx.pickProject().then(path=>{ if(path) rpc('load_project',{path}).then(()=>{ select(null); seekTo(0); setStatus('Project opened → '+path); }).catch(()=>{}); }); }

// ===================================================== ENGINE EVENTS
function applyState(s){ state=s; if(!state.resolution) state.resolution={w:1280,h:720};
  PW=state.resolution.w||1280; PH=state.resolution.h||720; recomputeWork();
  if(overlay.width!==workW) overlay.width=workW; if(overlay.height!==workH) overlay.height=workH;
  const trks=state.tracks||[]; if(!activeTrackId||!trks.some(t=>t.id===activeTrackId)) activeTrackId=(trks[trks.length-1]||{}).id||null;
  fitWorking(); syncResUI();
  renderTabs(); renderSection(); renderTimeline(); renderInspector(); renderLayers(); el('btnUndo').disabled=!s.canUndo; el('btnRedo').disabled=!s.canRedo; if(!playing) seekTo(playhead); }
window.kx.onState((s)=>{ if(interacting){ pendingState=s; return; } applyState(s); });
window.kx.onJob((j)=>{ jobs.set(j.id,j); if(activeSection==='media'&&['preview','thumbnail','sample','audio'].includes(j.type)&&j.status==='done') renderSection(); if(j.type==='export'&&(j.id===exportJobId||exportJobId==='pending')) setExportOverlay(j); if(j.status==='done'&&j.type==='export'){ setExportOverlay(null); setStatus('Export complete → '+(j.result&&j.result.out)); } if(j.status==='canceled'&&j.type==='export'){ setExportOverlay(null); setStatus('Export canceled.'); } if(j.status==='error'){ if(j.type==='export') setExportOverlay(null); setStatus('⚠ '+j.label+': '+j.error); } });
setInterval(()=>{ if(!interacting&&pendingState){ const s=pendingState; pendingState=null; applyState(s); } },80);

// ===================================================== PREVIEW ZOOM + PAN (Camtasia-style)
let previewZoom=1, previewPanX=0, previewPanY=0;
let previewMode='select'; // 'select' | 'pan'
let pvPanDrag=null;

function applyPreviewTransform(){
  const fr=el('frame'); if(!fr) return;
  fr.style.transformOrigin='center center';
  fr.style.transform=(previewZoom===1&&previewPanX===0&&previewPanY===0)
    ? '' : `translate(${previewPanX}px,${previewPanY}px) scale(${previewZoom})`;
  const lbl=el('pvZoomLabel');
  if(lbl) lbl.textContent=(previewZoom>0.99&&previewZoom<1.01)?'Fit':Math.round(previewZoom*100)+'%';
  const vp=el('viewport');
  if(vp) vp.style.cursor=previewMode==='pan'?(pvPanDrag?'grabbing':'grab'):(previewZoom>1?'move':'');
}

function zoomPreviewAt(cx,cy,newZ){
  const vp=el('viewport'); if(!vp) return;
  const vr=vp.getBoundingClientRect();
  const ox=cx-(vr.left+vr.width/2), oy=cy-(vr.top+vr.height/2);
  const ratio=newZ/previewZoom;
  previewPanX=ox-(ox-previewPanX)*ratio;
  previewPanY=oy-(oy-previewPanY)*ratio;
  previewZoom=newZ;
  applyPreviewTransform();
}

function resetPreviewZoom(){ previewZoom=1; previewPanX=0; previewPanY=0; applyPreviewTransform(); }

// Mode buttons
el('pvModeSelect').addEventListener('click',()=>{ previewMode='select'; el('pvModeSelect').classList.add('on'); el('pvModePan').classList.remove('on'); applyPreviewTransform(); });
el('pvModePan').addEventListener('click',()=>{ previewMode='pan'; el('pvModePan').classList.add('on'); el('pvModeSelect').classList.remove('on'); applyPreviewTransform(); });

// Zoom label: click = cycle zoom levels, double-click = reset to fit
const ZM_CYCLE=[1,1.5,2,3,0.5,0.25];
el('pvZoomLabel').addEventListener('click',()=>{ let i=ZM_CYCLE.findIndex(l=>Math.abs(l-previewZoom)<0.05); i=(i+1)%ZM_CYCLE.length; previewZoom=ZM_CYCLE[i]; previewPanX=0; previewPanY=0; applyPreviewTransform(); });
el('pvZoomLabel').addEventListener('dblclick',resetPreviewZoom);

// Ctrl+Scroll on viewport → zoom preview, centred on mouse cursor
el('viewport').addEventListener('wheel',e=>{ if(!e.ctrlKey) return; e.preventDefault(); zoomPreviewAt(e.clientX,e.clientY,Math.max(0.1,Math.min(4,previewZoom*(e.deltaY<0?1.12:1/1.12)))); },{passive:false});

// Pan drag — left-click in pan mode (capture phase so it fires before canvas overlay)
// OR middle-mouse button at any time
el('viewport').addEventListener('mousedown',e=>{
  if(previewMode!=='pan'&&e.button!==1) return;
  if(e.button!==0&&e.button!==1) return;
  e.preventDefault(); e.stopPropagation();
  pvPanDrag={sx:e.clientX-previewPanX,sy:e.clientY-previewPanY};
  applyPreviewTransform();
},true); // capture → fires before canvas overlay mousedown
window.addEventListener('mousemove',e=>{ if(!pvPanDrag) return; previewPanX=e.clientX-pvPanDrag.sx; previewPanY=e.clientY-pvPanDrag.sy; applyPreviewTransform(); });
window.addEventListener('mouseup',e=>{ if(!pvPanDrag) return; pvPanDrag=null; applyPreviewTransform(); });

// ===================================================== TOOLBAR + KEYS
el('btnSplit').onclick=splitSel; el('btnDup').onclick=duplicateSel; el('btnDel').onclick=deleteSel; el('btnUndo').onclick=()=>rpc('undo'); el('btnRedo').onclick=()=>rpc('redo'); el('btnOpenProject').onclick=openProject; el('btnSaveProject').onclick=saveProject; el('btnExport').onclick=startExport; el('btnCancelExport').onclick=cancelExport; el('btnPlay').onclick=togglePlay; el('btnStop').onclick=stop;
window.addEventListener('keydown',(e)=>{ const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement&&document.activeElement.tagName); if(typing) return;
  if(e.code==='Space'){ e.preventDefault(); togglePlay(); } else if(e.key==='s'||e.key==='S'){ splitSel(); } else if((e.ctrlKey||e.metaKey)&&e.key==='d'){ e.preventDefault(); duplicateSel(); } else if(e.key==='Delete'||e.key==='Backspace'){ deleteSel(); } else if((e.ctrlKey||e.metaKey)&&e.key==='z'){ rpc('undo'); } else if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&(e.key==='Z'||e.key==='z')))){ rpc('redo'); } });

// ===================================================== EXPORT OVERLAY RENDERER
// Main asks us to rasterise objects on a fixed fps grid so FFmpeg can composite
// the EXACT preview look onto the export. OffscreenCanvas is PW×PH (export size) —
// no crop margin, no video; only the objects, on full alpha. We draw with the very
// same drawObject/drawCaption used by the live preview, so what you see == what exports.
window.kx.onRenderOverlay(async ({ id, fps, total }, report) => {
  const FPS = fps || 30;
  const n = Math.max(1, Math.ceil(total * FPS));
  const savedOctx = octx, savedPH = playhead;
  const oc = new OffscreenCanvas(PW, PH);
  const offctx = oc.getContext('2d');
  const frames = [];
  const trks = state.tracks || [];
  const topId = (trks[trks.length - 1] || {}).id;
  let lastPct = -1;
  for (let i = 0; i < n; i++) {
    const t = +(i / FPS).toFixed(4);
    // Point the global draw context at the offscreen canvas (synchronous block — no
    // await until octx is restored, so the live rAF loop can never interleave).
    octx = offctx; playhead = t;
    offctx.clearRect(0, 0, PW, PH);
    for (const trk of trks) {
      for (const o of objsOfTrack(trk.id, trk.id === topId)) {
        if (objVisible(o)) drawObject(o);
      }
    }
    octx = savedOctx;
    const blob = await oc.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    frames.push(buf);   // structured-cloned over IPC (compact, no JSON bloat)
    // Stream progress back to the export job (throttled to whole-percent changes).
    if (report) { const pct = Math.floor((i + 1) / n * 100); if (pct !== lastPct) { report((i + 1) / n); lastPct = pct; } }
  }
  playhead = savedPH;
  return { fps: FPS, frames };
});

populateResProfiles();
el('zoom').value=pxToZoom(pxPerSec);
renderTabs();
rpc('get_state').then(s=>{ applyState(s); seekTo(0); setStatus('Ready. Pick a ratio up top · drag the preview to crop · layers stack in the timeline (top = front).'); });
