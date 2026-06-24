'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const uid=p=>p+'_'+crypto.randomBytes(5).toString('hex');

const media={id:uid('med'),path:'C:/Users/pc/Desktop/vid/test.mp4',name:'test.mp4',duration:4392.472,
  width:640,height:360,fps:29.97,hasVideo:true,hasAudio:true,isImage:false,kind:'video',thumbnail:null};

const SRC_IN=512, SRC_OUT=600, LEN=SRC_OUT-SRC_IN;   // 88s
const CW=1080, CH=1920;
const DUR=2.5;                                        // each caption block
const COLORS=['#2BD9A8','#FF5C72','#36C5F0','#F5D90A','#8577F0','#F5A524'];

const PHRASES=[
  ['so','here','is','the','real','truth'],
  ['most','people','never','figure','this','out'],
  ['and','that','is','exactly','the','problem'],
  ['you','have','to','stay','focused'],
  ['every','single','day','counts'],
  ['small','steps','build','big','results'],
  ['stop','waiting','for','the','perfect','moment'],
  ['just','start','where','you','are'],
  ['consistency','beats','raw','talent'],
  ['trust','the','process','completely'],
  ['the','hard','work','pays','off'],
  ['keep','pushing','through','the','doubt'],
  ['your','future','self','will','thank','you'],
  ['discipline','is','real','freedom'],
  ['never','give','up','on','the','vision'],
  ['growth','takes','time','and','patience'],
  ['so','start','right','now','today'],
  ['this','is','your','moment'],
];

const scale=Math.max(CW/media.width,CH/media.height);
const clipRect={x:Math.round((CW-media.width*scale)/2),y:Math.round((CH-media.height*scale)/2),
  w:Math.round(media.width*scale),h:Math.round(media.height*scale)};

const videoTrackId=uid('trk'), capTrackId=uid('trk');
const n=Math.floor(LEN/DUR);   // 35 caption blocks
let colorIdx=0;
const objects=[];
for(let i=0;i<n;i++){
  const words=PHRASES[i%PHRASES.length];
  const bStart=+(i*DUR).toFixed(3), bEnd=+(bStart+DUR).toFixed(3);
  const step=DUR/words.length;
  const wordObjs=words.map((w,wi)=>({text:w,color:COLORS[colorIdx++%COLORS.length],
    start:+(bStart+wi*step).toFixed(3),end:+(bStart+(wi+1)*step).toFixed(3)}));
  objects.push({id:uid('obj'),type:'caption',trackId:capTrackId,
    opacity:1,rotation:0,hidden:false,locked:false,
    animIn:{type:'bounce',dur:0.3},animOut:{type:'bounce',dur:0.3},
    start:bStart,end:bEnd,text:words.join(' '),
    x:40,y:1440,w:1000,h:430,fontSize:88,color:'#FFFFFF',align:'center',
    strokeColor:'#000000',strokeWidth:7,shadowColor:'#000000',shadowAlpha:0.7,
    shadowBlur:10,shadowOffsetX:2,shadowOffsetY:3,
    bgShape:'none',highlightMode:'box',boxPadding:14,wordGlow:false,words:wordObjs});
}

const knx={app:'Kninix Studio',format:'kninix-project',version:1,savedAt:new Date().toISOString(),
  project:{name:'Short 512-600s — bounce captions',resolution:{w:CW,h:CH},fps:30,
    media:{[media.id]:media},
    tracks:[
      {id:videoTrackId,kind:'video',name:'Track 1',clips:[{id:uid('clp'),mediaId:media.id,name:media.name,
        timelineIn:0,timelineOut:LEN,sourceIn:SRC_IN,sourceOut:SRC_OUT,rect:clipRect,opacity:1}]},
      {id:capTrackId,kind:'text',name:'Captions',clips:[]},
    ],
    objects,markers:[],playhead:0}};

const out='C:/Users/pc/Desktop/vid/short_512-600s.knx'.replace(/\//g,path.sep);
fs.writeFileSync(out,JSON.stringify(knx,null,2),'utf8');
console.log('Saved:',out,'| len:',LEN+'s','| captions:',objects.length,'| each:',DUR+'s | bounce in/out 0.3s');
