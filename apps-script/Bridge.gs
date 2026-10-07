// Add this as a NEW script file in your existing Apps Script project.
// It reuses Code.gs: getOptions, validate_, image_, book_, submitEnrollment.
function doPost(e) {
  let response;
  try {
    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty('VERCEL_API_SECRET');
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 3600000) throw new Error('Invalid request.');
    const input = JSON.parse(raw);
    if (!secret || secret.length < 32 || input.secret !== secret) throw new Error('Unauthorized request.');
    let data;
    if (input.action === 'options') {
      data = getOptions();
    } else if (input.action === 'upload-start' || input.action === 'submit') {
      data = bridgeEnrollment_(input, properties);
    } else {
      throw new Error('Invalid request.');
    }
    response = { ok: true, data: data };
  } catch (error) {
    // Only expose known validation messages; Google errors can include private IDs.
    const message = String(error && error.message || '');
    const safe = /^(Invalid request\.|Unauthorized request\.|Please complete|Enter a valid|Student index can|Select a valid|Batch or center|Choose a JPG|The image must|Upload expired|Upload details changed|A request already exists|The form is busy)/.test(message);
    response = { ok: false, error: safe ? message : 'Enrollment could not be saved. Contact staff or try again.' };
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function bridgeEnrollment_(input, properties) {
  const data = validate_(input, getOptions());
  const image = input.image;
  const partSize = 2621440; // 2.5 MiB: base64 fits Vercel's 4.5 MB request limit.
  if (!image || !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) ||
      typeof image.base64 !== 'string' || !image.base64.length || image.base64.length > 3495256 ||
      image.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)) {
    throw new Error('Choose a JPG, PNG or WebP card photo, up to 5 MB.');
  }
  let bytes = Utilities.base64Decode(image.base64);
  if (!bytes.length || bytes.length > partSize) throw new Error('The image must be no larger than 5 MB.');
  const folder = DriveApp.getFolderById(properties.getProperty('UPLOAD_FOLDER_ID'));
  const cache = CacheService.getScriptCache();
  if (input.action === 'upload-start') {
    if (bytes.length !== partSize || input.uploadId) throw new Error('Invalid request.');
    // Validate the first bytes before saving any partial upload.
    image_(Utilities.newBlob(bytes, image.type, 'card'));
    const uploadId = Utilities.getUuid();
    const file = folder.createFile(Utilities.newBlob(bytes, 'application/octet-stream', '.enrollment-part-' + uploadId));
    try {
      // ponytail: a 15-minute cache session; early eviction means the student retries.
      cache.put('upload:' + uploadId, JSON.stringify({ fileId: file.getId(), data: data, type: image.type }), 900);
    } catch (error) {
      file.setTrashed(true);
      throw error;
    }
    return { uploadId: uploadId };
  }
  let partial;
  if (input.uploadId !== undefined) {
    if (typeof input.uploadId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.uploadId)) throw new Error('Invalid request.');
    const value = cache.get('upload:' + input.uploadId);
    if (!value) throw new Error('Upload expired. Submit again to restart the upload.');
    const session = JSON.parse(value);
    if (JSON.stringify(session.data) !== JSON.stringify(data) || session.type !== image.type) {
      throw new Error('Upload details changed. Submit again to restart the upload.');
    }
    partial = DriveApp.getFileById(session.fileId);
    bytes = partial.getBlob().getBytes().concat(bytes);
  }
  try {
    const blob = Utilities.newBlob(bytes, image.type, 'card');
    image_(blob); // Full size, MIME and signature validation.
    return submitEnrollment(Object.assign({}, data, { image: blob }));
  } finally {
    if (partial) {
      cache.remove('upload:' + input.uploadId);
      // Never delete the final card image if a Sheet write fails.
      try { partial.setTrashed(true); } catch (error) { console.warn('Temporary upload cleanup failed.'); }
    }
  }
}

// Run ONCE in the editor to enable daily cleanup of abandoned upload parts.
// Leave this function in the project. It is not called by the student API.
function installUploadCleanup() {
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'cleanupCardUploads_')) {
    ScriptApp.newTrigger('cleanupCardUploads_').timeBased().everyDays(1).create();
  }
}

function cleanupCardUploads_() {
  const folderId = PropertiesService.getScriptProperties().getProperty('UPLOAD_FOLDER_ID');
  if (!folderId) return;
  const files = DriveApp.getFolderById(folderId).getFiles();
  const cutoff = Date.now() - 86400000;
  // ponytail: scans the existing folder daily; use a dedicated staging folder if it grows large.
  while (files.hasNext()) {
    const file = files.next();
    if (/^\.enrollment-part-[a-f0-9-]{36}$/i.test(file.getName()) && file.getDateCreated().getTime() < cutoff) {
      file.setTrashed(true);
    }
  }
}
