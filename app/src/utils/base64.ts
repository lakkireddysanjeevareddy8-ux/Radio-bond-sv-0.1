// Pure JS base64 encoder and decoder for React Native and Web compatibility
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : NaN;
    const b3 = i < bytes.length ? bytes[i++] : NaN;

    const e1 = b1 >> 2;
    const e2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    const e3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    const e4 = isNaN(b2) || isNaN(b3) ? 64 : b3 & 63;

    output +=
      B64_CHARS.charAt(e1) +
      B64_CHARS.charAt(e2) +
      B64_CHARS.charAt(e3) +
      B64_CHARS.charAt(e4);
  }
  return output;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  let i = 0;
  while (i < clean.length) {
    const e1 = B64_CHARS.indexOf(clean.charAt(i++));
    const e2 = B64_CHARS.indexOf(clean.charAt(i++));
    const e3 = B64_CHARS.indexOf(clean.charAt(i++));
    const e4 = B64_CHARS.indexOf(clean.charAt(i++));

    const b1 = (e1 << 2) | (e2 >> 4);
    const b2 = ((e2 & 15) << 4) | (e3 >> 2);
    const b3 = ((e3 & 3) << 6) | e4;

    bytes.push(b1);
    if (e3 !== 64) bytes.push(b2);
    if (e4 !== 64) bytes.push(b3);
  }
  return new Uint8Array(bytes);
}
