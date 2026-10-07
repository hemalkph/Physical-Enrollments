// Run setup_ through the temporary runSetup wrapper in README.md, then remove the wrapper.
function setup_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Open Apps Script from your Google Sheet first.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', book.getId());
  const tables = {
    Enrollments: [['Submitted at', 'Student name', 'Student index', 'Batch', 'Physical center', 'Enrollment month', 'LMS card status', 'Uploaded image']],
    Batches: [['Batch'], ['2027 A/L'], ['2028 A/L']],
    Centers: [['Physical center']]
  };
  Object.keys(tables).forEach(name => {
    const sheet = book.getSheetByName(name) || book.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      const rows = tables[name];
      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
    }
  });
  const enrollments = book.getSheetByName('Enrollments');
  const heading = enrollments.getRange(1, 8).getDisplayValue();
  if (heading && heading !== 'Uploaded image') throw new Error('Column H must be empty for the image link. Move its contents before running setup.');
  enrollments.getRange(1, 8).setValue('Uploaded image').setFontWeight('bold');
  setupStaff_(book, enrollments);
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('UPLOAD_FOLDER_ID')) {
    const folder = DriveApp.createFolder('Student enrollment images');
    properties.setProperty('UPLOAD_FOLDER_ID', folder.getId());
  }
}

function statusRule_() {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Completed', 'Needs correction', 'Rejected', 'Activated'], true)
    .setAllowInvalid(false)
    .setHelpText('Choose Completed only after confirming enrollment and activating the LMS card.')
    .build();
}

function setupStaff_(book, sheet) {
  ['Completed at', 'Staff notes'].forEach((label, index) => {
    const cell = sheet.getRange(1, 9 + index);
    if (cell.getDisplayValue() && cell.getDisplayValue() !== label) {
      throw new Error('Columns I and J must be empty for staff tracking. Move their contents before running setup.');
    }
  });
  sheet.getRange(1, 9, 1, 2).setValues([['Completed at', 'Staff notes']]);
  sheet.getRange(2, 7, sheet.getMaxRows() - 1, 1).setDataValidation(statusRule_());
  sheet.getRange(2, 9, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  const dashboard = book.getSheetByName('Staff Dashboard') || book.insertSheet('Staff Dashboard');
  if (dashboard.getLastRow() === 0) {
    dashboard.getRange(1, 1).setValue('Staff enrollment dashboard');
    dashboard.getRange(2, 1).setValue('Month (YYYY-MM; leave B2 empty for all months)');
    dashboard.getRange(2, 2).setNumberFormat('@');
    dashboard.getRange(3, 1).setValue('Edit status and notes in Enrollments. Pending/Completed tabs are live, read-only views.');
    dashboard.getRange(5, 1, 5, 1).setValues([['Total requests'], ['Pending'], ['Completed'], ['Needs correction'], ['Rejected']]);
    dashboard.getRange(5, 2).setFormula('=IF(B2="",COUNTA(Enrollments!C2:C),COUNTIF(Enrollments!F2:F,B2))');
    ['Pending', 'Completed', 'Needs correction', 'Rejected'].forEach((status, index) => {
      const count = value => 'IF($B$2="",COUNTIF(Enrollments!G2:G,"' + value + '"),COUNTIFS(Enrollments!F2:F,$B$2,Enrollments!G2:G,"' + value + '"))';
      dashboard.getRange(6 + index, 2).setFormula('=' + count(status) + (status === 'Completed' ? '+' + count('Activated') : ''));
    });
    dashboard.getRange(1, 1).setFontWeight('bold');
    dashboard.setFrozenRows(3);
  }
  [['Staff Pending', '(Enrollments!G2:G="Pending")+(Enrollments!G2:G="Needs correction")'],
   ['Staff Completed', '(Enrollments!G2:G="Completed")+(Enrollments!G2:G="Activated")']].forEach(([name, statuses]) => {
    const view = book.getSheetByName(name) || book.insertSheet(name);
    if (view.getLastRow() > 0) return;
    view.getRange(1, 1).setValue(name + ' — update rows in Enrollments');
    view.getRange(2, 1).setValue('Uses the month selected in Staff Dashboard!B2. Do not type into this view.');
    view.getRange(4, 1, 1, 10).setValues([sheet.getRange(1, 1, 1, 10).getDisplayValues()[0]]);
    view.getRange(5, 1).setFormula('=IFNA(FILTER(Enrollments!A2:J,Enrollments!C2:C<>"",(' + statuses + ')>0,((Enrollments!F2:F=\'Staff Dashboard\'!B2)+(\'Staff Dashboard\'!B2=""))>0),"No matching enrollments")');
    [1, 9].forEach(column => view.getRange(5, column, view.getMaxRows() - 4, 1).setNumberFormat('yyyy-mm-dd hh:mm'));
    view.setFrozenRows(4);
  });
}

// Bound-sheet trigger: staff edits in column G update the completion timestamp.
function onEdit(e) {
  if (!e || !e.range || typeof e.range.getSheet !== 'function') return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'Enrollments' || e.range.getColumn() > 7 || e.range.getLastColumn() < 7) return;
  const first = Math.max(2, e.range.getRow());
  const last = Math.min(sheet.getLastRow(), e.range.getLastRow());
  if (last < first) return;
  const values = sheet.getRange(first, 3, last - first + 1, 7).getValues();
  const stamps = values.map(row => [row[0] && ['Completed', 'Activated'].includes(row[4]) ? (row[6] || new Date()) : '']);
  sheet.getRange(first, 9, stamps.length, 1).setValues(stamps);
}

function doGet(e) {
  const embedded = !!(e && e.parameter && e.parameter.embed === '1');
  const origin = embedded ? (PropertiesService.getScriptProperties().getProperty('VERCEL_ORIGIN') || 'https://student-enrollment-livid.vercel.app') : '';
  if (embedded && (!origin || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin))) {
    throw new Error('Staff must configure VERCEL_ORIGIN in Apps Script project settings first.');
  }
  const template = HtmlService.createTemplateFromFile('Index');
  template.embedOrigin = origin || '';
  const output = template.evaluate()
    .setTitle('Monthly student enrollment')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return embedded ? output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL) : output;
}

function book_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('The form is not configured. Contact your institute.');
  return SpreadsheetApp.openById(id);
}

function options_(book, name) {
  const sheet = book.getSheetByName(name);
  if (!sheet) throw new Error('The form is not configured. Contact your institute.');
  if (sheet.getLastRow() < 2) return [];
  return [...new Set(sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .getDisplayValues().flat().map(value => value.trim()).filter(Boolean))];
}

function getOptions() {
  const book = book_();
  return { batches: options_(book, 'Batches'), centers: options_(book, 'Centers') };
}

function text_(value, label, maximum) {
  if (typeof value !== 'string') throw new Error(label + ' is required.');
  const result = value.trim();
  if (!result || result.length > maximum || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new Error('Enter a valid ' + label.toLowerCase() + ' (up to ' + maximum + ' characters).');
  }
  return result;
}

// "YYYY-MM" for this month and the two before it, in Sri Lanka time (same rule as src/months.js).
function allowedMonths_() {
  const parts = Utilities.formatDate(new Date(), 'Asia/Colombo', 'yyyy-M').split('-').map(Number);
  return [0, 1, 2].map(back => {
    const date = new Date(Date.UTC(parts[0], parts[1] - 1 - back, 1));
    return date.getUTCFullYear() + '-' + ('0' + (date.getUTCMonth() + 1)).slice(-2);
  });
}

function validate_(input, options) {
  if (!input || typeof input !== 'object') throw new Error('Please complete the form.');
  const data = {
    name: text_(input.name, 'Student name', 120),
    index: text_(input.index, 'Student index', 50).toUpperCase(),
    batch: text_(input.batch, 'Batch', 100),
    center: text_(input.center, 'Physical center', 100),
    month: text_(input.month, 'Enrollment month', 7)
  };
  if (!/^\d{6}$/.test(data.index)) {
    throw new Error('Enter a valid student index: exactly 6 digits.');
  }
  if (!allowedMonths_().includes(data.month)) {
    throw new Error('Select a valid month: this month or one of the last 2 months.');
  }
  if (!options.batches.includes(data.batch) || !options.centers.includes(data.center)) {
    throw new Error('Batch or center is unavailable. Reload the form and select again.');
  }
  return data;
}

// Keep user-entered text from being interpreted as spreadsheet formulas.
function cell_(value) {
  return /^[=+@-]/.test(value) ? "'" + value : value;
}

function image_(blob) {
  if (!blob || blob === '') return null;
  if (typeof blob.getBytes !== 'function' || typeof blob.getName !== 'function' ||
      typeof blob.getContentType !== 'function') throw new Error('Choose a JPG, PNG or WebP image.');
  const bytes = blob.getBytes();
  if (!bytes.length && !blob.getName()) return null;
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('The image must be nonempty and no larger than 5 MB.');
  const start = bytes.slice(0, 12).map(value => value & 255);
  const type = blob.getContentType();
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => start[i] === value);
  const jpg = start[0] === 255 && start[1] === 216 && start[2] === 255;
  const webp = start.slice(0, 4).join(',') === '82,73,70,70' && start.slice(8, 12).join(',') === '87,69,66,80';
  if (type === 'image/png' && png) return { blob, extension: 'png' };
  if (type === 'image/jpeg' && jpg) return { blob, extension: 'jpg' };
  if (type === 'image/webp' && webp) return { blob, extension: 'webp' };
  throw new Error('Choose a JPG, PNG or WebP image; other file types are not accepted.');
}

function submitEnrollment(input) {
  const book = book_();
  const data = validate_(input, {
    batches: options_(book, 'Batches'), centers: options_(book, 'Centers')
  });
  const image = image_(input.image);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('The form is busy. Please try again.');
  try {
    const sheet = book.getSheetByName('Enrollments');
    if (!sheet) throw new Error('The form is not configured. Contact your institute.');
    // ponytail: scan existing rows; use a database if enrollment volume makes this slow.
    const rows = sheet.getLastRow() < 2 ? [] :
      sheet.getRange(2, 2, sheet.getLastRow() - 1, 6).getDisplayValues(); // name, index, batch, center, month, status
    if (rows.some(row => row[1].trim().toUpperCase() === data.index && row[4] === data.month)) {
      throw new Error('A request already exists for this student index and month. Contact staff for changes.');
    }
    // An index is "verified" once staff marked any earlier request Completed/Activated.
    const verified = rows.filter(row => row[1].trim() === data.index && ['Completed', 'Activated'].includes(row[5]));
    const plain = value => value.toLowerCase().replace(/\s+/g, ' ').trim();
    const studentStatus = !verified.length ? 'New student (not verified yet)'
      : verified.some(row => plain(row[0]) === plain(data.name)) ? 'Verified student' : 'Verified student - name differs';
    if (sheet.getRange(1, 8).getDisplayValue() !== 'Uploaded image') {
      throw new Error('Staff must run the updated setup before accepting requests.');
    }
    let imageUrl = '';
    if (image) {
      const folderId = PropertiesService.getScriptProperties().getProperty('UPLOAD_FOLDER_ID');
      if (!folderId) throw new Error('Image uploads are not configured. Contact your institute.');
      const filename = data.index.replace(/[^A-Z0-9_-]/g, '_') + '_' + data.month + '.' + image.extension;
      const file = DriveApp.getFolderById(folderId).createFile(image.blob.setName(filename));
      imageUrl = file.getUrl();
    }
    const next = sheet.getLastRow() + 1;
    sheet.getRange(next, 2, 1, 5).setNumberFormat('@');
    sheet.getRange(next, 1, 1, 8).setValues([[
      new Date(), cell_(data.name), data.index, cell_(data.batch), cell_(data.center), data.month, 'Pending', imageUrl
    ]]);
    sheet.getRange(next, 7).setDataValidation(statusRule_());
    // Column K tells staff how much to trust the request. Never overwrite a column K that staff use for something else.
    const statusHeader = sheet.getRange(1, 11).getDisplayValue();
    if (!statusHeader) sheet.getRange(1, 11, 1, 1).setValues([['Student status']]);
    if (!statusHeader || statusHeader === 'Student status') sheet.getRange(next, 11, 1, 1).setValues([[studentStatus]]);
    SpreadsheetApp.flush();
    return { message: 'Your enrollment request was saved for ' + data.month + '. Staff will review it and activate your LMS card.' };
  } finally {
    lock.releaseLock();
  }
}

// Run ONCE in the editor. Creates a live "Verified Students" tab listing every index that staff
// marked Completed/Activated. It is a formula view: do not type into it.
function installVerifiedStudents() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const view = book.getSheetByName('Verified Students') || book.insertSheet('Verified Students');
  view.clear();
  view.getRange(1, 1).setValue('Verified students - built automatically from Enrollments rows marked Completed or Activated');
  view.getRange(3, 1, 1, 3).setValues([['Student index', 'Student name', 'Batch']]);
  view.getRange(4, 1).setFormula('=IFERROR(SORT(UNIQUE(FILTER({Enrollments!C2:C, Enrollments!B2:B, Enrollments!D2:D}, Enrollments!C2:C<>"", (Enrollments!G2:G="Completed")+(Enrollments!G2:G="Activated")>0)), 1, TRUE), "No verified students yet")');
  view.setFrozenRows(3);
}
