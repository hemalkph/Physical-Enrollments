import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { GET, POST } from './api/enrollment.js';
import { cardParts, sendEnrollment, MAX_SIZE, PART_SIZE } from './src/upload.js';
await import('./apps-script/check.cjs');

const rows = [['Submitted at', 'Student name', 'Student index', 'Batch', 'Physical center', 'Enrollment month', 'LMS card status', 'Uploaded image']];
const files = new Map(), sessions = new Map();
const props = { SPREADSHEET_ID: 'sheet', UPLOAD_FOLDER_ID: 'folder', VERCEL_API_SECRET: 'a-test-secret-that-is-more-than-32-characters' };
const chain = { requireValueInList() { return this; }, setAllowInvalid() { return this; }, setHelpText() { return this; }, build() { return this; } };
const sheet = {
  getLastRow: () => rows.length,
  getRange: (row, col, height = 1, width = 1) => ({
    getDisplayValue: () => rows[row - 1]?.[col - 1] || '',
    getDisplayValues: () => rows.slice(row - 1, row - 1 + height).map(values => values.slice(col - 1, col - 1 + width).map(String)),
    setNumberFormat() {}, setDataValidation() {},
    setValues: values => values.forEach((values, offset) => {
      rows[row - 1 + offset] ||= [];
      values.forEach((value, i) => { rows[row - 1 + offset][col - 1 + i] = value; });
    })
  })
};
const list = values => ({ getLastRow: () => values.length + 1, getRange: () => ({ getDisplayValues: () => values.map(value => [value]) }) });
const book = { getSheetByName: name => ({ Enrollments: sheet, Batches: list(['2027 A/L']), Centers: list(['Main center']) })[name] };
const newBlob = (bytes, type, name) => ({
  getBytes: () => Array.from(bytes), getContentType: () => type, getName: () => name,
  setName(value) { name = value; return this; }
});
const folder = {
  createFile(blob) {
    const id = crypto.randomUUID();
    const file = { getId: () => id, getBlob: () => blob, getUrl: () => 'https://drive.google.com/file/d/' + id,
      getName: () => blob.getName(), getDateCreated: () => new Date(), trashed: false,
      setTrashed(value) { this.trashed = value; } };
    files.set(id, file); return file;
  }
};
const context = vm.createContext({
  console, Date,
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key] }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
  SpreadsheetApp: { openById: () => book, newDataValidation: () => chain, flush() {} },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  DriveApp: { getFolderById: () => folder, getFileById: id => files.get(id) },
  CacheService: { getScriptCache: () => ({ get: key => sessions.get(key), put: (key, value) => sessions.set(key, value), remove: key => sessions.delete(key) }) },
  Utilities: { base64Decode: value => Array.from(Buffer.from(value, 'base64')), newBlob, getUuid: () => crypto.randomUUID() }
});
vm.runInContext(fs.readFileSync(new URL('./apps-script/Code.gs', import.meta.url), 'utf8'), context);
vm.runInContext(fs.readFileSync(new URL('./apps-script/Bridge.gs', import.meta.url), 'utf8'), context);
const bridge = payload => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text);
assert.equal(bridge({ action: 'options', secret: 'wrong' }).ok, false);
assert.equal(files.size, 0);
process.env.APPS_SCRIPT_SECRET = props.VERCEL_API_SECRET;
process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/test/exec';
const originalFetch = globalThis.fetch;
const bodies = [];
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('https://script.google.com/')) {
    bodies.push(options.body);
    assert.equal(options.redirect, 'follow');
    return Response.json(bridge(JSON.parse(options.body)));
  }
  assert.equal(url, '/api/enrollment');
  return options ? POST(new Request('https://enrollment.example/api/enrollment', {
    ...options, headers: { ...options.headers, Origin: 'https://enrollment.example' }
  })) : GET();
};
globalThis.FileReader = class {
  async readAsDataURL(blob) {
    this.result = 'data:application/octet-stream;base64,' + Buffer.from(await blob.arrayBuffer()).toString('base64');
    this.onload();
  }
};
const details = { name: '=Formula student', index: 'test001', batch: '2027 A/L', center: 'Main center', month: '2026-10' };
const jpeg = size => { const bytes = Buffer.alloc(size); bytes.set([255, 216, 255]); return new File([bytes], 'card.jpg', { type: 'image/jpeg' }); };
try {
  assert.deepEqual((await (await GET()).json()).batches, ['2027 A/L']);
  assert.equal((await POST(new Request('https://enrollment.example/api/enrollment', { method: 'POST', headers: { Origin: 'https://wrong.example', 'Content-Type': 'application/json' }, body: '{}' }))).status, 403);
  assert.equal((await POST(new Request('https://enrollment.example/api/enrollment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'admin' }) }))).status, 400);
  assert.throws(() => cardParts(jpeg(MAX_SIZE + 1)), /5 MB/);
  assert.equal(cardParts(jpeg(PART_SIZE)).length, 1);
  await assert.rejects(sendEnrollment(details, new File(['wrong bytes'], 'card.jpg', { type: 'image/jpeg' }), () => {}), /Choose a JPG/);
  assert.equal(files.size, 0);
  const result = await sendEnrollment(details, jpeg(100), () => {});
  assert.match(result.message, /saved/);
  assert.equal(rows[1][1], "'=Formula student");
  assert.equal(rows[1][2], 'TEST001');
  assert.equal(rows[1][6], 'Pending');
  assert.match(rows[1][7], /drive.google.com/);
  await assert.rejects(sendEnrollment(details, jpeg(100), () => {}), /already exists/);
  assert.equal(files.size, 1);
  const large = await sendEnrollment({ ...details, index: 'test002' }, jpeg(MAX_SIZE), () => {});
  assert.match(large.message, /saved/);
  assert.equal(rows.length, 3);
  assert.equal(sessions.size, 0);
  assert.equal([...files.values()].filter(file => file.trashed).length, 1);
  const savedLarge = [...files.values()].find(file => file.getName() === 'TEST002_2026-10.jpg');
  assert.equal(savedLarge.getBlob().getBytes().length, MAX_SIZE);
  for (const body of bodies) assert.ok(Buffer.byteLength(body) < 3_600_000);
  const start = bridge({ ...details, index: 'test003', action: 'upload-start', secret: props.VERCEL_API_SECRET,
    image: { type: 'image/jpeg', base64: Buffer.from(await jpeg(PART_SIZE).arrayBuffer()).toString('base64') } });
  assert.equal(start.ok, true);
  const finish = { ...details, index: 'test003', action: 'submit', uploadId: start.data.uploadId, secret: props.VERCEL_API_SECRET,
    image: { type: 'image/jpeg', base64: Buffer.from([1]).toString('base64') } };
  assert.match(bridge({ ...finish, month: '2026-11' }).error, /details changed/);
  sessions.clear();
  assert.match(bridge(finish).error, /expired/);
  assert.equal(rows.length, 3);
  delete process.env.APPS_SCRIPT_SECRET;
  assert.equal((await GET()).status, 503);
  process.env.APPS_SCRIPT_SECRET = props.VERCEL_API_SECRET;
  globalThis.fetch = async () => new Response('<html>Google login</html>');
  assert.equal((await GET()).status, 502);
  console.log('React upload → Vercel API → Apps Script checks passed (mock Sheet/Drive; no live records written).');
} finally { globalThis.fetch = originalFetch; }
