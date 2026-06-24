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
    const req  = http.request(
      { host:'127.0.0.1', port:info.port, path:'/rpc', method:'POST',
        headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),'x-kx-token':info.token} },
      (r) => { let d=''; r.on('data',x=>d+=x); r.on('end',()=>{ const p=JSON.parse(d); p.ok?res(p.result):rej(new Error(p.error)); }); });
    req.on('error',rej); req.write(body); req.end();
  });
}

function uid(prefix){ return prefix+'_'+crypto.randomBytes(5).toString('hex'); }

const COLORS = ['#2BD9A8','#FF5C72','#36C5F0','#F5D90A','#8577F0','#F5A524'];
const OUT    = 'C:/Users/pc/Desktop/vid';

const SEGMENTS = [
  {
    name: 'Segment 1 — 0-30s', sourceIn: 0, sourceOut: 30, file: 'segment_1_0-30s.knx',
    captions: [
      { words: ['so','today','we','are','talking','about','something'] },
      { words: ['that','will','completely','change','the','game'] },
      { words: ['because','most','people','are','making','the','same','mistake'] },
      { words: ['and','that','is','going','to','be','able','to','view','it'] },
      { words: ['but','once','you','understand','this','principle'] },
      { words: ['everything','shifts','and','your','growth','explodes'] },
    ],
  },
  {
    name: 'Segment 2 — 30-60s', sourceIn: 30, sourceOut: 60, file: 'segment_2_30-60s.knx',
    captions: [
      { words: ['the','biggest','problem','nobody','ever','talks','about'] },
      { words: ['how','to','actually','build','something','that','lasts'] },
      { words: ['stop','chasing','shortcuts','every','single','day'] },
      { words: ['focus','on','fundamentals','and','watch','things','grow'] },
      { words: ['consistency','beats','talent','when','talent','is','lazy'] },
      { words: ['trust','the','process','and','keep','showing','up'] },
    ],
  },
  {
    name: 'Segment 3 — 1m to 1m30s', sourceIn: 60, sourceOut: 90, file: 'segment_3_60-90s.knx',
    captions: [
      { words: ['here','is','the','one','thing','that','changes','everything'] },
      { words: ['your','mindset','is','the','only','thing','holding','you','back'] },
      { words: ['once','you','fix','that','the','results','come','naturally'] },
      { words: ['stop','overthinking','and','just','start','taking','action'] },
      { words: ['small','daily','steps','lead','to','massive','results'] },
      { words: ['start','today','not','tomorrow','not','next','week'] },
    ],
  },
];

async function main() {
  // Import the target video to get its full media record
  console.log('Importing test.mp4...');
  const media = await rpc('import_media', { path: 'C:/Users/pc/Desktop/vid/test.mp4' });
  console.log('Media ID:', media.id, '|', media.width + 'x' + media.height, '|', media.duration + 's');

  // Scale video to fill 1280x720 canvas (cover)
  const CW = 1280, CH = 720;
  const scale = Math.max(CW / media.width, CH / media.height);
  const clipRect = {
    x: Math.round((CW - media.width  * scale) / 2),
    y: Math.round((CH - media.height * scale) / 2),
    w: Math.round(media.width  * scale),
    h: Math.round(media.height * scale),
  };

  let colorIdx = 0;

  for (const seg of SEGMENTS) {
    const videoTrackId = uid('trk');
    const capTrackId   = uid('trk');

    // Caption objects — all on the caption track, sequential 5s blocks, no overlap
    const objects = [];
    seg.captions.forEach((cap, ci) => {
      const bStart = ci * 5;
      const bEnd   = bStart + 5;
      const step   = 5 / cap.words.length;
      const wordObjs = cap.words.map((w, wi) => ({
        text:  w,
        color: COLORS[colorIdx++ % COLORS.length],
        start: +(bStart + wi * step).toFixed(3),
        end:   +(bStart + (wi + 1) * step).toFixed(3),
      }));
      objects.push({
        id:            uid('obj'),
        type:          'caption',
        trackId:       capTrackId,
        opacity:       1,
        rotation:      0,
        hidden:        false,
        locked:        false,
        animIn:        { type: 'none', dur: 0.5 },
        animOut:       { type: 'none', dur: 0.5 },
        start:         bStart,
        end:           bEnd,
        text:          cap.words.join(' '),
        x:             40,  y: 560,  w: 1200,  h: 160,
        fontSize:      76,
        color:         '#FFFFFF',
        align:         'center',
        strokeColor:   '#000000',
        strokeWidth:   7,
        shadowColor:   '#000000',
        shadowAlpha:   0.7,
        shadowBlur:    10,
        shadowOffsetX: 2,
        shadowOffsetY: 3,
        bgShape:       'none',
        highlightMode: 'box',
        boxPadding:    14,
        wordGlow:      false,
        words:         wordObjs,
      });
    });

    const knx = {
      app:     'Kninix Studio',
      format:  'kninix-project',
      version: 1,
      savedAt: new Date().toISOString(),
      project: {
        name:       seg.name,
        resolution: { w: CW, h: CH },
        fps:        30,
        media: {
          [media.id]: {
            id:        media.id,
            path:      media.path,
            name:      media.name,
            duration:  media.duration,
            width:     media.width,
            height:    media.height,
            fps:       media.fps,
            hasVideo:  media.hasVideo,
            hasAudio:  media.hasAudio,
            isImage:   false,
            kind:      media.kind || 'video',
            thumbnail: media.thumbnail || null,
          },
        },
        tracks: [
          {
            id:    videoTrackId,
            kind:  'video',
            name:  'Track 1',
            clips: [{
              id:          uid('clp'),
              mediaId:     media.id,
              name:        media.name,
              timelineIn:  0,
              timelineOut: 30,
              sourceIn:    seg.sourceIn,
              sourceOut:   seg.sourceOut,
              rect:        clipRect,
              opacity:     1,
            }],
          },
          {
            id:    capTrackId,
            kind:  'text',
            name:  'Captions',
            clips: [],
          },
        ],
        objects,
        markers:  [],
        playhead: 0,
      },
    };

    const outPath = path.join(OUT, seg.file).replace(/\//g, path.sep);
    fs.writeFileSync(outPath, JSON.stringify(knx, null, 2), 'utf8');
    console.log('Saved:', outPath, '| captions:', objects.length, '| source:', seg.sourceIn + '-' + seg.sourceOut + 's');
  }

  console.log('\nAll 3 projects ready. Open each .knx file in Kninix and hit Export.');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
