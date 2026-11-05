import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateWorkbook } from '../shared/gacWorkbookEngine.js';
import { GPM_M3H, FT_M, LB_KG, FT3_M3 } from '../shared/gacUnits.js';
const model = JSON.parse(fs.readFileSync('src/data/gacWorkbook.json'));
const browser = await chromium.launch({ headless: true, channel: process.env.GAC_BROWSER_CHANNEL || 'msedge' });
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)), a+' != '+b);
try {
 const page=await browser.newPage({viewport:{width:1500,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const requests=[];let delay=0;let fail=false;
 // Explicit protocol fixtures only. Native workbook execution is independently tested.
 await page.route('**/api/gac/calculate', async route=>{
   const inputs=route.request().postDataJSON().inputs;requests.push(inputs);
   const result=calculateWorkbook(inputs,model);
   if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
   if(fail) return route.fulfill({status:503,json:{error:'Test: Excel is unavailable'}}).catch(()=>{});
   return route.fulfill({json:{...result,execution:{engine:'microsoft_excel',recalculated:true,testFixture:true},toolCalls:[{name:'calculate_gac_excel',testFixture:true}]}}).catch(()=>{});
 });
 await page.route('**/api/gac/assistant',route=>route.fulfill({status:503,json:{}}));
 await page.goto(process.env.GAC_TEST_URL||'http://127.0.0.1:4175');
 const toggle=page.getByRole('switch',{name:'Use US customary units'});
 const input=key=>page.getByRole('textbox',{name:key,exact:true});
 await page.getByRole('button',{name:'Design basis +',exact:true}).click();
 assert.equal(await toggle.getAttribute('aria-checked'),'false');
 assert.equal(await input('diameterFt').inputValue(),'3.2004');
 near(Number(await input('densityLbFt3').inputValue()),Number(model.assumptions.GAC_density.value)*LB_KG/FT3_M3);
 const snapshot=async()=>{
   if(!await page.getByRole('button',{name:'Export case + history'}).isVisible())await page.getByText('Case data',{exact:true}).click();
   const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export case + history'}).click();
   const stream=await(await pending).createReadStream();const chunks=[];for await(const c of stream)chunks.push(c);
   return JSON.parse(Buffer.concat(chunks).toString());
 };
 const canonical=await snapshot();
 for(let i=0;i<12;i++)await toggle.click();
 assert.deepEqual(await snapshot(),canonical);
 await toggle.focus();await page.keyboard.press('Space');
 assert.equal(await toggle.getAttribute('aria-checked'),'true');
 near(Number(await input('flow').inputValue()),100/GPM_M3H);
 assert.equal(await input('diameterFt').inputValue(),'10.5');
 assert.equal(await input('densityLbFt3').inputValue(),String(model.assumptions.GAC_density.value));
 await page.getByRole('button',{name:'Calculate GAC sizing',exact:true}).click();
 await page.getByRole('button',{name:'Accept and apply',exact:true}).waitFor();
 const proposed=await snapshot();
 assert.equal(proposed.proposal.workbook.execution.testFixture,true);
 await toggle.click();
 assert.equal(await page.getByRole('button',{name:'Accept and apply',exact:true}).count(),1);
 const siProposal=await snapshot();
 assert.deepEqual(siProposal.proposal,proposed.proposal);assert.deepEqual(siProposal.form,proposed.form);
 assert.deepEqual(siProposal.history,proposed.history);
 await page.getByRole('button',{name:'Accept and apply',exact:true}).click();
 const applied=await snapshot();
 await toggle.click();
 const appliedUS=await snapshot();
 assert.deepEqual(appliedUS.accepted,applied.accepted);assert.deepEqual(appliedUS.graph,applied.graph);assert.deepEqual(appliedUS.history,applied.history);
 assert.equal(appliedUS.state,'applied');
 assert.match(await page.locator('.change-table').innerText(),/ft³/);
 assert.match(await page.getByRole('button',{name:'GAC T1 / V1',exact:true}).last().locator('title').textContent(),/ft³/);
 await page.getByRole('button',{name:'Graph',exact:true}).click();
 assert.match(await page.locator('.formula-graph').innerText(),/ft²/);
 await toggle.click();
 assert.match(await page.locator('.formula-graph').innerText(),/m²/);
 assert.doesNotMatch(await page.locator('.formula-graph svg').textContent(),/lb\/ft|US gpm/);
 await page.getByRole('button',{name:'Architecture',exact:true}).click();
 await input('diameterFt').fill('');await input('diameterFt').pressSequentially('3.2004');
 assert.equal(await input('diameterFt').inputValue(),'3.2004');
 near(Number((await snapshot()).form.diameterFt),10.5);
 assert.equal((await snapshot()).state,'stale');
 for(const unknown of ['?','','1e','-']){
   await input('diameterFt').fill(unknown);await toggle.click();assert.equal(await input('diameterFt').inputValue(),unknown);await toggle.click();
 }
 await input('diameterFt').fill('3.2004');
 await input('heightFt').fill('3.3528');await input('bedDepthFt').fill('2.07264');
 await page.getByRole('button',{name:'Calculate GAC sizing',exact:true}).click();
 await page.getByRole('button',{name:'Accept and apply',exact:true}).waitFor();
 const second=await snapshot();
 for(const key of ['diameterFt','heightFt','bedDepthFt','densityLbFt3','flowGpm','averageFlowGpm'])near(Number(requests[0][key]),Number(requests.at(-1)[key]));
 near(second.proposal.workbook.mediaPerVesselM3,proposed.proposal.workbook.mediaPerVesselM3);
 await page.getByRole('button',{name:'Reject',exact:true}).click();
 const chat=page.locator('.chat-section textarea');
 await chat.fill('flowUnit=gpm');await page.getByRole('button',{name:'SEND',exact:true}).click();
 assert.equal(await toggle.getAttribute('aria-checked'),'true');
 assert.equal((await snapshot()).form.flow,'100');
 await chat.fill('flow=500');await page.getByRole('button',{name:'SEND',exact:true}).click();
 near(Number((await snapshot()).form.flow),500*GPM_M3H);
 await toggle.click();await input('flow').fill('100');
 // A slow result cannot overwrite a newer edit or double-submit.
 delay=1000;
 const before=requests.length;await page.getByRole('button',{name:'Calculate GAC sizing',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Calculating in Excel…',exact:true}).isDisabled(),true);
 await input('flow').fill('120');
 await page.waitForTimeout(1400);
 assert.equal(requests.length,before+1);assert.equal((await snapshot()).proposal,null);
 assert.equal((await snapshot()).form.flow,'120');
 // A display-only toggle during calculation must keep the request and use current units on completion.
 delay=700;await input('flow').fill('100');
 await page.getByRole('button',{name:'Calculate GAC sizing',exact:true}).click();
 await toggle.click();
 await page.getByRole('button',{name:'Accept and apply',exact:true}).waitFor();
 assert.match(await page.locator('.chat-section').innerText(),/ft³/);
 await page.getByRole('button',{name:'Reject',exact:true}).click();
 await toggle.click();
 // Failed Excel request must not apply a local fallback.
 delay=0;fail=true;await page.getByRole('button',{name:'Calculate GAC sizing',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Excel is unavailable'}).waitFor();
 assert.equal((await snapshot()).proposal,null);
 fail=false;await page.getByRole('button',{name:'Calculate GAC sizing',exact:true}).click();
 await page.getByRole('button',{name:'Accept and apply',exact:true}).waitFor();
 for(const width of [1500,375]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'docs/unit-toggle-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('Unit UI passed: keyboard toggle, 12 round trips, proposal/applied invariance, equivalent inputs, graph, tooltips, drafts, chat, cancellation, no fallback and mobile layout. Uses explicit API fixtures.');
} finally {await browser.close();}
