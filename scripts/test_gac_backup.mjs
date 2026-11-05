import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { calculationCapability, calculateFormulaWorkbook, calculationOriginAllowed, runGacCalculation } from '../server/gacCalculation.js';
import { calculateExcelWorkbook } from '../server/gacExcelBridge.js';
import app from '../api/index.js';
const base = { flowGpm: 100 / (0.003785411784 * 60), averageFlowGpm: 100 / (0.003785411784 * 60), totalEbctMinutes: 20, series: 2, parallel: 1, geometryMode: 'manual', diameterFt: 10.5, heightFt: 11, bedDepthFt: 6.8, densityLbFt3: 30, redundantVessels: '', carbonLifeMode: 'none' };
const local = calculationCapability({ platform: 'win32', env: {} });
const online = calculationCapability({ platform: 'linux', env: { VERCEL: '1' } });
assert.equal(local.nativeExcel, true);
assert.equal(online.mode, 'online_plan_b');
assert.equal(calculationCapability({ platform: 'win32', env: { VERCEL: '1' } }).nativeExcel, false);
const req = (host, origin) => ({ hostname: host.split(':')[0], headers: { origin }, get: () => host });
assert.equal(calculationOriginAllowed(req('127.0.0.1:8787','http://127.0.0.1:5173'),local),true);
assert.equal(calculationOriginAllowed(req('evil.example','http://127.0.0.1:5173'),local),false);
assert.equal(calculationOriginAllowed(req('127.0.0.1:8787','https://evil.example'),local),false);
assert.equal(calculationOriginAllowed(req('codesign.example','https://codesign.example'),online),true);
assert.equal(calculationOriginAllowed(req('codesign.example','https://evil.example'),online),false);
assert.equal(calculationOriginAllowed(req('codesign.example','null'),online),false);
let nativeCalls=0;
await assert.rejects(() => runGacCalculation(base,{capability:local,nativeAgent:async()=>{nativeCalls++;throw Error('Native unavailable');}}),/Native unavailable/);
assert.equal(nativeCalls,1);
const backup=await runGacCalculation(base,{capability:online,nativeAgent:async()=>{throw Error('must not call Excel');}});
assert.equal(backup.execution.engine,'javascript_formula_port');assert.equal(backup.execution.recalculated,false);
assert.equal(backup.execution.evaluated,true);assert.equal(backup.execution.agentMode,'direct_formula_tool');
assert.equal(backup.toolCalls[0].name,'calculate_gac_formula_backup');
assert.ok(backup.formulaTrace.every(row=>!Object.hasOwn(row,'cached')&&row.evidenceKind==='source_formula_snapshot'));
assert.equal(backup.carbonLifeMonths,null);
for(const invalid of [{...base,flowGpm:[100]},{...base,flowGpm:'=EXEC()'},{...base,formula:'x'},{...base,workbookPath:'other.xlsx'},{...base,averageFlowGpm:1e9},{...base,redundantVessels:[]},{...base,series:21},{...base,carbonLifeMode:'bv',carbonLifeValue:100},{...base,geometryMode:'manual',heightFt:1}])await assert.rejects(()=>calculateFormulaWorkbook(invalid));
const previous=process.env.VERCEL;process.env.VERCEL='1';
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const url='http://127.0.0.1:'+server.address().port;
try {
 const health=await fetch(url+'/api/health').then(r=>r.json());assert.equal(health.gacCalculation.mode,'online_plan_b');
 const send=(body,origin=url)=>fetch(url+'/api/gac/calculate',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
 const response=await send({inputs:base});assert.equal(response.status,200);assert.equal((await response.json()).execution.engine,'javascript_formula_port');
 assert.equal((await send({inputs:base},'https://evil.example')).status,403);
 assert.equal((await send({inputs:{...base,command:'test'}})).status,400);
 assert.equal((await send({inputs:base,engine:'microsoft_excel'})).status,400);
 assert.equal((await send({inputs:{...base,heightFt:1}})).status,422);
} finally { await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous; }
console.log('PASS: Plan B dispatch/provenance, local no-silent-fallback, origin/Host guards, input boundaries, online HTTP calculation and rejection paths.');
if(process.argv.includes('--native')){
 const source=new URL('../docs/granular-activated-carbon-gac-.xlsm.xlsm',import.meta.url);
 const hash=async()=>crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex');
 const before=await hash();
 const cases=[
  ['PFAS demo',base],
  ['EBCT 30 min',{...base,totalEbctMinutes:30}],
  ['Measured life',{...base,carbonLifeMode:'months',carbonLifeValue:12,carbonLifeSource:'Test measured life'}],
  ['BV total series',{...base,carbonLifeMode:'bv',carbonLifeValue:10000,bvDefinition:'total_series',carbonLifeSource:'Test breakthrough evidence'}],
  ['BV single vessel',{...base,carbonLifeMode:'bv',carbonLifeValue:10000,bvDefinition:'per_vessel',carbonLifeSource:'Test breakthrough evidence'}],
  ['BV half average flow',{...base,averageFlowGpm:base.averageFlowGpm/2,carbonLifeMode:'bv',carbonLifeValue:10000,bvDefinition:'total_series',carbonLifeSource:'Test breakthrough evidence'}],
  ['Freundlich',{...base,carbonLifeMode:'freundlich',carbonLifeValue:50,freundlichExponent:0.5,influentMgL:0.1,targetMgL:0.01,carbonLifeSource:'Test isotherm evidence'}],
  ['AutoSize',{...base,geometryMode:'auto'}],
  ['Density and spare count',{...base,densityLbFt3:25,redundantVessels:2}]
 ];
 const report=[];let compared=0,maxScaledError=0;
 for(const [name,inputs] of cases){
  const port=await calculateFormulaWorkbook(inputs),native=await calculateExcelWorkbook(inputs);
  let outputs=0,error=0;
  for(const [key,value] of Object.entries(native)){
   if(typeof value!=='number'&&value!==null)continue;
   if(value===null){assert.equal(port[key],null,name+' '+key);continue;}
   const relative=Math.abs(port[key]-value)/Math.max(1,Math.abs(value));
   assert.ok(relative<=1e-9,name+' '+key+': '+port[key]+' != '+value);outputs++;error=Math.max(error,relative);
  }
  compared+=outputs;maxScaledError=Math.max(maxScaledError,error);report.push({name,outputs,maxScaledError:error});console.log('PARITY '+name+': '+outputs+' numeric outputs');
 }
 assert.equal(await hash(),before);
 const summary={status:'PASS',nativeCases:cases.length,numericComparisons:compared,maxScaledError,sourcePreserved:true,sourceSha256:before,cases:report};
 await fs.writeFile('tmp/online-backup-parity.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}
