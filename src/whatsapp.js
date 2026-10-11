// Sri Lankan mobile only. Accepts 07X…, +947X…, 947X… (spaces/dashes ok); returns "947XXXXXXXX" or null.
export function normalizeWhatsapp(value) {
  const match = /^(?:\+?94|0)?(7\d{8})$/.exec(String(value).replace(/[\s\-()]/g, ''));
  return match ? '94' + match[1] : null;
}
