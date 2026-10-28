import fs from 'node:fs';
const dir='movies';
const files=fs.readdirSync(dir).filter(n=>n.endsWith('.json')).sort();
if(!files.length) throw Error('No movie JSON files found');
const ids=new Set();
for(const file of files){
  const j=JSON.parse(fs.readFileSync(dir+'/'+file,'utf8'));
  if(file!==j.id+'.json') throw Error('Filename must match movie id: '+file);
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(j.id)) throw Error('Invalid job id');
  if(ids.has(j.id)) throw Error('Duplicate job id'); ids.add(j.id);
  if(typeof j.title!=='string'||!j.title.trim()) throw Error('Missing title');
  if(typeof j.filename!=='string'||!/^[^/\\\x00-\x1f]{1,180}\.(mp4|mkv)$/i.test(j.filename)) throw Error('Invalid filename');
  if(!['mp4','mkv'].includes(j.file_type)) throw Error('Invalid file type');
  if(!j.filename.toLowerCase().endsWith('.'+j.file_type)) throw Error('Filename extension mismatch');
  if(typeof j.caption!=='string'||j.caption.length>2048) throw Error('Invalid caption');
  if(typeof j.enabled!=='boolean'||typeof j.license_confirmed!=='boolean') throw Error('Invalid flags');
  if(!Array.isArray(j.group_ids)||!j.group_ids.length||j.group_ids.some(x=>typeof x!=='string'||!x.endsWith('@g.us'))) throw Error('Invalid group ids');
  if(j.enabled&&!j.license_confirmed) throw Error('Enabled media requires confirmed distribution rights');
  const url=new URL(j.source_url);
  if(url.protocol!=='https:') throw Error('Source URL must be HTTPS');
  if(j.thumbnail_url && new URL(j.thumbnail_url).protocol!=='https:') throw Error('Thumbnail URL must be HTTPS');
}
console.log(`Validated ${files.length} movie files`);
