const TIME_ZONE = 'Asia/Colombo';

// "YYYY-MM" for this month and the two before it, newest first. Uses Sri Lanka time so the
// phone, Vercel (UTC) and Apps Script all agree on which month it is.
export function allowedMonths(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric' })
    .formatToParts(now).map(part => [part.type, part.value]));
  return [0, 1, 2].map(back => {
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1 - back, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function monthLabel(value) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}
