import { allowedMonths } from '../src/months.js';

const MAX_BODY = 3_600_000;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const reply = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store' }
});

async function forward(payload) {
  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url) || !secret || secret.length < 32) {
    return reply({ error: 'Enrollment is not configured yet. Please contact staff.' }, 503);
  }
  try {
    const response = await fetch(url, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret }),
      signal: AbortSignal.timeout(50_000)
    });
    if (!response.ok) throw new Error('Upstream HTTP failure');
    const result = await response.json();
    if (result.ok === false && typeof result.error === 'string') {
      return reply({ error: result.error }, 400);
    }
    if (result.ok !== true || !result.data || typeof result.data !== 'object') throw new Error('Invalid upstream response');
    return reply(result.data);
  } catch {
    // Do not log request bodies: they include a credential and students' cards.
    return reply({ error: 'The enrollment service did not respond. Try again; if a request already exists, ask staff to check it.' }, 502);
  }
}

export async function GET() {
  const response = await forward({ action: 'options' });
  // Apps Script is slow (3-27s). Let Vercel's CDN serve the lists instantly; new batches/centers show within ~5 minutes.
  if (response.ok) response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  return response;
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply({ error: 'Open the form on this website to submit.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Send JSON data.' }, 415);
  let body;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BODY) return reply({ error: 'The upload part is too large.' }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: 'Invalid form data.' }, 400);
  }
  if (!body || !['upload-start', 'submit'].includes(body.action)) return reply({ error: 'Invalid action.' }, 400);
  const input = {};
  for (const [key, maximum] of Object.entries({ name: 120, index: 50, batch: 100, center: 100, month: 7 })) {
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > maximum) return reply({ error: 'Please complete all student details.' }, 400);
    input[key] = body[key];
  }
  if (!/^\d{6}$/.test(input.index)) return reply({ error: 'Enter a valid student index: exactly 6 digits.' }, 400);
  if (!allowedMonths().includes(input.month)) return reply({ error: 'Select a valid month: this month or one of the last 2 months.' }, 400);
  const image = body.image;
  if (!image || !TYPES.includes(image.type) || typeof image.base64 !== 'string' ||
      !image.base64.length || image.base64.length > 3_495_256 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64) || image.base64.length % 4 !== 0) {
    return reply({ error: 'Upload a JPG, PNG or WebP card photo, up to 5 MB.' }, 400);
  }
  if (body.uploadId !== undefined && (typeof body.uploadId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.uploadId) || body.action !== 'submit')) {
    return reply({ error: 'Invalid upload. Please select your photo again.' }, 400);
  }
  return forward({ action: body.action, ...input, image: { base64: image.base64, type: image.type }, ...(body.uploadId ? { uploadId: body.uploadId } : {}) });
}
