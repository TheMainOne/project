import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createReviewService, AiError } from "../src/ai/reviews.js";
import { validateReview } from "../src/ai/openai.js";
import { emptyKnowledge } from "../src/ai/knowledge.js";
import { snapshot, reviewContext } from "../src/ai/context.js";
import { fileLimits } from "../src/ai/attachments.js";
import { createPanelServer } from "../src/http.js";
import { publish } from "../scripts/knowledge.js";

const pdf = { id:"401",parentId:"101",parentType:"ROW",attachmentType:"FILE",mimeType:"application/pdf",name:"Drawing.pdf",sizeInKb:1 };
const pic = { id:"402",parentId:"301",parentType:"COMMENT",attachmentType:"FILE",mimeType:"image/png",name:"label.png",sizeInKb:1 };
const textFile = { ...pdf,id:"403",name:"not selected.txt",mimeType:"text/plain" };
function row() {
  return { id:"101", rowNumber:7,description:"Check drawing for sample",site:"0071",
    fields:[{columnId:"10",title:"Description",value:"Check drawing for sample"}],commentsLoaded:true,attachmentsLoaded:true,
    attachments:[pdf,pic,textFile],discussions:[{id:"201",comments:[{id:"301",discussionId:"201",text:"Untrusted note about drawing",author:{name:"QA"},createdAt:"2026-10-22"}]}] };
}
function output(analysis) {
  return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(analysis)}]}]});
}
function sampleReview() {
  return { summary:{text:"Проверка чертежа.",sources:["field:10"]},changes:[],approvers:[],questions:[],nextSteps:[],
    draftComment:"Please confirm the drawing revision." };
}
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(),"ecn-ai-"));
  const config = { openaiKey:"DUMMY_OPENAI",openaiModel:"test-model",token:"DUMMY_SMART",sheetId:"100",pollSeconds:120,
    knowledgeDirectory:join(dir,"kb"),reviewDatabasePath:join(dir,"ai.sqlite"),publicDirectory:fileURLToPath(new URL("../public/",import.meta.url)) };
  const calls = [], meta = [], ctx = { row:row() };
  const store = {row:id => id === ctx.row?.id ? ctx.row : null, state:() => ({})};
  const reader = {getAttachment:async id => {
    meta.push(id);
    return ctx.getMeta ? ctx.getMeta(id) : { ...ctx.row.attachments.find(f => f.id === id),url:"https://s3.amazonaws.com/SmartsheetB1/" + id + "?signature=PRIVATE" };
  }};
  const fetchImpl = async (url,opts) => {
    url = new URL(url); calls.push({url,opts});
    if (url.hostname === "api.openai.com") return ctx.provider ? await ctx.provider(opts) : output(sampleReview());
    if (ctx.fileResponse) return ctx.fileResponse(url,opts);
    return new Response(url.pathname.endsWith("/401") ? Buffer.from("%PDF-1.4\nsynthetic") : Buffer.from("89504e470d0a1a0a","hex"));
  };
  const services = new Set();
  const open = () => { const service = createReviewService({config,store,reader,fetchImpl}); services.add(service); return service; };
  const close = async s => {services.delete(s);await s.close();};
  t.after(async () => {for (const s of services) await s.close();rmSync(dir,{recursive:true,force:true});});
  const service = open();
  const run = (ids = [],s = service,basis = s.status("101").basis) => s.analyze("101",{basis,attachmentIds:ids});
  return {service,ctx,store,reader,config,calls,meta,dir,run,open,close};
}
test("manual request includes selected file bytes, comments and relevant knowledge; other attachments and service secrets stay out of the prompt",async t => {
  const f=fixture(t),source=join(f.config.knowledgeDirectory,"sources");mkdirSync(source,{recursive:true});
  writeFileSync(join(source,"manifest.json"),JSON.stringify({documents:[{id:"guide",title:"Test Guide",revision:"1",kind:"procedure",file:"guide.md"}]}));
  writeFileSync(join(source,"guide.md"),"# Drawing routing\nTest rule for drawings.\n");
  publish(f.config.knowledgeDirectory);
  assert.equal(f.service.status("101").latest,null);assert.equal(f.calls.length,0);assert.equal(f.meta.length,0);
  f.ctx.provider = opts => {
    const b=JSON.parse(opts.body),input=b.input[0].content;
    assert.equal(b.store,false);assert.equal(b.model,"test-model");assert.equal(b.text.format.strict,true);
    assert.equal(b.tools,undefined);assert.match(input[0].text,/Untrusted note/);assert.match(input[0].text,/Test rule/);
    assert.doesNotMatch(opts.body,/not selected|PRIVATE|DUMMY|s3\.amazonaws/);
    assert.match(input[2].file_data,/^data:application\/pdf;base64,/);assert.match(input[4].image_url,/^data:image\/png;base64,/);
    assert.equal(input[1].text,"Attachment source ID: file:401");assert.equal(input[3].text,"Attachment source ID: file:402");
    assert.equal(opts.headers.Authorization,"Bearer DUMMY_OPENAI");
    const analysis=sampleReview();analysis.approvers=[{text:"Сверить отдел.",sources:["field:10","kb:guide:1"]}];
    analysis.changes=[{text:"Сверить приложенный чертёж.",sources:["file:401","comment:301"]}];return output(analysis);
  };
  const r=await f.run(["402","401"]);assert.equal(r.stale,false);assert.equal(r.reused,false);
  assert.deepEqual(f.meta,["401","402"]);assert.deepEqual(r.latest.attachmentIds,["401","402"]);
  assert.deepEqual(f.calls.map(x=>x.opts.method),["GET","GET","POST"]);
  assert.ok(f.calls.slice(0,2).every(x => !x.opts.headers && x.opts.redirect === "manual"));
  assert.doesNotMatch(JSON.stringify(r),/base64|PRIVATE|DUMMY/);
});
test("concurrent requests coalesce, cache survives restart and different selections never reuse another review",async t => {
  const f=fixture(t);let proceed,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  f.ctx.provider=async()=>{entered();await new Promise(resolve=>{proceed=resolve;});return output(sampleReview());};
  const first=f.run();const second=f.run();await started;
  assert.throws(()=>f.run(["401"]),e=>e.status===409);
  proceed();assert.deepEqual(await first,await second);
  assert.equal(f.calls.length,1);
  await f.close(f.service);
  const again=f.open();assert.equal(again.status("101").latest.model,"test-model");
  assert.equal((await f.run([],again)).reused,true);
  assert.equal(f.calls.length,1);
  f.ctx.provider=()=>output(sampleReview());
  assert.equal((await f.run(["401"],again)).reused,false);
  assert.equal((await f.run([],again)).reused,true);
  assert.deepEqual(again.status("101").latest.attachmentIds,[]);
});
test("explicit rerun verifies actual selected bytes before serving the saved result",async t => {
  const f=fixture(t);
  await f.run(["401"]);assert.equal((await f.run(["401"])).reused,true);
  f.ctx.fileResponse=()=>new Response("%PDF-1.4\nupdated");
  assert.equal((await f.run(["401"])).reused,false);
  assert.equal(f.calls.filter(c=>c.opts.method==="POST").length,2);
});
test("stale selection or removed row is rejected before sending and a change during model execution discards the result",async t=>{
  const f=fixture(t);const basis=f.service.status("101").basis;
  f.ctx.row.fields[0].value="new";assert.throws(()=>f.run([],f.service,basis),e=>e.status===409);
  f.ctx.provider=()=>{f.ctx.row.discussions[0].comments[0].text="edited during call";return output(sampleReview());};
  await assert.rejects(f.run(),e=>e.status===409);assert.equal(f.service.status("101").latest,null);
  f.ctx.row=null;assert.throws(()=>f.service.status("101"),e=>e.status===404);
});
test("a new comment, file, model or knowledge publication marks a stored review stale, while read receipts and row order do not",async t=>{
  const f=fixture(t);await f.run();
  f.ctx.row.rowNumber++;f.ctx.row.unreadCommentCount=0;assert.equal(f.service.status("101").stale,false);
  f.ctx.row.discussions[0].comments[0].text+=" edit";assert.ok(f.service.status("101").stale);
  await f.run();f.ctx.row.attachments.push({...pdf,id:"410"});assert.ok(f.service.status("101").stale);
  await f.run();f.config.openaiModel="model2";assert.ok(f.service.status("101").stale);
  await f.run();const source=join(f.config.knowledgeDirectory,"sources");mkdirSync(source,{recursive:true});
  writeFileSync(join(source,"manifest.json"),JSON.stringify({documents:[{id:"guide",title:"Guide",revision:"1",kind:"guidance",file:"g.md"}]}));
  writeFileSync(join(source,"g.md"),"# guide\nSome guidance.");publish(f.config.knowledgeDirectory);
  assert.ok(f.service.status("101").stale);
});
test("bad or foreign selections, external attachments, large files and arbitrary payloads fail before network access",async t=>{
  const f=fixture(t),s=f.service,basis=s.status("101").basis;
  for(const body of [{basis,attachmentIds:["401","401"]},{basis,attachmentIds:"401"},{basis,attachmentIds:[],url:"http://localhost"},
    {basis,attachmentIds:Array.from({length:6},(_,i)=>String(50+i))},{basis,attachmentIds:[402]},null])assert.throws(()=>s.analyze("101",body),AiError);
  await assert.rejects(f.run(["999"]),e=>e.status===400);
  for (const change of [{attachmentType:"LINK"},{name:"macro.exe"},{sizeInKb:14000}]) {
    f.ctx.row.attachments=[{...pdf,...change}];await assert.rejects(f.run(["401"]),e=>e.status===422);
  }
  f.ctx.row.attachments=[{...pdf,sizeInKb:12000},{...pic,sizeInKb:12000}];
  await assert.rejects(f.run(["401","402"]),e=>e.status===413);assert.equal(f.calls.length+f.meta.length,0);
});
test("changed ownership and host validation cover both the initial and redirected download",async t=>{
  const f=fixture(t);
  f.ctx.getMeta=()=>({...pdf,parentId:"102",url:"https://s3.amazonaws.com/file"});
  await assert.rejects(f.run(["401"]),e=>e.status===409);
  for(const url of ["http://s3.amazonaws.com/file","https://127.0.0.1/a","https://smartsheet.com.bad.test/file","https://user:pw@s3.amazonaws.com/file"]) {
    f.ctx.getMeta=()=>({...pdf,url});await assert.rejects(f.run(["401"]),e=>e.status===422);
  }
  assert.equal(f.calls.length,0);
  f.ctx.getMeta=()=>({...pdf,url:"https://files.smartsheet.com/file"});
  f.ctx.fileResponse=()=>new Response(null,{status:302,headers:{Location:"http://127.0.0.1/private"}});
  await assert.rejects(f.run(["401"]),e=>e.status===422);assert.equal(f.calls.length,1);
});
test("actual download size and format are checked even without accurate metadata; partial failures never send a subset",async t=>{
  const f=fixture(t);
  f.ctx.fileResponse=()=>new Response("not a PDF");await assert.rejects(f.run(["401"]),e=>e.status===422);
  f.ctx.fileResponse=()=>new Response("%PDF-1.4",{headers:{"Content-Length":String(fileLimits.perFile+1)}});
  await assert.rejects(f.run(["401"]),e=>e.status===413);
  f.ctx.fileResponse=()=>new Response(Buffer.alloc(fileLimits.perFile+1));
  await assert.rejects(f.run(["401"]),e=>e.status===413);
  f.ctx.fileResponse=url=>url.pathname.endsWith("401")?new Response("%PDF-1.4"):new Response(null,{status:403});
  await assert.rejects(f.run(["401","402"]),e=>e.status===502);assert.equal(f.calls.filter(c=>c.opts.method==="POST").length,0);
});
test("provider failure, missing source IDs, partial output and refusals are recoverable and do not leak provider content",async t=>{
  const f=fixture(t);
  for (const response of [new Response("DUMMY_SECRET_BAD",{status:401}),Response.json({status:"incomplete",output:[]}),
    Response.json({status:"completed",output:[{type:"message",content:[{type:"refusal",refusal:"..." }]}]}),
    output({...sampleReview(),summary:{text:"invented",sources:["file:999"]}}),output({})]) {
    f.ctx.provider=()=>response;await assert.rejects(f.run(),e=>e instanceof AiError && !e.message.includes("DUMMY"));assert.equal(f.service.status("101").latest,null);
  }
  f.ctx.provider=()=>output(sampleReview());assert.equal((await f.run()).latest.analysis.summary.sources[0],"field:10");
  assert.equal(f.calls.length,6);
});
test("proposed approvers must cite an applicable document and the ECN, and archive precedents cannot establish the rule alone",()=>{
  const sources=[{id:"f",kind:"field"},{id:"p",kind:"precedent"},{id:"r",kind:"procedure"}];
  function verify(ids){const r=sampleReview();r.summary.sources=["f"];r.approvers=[{text:"Quality",sources:ids}];return validateReview(r,sources);}
  for (const ids of [["r"],["f"],["f","p"],["f","unknown"]]) assert.throws(()=>verify(ids),AiError);
  assert.equal(verify(["f","r"]).approvers.length,1);
});
test("legacy snapshots retain available fields, coverage reports shortened comments and omitted attachments",()=>{
  const r=row();delete r.fields;r.discussions[0].comments=Array.from({length:62},(_,i)=>({id:String(300+i),text:"a".repeat(7000),modifiedAt:String(i).padStart(3,"0")}));
  const s=snapshot(r,emptyKnowledge,"test");const ctx=reviewContext(r,s,emptyKnowledge,[]);
  assert.ok(ctx.sources.some(s=>s.id==="field:description"));assert.ok(ctx.sources.some(s=>s.id==="comment:361"));assert.ok(ctx.coverage.some(n=>n.includes("62")));
  assert.ok(ctx.coverage.some(n=>n.includes("0 из 3")));assert.ok(ctx.coverage.some(n=>n.includes("не опубликована")));
});
test("only a guarded, local manual POST can call OpenAI; missing key and missing token have actionable behavior",async t=>{
  const f=fixture(t); const server=createPanelServer({config:f.config,store:f.store,reader:f.reader,reviews:f.service,monitor:{status:()=>({})}});
  server.listen(0,"127.0.0.1");await once(server,"listening");
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base="http://127.0.0.1:"+server.address().port, url=base+"/api/rows/101/ai-review";
  const info=await (await fetch(url)).json();
  await fetch(base);await fetch(base+"/api/state");assert.equal(f.calls.length,0);
  assert.doesNotMatch(JSON.stringify(info),/DUMMY/);
  const opts={method:"POST",headers:{"Content-Type":"application/json",Origin:base,"X-ECN-UI":"1"},body:JSON.stringify({basis:info.basis,attachmentIds:[]})};
  for (const [patch,code] of [[{headers:{"Content-Type":"application/json"}},403],[{headers:{...opts.headers,Origin:"https://wrong.test"}},403],
    [{body:"{"},400],[{body:"X".repeat(2050)},413],[{headers:{...opts.headers,"Content-Type":"text/plain"}},415]])assert.equal((await fetch(url,{...opts,...patch})).status,code);
  f.config.openaiKey="";assert.equal((await fetch(url,opts)).status,409);
  assert.equal(f.calls.length,0);f.config.openaiKey="DUMMY_OPENAI";f.config.token="";
  await assert.rejects(f.run(["401"]),e=>e.status===409);assert.equal((await fetch(url,opts)).status,200);
  assert.equal((await fetch(base+"/data/ai-reviews.sqlite")).status,404);assert.equal(f.calls.length,1);
});

test("an attachment removed during its metadata lookup cannot be downloaded or sent",async t=>{
  const f=fixture(t);
  f.ctx.getMeta=()=>{
    f.ctx.row.attachments=[];
    return {...pdf,url:"https://s3.amazonaws.com/file"};
  };
  await assert.rejects(f.run(["401"]),e=>e.status===409);
  assert.deepEqual(f.meta,["401"]);
  assert.equal(f.calls.length,0);
});

test("transport failures identify the failed service without exposing the key, signed URL or raw exception", async t => {
  const f=fixture(t);
  function failed() {throw Object.assign(new Error("private-url?signature=never-display"),{cause:{code:"ECONNRESET"}});}
  f.ctx.getMeta=failed;
  await assert.rejects(f.run(["401"]),e=>e.status===502 && /Получение ссылки Smartsheet.*ECONNRESET/.test(e.message) && !e.message.includes("signature"));
  delete f.ctx.getMeta; f.ctx.fileResponse=failed;
  await assert.rejects(f.run(["401"]),e=>e.status===502 && /Скачивание файла.*ECONNRESET/.test(e.message) && !e.message.includes("signature"));
  assert.equal(f.calls.filter(c=>c.opts.method==="POST").length,0);
  f.ctx.provider=failed;
  await assert.rejects(f.run([]),e=>e.status===502 && /Соединение с OpenAI.*ECONNRESET/.test(e.message) && !e.message.includes("signature"));
});

test("selected XLSX reaches OpenAI as a spreadsheet and can be cited in the saved result",async t=>{
  const f=fixture(t);
  const mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  f.ctx.row.attachments=[{...pdf,name:"rates.xlsx",mimeType:mime}];
  const bytes=Buffer.from("UEsDBBQAAAAIACF6d12I95JuzwAAALoBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2Rv07EMAyHX6XKii4+bmBAbRdg5Rh4AZO616hJHMW+o7w9afkzMIHEZMX+/PsspX1+yyTNEkOSzkyq+RZA3EQRxXKmVCcjl4han+UEGd2MJ4LDfn8DjpNS0p2uGaZv72nEc9DmYalt8Zw6UyiIae4+wNXVGcw5eIda53BJww/L7tNg6+bGyOSzXFXAQN8eL1SKH6h5wqKPGGscLAFeucwvzLNdsT/ZeBy9o4HdOdYVK7kQDjIRaQx2qzaiT7/wb7CAXP/zEd/ZXzfA9mX9O1BLAwQUAAAACAAhenddfxEoFogAAADuAAAACwAAAF9yZWxzLy5yZWxzjc89DgIhEAXgq2w4wM5qYWGAysbWeAHE4Sf8DAGM6+2lXI2F5eS9fC/DLxhV95Sb86VNa4q5CeZ6L0eAph0m1WYqmEdiqCbVx1ktFKWDsgj7ZTlA3RpM8q05ne+C1R2brq+C/8hkjNd4Iv1ImPuPga/GkFW12AVbIzyphhtRmAfKQHL4eE++AVBLAwQUAAAACAAhenddz93uGIoAAADrAAAAGgAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzjc89DsIwDAXgq0Q5QN0yMKAkEwsr6gWi4DRRmx/FRsDtyYSKxMDo96TvyeqKm+VYMoVYSTzTlknLwFxPAOQCJktDqZh740tLlvvZFqjWrXZBOIzjEdrekEbtTXG5adkmKeZXxX/k4n10eC7unjDzjwF4lLZSQOSO2rYga/mJCGgauijBKPj6zbwBUEsDBBQAAAAIACF6d12gaDVZkAAAAOEAAAAPAAAAeGwvd29ya2Jvb2sueG1sjY8xDoMwDEWvEvkANXTogICpS9fewAXTRJA4slO1xy+Csney///y+3L7Fp0fIrP7xCVZB76U3CDa4DmSnSRzWpNJNFJZpT7RsjKN5plLXPBcVReMFBLshEb/Ycg0hYGvMrwip7JDlBcqQZL5kA36dmuw33SJIndwp8IGbrNuYwc1OG3CumgN2Ld43ODxVv8FUEsDBBQAAAAIACF6d10Ql/osdgAAAJgAAAAUAAAAeGwvd29ya3NoZWV0cy9zMS54bWxNjtEKwjAMRX9l9ANM54MPkhUEfyTUasWlLUnZ9vlmexAfcrn3JBeCa5WP5pT6sPFcdHK593YF0JgTk55qS8U2zypM3aK8QJskehwlnuHs/QWY3sUFPNidOgWUug4yudFo3M1td0sYPcISEKKNnZj+deD3TPgCUEsBAhQDFAAAAAgAIXp3XYj3km7PAAAAugEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACAAhenddfxEoFogAAADuAAAACwAAAAAAAAAAAAAAgAEAAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACAAhenddz93uGIoAAADrAAAAGgAAAAAAAAAAAAAAgAGxAQAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAMUAAAACAAhenddoGg1WZAAAADhAAAADwAAAAAAAAAAAAAAgAFzAgAAeGwvd29ya2Jvb2sueG1sUEsBAhQDFAAAAAgAIXp3XRCX+ix2AAAAmAAAABQAAAAAAAAAAAAAAIABMAMAAHhsL3dvcmtzaGVldHMvczEueG1sUEsFBgAAAAAFAAUAQQEAANgDAAAAAA==","base64");
  f.ctx.fileResponse=()=>new Response(bytes);
  f.ctx.provider=opts=>{
    const file=JSON.parse(opts.body).input[0].content.find(part=>part.type==="input_file");
    assert.equal(file.file_data,"data:"+mime+";base64,"+bytes.toString("base64"));
    assert.equal(file.filename,"rates.xlsx");
    const review=sampleReview();review.summary.sources.push("file:401");return output(review);
  };
  const r=await f.run(["401"]);assert.equal(r.latest.analysis.summary.sources.at(-1),"file:401");
});
