import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createSmartsheetReader, normalizeDiscussions, SmartsheetError } from '../src/smartsheet.js';
import { openStore } from '../src/store.js';
import { createMonitor } from '../src/monitor.js';
import { SHEET_ID, rawSheet, normalizedSheet } from './fixtures.js';

const comment = (id = 9001, text = 'Original comment') => ({ id, discussionId: 5001, text, createdAt: '2026-11-17T14:00:00Z', modifiedAt: '2026-11-17T14:00:00Z', createdBy: {name: 'Test Author', email: 'test@example.invalid'} });
const thread = (comments = [comment()]) => ({id: 5001, parentId: 1000, parentType: 'ROW', title: 'Thread', commentCount: comments.length, comments});
const page = (data = []) => ({pageNumber: 1, pageSize: 100, totalPages: data.length ? 1 : 0, totalCount: data.length, data});
function fullSheet(threads = [thread()]) {
  const sheet = normalizedSheet();
  sheet.rows[0].discussions = normalizeDiscussions(threads);
  sheet.commentsLoaded = true;
  return sheet;
}
function fixture(t) {
  const path = mkdtempSync(join(tmpdir(), 'ecn-comments-'));
  t.after(() => rmSync(path, {recursive:true, force:true}));
  return join(path, 'ecn.sqlite');
}
const wrapped = handler => createSmartsheetReader({sheetId:SHEET_ID, token:'synthetic-secret', fetchImpl: async (url,options) => {
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  return url.pathname.endsWith('/discussions') ? handler(url) : Response.json(rawSheet());
}});

test('reads all row threads and replies, keeps authors/dates and separates sheet discussions', async () => {
  const general = {...thread([{...comment(9999),discussionId:5002}]),id:5002,parentType:'SHEET',parentId:Number(SHEET_ID)};
  const result = await wrapped(url => {
    assert.equal(url.searchParams.get('include'),'comments');
    return Response.json(page([thread([comment(), comment(9002,'Reply')]),general]));
  }).read();
  assert.equal(result.rows[0].discussions.length,1);
  assert.equal(result.rows[0].discussions[0].comments[1].text,'Reply');
  assert.equal(result.rows[0].discussions[0].comments[0].author.email,'test@example.invalid');
  assert.equal(result.sheetDiscussionCount,1);
  assert.equal(result.commentsLoaded,true);
});

test('polls comments on every cycle even if row timestamps and sheet version stay unchanged', async () => {
  let calls = 0;
  const reader = wrapped(() => Response.json(page([thread([comment(9001, 'Revision ' + ++calls)])])));
  const first = await reader.read(); const next = await reader.read();
  assert.equal(first.version,next.version);
  assert.equal(first.rows[0].modifiedAt,next.rows[0].modifiedAt);
  assert.notEqual(first.rows[0].discussions[0].comments[0].text,next.rows[0].discussions[0].comments[0].text);
});

test('fetches discussion pages and verifies the first page again', async () => {
  const calls=[];
  const reader = wrapped(url => {
    const number=Number(url.searchParams.get('page'));calls.push(number);
    const second={...thread([{...comment(9002),discussionId:5002}]),id:5002};
    return Response.json({pageNumber:number,totalPages:2,totalCount:2,data:number===1?[thread()]:[second]});
  });
  const result=await reader.read();
  assert.deepEqual(calls,[1,2,1]);
  assert.equal(result.rows[0].discussions.length,2);
});

test('rejects missing comments, duplicate threads, incomplete bodies and a changed page', async () => {
  const missing={...thread()};delete missing.comments;
  await assert.rejects(wrapped(()=>Response.json(page([missing]))).read(),{code:'incomplete_comments'});
  await assert.rejects(wrapped(()=>Response.json(page([thread(),thread()]))).read(),{code:'incomplete_comments'});
  await assert.rejects(wrapped(()=>Response.json(page([{...thread(),commentCount:9}]))).read(),{code:'incomplete_comments'});
  await assert.rejects(wrapped(url=>Response.json({pageNumber:Number(url.searchParams.get('page')),totalPages:2,totalCount:url.searchParams.get('page')==='1'?2:3,data:[thread()]})).read(),{code:'comments_changed'});
  let count=0;
  await assert.rejects(wrapped(url=>{
    count+=1;const n=Number(url.searchParams.get('page'));
    return Response.json({pageNumber:n,totalPages:2,totalCount:2,data:[n===2?{...thread([{...comment(9002),discussionId:5002}]),id:5002}:thread([comment(9001,count===3?'Changed':'Original')])]});
  }).read(),{code:'comments_changed'});
});

test('rejects duplicate comment ids and orphan row discussions', async () => {
  assert.throws(()=>normalizeDiscussions([thread([comment(),comment()])]),{code:'incomplete_comments'});
  await assert.rejects(wrapped(()=>Response.json(page([{...thread(),parentId:2000}]))).read(),{code:'sheet_changed'});
});

test('a comments endpoint error is safe and never treated as an empty conversation', async () => {
  await assert.rejects(wrapped(()=>new Response('synthetic-secret',{status:403})).read(),error=>error.code==='http_403'&&!error.message.includes('synthetic-secret'));
});

test('upgrade keeps legacy rows and journal; first comments import is a baseline', t => {
  const path=fixture(t);
  // Create the actual v0.1 table layout, with one stored snapshot and its original digest.
  const old=normalizedSheet().rows[0];const {rowNumber,modifiedAt,...content}=old;
  const db=new DatabaseSync(path);
  db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE rows(id TEXT PRIMARY KEY,hash TEXT NOT NULL,snapshot TEXT NOT NULL); CREATE TABLE events(id INTEGER PRIMARY KEY,at TEXT NOT NULL,kind TEXT NOT NULL,row_id TEXT,message TEXT NOT NULL); CREATE TABLE runs(id INTEGER PRIMARY KEY,started_at TEXT NOT NULL,finished_at TEXT,status TEXT NOT NULL,detail TEXT);');
  db.prepare('INSERT INTO meta VALUES (?,?)').run('sheetId',JSON.stringify(SHEET_ID));
  db.prepare('INSERT INTO meta VALUES (?,?)').run('lastSyncAt',JSON.stringify('2026-11-17T12:00:00Z'));
  db.prepare('INSERT INTO rows VALUES (?,?,?)').run(old.id,createHash('sha256').update(JSON.stringify(content)).digest('hex'),JSON.stringify(old));
  db.prepare('INSERT INTO events VALUES (1,?,?,NULL,?)').run('2026-11-17T12:00:00Z','baseline','Existing event');db.close();
  const store=openStore(path,SHEET_ID);
  assert.equal(store.row('1000').commentsLoaded,false);
  store.saveSheet(fullSheet(),store.beginRun());
  assert.equal(store.row('1000').commentCount,1);
  assert.equal(store.row('1000').unreadCommentCount,0);
  assert.equal(store.state().events.filter(x=>x.kind==='row_changed').length,0);
  assert.equal(store.state().events.filter(x=>x.kind==='comment_added').length,0);
  assert.ok(store.state().events.some(x=>x.message==='Existing event'));
  store.close();
});

test('tracks added, edited and removed comments once and persists unread state across restart', t => {
  const path=fixture(t);let store=openStore(path,SHEET_ID);
  const initial=fullSheet();store.saveSheet(initial,store.beginRun());
  const next=fullSheet([thread([comment(),comment(9002,'A reply')])]);
  store.saveSheet(next,store.beginRun());store.saveSheet(next,store.beginRun());
  assert.equal(store.row('1000').unreadCommentCount,1);
  assert.equal(store.state().events.filter(x=>x.kind==='comment_added').length,1);
  store.close();store=openStore(path,SHEET_ID);
  assert.equal(store.state().counts.unreadComments,1);
  const shown=store.row('1000');
  assert.equal(store.markCommentsSeen('1000',shown.commentsRevision),'ok');
  assert.equal(store.state().counts.unreadComments,0);
  const edited=structuredClone(next);edited.rows[0].discussions[0].comments[0].text='Changed';
  store.saveSheet(edited,store.beginRun());
  assert.equal(store.row('1000').unreadCommentCount,1);
  assert.equal(store.markCommentsSeen('1000',shown.commentsRevision),'stale');
  assert.equal(store.row('1000').unreadCommentCount,1);
  edited.rows[0].discussions[0].comments.shift();
  store.saveSheet(edited,store.beginRun());
  assert.equal(store.row('1000').commentCount,1);
  assert.ok(store.state().events.some(x=>x.kind==='comment_removed'));
  assert.equal(store.state().events.filter(x=>x.kind==='row_changed').length,0);
  store.close();
});

test('a failed comments sync retains both the previous row and comment snapshot', async t => {
  const store=openStore(fixture(t),SHEET_ID);store.saveSheet(fullSheet(),store.beginRun());
  const last=store.state().lastSyncAt;
  const monitor=createMonitor({reader:{read:async()=>{throw new SmartsheetError('incomplete_comments','Incomplete comments');}},store,pollSeconds:120,tokenConfigured:true});
  const result=await monitor.sync();await monitor.stop();
  assert.equal(result.ok,false);
  assert.equal(store.state().lastSyncAt,last);
  assert.equal(store.row('1000').discussions[0].comments[0].text,'Original comment');
  store.close();
});

test('row disappearance clears current comments and views without deleting journal', t => {
  const store=openStore(fixture(t),SHEET_ID);store.saveSheet(fullSheet(),store.beginRun());
  const sheet=fullSheet();sheet.rows=[];store.saveSheet(sheet,store.beginRun());
  assert.equal(store.row('1000'),null);
  assert.equal(store.state().counts.comments,0);
  assert.equal(store.markCommentsSeen('1000','x'),'missing');
  assert.ok(store.state().events.some(x=>x.kind==='row_removed'));store.close();
});
