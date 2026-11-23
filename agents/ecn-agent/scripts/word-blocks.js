import { crc32, inflateRawSync } from "node:zlib";
import sax from "./vendor/sax.cjs";

// A DOCX is a ZIP. Read only its main XML part, without extracting to the filesystem.
function documentXml(zip) {
  const invalid = () => { throw new Error("Некорректный или неподдерживаемый DOCX. Сохрани документ в обычном формате Word .docx."); };
  let end = zip.length-22;
  for (; end >= Math.max(0,zip.length-65557); end--) {
    if (zip.readUInt32LE(end) === 0x06054b50 && end+22+zip.readUInt16LE(end+20) === zip.length) break;
  }
  if (end < Math.max(0,zip.length-65557) || zip.readUInt32LE(end+4) !== 0) invalid();
  const entries = zip.readUInt16LE(end+10);
  let offset = zip.readUInt32LE(end+16);
  const limit = offset+zip.readUInt32LE(end+12);
  if (limit > end || zip.readUInt16LE(end+8) !== entries) invalid();
  for (let i=0;i<entries;i++) {
    if (offset+46 > limit || zip.readUInt32LE(offset) !== 0x02014b50) invalid();
    const nameLength=zip.readUInt16LE(offset+28), nameStart=offset+46;
    const next=nameStart+nameLength+zip.readUInt16LE(offset+30)+zip.readUInt16LE(offset+32);
    if (next > limit) invalid();
    if (zip.toString("utf8",nameStart,nameStart+nameLength) === "word/document.xml") {
      const size=zip.readUInt32LE(offset+24), packed=zip.readUInt32LE(offset+20);
      const method=zip.readUInt16LE(offset+10), local=zip.readUInt32LE(offset+42);
      if ((zip.readUInt16LE(offset+8)&1) || ![0,8].includes(method) || !size || size > 12_000_000 ||
          local+30 > zip.length || zip.readUInt32LE(local)!==0x04034b50) invalid();
      const start=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28);
      if (start+packed>zip.length) invalid();
      const input=zip.subarray(start,start+packed);
      const xml=method===0 ? input : inflateRawSync(input,{maxOutputLength:12_000_000});
      if (xml.length!==size || crc32(xml)!==zip.readUInt32LE(offset+16)) invalid();
      return new TextDecoder("utf-8",{fatal:true}).decode(xml);
    }
    offset=next;
  }
  invalid();
}

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export function wordBlocks(bytes) {
  const blocks=[], stack=[];
  let table=null, row=null, cell=null, paragraph=null;
  const parser=sax.parser(true,{xmlns:true,strictEntities:true});
  parser.ondoctype=() => { throw new Error("DOCTYPE в исходном документе Word не поддерживается."); };
  parser.onopentag=node => {
    const parent=stack.at(-1);
    stack.push(node);
    if (node.uri!==word) return;
    const topLevel=parent?.uri===word && parent.local==="body";
    if (node.local==="tbl" && topLevel) table=node;
    else if (node.local==="tr" && table && parent===table) row={node,cells:[]};
    else if (node.local==="tc" && row && parent===row.node) cell={node,lines:[]};
    else if (node.local==="p" && !paragraph && (topLevel || cell)) paragraph={node,style:"",parts:[]};
    else if (paragraph && node.local==="pStyle") {
      paragraph.style=Object.values(node.attributes).find(a=>a.uri===word && a.local==="val")?.value || "";
    } else if (paragraph && ["tab","br","cr"].includes(node.local)) paragraph.parts.push(" ");
  };
  parser.ontext=parser.oncdata=text => {
    const node=stack.at(-1);
    if (paragraph && node?.uri===word && node.local==="t") paragraph.parts.push(text);
  };
  parser.onclosetag=() => {
    const node=stack.pop();
    if (paragraph && node===paragraph.node) {
      const text=paragraph.parts.join("").replace(/\s+/gu," ").trim();
      if (text && !/Contents|^TOC/i.test(paragraph.style)) {
        if (cell) cell.lines.push(text);
        else {
          const heading=/^(?:Heading|Заголовок)([1-6])$/iu.exec(paragraph.style);
          blocks.push({level:heading ? Number(heading[1]) : 0,text});
        }
      }
      paragraph=null;
    } else if (cell && node===cell.node) {row.cells.push(cell.lines.join(" / "));cell=null;}
    else if (row && node===row.node) {
      if (row.cells.some(Boolean)) blocks.push({level:0,text:row.cells.join(" | ")});
      row=null;
    } else if (node===table) table=null;
  };
  parser.write(documentXml(bytes)).close();
  return blocks;
}
