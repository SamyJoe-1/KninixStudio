'use strict';
const http   = require('http');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');

const info = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'Kninix-studio', 'kx-control.json'), 'utf8'));
function rpc(method, params) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ method, params: params || {} });
    const req = http.request(
      { host:'127.0.0.1', port:info.port, path:'/rpc', method:'POST',
        headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),'x-kx-token':info.token} },
      (r)=>{ let d=''; r.on('data',x=>d+=x); r.on('end',()=>{ const p=JSON.parse(d); p.ok?res(p.result):rej(new Error(p.error)); }); });
    req.on('error',rej); req.write(body); req.end();
  });
}
function uid(p){ return p+'_'+crypto.randomBytes(5).toString('hex'); }

const COLORS = ['#2BD9A8','#FF5C72','#36C5F0','#F5D90A','#8577F0','#F5A524'];
const OUT = 'C:/Users/pc/Desktop/vid';

// 12 captions × 2.5s = 30s. Each is within the 1–3s rule, none overlap.
const CAPTIONS = [
  ['so','today','i','want','to','show','you'],
  ['something','that','really','matters'],
  ['most','people','get','this','completely','wrong'],
  ['and','it','costs','them','everything'],
  ['but','the','fix','is','actually','simple'],
  ['you','just','need','to','start','small'],
  ['focus','on','one','thing','at','a','time'],
  ['stay','consistent','every','single','day'],
  ['the','results','will','surprise','you'],
  ['trust','the','process','and','keep','going'],
  ['because','growth','takes','real','patience'],
  ['so','start','right','now','not','later'],
];

async function main() {
  console.log('Importing test.mp4...');
  const media = await rpc('import_media', { path: 'C:/Users/pc/Desktop/vid/test.mp4' });
  console.log('Media:', media.id, media.width + 'x' + media.height);

  const CW=1080, CH=1920;
  const scale = Math.max(CW/media.width, CH/media.height);
  const clipRect = {
    x: Math.round((CW-media.width*scale)/2),
    y: Math.round((CH-media.height*scale)/2),
    w: Math.round(media.width*scale),
    h: Math.round(media.height*scale),
  };

  const videoTrackId = uid('trk');
  const capTrackId   = uid('trk');
  const DUR = 2.5;                 // each caption block (1–3s rule)
  let colorIdx = 0;
  const objects = [];

  CAPTIONS.forEach((words, ci) => {
    const bStart = +(ci*DUR).toFixed(3);
    const bEnd   = +(bStart+DUR).toFixed(3);
    const step   = DUR/words.length;
    const wordObjs = words.map((w,wi)=>({
      text:w, color:COLORS[colorIdx++%COLORS.length],
      start:+(bStart+wi*step).toFixed(3), end:+(bStart+(wi+1)*step).toFixed(3),
    }));
    objects.push({
      id:uid('obj'), type:'caption', trackId:capTrackId,
      opacity:1, rotation:0, hidden:false, locked:false,
      animIn:{ type:'bounce', dur:0.45 },   // bounce in
      animOut:{ type:'bounce', dur:0.45 },  // bounce out
      start:bStart, end:bEnd,
      text:words.join(' '),
      x:40, y:1440, w:1000, h:430,
      fontSize:88, color:'#FFFFFF', align:'center',
      strokeColor:'#000000', strokeWidth:7,
      shadowColor:'#000000', shadowAlpha:0.7, shadowBlur:10, shadowOffsetX:2, shadowOffsetY:3,
      bgShape:'none', highlightMode:'box', boxPadding:14, wordGlow:false,
      words:wordObjs,
    });
  });

  const knx = {
    app:'Kninix Studio', format:'kninix-project', version:1, savedAt:new Date().toISOString(),
    project:{
      name:'Short 30s — bounce captions', resolution:{w:CW,h:CH}, fps:30,
      media:{ [media.id]:{ id:media.id, path:media.path, name:media.name, duration:media.duration,
        width:media.width, height:media.height, fps:media.fps, hasVideo:media.hasVideo, hasAudio:media.hasAudio,
        isImage:false, kind:media.kind||'video', thumbnail:media.thumbnail||null } },
      tracks:[
        { id:videoTrackId, kind:'video', name:'Track 1', clips:[{
          id:uid('clp'), mediaId:media.id, name:media.name,
          timelineIn:0, timelineOut:30, sourceIn:0, sourceOut:30, rect:clipRect, opacity:1 }] },
        { id:capTrackId, kind:'text', name:'Captions', clips:[] },
      ],
      objects, markers:[], playhead:0,
    },
  };

  const outPath = path.join(OUT,'short_30s.knx').replace(/\//g,path.sep);
  fs.writeFileSync(outPath, JSON.stringify(knx,null,2),'utf8');
  console.log('Saved:', outPath, '| captions:', objects.length, '| each:', DUR+'s', '| anim: bounce in/out');
}
main().catch(e=>{ console.error('ERROR:',e.message); process.exit(1); });
