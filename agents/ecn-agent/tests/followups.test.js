import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createFollowups} from "../src/followups.js";
import {buildHistory,classifyHistory,verifyTopics,DAY,prefix,hash} from "../src/ai/followup-analysis.js";
import {AiError} from "../src/ai/attachments.js";
import {openStore} from "../src/store.js";
import {createCommentService} from "../src/comment-service.js";
import {createSmartsheetWriter} from "../src/smartsheet-write.js";
import {createPanelServer} from "../src/http.js";
import {createSmartsheetReader,normalizeDiscussions,normalizeSheet} from "../src/smartsheet.js";
import {SHEET_ID,rawSheet} from "./fixtures.js";

const email="author@example.test", qa="qa@example.test", purchasing="purchasing@example.test";
const config={token:"fixture",sheetId:SHEET_ID,followupEmail:email,followupDays:3,openaiKey:"fixture",openaiModel:"test-model",
  publicDirectory:fileURLToPath(new URL("../public/",import.meta.url))};
const start=Date.UTC(2025,0,1);
const when=day=>new Date(start+day*DAY).toISOString();
function message(id,day,text,author=email) {
  return {id,createdAt:when(day),createdBy:{email:author,name:author.split("@")[0]},text};
}
function thread(id,...comments) {return {id,parentId:1000,parentType:"ROW",comments};}
const initial=()=>[thread(21,message(31,0,"@qa@example.test Please approve the revised drawing."))];
function topic(ids,evidence,status="open",subject="Согласование чертежа") {
  return {subject,requests:ids.map(id=>"C"+id),status,
    evidence:evidence.map(([id,quote])=>({id:typeof id==="number"?"C"+id:id,quote})),
    reason:status==="open"?"Ожидается подтверждение.":"В переписке есть уточнение.",
    recipients:[],question:status==="open"?"Could you please confirm approval of the revised drawing?":""};
}
function basic() {const t=topic([31],[[31,"Please approve the revised drawing."]]);t.recipients=[qa];return {topics:[t],nonRequests:[],unrelated:[]};}
async function setup(t,opts={}) {
  const dir=mkdtempSync(join(tmpdir(),"ecn-smart-")), filename=join(dir,"test.sqlite");
  const raw=rawSheet(), threads=opts.threads || initial();
  const cfg={...config,...opts.config};
  const store=openStore(filename,SHEET_ID);
  function persist() {
    const sheet=normalizeSheet(raw);
    for (const row of sheet.rows) row.discussions=normalizeDiscussions(threads).filter(d=>d.parentId===row.id);
    sheet.commentsLoaded=true;store.saveSheet(sheet,store.beginRun());
  }
  persist();
  const api=[],provider=[],sentTexts=[];
  const fetchImpl=async(url,o) => {
    const path=url.pathname.replace("/2.0/sheets/"+SHEET_ID,""), method=o.method || "GET";
    api.push({path,method});
    if (path==="/rows/1000") return Response.json(raw.rows[0]);
    if (path==="/rows/1000/discussions") {
      assert.equal(url.searchParams.get("include"),"comments");
      if(opts.listResponse) return Response.json(opts.listResponse(Number(url.searchParams.get("page")),threads));
      return Response.json({pageNumber:1,totalPages:1,totalCount:threads.length,data:threads});
    }
    if (path.endsWith("/comments") && method==="POST") {
      const text=JSON.parse(o.body).text;
      sentTexts.push(text);
      if (opts.replyResponse) return opts.replyResponse();
      return Response.json({resultCode:0,message:"SUCCESS",result:{id:999,discussionId:Number(path.split("/")[2]),text}});
    }
    const target=threads.find(th=>path==="/discussions/"+th.id);
    assert.ok(target,path);return Response.json(target);
  };
  const comments=createCommentService({filename,sheetId:SHEET_ID,store,refresh(){},writer:createSmartsheetWriter({...cfg,fetchImpl})});
  const reader=createSmartsheetReader({...cfg,fetchImpl});
  const service=createFollowups({config:cfg,store,comments,reader,now:opts.now,
    refresh:opts.refresh, classify:async args=>{provider.push(args.data);return (opts.classify || basic)(args);}});
  const server=createPanelServer({config:cfg,store,comments,followups:service,monitor:{status:()=>({})}});
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const base="http://127.0.0.1:"+server.address().port;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await service.close();await comments.close();store.close();rmSync(dir,{recursive:true,force:true});});
  const view=async()=>(await (await fetch(base+"/api/followups")).json());
  const post=(action,body={},origin=base)=>fetch(base+"/api/followups/"+action,{method:"POST",headers:{Origin:origin,"X-ECN-UI":"1","Content-Type":"application/json"},body:JSON.stringify(body)});
  const act=(item,action="confirm",patch={},origin=base)=>post(action,{...item,text:item.draft,...patch},origin);
  const run=async()=>{assert.equal((await post("analyze")).status,202);await service.idle();return view();};
  return {raw,threads,persist,store,comments,service,reader,cfg,filename,base,api,provider,sentTexts,view,post,act,run};
}
test("ten paraphrased requests, a detached substantive reply and an owner FYI reach one row-wide classifier in time order",async t=>{
  const threads=Array.from({length:10},(_,i)=>thread(100+i,message(50+i,i,i%2?"Any update on the dimensional evidence?":"Please provide the inspection results."))).reverse();
  threads.unshift(thread(300,message(200,11,"All three inspection records are attached and the dimensions passed.",qa)));
  threads.unshift(thread(301,message(201,12,"Thanks, the results cover all three lots.")));
  const f=await setup(t,{threads,classify:({data})=>{
    assert.equal(data.comments.length,12);assert.equal(data.comments[0].id,"C50");assert.equal(data.comments.at(-1).id,"C201");
    assert.equal(new Set(data.comments.map(c=>c.thread)).size,12);
    return {topics:[topic(Array.from({length:10},(_,i)=>i+50),[[200,"dimensions passed"]],"resolved")],nonRequests:["C201"],unrelated:[]};
  }});
  assert.equal((await f.view()).waiting.length,1);assert.equal(f.provider.length,0);
  const v=await f.run();assert.equal(v.items.length,0);assert.equal(v.audit.length,1);assert.equal(v.audit[0].requestCount,10);
  assert.equal(v.audit[0].sourceId,"59");assert.equal(v.audit[0].evidence[0].quote,"dimensions passed");assert.deepEqual(f.api,[]);
});
test("unanswered paraphrases use the newest request, its thread and its edit time for the deadline",async t=>{
  let clock=start+5*DAY;
  const newer=message(33,3,"Could you share those three reports?");
  newer.modifiedAt=when(4);
  const f=await setup(t,{now:()=>clock,threads:[thread(22,newer),thread(21,message(31,0,"Please provide all three inspection records."))],
    classify:()=>({topics:[topic([33,31],[[33,"share those three reports"]])],nonRequests:[],unrelated:[]})});
  assert.deepEqual((await f.run()).items,[]);
  clock=start+7*DAY;
  const [item]=(await f.view()).items;assert.equal(item.discussionId,"22");assert.equal(item.sourceId,"33");assert.equal(item.topics[0].requestCount,2);
  assert.equal(item.due,when(7));assert.equal(f.provider.length,1);
});
test("partial answer from another discussion leaves only the purchasing question and its own recipient",async t=>{
  const text="@qa@example.test Please approve. @purchasing@example.test What is the vendor lead time?";
  const f=await setup(t,{threads:[thread(21,message(31,0,text)),thread(22,message(32,1,"Quality approves the drawing.",qa)),
    thread(23,message(33,2,"Updated the packing notes.",qa))],classify:()=>{
    const open=topic([31],[[31,"What is the vendor lead time?"],[32,"Quality approves"]],"open","Срок поставщика");
    open.question="Could you confirm the vendor lead time?";open.recipients=[purchasing];
    return {topics:[open,topic([31],[[32,"Quality approves the drawing."]],"resolved","Согласование Quality")],nonRequests:[],unrelated:["C33"]};
  }});
  const v=await f.run();assert.equal(v.items.length,1);assert.equal(v.audit.length,1);
  assert.match(v.items[0].draft,/@purchasing@example.test Could you confirm the vendor lead time/);
  assert.doesNotMatch(v.items[0].draft,/@qa|approv/i);assert.equal(v.items[0].sourceId,"31");
});
test("field updates can settle a topic; earlier or ambiguous evidence cannot become a sendable draft",async t=>{
  const f=await setup(t,{threads:[thread(21,message(30,0,"It was approved back then.",qa),message(31,3,"Please reapprove after the revision."))],
    classify:({data})=>{
      const update=data.fields.find(field=>field.label==="Comment/Updates");
      assert.ok(data.fields.some(field=>field.label==="Quality" && field.text.includes("Approved")));
      return {topics:[topic([31],[[30,"approved back then"]],"resolved"),topic([31],[[update.id,"QA approved revision C"]],"resolved")],nonRequests:[],unrelated:[]};
    }});
  const {APPROVALS}=await import("../src/smartsheet.js"), [, , status]=APPROVALS.find(a=>a[0]==="Quality");
  f.raw.columns.push({id:999,title:"Comment/Updates"});f.raw.rows[0].cells.push({columnId:999,value:"01/06 QA approved revision C"},{columnId:Number(status),value:"Approved"});
  f.persist();const v=await f.run();assert.equal(v.items.length,0);assert.deepEqual(v.audit.map(a=>a.status),["uncertain","resolved"]);
});
test("public queue is read only, confirmation is same-origin, text-bound, exactly once and persistent",async t=>{
  const f=await setup(t);assert.equal((await fetch(f.base+"/followups")).status,200);
  assert.equal((await f.post("analyze",{},"https://elsewhere.test")).status,403);
  assert.equal((await f.view()).items.length,0);assert.equal(f.provider.length,0);
  const [item]=(await f.run()).items;assert.equal((await (await fetch(f.base+"/api/state")).json()).followupCount,1);
  assert.equal((await f.act(item,"confirm",{},"https://elsewhere.test")).status,403);
  assert.equal((await f.act(item,"confirm",{text:"Something else"})).status,409);assert.deepEqual(f.api,[]);
  await Promise.all([f.act(item),f.act(item)]);
  assert.deepEqual(f.api.map(a=>a.method),["GET","GET","GET","POST"]);
  assert.equal(f.api.at(-1).path,"/discussions/21/comments");assert.deepEqual((await f.view()).items,[]);
  const nextStore=openStore(f.filename,SHEET_ID), next=createFollowups({config:f.cfg,store:nextStore,comments:f.comments,reader:f.reader,classify:()=>assert.fail("cached")});
  try {next.start();await next.idle();assert.deepEqual(next.list(nextStore.readRows()),[]);} finally{await next.close();nextStore.close();}
});
test("new independent reply without a row timestamp change blocks an already confirmed reminder before POST",async t=>{
  const f=await setup(t);const [item]=(await f.run()).items;
  f.threads.push(thread(25,message(32,4,"QA has approved this change.",qa)));
  const result=await (await f.act(item)).json();assert.equal(result.status,"rejected");
  assert.deepEqual(f.api.map(a=>a.method),["GET","GET","GET"]);assert.match(result.error,/изменилась/);
  f.persist();assert.equal((await f.view()).items.length,0);assert.equal((await f.act(item)).status,409);
});
test("target thread edit, live row edit or incomplete live discussion pages stop publication",async t=>{
  for (const type of ["thread","row","incomplete"]) await t.test(type,async s=>{
    const f=await setup(s,type==="incomplete"?{listResponse:()=>({pageNumber:1,totalPages:1,totalCount:10,data:[]})}:{});
    const [item]=(await f.run()).items;
    if(type==="thread") f.threads[0].comments.push(message(32,1,"Completed",qa));
    if(type==="row") f.raw.rows[0].modifiedAt=when(5);
    assert.equal((await (await f.act(item)).json()).status,"rejected");assert.ok(f.api.every(a=>a.method==="GET"));
    if (type !== "incomplete") {
      assert.equal((await f.view()).items.length,0);
      // Sync the new snapshot and get a fresh review before exposing a new confirmation.
      f.persist();
      if (type==="thread") return;
      await f.run();
    }
    const [retry]=(await f.view()).items;assert.notEqual(retry.operationId,item.operationId);
    assert.equal((await f.act(retry,"dismiss")).status,200);assert.deepEqual((await f.view()).items,[]);
  });
});
test("row-scoped preflight reads all pages including detached threads with omitted parent metadata",async t=>{
  const f=await setup(t,{listResponse:(page,threads)=>({pageNumber:page,totalPages:2,totalCount:2,data:[{...threads[page-1],parentType:undefined,parentId:undefined}]})});
  const [item]=(await f.run()).items;
  f.threads.push(thread(22,message(32,1,"QA approved.",qa)));assert.equal((await (await f.act(item)).json()).status,"rejected");
  assert.equal(f.api.filter(a=>a.path==="/rows/1000/discussions").length,3);assert.ok(f.api.every(a=>a.method==="GET"));
});
test("failed classification or a changed context never falls back to a stale or thread-local candidate",async t=>{
  let fail=false;
  const f=await setup(t,{classify:()=>{if(fail)throw new AiError(502,"OpenAI недоступен.");return basic();}});
  const first=await f.run();assert.equal(first.items.length,1);await f.run();assert.equal(f.provider.length,1);
  f.threads.push(thread(22,message(32,4,"We should review this separately.",qa)));f.persist();fail=true;
  assert.equal((await f.view()).items.length,0);
  assert.equal((await f.act(first.items[0])).status,409);const v=await f.run();
  assert.equal(v.waiting.length,1);assert.match(v.error,/OpenAI/);assert.deepEqual(v.items,[]);assert.deepEqual(f.api,[]);
});
test("on a mid-flight update, coalesced jobs discard stale results and never send",async t=>{
  let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const f=await setup(t,{classify:async()=>{entered();await gate;return basic();}});
  await f.post("analyze");await ready;await f.post("analyze");
  f.threads.push(thread(22,message(32,5,"I have approved it.",qa)));f.persist();release();await f.service.idle();
  const v=await f.view();assert.equal(f.provider.length,1);assert.equal(v.waiting.length,1);assert.deepEqual(v.items,[]);assert.deepEqual(f.api,[]);
});
test("auto mode is opt-in, respects pause and manual refresh failure is visible",async t=>{
  const f=await setup(t,{refresh:async()=>({ok:false})});f.service.start(false);await f.service.idle();assert.equal(f.provider.length,0);
  assert.match((await f.run()).error,/обновить снимок/);assert.equal(f.provider.length,0);
  f.cfg.followupAiAuto=true;f.store.setPaused(true);f.service.start(false);await f.service.idle();assert.equal(f.provider.length,0);
  f.store.setPaused(false);f.service.start(false);await f.service.idle();assert.equal(f.provider.length,1);
  f.service.start(false);await f.service.idle();assert.equal(f.provider.length,1);assert.equal(f.api.length,0);
});
test("missing key keeps eligible rows waiting and no historical snapshot leaves the queue",async t=>{
  const f=await setup(t,{config:{openaiKey:""}});assert.equal((await f.post("analyze")).status,409);
  const v=await f.view();assert.equal(v.configured,false);assert.equal(v.items.length,0);assert.equal(f.provider.length,0);
});
test("no data upload for terminal rows, someone else's requests, only automatic reminders, or oversized history",async t=>{
  const row=normalizeSheet(rawSheet()).rows[0], base=structuredClone(row);
  for(const [comment,overrides] of [[message(31,0,"Please approve.",qa),{}],[message(31,0,prefix+" for ECN 123."),{}],[message(31,0,"Please approve."),{status:"Complete and Closed"}]]) {
    Object.assign(row,base,overrides);row.discussions=normalizeDiscussions([thread(21,comment)]);
    assert.equal(buildHistory(row,config),null);
  }
  const f=await setup(t,{threads:[thread(21,message(31,0,"Please review."),message(35,1,"x".repeat(250000),qa))]});
  const v=await f.run();assert.equal(v.items.length,0);assert.match(v.waiting[0].reason,/целиком/);assert.equal(f.provider.length,0);
});
test("all owner comments must be accounted for; invented IDs, quotes, recipients or draft mentions are rejected",()=>{
  const row=normalizeSheet(rawSheet()).rows[0];row.discussions=normalizeDiscussions(initial());const {data}=buildHistory(row,config);
  for(const mutate of [r=>r.topics[0].requests=[],r=>r.nonRequests=["C31"],r=>r.topics=[],r=>r.topics[0].requests=["S"],
    r=>r.topics[0].evidence[0].id="C99",r=>r.topics[0].evidence[0].quote="made up evidence",r=>r.topics[0].recipients=[purchasing],
    r=>r.topics[0].question="@stranger please act now"]) {
    const r=basic();mutate(r);assert.throws(()=>verifyTopics(r,data),AiError);
  }
});
test("OpenAI adapter transmits all threads as data, strict output and store false; no tools, attachments or Smartsheet credential",async()=>{
  const row=normalizeSheet(rawSheet()).rows[0];row.discussions=normalizeDiscussions([...initial(),thread(22,message(32,3,"Approved independently",qa))]);
  const {data}=buildHistory(row,config);let calls=0;
  const output={topics:[topic([31],[[32,"Approved independently"]],"resolved")],nonRequests:[],unrelated:[]};
  const raw=await classifyHistory({data,config:{...config,token:"never-transmit-fixture"},signal:AbortSignal.timeout(1000),fetchImpl:async(url,opts)=>{
    calls++;assert.equal(url,"https://api.openai.com/v1/responses");
    const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.model,config.openaiModel);assert.equal(body.text.format.strict,true);
    assert.equal(body.tools,undefined);assert.equal(body.input[0].content.length,1);assert.deepEqual(JSON.parse(body.input[0].content[0].text),data);
    assert.ok(!opts.body.includes("never-transmit-fixture"));return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(output)}]}]});
  }});assert.equal(calls,1);assert.equal(verifyTopics(raw,data)[0].status,"resolved");
});
test("a detached incoming comment must be assessed even when the model proposes a plausible open reminder",()=>{
  const row=normalizeSheet(rawSheet()).rows[0];
  row.discussions=normalizeDiscussions([...initial(),thread(27,message(44,2,"The inspection records are available.",qa))]);
  const {data}=buildHistory(row,config);
  assert.throws(()=>verifyTopics(basic(),data),AiError);
  const r=basic();r.unrelated=["C44"];assert.equal(verifyTopics(r,data)[0].status,"open");
  r.topics[0].evidence.push({id:"C44",quote:"inspection records"});assert.throws(()=>verifyTopics(r,data),AiError);
});
test("a dated update predating a reopened question, Pending and a contact alone cannot prove resolution",()=>{
  const row=normalizeSheet(rawSheet()).rows[0];
  row.discussions=normalizeDiscussions([thread(21,message(31,10,"Can QA approve the changed drawing?"))]);
  row.fields.push({columnId:"123",title:"Comment/Updates",value:"01/02/2025 - QA approved the old drawing.\nReviewed earlier.\n01/16/2025 - QA approved revision C."});
  row.approvals=[{department:"Quality",available:true,status:"Pending",contacts:[{email:qa}]}];
  const {data}=buildHistory(row,config);
  const check=(id,quote)=>verifyTopics({topics:[topic([31],[[id,quote]],"resolved")],nonRequests:[],unrelated:[]},data)[0].status;
  assert.equal(check("U123.0","QA approved the old drawing."),"uncertain");
  assert.equal(check("U123.1","QA approved revision C."),"resolved");
  assert.equal(check("A0","Pending"),"uncertain");row.approvals[0].status="Approved";
  const changed=buildHistory(row,config);
  assert.notEqual(changed.basis,buildHistory({...row,approvals:[]},config).basis);
  const proof=quote=>verifyTopics({topics:[topic([31],[["A0",quote]],"resolved")],nonRequests:[],unrelated:[]},changed.data)[0].status;
  assert.equal(proof(qa),"uncertain");assert.equal(proof("Approved"),"resolved");
});
test("a shared response may settle two deliverables while a third independent one stays due",async t=>{
  const f=await setup(t,{threads:[thread(21,message(31,0,"Could you confirm the price?")),thread(22,message(32,1,"And the lead time?")),
    thread(23,message(33,1,"Where is the drawing for item X?")),thread(24,message(34,2,"Price is $10 and lead time is two weeks.",purchasing))],classify:()=>{
    const drawing=topic([33],[[33,"drawing for item X"]],"open","Чертёж");drawing.question="Could you share the drawing for item X?";
    return {topics:[topic([31],[[34,"Price is $10"]],"resolved","Цена"),topic([32],[[34,"lead time is two weeks"]],"resolved","Срок"),drawing],
      nonRequests:[],unrelated:[]};
  }});
  const v=await f.run();assert.equal(v.audit.length,2);assert.equal(v.items.length,1);assert.equal(v.items[0].discussionId,"23");
  assert.doesNotMatch(v.items[0].draft,/lead time|price/i);
});
test("an old request edited later never displaces a newer rephrasing as the reply destination",async t=>{
  const older=message(31,0,"Confirm the drawing revision.");older.modifiedAt=when(6);
  const f=await setup(t,{threads:[thread(20,older),thread(21,message(33,4,"Which revision should we use?"))],
    classify:()=>({topics:[topic([31,33],[[33,"Which revision"]])],nonRequests:[],unrelated:[]})});
  const [item]=(await f.run()).items;assert.equal(item.sourceId,"33");assert.equal(item.due,when(7));
});
test("a missing-text response can be grounded as uncertain and never generates a follow-up",async t=>{
  const f=await setup(t,{threads:[...initial(),thread(22,message(35,3,"",qa))],classify:()=>({
    topics:[topic([31],[[35,""]],"uncertain")],nonRequests:[],unrelated:[]})});
  const v=await f.run();assert.equal(v.items.length,0);assert.equal(v.audit[0].status,"uncertain");
});
test("one prior-version dismissal remains hidden after installing semantic matching and restarting",async t=>{
  const f=await setup(t);f.store.hideFollowup("31",email);
  const v=await f.run();assert.equal(v.items.length,0);assert.equal(f.provider.length,1);
  const nextStore=openStore(f.filename,SHEET_ID);
  try {
    const s=createFollowups({config:f.cfg,store:nextStore,comments:f.comments,reader:f.reader,classify:()=>assert.fail("cached")});
    assert.equal(s.overview(nextStore.readRows()).items.length,0);
    await s.close();
  } finally {nextStore.close();}
});
test("literal addressed reminders are locally collapsed even if the provider split them, including the newer due date",async t=>{
  const same="@qa@example.test Please approve drawing C.";
  const f=await setup(t,{threads:[thread(21,message(31,0,same)),thread(22,message(32,2,same))],classify:()=>({
    topics:[topic([31],[[31,"approve drawing C"]]),topic([32],[[32,"approve drawing C"]])],nonRequests:[],unrelated:[]})});
  const v=await f.run();assert.equal(v.items.length,1);assert.equal(v.items[0].sourceId,"32");assert.equal(v.items[0].due,when(5));
  assert.equal(v.items[0].topics[0].requestCount,2);
});

test("upgrade restyles both notification drafts from cache; an old confirmation cannot publish the replacement",async t=>{
  for (const [question,expected] of [
    ["Could you please confirm whether the customer notifications have been sent?","Did the customer notifications go out?"],
    ["Should the customer notification be issued now?","Should the customer notification go out now?"],
  ]) await t.test(expected,async s=>{
    const text="@qa@example.test Any update on the customer notification? @cc@example.test";
    const f=await setup(s,{threads:[thread(21,message(31,0,text))]});
    const row=f.store.row("1000"), ctx=buildHistory(row,f.cfg);
    const oldTopic={...topic([31],[[31,"Any update"]]),recipients:[qa],question};
    f.store.saveFollowupAnalysis(row.id,email,ctx.basis,verifyTopics({topics:[oldTopic],nonRequests:[],unrelated:[]},ctx.data));
    const [item]=(await f.view()).items;
    assert.equal(item.ecn,row.ecnNumber);
    assert.equal(item.draft,"@"+qa+" "+expected);
    assert.equal(f.provider.length,0);assert.deepEqual(f.api,[]);
    const formerText=prefix+" for ECN "+row.ecnNumber+". @"+qa+" "+question;
    const formerBasis=hash([ctx.basis,f.cfg.followupDays,item.sourceId,formerText]);
    assert.equal((await f.act(item,"confirm",{basis:formerBasis,text:formerText})).status,409);
    assert.deepEqual(f.sentTexts,[]);
    assert.equal((await (await f.act(item)).json()).status,"sent");
    assert.deepEqual(f.sentTexts,["@"+qa+" "+expected]);
    assert.equal(f.provider.length,0);
  });
});
test("addressing preserves separate requests, conditions, technical identifiers and references to other ECNs",async t=>{
  const text="@qa@example.test @purchasing@example.test Any update?";
  const f=await setup(t,{threads:[thread(21,message(31,0,text))],classify:({data})=>{
    const make=(question,recipients)=>({...topic([31],[[31,"Any update?"]]),question,recipients});
    return {topics:[make("Just following up on my earlier request for ECN "+data.ecn+". Could you please check drawing X-12 Rev C?",[qa]),
      make("Can you check linked ECN 20261120-02 before approval?",[qa]),
      make("Can you confirm 3,000 EA if the MOQ changes?",[purchasing])],nonRequests:[],unrelated:[]};
  }});
  const [item]=(await f.run()).items;
  assert.equal(item.draft,"@"+qa+" Can you check drawing X-12 Rev C? Can you check linked ECN 20261120-02 before approval?\n"+
    "@"+purchasing+" Can you confirm 3,000 EA if the MOQ changes?");
});
test("unaddressed draft asks the question directly and a conditional question keeps its qualification",async t=>{
  const question="Could you please confirm whether the customer notifications have been sent for lots P1 and P2 only?";
  const f=await setup(t,{threads:[thread(21,message(31,0,"Were both lots notified?"))],classify:()=>({
    topics:[{...topic([31],[[31,"both lots"]]),question}],nonRequests:[],unrelated:[]})});
  assert.equal((await f.run()).items[0].draft,"Can you confirm whether the customer notifications have been sent for lots P1 and P2 only?");
});
test("short sent reminders keep their identity after restart and editing; an identical human question remains eligible",async t=>{
  const f=await setup(t);const [item]=(await f.run()).items;
  assert.equal((await (await f.act(item)).json()).status,"sent");
  f.threads[0].comments.push(message(999,2,item.draft+" (edited)"),message(1001,3,item.draft),
    message(1002,4,"@qa@example.test "+prefix+" for ECN 20261117-01. Any update?"));
  f.persist();
  const nextStore=openStore(f.filename,SHEET_ID);
  const log=createCommentService({filename:f.filename,sheetId:SHEET_ID,store:nextStore,writer:{},refresh(){}});
  let checked=false;
  const next=createFollowups({config:f.cfg,store:nextStore,comments:log,reader:f.reader,classify:({data})=>{
    const marks=Object.fromEntries(data.comments.map(c=>[c.id,c.reminder]));
    assert.deepEqual(marks,{C31:false,C999:true,C1001:false,C1002:true});
    checked=true;
    return {topics:[topic([31,1001],[[1001,item.draft]])],nonRequests:[],unrelated:["C999","C1002"]};
  }});
  try{
    next.start();await next.idle();assert.equal(checked,true);
    const [draft]=next.list(nextStore.readRows());assert.equal(draft.sourceId,"1001");
    assert.equal(f.sentTexts.length,1);
  }finally{await next.close();await log.close();nextStore.close();}
});
test("lost POST receipt only marks a matching new comment by the owner in the same thread near dispatch",async t=>{
  const f=await setup(t,{replyResponse:()=>{throw Error("simulated connection loss");}});
  const [item]=(await f.run()).items;
  const stamp=Date.now(), at=(id,offset,author=email)=>({...message(id,0,item.draft,author),createdAt:new Date(stamp+offset).toISOString()});
  // The identical pre-existing manual request is present when the send intent is recorded.
  f.threads[0].comments.push(at(40,-20_000));f.persist();
  const ctx=buildHistory(f.store.row("1000"),f.cfg);
  const topicNow={...basic().topics[0],requests:["C31","C40"],evidence:[{id:"C40",quote:item.draft}]};
  f.store.saveFollowupAnalysis("1000",email,ctx.basis,verifyTopics({topics:[topicNow],nonRequests:[],unrelated:[]},ctx.data));
  // This recent source is below the usual deadline; use a simulated service clock for the test.
  const later=createFollowups({config:f.cfg,store:f.store,comments:f.comments,reader:f.reader,now:()=>stamp+5*DAY});
  try{
    const [due]=later.list(f.store.readRows());
    const result=await later.act("confirm",{...due,text:due.draft});assert.equal(result.status,"uncertain");
    f.threads[0].comments.push(at(41,0,qa),at(42,1000),at(43,3*DAY));
    f.threads.push(thread(30,at(44,2000)));f.persist();
    assert.deepEqual([...f.comments.followupIds(f.store.row("1000"),email)],["42"]);
  }finally{await later.close();}
});
