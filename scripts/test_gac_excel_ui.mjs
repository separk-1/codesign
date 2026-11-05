// Live opt-in test: requires the local API, source .xlsm and Microsoft Excel.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { GPM_M3H } from '../shared/gacUnits.js';
const browser = await chromium.launch({headless:true,channel:process.env.GAC_BROWSER_CHANNEL||'msedge'});
try {
 const page=await browser.newPage({viewport:{width:1500,height:1000}});
 page.setDefaultTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const api=process.env.GAC_API_URL;
 if(api) await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());
   const response=await route.fetch({url:api+url.pathname+url.search,timeout:120000});
   await route.fulfill({response});
 });
 await page.goto(process.env.GAC_TEST_URL||'http://127.0.0.1:4175');
 await page.getByRole('button',{name:'Design basis +',exact:true}).click();
 const toggle=page.getByRole('switch',{name:'Use US customary units'});
 await toggle.click();
 const flow=Number(await page.getByRole('textbox',{name:'flow',exact:true}).inputValue());
 assert.ok(Math.abs(flow-100/GPM_M3H)<1e-8);
 await page.getByRole('button',{name:'Calculate GAC sizing',exact:true}).click();
 await toggle.click();
 await page.getByRole('button',{name:'Accept and apply',exact:true}).waitFor();
 await page.getByText('Case data',{exact:true}).click();
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export case + history'}).click();
 const stream=await(await pending).createReadStream();const chunks=[];for await(const c of stream)chunks.push(c);
 const data=JSON.parse(Buffer.concat(chunks).toString());
 const w=data.proposal.workbook;
 assert.equal(w.execution.engine,'microsoft_excel');assert.equal(w.execution.recalculated,true);
 assert.notEqual(w.execution.testFixture,true);
 assert.equal(data.form.diameterFt,'10.5');assert.equal(data.form.flow,'100');
 assert.equal(data.proposal.requiredMediaM3,w.requiredMediaM3);
 assert.ok(w.toolCalls.some(t=>t.name==='calculate_gac_excel'&&t.status==='succeeded'));
 const logged=data.history.find(entry=>entry.action==='Calculate GAC proposal');
 assert.deepEqual(logged.toolCall,w.toolCalls[0]);
 assert.ok(w.formulaTrace.some(f=>f.citation==='Contactor Constraints!C80'));
 assert.equal(data.displayUnitSystem,'si');
 assert.match(await page.locator('.chat-section').innerText(),/m³/);
 await page.getByRole('button',{name:'Accept and apply',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Sizing applied'}).waitFor();
 await page.screenshot({path:'docs/unit-toggle-native-si.png',fullPage:true});
 await toggle.click();
 assert.match(await page.locator('.change-table').innerText(),/ft³/);
 await page.screenshot({path:'docs/unit-toggle-native-us.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,engine:w.execution.engine,agentMode:w.execution.agentMode,runId:w.execution.runId,sourceHash:w.source.sha256,requiredMediaM3:w.requiredMediaM3,mediaPerVesselM3:w.mediaPerVesselM3,vessels:w.operatingVessels,diameterFt:w.diameterFt},null,2));
} finally {await browser.close();}
