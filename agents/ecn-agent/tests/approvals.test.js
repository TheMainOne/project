import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,writeFileSync,mkdirSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rawSheet,SHEET_ID } from "./fixtures.js";
import { APPROVALS,FIELDS,normalizeSheet } from "../src/smartsheet.js";
import { createWriteQueue } from "../src/comment-service.js";
import { approvalApi,createApprovals,destination,recommend } from "../src/approvals.js";
import { digest } from "../src/ai/knowledge.js";

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),"approval-"));
  const kb={format:1,documents:[],sections:[]}, version=digest(kb);
  mkdirSync(join(dir,"versions"));writeFileSync(join(dir,"versions",version+".json"),JSON.stringify(kb));
  writeFileSync(join(dir,"active.json"),JSON.stringify({version}));
  const config={databasePath:join(dir,"test.sqlite"),knowledgeDirectory:dir,token:"fake",openaiKey:"fake",sheetId:SHEET_ID,openaiModel:"test"};
  const raw=rawSheet();
  for (const [,id] of APPROVALS) Object.assign(raw.columns.find(c=>String(c.id)===id),{type:"CONTACT_LIST",validation:true,
    contactOptions:[{email:"first@example.com",name:"First"},{email:"second@example.com",name:"Second"}]});
  raw.columns.find(c=>String(c.id)===FIELDS.status).options=["Initial Review",destination];
  raw.rows[0].cells.push({columnId:Number(APPROVALS[0][1]),value:"first@example.com"});
  const local=normalizeSheet(raw);
  const store={row:()=>local.rows[0],readRows:()=>local.rows,getMeta:()=>local,addEvent(){}};
  const calls=[], analyses=[];
  const api={async read(){ const s=normalizeSheet(raw);return {row:s.rows[0],columns:s.columns,raw:{...raw.rows[0],columns:raw.columns}}; },
    async put(id,cells) { calls.push(cells);
      for (const cell of cells) {const prev=raw.rows[0].cells.find(c=>c.columnId===cell.columnId);if(prev) Object.assign(prev,cell);else raw.rows[0].cells.push(cell);}
    }};
  const ledger={assignments:()=>[{rowId:"1000",number:local.rows[0].ecnNumber,state:"assigned"}]};
  const args={config,store,ledger,api,reader:{readRowDiscussions:async()=>[]},runExclusive:createWriteQueue(),refresh:async()=>{},
    analyze:async({row})=>{analyses.push(row.id);return {choices:[{department:"Engineering",email:"first@example.com",reason:"rule"}],note:""};}};
  let service=createApprovals(args);
  t.after(async()=>{await service.close();rmSync(dir,{recursive:true,force:true});});
  return {get service(){return service;},raw,calls,analyses,api,args,async restart(){await service.close();service=createApprovals(args);},
    input(){const state=service.detail("1000");return {basis:state.basis,contacts:state.groups.map(g=>({department:g.department,email:g.department==="Engineering"?"second@example.com":""}))};}};
}
test("numbered Initial Review gets a cached suggestion, confirmation alone writes the edited contacts and status",async t=>{
  const f=fixture(t); f.service.start();
  await f.service.generate("1000",true);
  assert.equal(f.service.detail("1000").plan.choices[0].email,"first@example.com");
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.analyses,["1000"]);
  await f.restart(); await f.service.generate("1000",false);assert.equal(f.analyses.length,1);
  const results=await Promise.allSettled([f.service.confirm("1000",f.input()),f.service.confirm("1000",f.input())]);
  assert.equal(results[0].value.state,"sent"); assert.equal(results[1].status,"rejected");
  assert.deepEqual(f.calls,[[{columnId:Number(FIELDS.status),value:destination,strict:true},
    {columnId:Number(APPROVALS[0][1]),value:null,strict:true},{columnId:Number(APPROVALS[1][1]),value:"second@example.com",strict:true}]]);
});
test("foreign addresses, an empty list and changed source data cannot dispatch",async t=>{
  const f=fixture(t); const input=f.input();
  input.contacts[1].email="bad@example.com";await assert.rejects(f.service.confirm("1000",input),{status:400});
  input.contacts[1].email="";await assert.rejects(f.service.confirm("1000",input),{status:400});
  f.raw.rows[0].cells.find(c=>String(c.columnId)===FIELDS.description).value="changed";
  await assert.rejects(f.service.confirm("1000",f.input()),{status:409});assert.equal(f.calls.length,0);
});
test("lost response is read back without resending, ambiguous uncommitted writes survive restart",async t=>{
  const f=fixture(t);const real=f.api.put;
  f.api.put=async()=>{throw Error("lost");};const input=f.input();
  await assert.rejects(f.service.confirm("1000",input),{status:409});
  await f.restart();assert.equal(f.service.list()[0].unconfirmed,true);
  await assert.rejects(f.service.confirm("1000",input),{status:409});
  await f.service.reopen("1000");
  f.api.put=async(...args)=>{await real(...args);throw Error("lost");};
  assert.equal((await f.service.confirm("1000",input)).state,"sent"); assert.equal(f.calls.length,1);
});
test("approval writer uses one update against the configured sheet",async()=>{
  const calls=[];const api=approvalApi({sheetId:SHEET_ID,token:"fake"},async(url,opts)=>{
    calls.push([url,opts.method,JSON.parse(opts.body)]);return Response.json({resultCode:0});});
  const cells=[{columnId:Number(FIELDS.status),value:destination,strict:true}];
  await api.put("1000",cells);assert.deepEqual(calls,[["https://api.smartsheet.com/2.0/sheets/"+SHEET_ID+"/rows","PUT",[{id:1000,cells}]]]);
});

test("recommendations must cite a real rule and ECN field and choose an actual department contact",async t=>{
  const f=fixture(t), row=f.args.store.row("1000"), groups=f.service.detail("1000").groups;
  const kb={version:"v",documents:[{id:"procedure",kind:"procedure",title:"Procedure",revision:"A"}],
    sections:[{id:"kb:procedure:1",document:"procedure",heading:"Synthetic sample",text:"Synthetic sample requires Engineering pre-approval."}]};
  const choice={department:"Engineering",email:"first@example.com",rule:"kb:procedure:1",field:"field:"+FIELDS.itemDescription,reason:"Проверка изменения."};
  const run=()=>recommend({row,groups,kb,config:f.args.config,history:[],signal:new AbortController().signal,
    fetchImpl:async(_url,opts)=>{
      const props=JSON.parse(opts.body).text.format.schema.properties.choices.items.properties;
      assert.ok(props.field.enum.includes("field:"+FIELDS.itemDescription));
      assert.deepEqual(props.rule.enum,["kb:procedure:1"]);
      const engineering=props.recipient.anyOf.find(r=>r.properties.department.enum.includes("Engineering"));
      assert.ok(engineering.properties.email.enum.includes("first@example.com"));
      assert.ok(!engineering.properties.email.enum.includes("invented@example.com"));
      const {department,email,...finding}=choice;
      const item={...finding,recipient:{department,email}};
      return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({choices:[item,item],note:""})}]}]});
    }});
  assert.equal((await run()).choices[0].email,choice.email);
  choice.email="invented@example.com";await assert.rejects(run(),{status:502});
  choice.email="";choice.rule="kb:missing";await assert.rejects(run(),{status:502});
});
