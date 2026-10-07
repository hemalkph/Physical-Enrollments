const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const rows = [['Submitted at', 'Student name', 'Student index', 'Batch', 'Physical center', 'Enrollment month', 'LMS card status']];
let releases = 0;
let busy = false;
let uploads = 0;
let uploadFailure = false;
let writeFailure = false;
let folders = 0;
const properties = { SPREADSHEET_ID: 'test-sheet' };
let htmlOutput;
const lists = { Batches: [['Batch'], ['2027 A/L'], ['2028 A/L']], Centers: [['Physical center'], ['Main center']] };
function sheet(data, name) {
  return {
    getName: () => name,
    clear: () => {},
    getMaxRows: () => 1000,
    getLastRow: () => data.length,
    setFrozenRows: () => {},
    getRange: (row, col, height, width) => ({
      getDisplayValue: () => String(data[row - 1]?.[col - 1] || ''),
      getDisplayValues: () => data.slice(row - 1, row - 1 + height).map(values => values.slice(col - 1, col - 1 + width).map(String)),
      getValues: () => data.slice(row - 1, row - 1 + height).map(values => Array.from({ length: width }, (_, i) => values[col - 1 + i] ?? '')),
      setDataValidation: () => {},
      setNumberFormat: () => {},
      setFontWeight: () => {},
      setFormula: value => { data[row - 1] ||= []; data[row - 1][col - 1] = value; },
      setValue: value => {
        data[row - 1] ||= [];
        data[row - 1][col - 1] = value;
        return { setFontWeight: () => {} };
      },
      setValues: values => {
        if (writeFailure) throw new Error('Sheet write failed');
        values.forEach((value, offset) => {
          data[row - 1 + offset] ||= [];
          value.forEach((cell, index) => { data[row - 1 + offset][col - 1 + index] = cell; });
        });
      }
    })
  };
}
const tables = { Enrollments: rows, ...lists };
const book = {
  getId: () => 'test-sheet',
  getSheetByName: name => tables[name] ? sheet(tables[name], name) : null,
  insertSheet: name => { tables[name] = []; return sheet(tables[name], name); }
};
const validation = {
  requireValueInList: () => validation,
  setAllowInvalid: () => validation,
  setHelpText: () => validation,
  build: () => ({})
};
const context = vm.createContext({
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createTemplateFromFile: () => {
      const template = { evaluate: () => {
        htmlOutput = {
          origin: template.embedOrigin,
          setTitle() { return this; }, addMetaTag() { return this; },
          setXFrameOptionsMode(mode) { this.mode = mode; return this; }
        };
        return htmlOutput;
      } };
      return template;
    }
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key], setProperty: (key, value) => { properties[key] = value; } }) },
  SpreadsheetApp: {
    newDataValidation: () => validation,
    getActiveSpreadsheet: () => book,
    openById: () => book,
    flush: () => {}
  },
  DriveApp: {
    createFolder: () => { folders++; return { getId: () => 'private-folder' }; },
    getFolderById: id => {
      assert.equal(id, 'private-folder');
      return { createFile: blob => {
        if (uploadFailure) throw new Error('Drive upload failed');
        uploads++;
        assert.match(blob.getName(), /^[A-Z0-9_-]+_\d{4}-\d{2}\.(png|jpg|webp)$/);
        return { getUrl: () => 'https://drive.google.com/file/d/test-image/view' };
      } };
    }
  },
  Utilities: { formatDate: (date, zone) => {
    assert.equal(zone, 'Asia/Colombo');
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric' }).formatToParts(date).map(x => [x.type, x.value]));
    return p.year + '-' + p.month;
  } },
  LockService: { getScriptLock: () => ({ tryLock: () => !busy, releaseLock: () => releases++ }) }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), context);
context.doGet();
assert.equal(htmlOutput.mode, undefined);
assert.equal(htmlOutput.origin, '');
context.doGet({ parameter: { embed: '1' } });
assert.equal(htmlOutput.origin, 'https://student-enrollment-livid.vercel.app');
properties.VERCEL_ORIGIN = 'invalid';
assert.throws(() => context.doGet({ parameter: { embed: '1' } }), /VERCEL_ORIGIN/);
properties.VERCEL_ORIGIN = 'https://enrollment.example.com';
context.doGet({ parameter: { embed: '1' } });
assert.equal(htmlOutput.mode, 'ALLOWALL');
assert.equal(htmlOutput.origin, properties.VERCEL_ORIGIN);
context.setup_();
assert.equal(rows[0][7], 'Uploaded image');
assert.equal(rows[0][8], 'Completed at');
assert.equal(rows[0][9], 'Staff notes');
assert.match(tables['Staff Dashboard'][6][1], /Activated/);
assert.match(tables['Staff Pending'][4][0], /Needs correction/);
assert.match(tables['Staff Completed'][4][0], /Completed/);
assert.equal(folders, 1);
const [m0, m1, m2] = context.allowedMonths_();
const input = { name: 'Test Student', index: '250001', batch: '2027 A/L', center: 'Main center', month: m0 };
assert.match(context.submitEnrollment(input).message, /saved/);
assert.equal(rows[1][2], '250001');
assert.equal(rows[1][6], 'Pending');
assert.equal(rows[1][7], '');
assert.equal(rows[0][10], 'Student status');
assert.equal(rows[1][10], 'New student (not verified yet)');
context.setup_();
assert.equal(rows[1][2], '250001');
assert.equal(folders, 1);
assert.throws(() => context.submitEnrollment(input), /already exists/);
assert.equal(releases, 2);
assert.equal(rows.length, 2);
context.submitEnrollment({ ...input, month: m1, name: '=IMPORTXML("bad")' });
assert.equal(rows[2][1], '\'=IMPORTXML("bad")');
for (const change of [{ month: '2026-13' }, { month: '2026-1' }, { month: '2099-01' }, { month: '2000-01' }, { name: '' }, { index: '=BAD' }, { index: '12345' }, { index: '1234567' }, { index: '25000a' }, { index: '250 002' }, { batch: 'Unknown' }, { center: 'Unknown' }, { name: 'a'.repeat(121) }]) {
  assert.throws(() => context.submitEnrollment({ ...input, ...change }));
}
assert.equal(rows.length, 3);
busy = true;
assert.throws(() => context.submitEnrollment({ ...input, index: '250009' }), /busy/);
assert.equal(rows.length, 3);
busy = false;
function blob(type, bytes, name = 'upload.png') {
  return { getContentType: () => type, getBytes: () => bytes, getName: () => name, setName: value => { name = value; return blob(type, bytes, name); } };
}
const png = blob('image/png', [137, 80, 78, 71, 13, 10, 26, 10]);
const withImage = { ...input, index: '250003', image: png };
context.submitEnrollment(withImage);
assert.equal(uploads, 1);
assert.match(rows[3][7], /drive.google.com/);
assert.throws(() => context.submitEnrollment(withImage), /already exists/);
assert.equal(uploads, 1);
for (const image of [blob('image/png', [1, 2, 3]), blob('image/svg+xml', [1]), blob('image/png', []), blob('image/png', new Array(5 * 1024 * 1024 + 1)), {}]) {
  assert.throws(() => context.submitEnrollment({ ...input, index: '250004', image }));
}
assert.equal(context.image_(blob('image/jpeg', [255, 216, 255])).extension, 'jpg');
assert.equal(context.image_(blob('image/webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])).extension, 'webp');
assert.equal(context.image_(blob('application/octet-stream', [], '')), null);
uploadFailure = true;
const beforeReleases = releases;
assert.throws(() => context.submitEnrollment({ ...withImage, index: '250005' }), /Drive upload failed/);
assert.equal(rows.length, 4);
assert.equal(releases, beforeReleases + 1);
uploadFailure = false;
writeFailure = true;
assert.throws(() => context.submitEnrollment({ ...withImage, index: '250006' }), /Sheet write failed/);
assert.equal(rows.length, 4);
assert.equal(uploads, 2); // Retain the image for staff recovery if the spreadsheet write fails.
writeFailure = false;
function edit(first, last = first, column = 7, lastColumn = column, name = 'Enrollments') {
  context.onEdit({ range: {
    getSheet: () => sheet(tables[name], name),
    getColumn: () => column, getLastColumn: () => lastColumn,
    getRow: () => first, getLastRow: () => last
  } });
}
rows[1][6] = 'Completed';
rows[1][9] = 'Reviewed by staff';
edit(2);
assert.equal(Object.prototype.toString.call(rows[1][8]), '[object Date]');
const completedAt = rows[1][8];
edit(2);
assert.equal(rows[1][8], completedAt);
rows[1][6] = 'Pending';
edit(2);
assert.equal(rows[1][8], '');
rows[1][6] = 'Completed';
rows[2][6] = 'Activated';
rows[3][6] = 'Needs correction';
edit(1, 4, 6, 8);
assert.equal(Object.prototype.toString.call(rows[1][8]), '[object Date]');
assert.equal(Object.prototype.toString.call(rows[2][8]), '[object Date]');
assert.equal(rows[3][8], '');
const preservedStamp = rows[1][8];
context.setup_();
assert.equal(rows[1][8], preservedStamp);
assert.equal(rows[1][9], 'Reviewed by staff');
rows[1][6] = 'Rejected';
edit(2, 2, 10); // Unrelated notes edits do not stamp a completion.
assert.equal(rows[1][8], preservedStamp);
edit(2);
assert.equal(rows[1][8], '');
context.onEdit(); // Clicking Run on onEdit is harmless.
assert.equal(rows[0][8], 'Completed at');
// Student status: staff-confirmed indexes are recognised on later requests.
rows[1][6] = 'Completed';
rows[3][6] = 'Activated';
context.submitEnrollment({ ...input, month: m2 });
assert.equal(rows[rows.length - 1][10], 'Verified student');
context.submitEnrollment({ ...input, index: '250003', month: m1, name: '  someone   ELSE ' });
assert.equal(rows[rows.length - 1][10], 'Verified student - name differs');
context.submitEnrollment({ ...input, index: '250003', month: m2, name: ' test   STUDENT' });
assert.equal(rows[rows.length - 1][10], 'Verified student');
context.submitEnrollment({ ...input, index: '250777' });
assert.equal(rows[rows.length - 1][10], 'New student (not verified yet)');
context.installVerifiedStudents();
assert.match(tables['Verified Students'][3][0], /FILTER/);
const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
console.log('Passed: enrollment/upload checks, staff status tracking, embed configuration, and client syntax.');
