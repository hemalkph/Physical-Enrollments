export const PART_SIZE = 2.5 * 1024 * 1024;
export const MAX_SIZE = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function cardParts(file) {
  if (!file || !IMAGE_TYPES.includes(file.type) || !file.size || file.size > MAX_SIZE) {
    throw new Error('Choose a JPG, PNG or WebP card photo, up to 5 MB.');
  }
  return file.size > PART_SIZE ? [file.slice(0, PART_SIZE), file.slice(PART_SIZE)] : [file];
}

// Phone photos are 3-5 MB; a card stays readable at 1600 px / JPEG 0.8 (~300 KB), so it uploads in one fast request.
// Falls back to the original file if the browser can't decode it (e.g. HEIC) or the result isn't smaller.
export async function compress(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; // PNG transparency would turn black in JPEG
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return blob && blob.size < file.size ? new File([blob], 'card.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
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

export async function sendEnrollment(data, original, progress) {
  cardParts(original);
  progress('Preparing card photo…', 0.1);
  const file = await compress(original);
  const parts = cardParts(file);
  let uploadId;
  if (parts.length === 2) {
    progress('Uploading card photo — part 1 of 2…', 0.3);
    const started = await api({ ...data, action: 'upload-start', image: { type: file.type, base64: await base64(parts[0]) } });
    if (typeof started.uploadId !== 'string') throw new Error('The upload could not start. Please try again.');
    uploadId = started.uploadId;
  }
  progress(parts.length === 2 ? 'Uploading card photo — part 2 of 2…' : 'Uploading and saving your request…', parts.length === 2 ? 0.6 : 0.4);
  return api({ ...data, action: 'submit', ...(uploadId ? { uploadId } : {}), image: { type: file.type, base64: await base64(parts.at(-1)) } });
}
