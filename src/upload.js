export const PART_SIZE = 2.5 * 1024 * 1024;
export const MAX_SIZE = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function cardParts(file) {
  if (!file || !IMAGE_TYPES.includes(file.type) || !file.size || file.size > MAX_SIZE) {
    throw new Error('Choose a JPG, PNG or WebP card photo, up to 5 MB.');
  }
  return file.size > PART_SIZE ? [file.slice(0, PART_SIZE), file.slice(PART_SIZE)] : [file];
}

export function base64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The photo could not be read. Select it again.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

export async function api(payload) {
  const response = await fetch('/api/enrollment', payload ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  } : undefined);
  let result;
  try { result = await response.json(); } catch { throw new Error('The service is unavailable. Please try again or contact staff.'); }
  if (!response.ok || result.error) throw new Error(result.error || 'The request could not be saved. Please try again.');
  return result;
}

export async function sendEnrollment(data, file, progress) {
  const parts = cardParts(file);
  let uploadId;
  if (parts.length === 2) {
    progress('Uploading card photo — part 1 of 2…');
    const started = await api({ ...data, action: 'upload-start', image: { type: file.type, base64: await base64(parts[0]) } });
    if (typeof started.uploadId !== 'string') throw new Error('The upload could not start. Please try again.');
    uploadId = started.uploadId;
  }
  progress(parts.length === 2 ? 'Uploading card photo — part 2 of 2…' : 'Saving your request…');
  return api({ ...data, action: 'submit', ...(uploadId ? { uploadId } : {}), image: { type: file.type, base64: await base64(parts.at(-1)) } });
}
