import fs from 'node:fs';

const id=process.env.REQUEST_ID;
if(!id||!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid request id');
const file='movies/request-'+id+'.json';
let record;
if(fs.existsSync(file)){
 record=JSON.parse(fs.readFileSync(file,'utf8'));
}else{
 const payload=JSON.parse(process.env.REQUEST_PAYLOAD_JSON||'{}');
 record={id:'request-'+id,title:typeof payload.title==='string'?payload.title.slice(0,140):'Unknown request'};
}
const status=process.env.PUBLISH_OUTCOME==='success'?'submitted':'failed';
const wasProcessed=['submitted','failed'].includes(record.status);
record.status=wasProcessed?record.status:status;
record.enabled=false;
if(record.status==='failed')record.failure_stage=process.env.STAGE_OUTCOME!=='success'?'request_validation':process.env.PUBLISH_OUTCOME!=='success'?'media_publishing':'unknown';
record.finished_at=record.finished_at||new Date().toISOString();
record.request_origin='koyeb_verified';
record.workflow_run_id=process.env.GITHUB_RUN_ID||null;
record.workflow_run_url=process.env.GITHUB_SERVER_URL&&process.env.GITHUB_REPOSITORY&&process.env.GITHUB_RUN_ID?
 process.env.GITHUB_SERVER_URL+'/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:null;
// History is public-repository safe: never commit phone numbers, JIDs,
// one-time credentials, private signed URLs or raw request payloads.
delete record.recipient_jids;
delete record.group_ids;
delete record.source_url;
delete record.token;
delete record.request_payload;
delete record.error;
delete record.job_id;
fs.mkdirSync('movies',{recursive:true});
fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
console.log('Saved sanitized request history',record.id,record.status);
