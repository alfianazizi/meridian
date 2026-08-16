import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { repoPath } from './repo-root.js';

export const MODEL_TELEMETRY_FILE=repoPath('logs','model-screening.jsonl');
export const SHADOW_PROFILES=Object.freeze([
 Object.freeze({provider:'9router',model:'cx/gpt-5.6-luna',reasoningEffort:'high'}),
 Object.freeze({provider:'9router',model:'ocg/deepseek-v4-flash',reasoningEffort:'none'}),
]);
const DECISIONS=new Set(['deploy','no_deploy']);
const REC_KEYS=new Set(['decision','pool','confidence','reasons','risks']);
const TELEMETRY_KEYS=['cycle_id','ts','finished_at','provider','model','authoritative','duration_ms','status','decision','selected_pool','confidence','candidate_count','error_class','agreement'];

function cleanText(value,max=180){return String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function cleanList(value){return Array.isArray(value)?value.map(x=>cleanText(x,180)).filter(Boolean).slice(0,8):[]}
export function validateShadowRecommendation(value,allowedPools=null){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('recommendation must be an object');
 for(const key of Object.keys(value))if(!REC_KEYS.has(key))throw new Error(`unknown recommendation field: ${key}`);
 if(!DECISIONS.has(value.decision))throw new Error('invalid decision');
 if(typeof value.confidence!=='number'||!Number.isFinite(value.confidence)||value.confidence<0||value.confidence>1)throw new Error('invalid confidence');
 const pool=value.pool==null?null:cleanText(value.pool,120);
 if(value.decision==='deploy'&&!pool)throw new Error('deploy recommendation requires pool');
 if(value.decision==='no_deploy'&&pool!==null)throw new Error('no_deploy recommendation cannot select pool');
 if(pool&&allowedPools&&!allowedPools.has(pool))throw new Error('selected pool is not in candidate packet');
 if(!Array.isArray(value.reasons)||!Array.isArray(value.risks))throw new Error('reasons and risks must be arrays');
 return Object.freeze({decision:value.decision,pool,confidence:value.confidence,reasons:cleanList(value.reasons),risks:cleanList(value.risks)});
}

export function buildShadowRequest(profile,packet){
 const schema='Return one JSON object only with exactly these fields: decision ("deploy" or "no_deploy"), pool (candidate pool address or null), confidence (0 to 1), reasons (short string array), risks (short string array). A deploy pool must be present in the candidate packet. This is hypothetical analysis only. You have no tools and cannot execute transactions.';
 return {model:profile.model,messages:[{role:'system',content:`You are a read-only shadow evaluator for a Solana DLMM screening experiment. ${schema}`},{role:'user',content:`Cycle ${cleanText(packet.cycle_id,80)}. Candidate count: ${Number(packet.candidate_count)||0}.\n\n${String(packet.candidates??'').slice(0,50000)}\n\n${schema}`}],response_format:{type:'json_object'},reasoning_effort:profile.reasoningEffort,temperature:0,max_tokens:768,stream:false};
}

function telemetryRow(input){const row={};for(const key of TELEMETRY_KEYS){if(Object.hasOwn(input,key))row[key]=input[key]};return row}
export function appendModelTelemetry(input,file=MODEL_TELEMETRY_FILE){
 const row=telemetryRow(input);fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,`${JSON.stringify(row)}\n`,{encoding:'utf8',mode:0o600});return row;
}
function parseContent(response){const content=response?.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw new Error('empty shadow response');return JSON.parse(content)}
function errorClass(error){return cleanText(error?.name||error?.constructor?.name||'Error',60).replace(/[^A-Za-z0-9_.-]/g,'')||'Error'}

export async function runShadowModel({profile,packet,apiKey,baseURL=process.env.NINEROUTER_URL||'http://127.0.0.1:20128/v1',telemetryFile=MODEL_TELEMETRY_FILE,client=null,timeoutMs=90000}){
 const started=Date.now();const base={cycle_id:cleanText(packet.cycle_id,80),ts:new Date(started).toISOString(),provider:profile.provider,model:profile.model,authoritative:false,candidate_count:Number(packet.candidate_count)||0};
 try{
  if(!apiKey)throw new Error('shadow credential unavailable');
  const sdk=client||new OpenAI({baseURL,apiKey,timeout:timeoutMs,maxRetries:0});
  const response=await sdk.chat.completions.create(buildShadowRequest(profile,packet),{signal:AbortSignal.timeout(timeoutMs)});
  const recommendation=validateShadowRecommendation(parseContent(response),new Set(packet.allowedPools||[]));
  const row={...base,finished_at:new Date().toISOString(),duration_ms:Date.now()-started,status:'success',decision:recommendation.decision,selected_pool:recommendation.pool,confidence:recommendation.confidence,error_class:null,agreement:null};appendModelTelemetry(row,telemetryFile);return{status:'success',recommendation,telemetry:row};
 }catch(error){const row={...base,finished_at:new Date().toISOString(),duration_ms:Date.now()-started,status:'failure',decision:null,selected_pool:null,confidence:null,error_class:errorClass(error),agreement:null};try{appendModelTelemetry(row,telemetryFile)}catch{}return{status:'failure',recommendation:null,telemetry:row};}
}

const execFileAsync=promisify(execFile);
async function resolveGatewayKey(apiKey,keyCommand){if(apiKey)return apiKey;if(!keyCommand)return'';if(typeof keyCommand!=='string'||!path.isAbsolute(keyCommand))return'';try{const{stdout}=await execFileAsync(keyCommand,[],{encoding:'utf8',timeout:5000});return stdout.trim()}catch{return''}}
export async function launchShadowComparisons({packet,profiles=SHADOW_PROFILES,apiKey=process.env.NINEROUTER_KEY,keyCommand='',baseURL,telemetryFile,timeoutMs=90000}){
 apiKey=await resolveGatewayKey(apiKey,keyCommand);if(!apiKey)return[];
 return Promise.all(profiles.map(profile=>runShadowModel({profile,packet,apiKey,baseURL,telemetryFile,timeoutMs})));
}

export function recordAuthoritativeScreening({cycleId,startedAt,durationMs,status,decision,selectedPool,candidateCount,model,errorClass:failure=null},file=MODEL_TELEMETRY_FILE){
 return appendModelTelemetry({cycle_id:cleanText(cycleId,80),ts:startedAt,finished_at:new Date().toISOString(),provider:'zai',model,authoritative:true,duration_ms:durationMs,status,decision:decision??null,selected_pool:selectedPool??null,confidence:null,candidate_count:candidateCount,error_class:failure?cleanText(failure,60):null,agreement:null},file);
}

export function deriveDecisionFromReport(content){const text=String(content??'');if(/⛔\s*NO DEPLOY/i.test(text))return{decision:'no_deploy',selectedPool:null};if(/🚀\s*DEPLOYED/i.test(text))return{decision:'deploy',selectedPool:null};return{decision:null,selectedPool:null}}

export function newScreeningCycleId(){return `screen_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}

export function withAgreement(rows){const live=rows.find(x=>x.authoritative===true&&x.status==='success');return rows.map(row=>({...row,agreement:row.authoritative===false&&live&&row.status==='success'&&row.decision&&live.decision?row.decision===live.decision:null}))}
