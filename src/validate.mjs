import fs from 'node:fs';
const dir='movies';
const files=fs.readdirSync(dir).filter(n=>n.endsWith('.json')).sort();
if(!files.length) throw Error('No movie JSON files found');
const ids=new Set();
for(const file of files){
  const j=JSON.parse(fs.readFileSync(dir+'/'+file,'utf8'));
  if(j.request_origin==='koyeb_verified'&&j.enabled===false){
    if(file!==j.id+'.json')throw Error('Invalid history filename');
    if(ids.has(j.id))throw Error('Duplicate job id');
    ids.add(j.id);
    continue;
  }
  if(file!==j.id+'.json') throw Error('Filename must match movie id: '+file);
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(j.id)) throw Error('Invalid job id');
  if(ids.has(j.id)) throw Error('Duplicate job id'); ids.add(j.id);
  if(typeof j.title!=='string'||!j.title.trim()) throw Error('Missing title');
  if(j.filename!==undefined && (typeof j.filename!=='string'||j.filename.length>180)) throw Error('Invalid filename');
  if(j.file_type!==undefined && !['mp4','mkv'].includes(j.file_type)) throw Error('Invalid file type');
  if(j.caption!==undefined && (typeof j.caption!=='string'||j.caption.length>2048)) throw Error('Invalid caption');
  if(j.enabled!==undefined && typeof j.enabled!=='boolean') throw Error('Invalid enabled flag');
  if(j.license_confirmed!==true) throw Error('Distribution rights confirmation required');
  const groups=j.group_ids??[];
  const people=j.recipient_jids??[];
  if(!Array.isArray(groups)||groups.some(x=>typeof x!=='string'||!/^\\d+(-\\d+)?@g\\.us$/.test(x))) throw Error('Invalid group ids');
  if(!Array.isArray(people)||people.some(x=>typeof x!=='string'||!/^\\d{7,15}@s\\.whatsapp\\.net$/.test(x))) throw Error('Invalid personal recipient JIDs');
  if(!groups.length&&!people.length) throw Error('At least one recipient is required');
  if(j.enabled!==false&&!j.license_confirmed) throw Error('Enabled media requires confirmed distribution rights');
  const url=new URL(j.source_url);
  if(url.protocol!=='https:') throw Error('Source URL must be HTTPS');
  if(j.thumbnail_url && new URL(j.thumbnail_url).protocol!=='https:') throw Error('Thumbnail URL must be HTTPS');
}
console.log(`Validated ${files.length} movie files`);
