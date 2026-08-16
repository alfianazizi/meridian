import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateShadowRecommendation,
  buildShadowRequest,
  appendModelTelemetry,
  runShadowModel,
  launchShadowComparisons,
} from '../shadow-screening.js';

test('validates the strict shadow recommendation contract', () => {
  const value=validateShadowRecommendation({decision:'deploy',pool:'pool-1',confidence:.8,reasons:['strong fees'],risks:['volatility']},new Set(['pool-1']));
  assert.equal(value.decision,'deploy');
  assert.equal(value.pool,'pool-1');
  assert.throws(()=>validateShadowRecommendation({decision:'deploy',pool:'other',confidence:.8,reasons:[],risks:[]},new Set(['pool-1'])));
  assert.throws(()=>validateShadowRecommendation({decision:'no_deploy',pool:null,confidence:2,reasons:[],risks:[]}));
  assert.throws(()=>validateShadowRecommendation({decision:'no_deploy',pool:null,confidence:.5,reasons:[],risks:[],extra:true}));
});

test('builds tool-free requests with fixed model reasoning settings', () => {
  const packet={cycle_id:'cycle-1',candidate_count:1,candidates:'POOL: Demo (pool-1)'};
  const luna=buildShadowRequest({model:'cx/gpt-5.6-luna',reasoningEffort:'high'},packet);
  const deepseek=buildShadowRequest({model:'ocg/deepseek-v4-flash',reasoningEffort:'none'},packet);
  for(const request of [luna,deepseek]){
    assert.equal(request.tools,undefined);
    assert.equal(request.tool_choice,undefined);
    assert.deepEqual(request.response_format,{type:'json_object'});
    assert.equal(JSON.stringify(request).includes('deploy_position'),false);
  }
  assert.equal(luna.reasoning_effort,'high');
  assert.equal(deepseek.reasoning_effort,'none');
});

test('telemetry keeps allowlisted fields and strips sensitive text', () => {
  const dir=mkdtempSync(join(tmpdir(),'meridian-shadow-'));const file=join(dir,'models.jsonl');
  appendModelTelemetry({cycle_id:'c1',ts:'2026-01-01T00:00:00Z',model:'m',provider:'p',authoritative:false,duration_ms:12,status:'success',decision:'no_deploy',candidate_count:1,error_class:null,prompt:'secret',response:'secret',api_key:'secret'},file);
  const row=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(row.cycle_id,'c1');assert.equal(row.status,'success');
  assert.equal('prompt' in row,false);assert.equal('response' in row,false);assert.equal('api_key' in row,false);
});

test('shadow failures resolve to failure telemetry and never throw', async () => {
  const dir=mkdtempSync(join(tmpdir(),'meridian-shadow-'));const file=join(dir,'models.jsonl');
  const result=await runShadowModel({profile:{provider:'9router',model:'cx/gpt-5.6-luna',reasoningEffort:'high'},packet:{cycle_id:'c1',candidate_count:1,candidates:'POOL: Demo (pool-1)',allowedPools:['pool-1']},apiKey:'x',telemetryFile:file,client:{chat:{completions:{create:async()=>{throw new Error('Bearer secret-token timeout')}}}}});
  assert.equal(result.status,'failure');
  const row=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(row.error_class,'Error');
  assert.equal(JSON.stringify(row).includes('secret-token'),false);
});

test('gateway key commands fail closed unless absolute executables',async()=>{
 const packet={cycle_id:'c1',candidate_count:0,candidates:'none',allowedPools:[]};
 assert.deepEqual(await launchShadowComparisons({packet,keyCommand:'echo secret',profiles:[]}),[]);
 const dir=mkdtempSync(join(tmpdir(),'meridian-key-')),script=join(dir,'key');
 writeFileSync(script,'#!/bin/sh\nprintf test-key\n',{mode:0o700});
 assert.deepEqual(await launchShadowComparisons({packet,keyCommand:script,profiles:[]}),[]);
});
