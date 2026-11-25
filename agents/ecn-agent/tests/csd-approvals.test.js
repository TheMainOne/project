import test from "node:test";
import assert from "node:assert/strict";
import { csdProposal, isSimpleCsd } from "../src/csd-approvals.js";

const applicant = {id:"100",ecnNumber:"20261125-02",ecnType:"Change",itemNumber:"1008051",site:"",
  fields:[{title:"Customer",value:"Example"}],description:"Using the attached print please create a CSD of this item.",approvals:[]};
const groups = [{department:"Engineering",options:[{email:"a@example.com"},{email:"b@example.com"}]}];
const precedent = { ...applicant,id:"101",ecnNumber:"20261109-03",site:"0071",
  approvals:[{department:"Engineering",status:"Approved",contacts:[{email:"a@example.com"}]}]};

test("simple CSD with missing site suggests only Engineering and a verified contact for the same item/customer",()=>{
  const plan=csdProposal(applicant,groups,[applicant,precedent]);
  assert.deepEqual(plan.choices.map(({department,email})=>[department,email]),[["Engineering","a@example.com"]]);
  assert.match(plan.choices[0].source,/20261109-03/);
  assert.ok(isSimpleCsd({...applicant,description:"Print request 212824. Using the BOM print, please create a CSD for this item."}));
});

test("absent, conflicting, stale or mismatched precedents leave Engineering selected without a guessed person",()=>{
  const second={...precedent,id:"102",approvals:[{department:"Engineering",status:"Approved",contacts:[{email:"b@example.com"}]}]};
  for (const rows of [[],[precedent,second],[{...precedent,itemNumber:"777"}],[{...precedent,fields:[]}],
    [{...precedent,approvals:[{department:"Engineering",status:"Approved",contacts:[{email:"retired@example.com"}]}]}]]) {
    const plan=csdProposal(applicant,groups,rows);
    assert.equal(plan.choices[0].department,"Engineering");
    assert.equal(plan.choices[0].email,"");
  }
  assert.equal(csdProposal({...applicant,site:"1501"},groups,[precedent]).choices[0].email,"");
});

test("mixed changes, supplemental notes and preassigned departments retain normal review",()=>{
  for (const extra of [{description:"Using the attached print please create a CSD of this item and update its BOM."},
    {description:"Do not create a CSD of this item."},{description:"Update the MFD, create a CSD, and revise PGS."},
    {ecnType:"New"},{discussions:[{comments:[{text:"Also change the packaging specification."}]}]},
    {fields:[{title:"Comment/Updates",value:"Additional changes requested."}]},
    {approvals:[{department:"Quality",contacts:[{email:"q@example.com"}]}]}]) {
    assert.equal(csdProposal({...applicant,...extra},groups,[precedent]),null);
  }
});
