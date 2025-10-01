import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { MongoClient } from 'mongodb';
import OpenAI from '@openai/openai';
import { htmlToText } from 'html-to-text';
import cron from 'node-cron';


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// грузим .env из корня проекта (поднимемся на два уровня от services/web_crawler/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });


/* =====================
   Config
===================== */
const {
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_USER,
  ALLOWED_SENDERS, // comma-separated list
  MONGODB_URI,
  MONGODB_DB,
  OPENAI_API_KEY,
  CRON_SCHEDULE, // e.g. "*/2 * * * *" every 2 minutes
  LOOKBACK_DAYS = '7'
} = process.env;

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_USER) {
  console.error('Missing Gmail OAuth env vars. Please set GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/GMAIL_USER');
  process.exit(1);
}
if (!MONGODB_URI || !MONGODB_DB) {
  console.error('Missing MongoDB env vars. Please set MONGODB_URI and MONGODB_DB');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const allowedSenders = (ALLOWED_SENDERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/* =====================
   Gmail client (OAuth2)
===================== */
const oAuth2Client = new google.auth.OAuth2({
  clientId: GMAIL_CLIENT_ID,
  clientSecret: GMAIL_CLIENT_SECRET,
});
oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

/* =====================
   Mongo
===================== */
const mongoClient = new MongoClient(MONGODB_URI);
let db, materialsCol, documentsCol, processedEmailsCol;

/* =====================
   OpenAI (Responses API + Structured Output)
===================== */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const extractionSchema = {
  name: 'EmailExtraction',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: 'string', description: 'Short description of what the sender wants' },
      parts: {
        type: 'array',
        description: 'Unique part numbers requested or mentioned',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            partNumber: { type: 'string' },
            quantity: { type: 'string', description: 'If request includes quantities' },
            notes: { type: 'string' }
          },
          required: ['partNumber']
        }
      },
      regulations: {
        type: 'array',
        description: 'Requested/mentioned regulations or standards',
        items: { type: 'string' }
      },
      dueDate: { type: 'string', description: 'Any explicit deadline in ISO or human text if present' },
      attachmentsHint: { type: 'boolean', description: 'True if the email references attachments worth checking' }
    },
    required: ['intent', 'parts']
  }
};

async function extractWithOpenAI(rawText) {
  const sys = `You are Compliance Extractor. Extract DWK-style part numbers (alphanumeric + dashes), and a normalized list of regulations (e.g., REACH, RoHS, TSCA, PFAS, Prop 65, USP <660>, <87>, <88>, CMRT, IEC 62474, EUDR, BSE/TSE, Halal, etc.). Keep it concise.`;

  const resp = await openai.responses.create({
    model: 'gpt-5.1-mini',
    input: [
      { role: 'system', content: sys },
      { role: 'user', content: rawText }
    ],
    text_format: { type: 'json_schema', json_schema: extractionSchema }
  });

  // Responses API content helper
  const content = resp.output?.[0]?.content?.[0];
  if (content?.type === 'output_text') {
    return JSON.parse(content.text);
  }
  // Fallback: try whole output_text aggregation
  const text = OpenAI.getTextOutput(resp);
  return JSON.parse(text);
}

/* =====================
   Gmail Utilities
===================== */
function buildSearchQuery() {
  const parts = [
    'label:inbox',
    'is:unread',
    `newer_than:${LOOKBACK_DAYS}d`
  ];
  if (allowedSenders.length) {
    const froms = allowedSenders.map(e => `from:${e}`).join(' OR ');
    parts.push(`(${froms})`);
  }
  return parts.join(' ');
}

async function listUnreadMessages() {
  const q = buildSearchQuery();
  const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 10 });
  return res.data.messages || [];
}

function decodeBase64Url(data) {
  const buff = Buffer.from((data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buff.toString('utf8');
}

function findHeader(headers, name) {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractTextFromPayload(payload) {
  // Prefer text/plain; fallback to text/html; fallback to body.data
  const stack = [payload];
  let html = '', text = '';
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.mimeType === 'text/plain' && node.body?.data) {
      text += decodeBase64Url(node.body.data) + '\n';
    } else if (node.mimeType === 'text/html' && node.body?.data) {
      html += decodeBase64Url(node.body.data) + '\n';
    }
    (node.parts || []).forEach(p => stack.push(p));
  }
  if (!text && html) text = htmlToText(html, { wordwrap: 120 });
  if (!text && payload?.body?.data) text = decodeBase64Url(payload.body.data);
  return { text, html };
}

async function getMessage(id) {
  const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
  return res.data;
}

async function markAsRead(id) {
  await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } });
}

async function addLabel(id, labelName) {
  // Ensure label exists (create or get)
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  const existing = data.labels?.find(l => l.name === labelName);
  let labelId = existing?.id;
  if (!labelId) {
    const created = await gmail.users.labels.create({ userId: 'me', requestBody: { name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show' } });
    labelId = created.data.id;
  }
  await gmail.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds: [labelId] } });
}

async function sendReply({ threadId, subject, to, body }) {
  const messageParts = [];
  messageParts.push(`From: ${GMAIL_USER}`);
  messageParts.push(`To: ${to}`);
  messageParts.push(`Subject: Re: ${subject}`);
  messageParts.push('Content-Type: text/plain; charset="UTF-8"');
  messageParts.push('MIME-Version: 1.0');
  messageParts.push('');
  messageParts.push(body);
  const raw = Buffer.from(messageParts.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId } });
}

/* =====================
   Domain Logic
===================== */
function normalizeReg(name = '') {
  const s = name.toLowerCase();
  if (s.includes('reach')) return 'REACH';
  if (s.includes('rohs')) return 'RoHS';
  if (s.includes('tsca')) return 'TSCA';
  if (s.includes('pfas')) return 'PFAS';
  if (s.includes('prop')) return 'Prop 65';
  if (s.includes('iec 62474')) return 'IEC 62474';
  if (s.includes('cmrt') || s.includes('conflict mineral')) return 'CMRT';
  if (s.match(/\b660\b/)) return 'USP <660>';
  if (s.match(/\b87\b/)) return 'USP <87>';
  if (s.match(/\b88\b/)) return 'USP <88>';
  if (s.includes('eudr')) return 'EUDR';
  if (s.includes('bse') || s.includes('tse')) return 'BSE/TSE';
  return name;
}

async function fetchComplianceForParts(parts) {
  // Example Mongo shape assumptions:
  // materials: { partNumber, description, regulatoryCompliance: [{ name, status, lastUpdated, documents: [docId] }], supplier, ... }
  // documents: { _id, type, title, url, contentType, expiryDate, relatedParts: [partNumber], regulations: [name] }
  const pns = parts.map(p => p.partNumber);
  const uniquePNs = [...new Set(pns)];

  const materials = await materialsCol.find({ partNumber: { $in: uniquePNs } }).toArray();
  const byPN = new Map(materials.map(m => [m.partNumber, m]));

  const results = [];
  for (const pn of uniquePNs) {
    const m = byPN.get(pn);
    if (!m) {
      results.push({ partNumber: pn, found: false });
      continue;
    }
    const comp = (m.regulatoryCompliance || []).map(rc => ({
      name: normalizeReg(rc.name),
      status: rc.status,
      lastUpdated: rc.lastUpdated,
      documents: rc.documents || []
    }));
    // Fetch doc metadata if needed
    let docs = [];
    const docIds = comp.flatMap(c => c.documents).filter(Boolean);
    if (docIds.length) {
      docs = await documentsCol.find({ _id: { $in: docIds } }).project({ title: 1, url: 1, type: 1, expiryDate: 1, regulations: 1 }).toArray();
    }
    results.push({ partNumber: pn, found: true, description: m.description, supplier: m.supplier, compliance: comp, documents: docs });
  }
  return results;
}

function composeReplyBody({ sender, intent, parts, regulations, lookups, threadLink }) {
  const lines = [];
  lines.push(`Hi ${sender || ''},`);
  lines.push('');
  lines.push('Thanks for your request. Here is a quick summary:');
  lines.push(`• Intent: ${intent}`);
  if (regulations?.length) lines.push(`• Regulations mentioned: ${regulations.map(normalizeReg).join(', ')}`);
  lines.push('');
  lines.push('Part results:');
  for (const r of lookups) {
    if (!r.found) {
      lines.push(`- ${r.partNumber}: not found in our database.`);
      continue;
    }
    lines.push(`- ${r.partNumber} — ${r.description || ''}`);
    if (r.compliance?.length) {
      for (const c of r.compliance) {
        const status = c.status ? `: ${c.status}` : '';
        lines.push(`   · ${c.name}${status}${c.lastUpdated ? ` (updated ${new Date(c.lastUpdated).toISOString().slice(0,10)})` : ''}`);
      }
    } else {
      lines.push('   · No compliance records on file.');
    }
    if (r.documents?.length) {
      lines.push('   · Documents:');
      for (const d of r.documents) {
        lines.push(`     - ${d.type || 'Doc'}: ${d.title || d.url || d._id}${d.expiryDate ? ` (exp. ${new Date(d.expiryDate).toISOString().slice(0,10)})` : ''}`);
      }
    }
  }
  lines.push('');
  lines.push('If you need formal statements or additional documents, let me know the exact part list and regulations to cover.');
  if (threadLink) {
    lines.push('');
    lines.push(`(ref. ${threadLink})`);
  }
  lines.push('');
  lines.push('Best regards,');
  lines.push('DWK Compliance');
  return lines.join('\n');
}

/* =====================
   Processing pipeline
===================== */
async function processOneMessage(msg) {
  const full = await getMessage(msg.id);
  const headers = full.payload?.headers || [];
  const subject = findHeader(headers, 'Subject') || '(no subject)';
  const from = findHeader(headers, 'From');
  const to = findHeader(headers, 'Reply-To') || findHeader(headers, 'To');
  const threadId = full.threadId;
  const fromEmail = (from.match(/<([^>]+)>/)?.[1] || from).toLowerCase();

  if (allowedSenders.length && !allowedSenders.some(a => fromEmail.includes(a))) {
    // Not an allowed sender — mark read and label skip
    await markAsRead(msg.id);
    await addLabel(msg.id, 'AutoSkip: NotAllowedSender');
    return { skipped: true, reason: 'sender not allowed' };
  }

  const { text } = extractTextFromPayload(full.payload || {});
  if (!text?.trim()) {
    await addLabel(msg.id, 'AutoSkip: Empty');
    return { skipped: true, reason: 'empty body' };
  }

  // Ask OpenAI to extract structured info
  let extraction;
  try {
    extraction = await extractWithOpenAI(text);
  } catch (e) {
    console.error('OpenAI extraction failed:', e?.message);
    await addLabel(msg.id, 'AutoError: OpenAI');
    return { skipped: true, reason: 'openai error' };
  }

  const parts = (extraction.parts || []).map(p => ({ partNumber: (p.partNumber || '').trim() })).filter(p => p.partNumber);
  const regulations = (extraction.regulations || []).map(normalizeReg);

  // Query Mongo for compliance
  const lookups = await fetchComplianceForParts(parts);

  // Prepare reply
  const replyBody = composeReplyBody({
    sender: fromEmail.split('@')[0],
    intent: extraction.intent,
    parts,
    regulations,
    lookups,
    threadLink: `thread:${threadId}`
  });

  // Send reply back to original sender (respect Reply-To if present)
  await sendReply({ threadId, subject, to: fromEmail, body: replyBody });

  await markAsRead(msg.id);
  await addLabel(msg.id, 'AutoReplied: ComplianceBot');

  // Record processed
  await processedEmailsCol.updateOne({ messageId: msg.id }, { $set: { messageId: msg.id, processedAt: new Date(), from: fromEmail, subject } }, { upsert: true });

  return { replied: true };
}

async function tick() {
  const msgs = await listUnreadMessages();
  for (const m of msgs) {
    // idempotency: skip if seen
    const seen = await processedEmailsCol.findOne({ messageId: m.id });
    if (seen) continue;
    try {
      await processOneMessage(m);
    } catch (e) {
      console.error('Processing error:', e);
      try { await addLabel(m.id, 'AutoError: Pipeline'); } catch {}
    }
  }
}

/* =====================
   Bootstrap
===================== */
async function main() {
  await mongoClient.connect();
  db = mongoClient.db(MONGODB_DB);
  materialsCol = db.collection('materials');
  documentsCol = db.collection('documents');
  processedEmailsCol = db.collection('processedEmails');

  console.log('Connected to Mongo. Starting scheduler...');
  const schedule = CRON_SCHEDULE || '*/5 * * * *'; // every 5 minutes by default
  cron.schedule(schedule, () => {
    console.log(`[${new Date().toISOString()}] Gmail tick...`);
    tick().catch(err => console.error('Tick failed:', err));
  });

  // Optional: run once at start
  await tick();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

