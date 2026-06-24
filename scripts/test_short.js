'use strict';
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const info = JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'Kninix-studio','kx-control.json'),'utf8'));
function rpc(m,p){ return new Promise((res,rej)=>{ const b=JSON.stringify({method:m,params:p||{}}); const r=http.request({host:'127.0.0.1',port:info.port,path:'/rpc',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(b),'x-kx-token':info.token}},(x)=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>{const j=JSON.parse(d);j.ok?res(j.result):rej(new Error(j.error));});}); r.on('error',rej); r.write(b); r.end(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  await rpc('load_project',{path:'C:/Users/pc/Desktop/vid/short_30s.knx'});
  const st=await rpc('get_state');
  console.log('Loaded. res:',JSON.stringify(st.resolution),'objects:',(st.objects||[]).length);
  const {jobId,out}=await rpc('export',{name:'TEST_short30'});
  console.log('Export ->',out);
  let last=-1;
  for(let i=0;i<600;i++){ await sleep(1000); const jobs=await rpc('list_jobs'); const j=jobs.find(x=>x.id===jobId); if(!j)break; const pct=Math.round((j.progress||0)*100); if(pct!==last){console.log(`  [${j.status}] ${pct}%`);last=pct;} if(j.status==='done'||j.status==='completed'){console.log('DONE',out);return;} if(/error|failed|cancel/.test(j.status)){console.error('FAILED:',j.error);process.exit(1);} }
  console.error('timeout'); process.exit(1);
}
main().catch(e=>{console.error('ERROR:',e.message);process.exit(1);});
