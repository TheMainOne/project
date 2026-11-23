import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { publish } from "../scripts/knowledge.js";
import { matrixBlocks } from "../scripts/approval-matrix.js";
import { loadKnowledge, selectKnowledge, emptyKnowledge } from "../src/ai/knowledge.js";

function knowledgeFixture(t) {
  const dir=mkdtempSync(join(tmpdir(),"test-ecn-rules-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,"sources");mkdirSync(source);
  const manifest=docs=>writeFileSync(join(source,"manifest.json"),JSON.stringify({documents:docs}));
  const doc={id:"process",title:"Engineering Procedures",revision:"1",kind:"procedure",file:"steps.md"};
  manifest([doc]);return {dir,source,manifest,doc};
}
test("publication is atomic, reproducible, versioned and reversible using the saved index",t=>{
  const {dir,source,manifest,doc}=knowledgeFixture(t);assert.equal(loadKnowledge(dir),emptyKnowledge);
  const file=join(source,doc.file);writeFileSync(file,"# Intro\nFirst procedure\n## Incoming inspection\nCheck incoming inspection in plant X.\n");
  const initial=publish(dir);assert.equal(publish(dir).version,initial.version);
  const active=readFileSync(join(dir,"active.json"));
  assert.equal(selectKnowledge(loadKnowledge(dir),"Incoming inspection")[0].heading,"Intro › Incoming inspection");
  manifest([{...doc,file:"missing.md"}]);assert.throws(()=>publish(dir));assert.equal(loadKnowledge(dir).version,initial.version);
  manifest([{...doc,revision:"2"}]);writeFileSync(file,"# Changed\nDifferent procedure");
  assert.notEqual(publish(dir).version,initial.version);writeFileSync(join(dir,"active.json"),active);
  assert.equal(loadKnowledge(dir).version,initial.version);
  writeFileSync(join(dir,"versions",initial.version+".json"),'{"format":1,"documents":[],"sections":[]}');assert.throws(()=>loadKnowledge(dir));
});
test("unlisted files stay private, Markdown link destinations stay local, manifest rejects path traversal and duplicate IDs",t=>{
  const {dir,source,manifest,doc}=knowledgeFixture(t);writeFileSync(join(source,doc.file),"# Title\nClaim [Evidence][ref]\n[ref]: https://private.test\n");
  writeFileSync(join(source,"draft.md"),"DRAFT-DO-NOT-PUBLISH");
  publish(dir);const k=loadKnowledge(dir);assert.doesNotMatch(JSON.stringify(k),/private\.test|DRAFT-DO-NOT-PUBLISH/);
  assert.deepEqual(selectKnowledge(k,"completelyunrelated"),[]);
  manifest([{...doc,file:"../secrets.md"}]);assert.throws(()=>publish(dir));manifest([doc,doc]);assert.throws(()=>publish(dir));
});
test("DOCX paragraphs, tables, Unicode and heading order survive offline publication",t=>{
  const {dir,source,manifest,doc}=knowledgeFixture(t);
  manifest([{...doc,file:"rule.docx"}]);writeFileSync(join(source,"rule.docx"),Buffer.from("UEsDBBQAAAAIAD12d11RuiZL6QAAAJUBAAARAAAAd29yZC9kb2N1bWVudC54bWx1kT1OAzEQha9ibUHJBAoKs1kJKugi5QSO1ySR/CfbxEmHItFRUXOIFCABUTjD+EY43iRIEJr3ZPl9ftZMHWlr+L0SOpC5ktrT2K8mIVgK4PlEKOZPjRU6390Zp1jIRzeGaFxrneHC+6keKwnnvd4FKDbVVVNHOjLtYuu2yMAVG4aFFCTSGZP96kawNpNnFTQ1HDJFQoPP6RG/8BU3WT8IfmbbpGV6yL5OT1sgFMx18KFqx1+RE6bsJbk+mgwjWawL898wvuAqLfEtt73jCtdH3oA995e+1d4KHv6HoGuG3T9gPyz4WUTzDVBLAQIUAxQAAAAIAD12d11RuiZL6QAAAJUBAAARAAAAAAAAAAAAAACAAQAAAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAQABAD8AAAAYAQAAAAA=","base64"));
  publish(dir);const k=loadKnowledge(dir);
  assert.equal(k.sections.length,1);assert.equal(k.sections[0].heading,"Входной контроль");
  assert.match(k.sections[0].text,/A & B/);assert.match(k.sections[0].text,/Материал \| Inspect/);
});
const matrix=[
  ["","Standard Operating Procedure - Annex","","","","",""],
  ["","Revision No.: 5","","","","",""],
  ["","Form No. DWKID-7206","","","","",""],
  ["","Engineering","","","Quality","",""],
  ["Type Of Change","Pre-Approval","Implementation Review","Completion Notification","Pre-Approval","Implementation Review","Completion Notification"],
  ['Quoted, "type"\nwith line break',"NO","YES","NO","YES","NO","YES"],
  ["DATE","","","","","",""],
  ["unrelated archive","","","","","",""],
];
function csv(delimiter, rows=matrix) {
  return rows.map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join(delimiter)).join("\r\n");
}
test("matrix CSV preserves Excel row, phase and department for both common export delimiters and reads no archive records",()=>{
  for(const delimiter of [",",";"]) {
    const blocks=matrixBlocks(csv(delimiter),"5");assert.equal(blocks.length,2);
    assert.match(blocks[0].text,/строка 6.*Quoted, "type" with line break/);
    assert.equal(blocks[1].text,"Pre-Approval: Quality\nImplementation Review: Engineering\nCompletion Notification: Quality");
  }
  assert.throws(()=>matrixBlocks(csv(","),"6"));const invalid=structuredClone(matrix);invalid[5][2]="TBD";assert.throws(()=>matrixBlocks(csv(",",invalid),"5"));
});

test("a damaged DOCX cannot replace the published knowledge and the prior original remains accessible",t=>{
  const {dir,source,manifest,doc}=knowledgeFixture(t);
  writeFileSync(join(source,doc.file),"# Reviewed procedure\nOriginal instruction.");
  const before=publish(dir);
  const original=loadKnowledge(dir).documents[0];
  writeFileSync(join(source,"damaged.docx"),Buffer.from([0x50,0x4b,0,0]));
  manifest([{...doc,file:"damaged.docx",revision:"2"}]);
  assert.throws(()=>publish(dir));
  assert.equal(loadKnowledge(dir).version,before.version);
  assert.equal(readFileSync(join(dir,"originals",original.sourceHash+".md"),"utf8"),"# Reviewed procedure\nOriginal instruction.");
});
