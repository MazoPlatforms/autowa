export const DAILY_TOKEN_LIMIT=50;
export const TOKEN_SCALE=1000;
export const TOKEN_UNIT_BYTES=512*1024*1024;
export const DAILY_TOKEN_LIMIT_MILLI=DAILY_TOKEN_LIMIT*TOKEN_SCALE;

const ACTION_RATE=Object.freeze({stream:1,download:1,whatsapp:1.5,telegram:0.75});
const ACTION_FEE=Object.freeze({stream:0,download:0,whatsapp:1,telegram:1});

const RESERVE_SCRIPT="local used=tonumber(redis.call('GET',KEYS[1]) or '0'); local cost=tonumber(ARGV[1]); local cap=tonumber(ARGV[2]); if used+cost>cap then return -1 end; local next=redis.call('INCRBY',KEYS[1],cost); if next==cost then redis.call('EXPIREAT',KEYS[1],ARGV[3]) end; return next";
const REFUND_SCRIPT="local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local used=tonumber(raw); local refund=tonumber(ARGV[1]); if used<=refund then redis.call('DEL',KEYS[1]); return 0 end; return redis.call('INCRBY',KEYS[1],-refund)";

export function utcTokenWindow(now=Date.now()){
 const date=new Date(now),day=date.toISOString().slice(0,10);
 const resetAt=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1);
 return {day,resetAt,expireAt:Math.ceil(resetAt/1000)};
}

export function tokenUsageKey(accountHash,now=Date.now()){
 return 'filmgo:daily-tokens:v1:'+accountHash+':'+utcTokenWindow(now).day;
}

export function tokenCostMilli(bytes,action){
 const size=Number(bytes),rate=ACTION_RATE[action],fee=ACTION_FEE[action];
 if(!Number.isFinite(size)||size<=0||rate===undefined||fee===undefined)throw Error('Invalid token usage details');
 return Math.max(1,Math.ceil((size/TOKEN_UNIT_BYTES*rate+fee)*TOKEN_SCALE));
}

export function tokenAmount(milli){return Number((Math.max(0,Number(milli)||0)/TOKEN_SCALE).toFixed(2));}

export async function reserveDailyTokens(redis,accountHash,costMilli,{unlimited=false,now=Date.now()}={}){
 if(unlimited)return {allowed:true,unlimited:true,key:null,costMilli:0,usedMilli:0};
 if(!/^[a-f0-9]{64}$/.test(String(accountHash))||!Number.isSafeInteger(costMilli)||costMilli<0)throw Error('Invalid token reservation');
 const window=utcTokenWindow(now),key='filmgo:daily-tokens:v1:'+accountHash+':'+window.day;
 const result=Number(await redis('EVAL',RESERVE_SCRIPT,1,key,costMilli,DAILY_TOKEN_LIMIT_MILLI,window.expireAt));
 if(!Number.isFinite(result))throw Error('Token reservation failed');
 if(result<0)return {allowed:false,unlimited:false,key,costMilli,usedMilli:DAILY_TOKEN_LIMIT_MILLI};
 return {allowed:true,unlimited:false,key,costMilli,usedMilli:result,resetAt:window.resetAt};
}

export async function releaseDailyTokens(redis,reservation,amountMilli=reservation?.costMilli){
 if(!reservation?.key||!Number.isSafeInteger(amountMilli)||amountMilli<=0)return 0;
 return Number(await redis('EVAL',REFUND_SCRIPT,1,reservation.key,amountMilli))||0;
}

export async function dailyTokenUsage(redis,accountHash,now=Date.now()){
 const window=utcTokenWindow(now),key='filmgo:daily-tokens:v1:'+accountHash+':'+window.day;
 const usedMilli=Math.max(0,Number(await redis('GET',key)||0));
 return {usedMilli:Math.min(DAILY_TOKEN_LIMIT_MILLI,usedMilli),remainingMilli:Math.max(0,DAILY_TOKEN_LIMIT_MILLI-usedMilli),resetAt:window.resetAt};
}
