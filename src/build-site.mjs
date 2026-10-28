import fs from 'node:fs';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const movies = fs.readdirSync('movies').filter(n=>n.endsWith('.json')).sort().map(n=>JSON.parse(fs.readFileSync('movies/'+n,'utf8')));
const groups=fs.existsSync('site/groups.json')?JSON.parse(fs.readFileSync('site/groups.json','utf8')).groups:[];
const counts={total:movies.length,done:movies.filter(x=>x.status==='submitted').length,active:movies.filter(x=>x.status==='processing').length};
const rows=movies.map(m=>'<tr><td><strong>'+esc(m.title)+'</strong><span class="muted sub">'+esc(m.id)+'</span></td><td><code>'+esc(m.job_id||'Not assigned')+'</code></td><td><span class="status '+(m.status==='submitted'?'good':m.status==='failed'?'bad':m.status==='processing'?'busy':'idle')+'">'+esc(m.status||(m.enabled?'Pending':'Disabled'))+'</span></td><td>'+esc(m.started_at?new Date(m.started_at).toLocaleString('en-GB',{timeZone:'UTC'}):'—')+'</td></tr>').join('');
const html=String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="description" content="AutoWA community media submission and processing dashboard">
<title>AutoWA — Community Publisher</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;650;700;750;800&display=swap" rel="stylesheet">
<style>
:root{font-family:Inter,system-ui,sans-serif;color:#eef0f8;background:#090b13;font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse 65% 35% at 50% -10%,#24204b 0%,transparent 80%),#090b13}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}button{cursor:pointer}.shell{max-width:1140px;margin:auto;padding:0 24px}.nav{height:78px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #242634}.brand{font-weight:800;letter-spacing:-.06em;font-size:24px}.brand i{font-style:normal;color:#a78bfa}.navright{display:flex;gap:20px;align-items:center}.navright a{color:#b6b9c9;font-size:13px}.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid #39344e;background:#1b1729;border-radius:99px;padding:7px 12px;color:#c4b5fd;font-size:12px;font-weight:600}.dot{width:7px;height:7px;border-radius:50%;background:#a78bfa}.hero{padding:80px 0 38px;max-width:800px}.hero h1{font-size:clamp(36px,5.5vw,66px);letter-spacing:-.065em;line-height:1.08;margin:22px 0;font-weight:800}.gradient{background:linear-gradient(110deg,#e4dcff,#a78bfa 60%,#8ad4fb);color:transparent;background-clip:text}.hero p{font-size:16px;color:#a4a8bd;line-height:1.8;max-width:630px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.btn{background:#a78bfa;color:#100b20;border:1px solid #a78bfa;padding:12px 18px;border-radius:11px;font-weight:700;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:8px}.btn.secondary{background:#191b29;border-color:#33364a;color:#e8e8f4}.btn:hover{filter:brightness(1.12)}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:24px 0 50px}.stat,.panel{background:linear-gradient(145deg,#171925,#11131d);border:1px solid #292c3b;border-radius:17px}.stat{padding:24px}.stat small{color:#9298ae;font-size:12px}.stat strong{display:block;font-size:32px;letter-spacing:-.04em;margin-top:8px}.sectionhead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:35px 0 17px}.sectionhead h2{font-size:22px;letter-spacing:-.035em;margin:0}.sectionhead p,.muted{color:#9298ae}.sectionhead p{font-size:13px;margin:6px 0 0}.panel{padding:24px;margin-bottom:25px}.tablewrap{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:660px}th{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#9298ae;font-weight:650}td,th{padding:17px 12px;border-bottom:1px solid #272a37}tbody tr:last-child td{border:0}td{font-size:13px;color:#c7cbd9}td strong{color:#f3f3fa;font-weight:600}.sub{display:block;font-size:11px;margin-top:5px}code{font-size:11px;color:#c6b8ff}.status{border-radius:100px;padding:6px 10px;font-size:11px;font-weight:650;text-transform:capitalize;background:#292b38;color:#aeb3c4}.status.good{background:#12382e;color:#7ee1b0}.status.bad{background:#3d2027;color:#fda5b4}.status.busy{background:#3a321e;color:#f5d48b}.empty{padding:35px 8px;text-align:center;color:#9298ae}.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:17px}.field{display:flex;flex-direction:column;gap:8px}.field.full{grid-column:1/-1}label{font-size:12px;font-weight:600;color:#d5d7e3}.hint{color:#9298ae;font-size:11px;line-height:1.6}input,textarea,select{width:100%;border:1px solid #35384a;background:#0d101a;color:#f1f2fa;border-radius:10px;padding:12px 13px;outline:none;font-size:13px}input:focus,textarea:focus,select:focus{border-color:#a78bfa;box-shadow:0 0 0 3px #a78bfa1c}textarea{min-height:90px;resize:vertical}.check{display:flex;gap:10px;align-items:flex-start;font-size:12px;color:#c4c7d4;line-height:1.6}.check input{width:16px;margin:3px 0}.formactions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.note{font-size:12px;color:#9298ae;line-height:1.8}.guide{display:grid;grid-template-columns:1fr 1fr;gap:16px}.guidecard{border:1px solid #303345;border-radius:13px;padding:20px;background:#121520}.guidecard h3{font-size:14px;margin:0 0 10px}.guidecard p{font-size:12px;line-height:1.8;color:#9ea3b7;margin:0}.guidecard code{word-break:break-all}.footer{border-top:1px solid #272a37;margin-top:70px;padding:28px 0 40px;color:#777d93;font-size:12px;display:flex;justify-content:space-between;gap:12px}.toast{margin-top:12px;font-size:12px;color:#9de6c1;min-height:18px}@media(max-width:700px){.navright a.hide{display:none}.hero{padding-top:55px}.stats{grid-template-columns:repeat(3,1fr);gap:8px}.stat{padding:16px}.stat strong{font-size:25px}.panel{padding:17px}.formgrid,.guide{grid-template-columns:1fr}.field.full{grid-column:auto}.footer{flex-direction:column}}
</style></head><body><div class="shell"><header class="nav"><a class="brand" href="#">auto<i>wa.</i></a><div class="navright"><a class="hide" href="#jobs">Jobs</a><a class="hide" href="#group-help">Group JID help</a><a class="btn secondary" href="https://github.com/MazoPlatforms/autowa" target="_blank" rel="noopener">GitHub ↗</a></div></header>
<main><section class="hero"><span class="pill"><span class="dot"></span>Community-powered automation</span><h1>Media publishing,<br><span class="gradient">made effortless.</span></h1><p>Submit authorized media using a simple form, download a ready-to-commit JSON file, and follow processing activity in one clean dashboard.</p><div class="actions"><a href="#create" class="btn">Create movie JSON ↗</a><a href="#jobs" class="btn secondary">View processing jobs</a></div></section>
<div class="stats"><div class="stat"><small>Total entries</small><strong>\${COUNTS_TOTAL}</strong></div><div class="stat"><small>Submitted</small><strong>\${COUNTS_DONE}</strong></div><div class="stat"><small>Processing</small><strong>\${COUNTS_ACTIVE}</strong></div></div>
<section id="jobs"><div class="sectionhead"><div><h2>Processing activity</h2><p>Public metadata only. A submitted message is not proof of delivery.</p></div></div><div class="panel tablewrap"><table><thead><tr><th>Movie</th><th>Job ID</th><th>Status</th><th>Started · UTC</th></tr></thead><tbody>\${ROWS}</tbody></table>\${EMPTY}</div></section>
<section id="create"><div class="sectionhead"><div><h2>Create a movie entry</h2><p>Enter a movie name and URL, then choose groups or personal recipients. Media format and caption are generated automatically after download.</p></div></div><div class="panel"><form id="movie-form" class="formgrid">
<div class="field"><label for="title">Movie title *</label><input id="title" required placeholder="My Licensed Film (2026)"></div>
<div class="field full"><label for="url">Direct HTTPS download URL *</label><input id="url" required type="url" pattern="https://.*" placeholder="https://example.com/film.mp4"></div>
<div class="field full"><label for="groups">Select WhatsApp groups *</label><div id="group-picker" style="display:grid;gap:10px;border:1px solid #35384a;padding:15px;border-radius:10px;background:#0d101a">Loading groups…</div><span class="hint">Only groups where the bot is an admin are listed. Make 94771227821 an admin in your WhatsApp group to list it here. Internal delivery groups are hidden.</span></div>
<div class="field full"><label>Personal WhatsApp recipients (optional)</label><span class="hint">Only send to people who explicitly agreed to receive this media. Personal phone numbers will be included in the generated JSON; do not commit them to a public repository.</span></div>
<div class="field full"><label class="check"><input type="checkbox" id="send-personally"> Send personally to WhatsApp number(s)</label></div>
<div class="field full" id="personal-fields" hidden style="grid-column:1/-1">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
    <div class="field"><label for="country-search">Country / region</label>
      <input id="country-search" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="country-options" autocomplete="off" placeholder="Search country or calling code…" value="🇱🇰 Sri Lanka (+94)">
      <div id="country-options" role="listbox" hidden style="max-height:230px;overflow-y:auto;background:#151927;border:1px solid #44495b;border-radius:12px;margin-top:6px;padding:5px"></div>
      <span class="hint" id="country-status">Sri Lanka (+94)</span>
    </div>
    <div class="field"><label for="phone">WhatsApp phone number(s)</label><textarea id="phone" rows="3" inputmode="tel" placeholder="077 123 4567" autocomplete="off"></textarea><span class="hint">One number per line; local or +international format.</span></div>
  </div>
</div>
<div class="field full"><div class="formactions"><button class="btn" type="submit">Download movie JSON ↓</button><button class="btn secondary" type="button" id="copy">Copy JSON</button><a class="btn secondary" href="https://github.com/MazoPlatforms/autowa/new/main/movies" target="_blank" rel="noopener">Add file on GitHub ↗</a></div><div class="toast" id="message" role="status"></div><p class="note">This site is static: downloading or copying JSON does not submit it to GitHub. Upload the file through a reviewed pull request or an authorized commit. The server assigns <code>job_id</code> when processing begins.</p></div>
</form></div></section>
<section id="group-help"><div class="sectionhead"><div><h2>Find your WhatsApp group JID</h2><p>A group name and a group JID are different values.</p></div></div><div class="guide"><div class="guidecard"><h3>01 · Identify the group</h3><p>Use a WhatsApp account that is already a member of the group. Group JIDs typically look like <code>120363012345678901@g.us</code>. They cannot be reliably derived from a group invite link or its visible name.</p></div><div class="guidecard"><h3>02 · Retrieve it privately</h3><p>Run the repository's local <code>npm run groups</code> command on a trusted computer with an existing Baileys auth directory. It lists each joined group's <b>name</b> and <b>JID</b>. Never upload session files or authentication credentials to GitHub Pages.</p></div></div><p class="note">Group membership and JIDs are sensitive. The public website lists the groups synchronized during the latest Pages build; it does not connect to WhatsApp directly.</p></section>
</main><footer class="footer"><span>© AutoWA · Community media automation</span><span>Open-source workflow · Licensed media only</span></footer></div>
<script>
const form=document.getElementById('movie-form'),msg=document.getElementById('message');
function makeMovie(){
if(!form.reportValidity())return null;
const title=document.getElementById('title').value.trim();
const id=title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);
if(!id){msg.textContent='Enter a movie title with Latin letters or numbers.';return null;}
const groups=[...document.querySelectorAll('#group-picker input:checked')].map(x=>x.value).filter(x=>!['120363024245545077@g.us','120363328126166173@g.us'].includes(x));
if(groups.some(x=>!/^\d+(-\d+)?@g\.us$/.test(x))){msg.textContent='Invalid group selection.';return null;}
const personalEnabled=document.getElementById('send-personally').checked;
const code=selectedCountry?.dial||'';
const lines=personalEnabled?document.getElementById('phone').value.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean):[];
if(personalEnabled&&!lines.length){msg.textContent='Enter at least one personal phone number.';return null;}
if(lines.length&&(!selectedCountry||!/^\d{1,5}$/.test(code))){msg.textContent='Enter a valid country calling code.';return null;}
const recipient_jids=[];
for(const line of lines){
 let digits=line.replace(/[^0-9+]/g,'');
 if(digits.startsWith('+'))digits=digits.slice(1);
 else if(digits.startsWith('00'))digits=digits.slice(2);
 else {digits=digits.replace(/^0+/,'');if(!digits.startsWith(code))digits=code+digits;}
 if(!/^\d{7,15}$/.test(digits)){msg.textContent='Invalid phone number: '+line;return null;}
 recipient_jids.push(digits+'@s.whatsapp.net');
}
if(!groups.length&&!recipient_jids.length){msg.textContent='Select a group or enter a personal recipient.';return null;}
return {recipient_jids:[...new Set(recipient_jids)],id,title,source_url:document.getElementById('url').value.trim(),group_ids:groups,license_confirmed:true,enabled:true};
}
fetch('./groups.json').then(r=>{if(!r.ok)throw Error('Group catalog unavailable');return r.json()}).then(data=>{
 const root=document.getElementById('group-picker');root.textContent='';
 if(!Array.isArray(data.groups)||!data.groups.length){root.textContent='No eligible groups found. Make 94771227821 an admin in your WhatsApp group to list it here.';return;}
 for(const g of data.groups){
  if(!g.is_bot_admin||['120363024245545077@g.us','120363328126166173@g.us'].includes(g.jid))continue;
  const label=document.createElement('label');label.className='check';
  const input=document.createElement('input');input.type='checkbox';input.value=g.jid;
  const span=document.createElement('span');span.textContent=g.name;
  label.append(input,span);root.append(label);
 }
}).catch(()=>{document.getElementById('group-picker').textContent='Group list unavailable. Try again later.';});
const personalToggle=document.getElementById('send-personally');
const personalFields=document.getElementById('personal-fields');
const countrySearch=document.getElementById('country-search');
const countryOptions=document.getElementById('country-options');
const countryStatus=document.getElementById('country-status');
let selectedCountry={iso:'LK',name:'Sri Lanka',dial:'94'},countryList=[];
const flagFor=iso=>iso.replace(/./g,c=>String.fromCodePoint(c.charCodeAt(0)+127397));
const countryLabel=c=>flagFor(c.iso)+' '+c.name+' (+'+c.dial+')';
personalToggle.addEventListener('change',()=>{personalFields.hidden=!personalToggle.checked;countrySearch.setAttribute('aria-expanded','false');countryOptions.hidden=true;});
function showCountries(){
 const term=countrySearch.value.toLowerCase().trim();
 const matches=countryList.filter(c=>c.name.toLowerCase().includes(term)||c.iso.toLowerCase().includes(term)||('+'+c.dial).includes(term)).slice(0,75);
 countryOptions.replaceChildren();
 for(const c of matches){
  const item=document.createElement('button');item.type='button';item.setAttribute('role','option');
  item.textContent=countryLabel(c);item.style.cssText='display:block;width:100%;text-align:left;padding:10px 12px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer';
  item.addEventListener('click',()=>{selectedCountry=c;countrySearch.value=countryLabel(c);countryStatus.textContent=c.name+' (+'+c.dial+')';countryOptions.hidden=true;countrySearch.setAttribute('aria-expanded','false');});
  countryOptions.append(item);
 }
 if(!matches.length){countryOptions.textContent='No matching countries';}
 countryOptions.hidden=false;countrySearch.setAttribute('aria-expanded','true');
}
countrySearch.addEventListener('focus',()=>{countrySearch.value='';showCountries();});
countrySearch.addEventListener('input',()=>{selectedCountry=null;showCountries();});
countrySearch.addEventListener('keydown',e=>{if(e.key==='Escape'){countryOptions.hidden=true;countrySearch.setAttribute('aria-expanded','false');}});
countrySearch.addEventListener('blur',()=>{setTimeout(()=>{countryOptions.hidden=true;countrySearch.setAttribute('aria-expanded','false');if(selectedCountry)countrySearch.value=countryLabel(selectedCountry);},160);});
fetch('./countries.json').then(r=>{if(!r.ok)throw Error('Country list unavailable');return r.json()}).then(data=>{countryList=data.countries||[];selectedCountry=countryList.find(c=>c.iso==='LK')||selectedCountry;countrySearch.value=countryLabel(selectedCountry);}).catch(()=>{countryStatus.textContent='Country list unavailable';countrySearch.disabled=true;});

form.addEventListener('submit',e=>{e.preventDefault();const data=makeMovie();if(!data)return;const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=data.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);msg.textContent='JSON downloaded. Add it to movies/ through a reviewed GitHub contribution.';});
document.getElementById('copy').addEventListener('click',async()=>{const data=makeMovie();if(!data)return;try{await navigator.clipboard.writeText(JSON.stringify(data,null,2)+'\n');msg.textContent='JSON copied to clipboard.';}catch{msg.textContent='Clipboard unavailable; use Download movie JSON.';}});
</script></body></html>`;
fs.mkdirSync('site',{recursive:true});
if(!fs.existsSync('site/groups.json'))fs.writeFileSync('site/groups.json',JSON.stringify({groups:[],updated_at:null},null,2));
fs.writeFileSync('site/index.html',html.replaceAll(String.fromCharCode(92)+'${','${').replace('${COUNTS_TOTAL}',String(counts.total)).replace('\${COUNTS_DONE}',String(counts.done)).replace('\${COUNTS_ACTIVE}',String(counts.active)).replace('\${ROWS}',rows).replace('\${EMPTY}',movies.length?'':'<p class="empty">No movie entries yet.</p>'));
console.log('Generated premium dashboard for '+movies.length+' movies');
