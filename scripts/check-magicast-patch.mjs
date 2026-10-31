import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// Complete patched upstream bundle, including all seven indexed-consumer guards.
export const PATCHED_MAGICAST_BLOB = 'de8b4180743bdc85ae12b8e2fdd81f7e24666685';
export function verifyMagicastSource(source) {
  verifyMagicastBytes(readFileSync(source));
}
export function verifyMagicastBytes(bytes) {
  const blob = createHash('sha1')
    .update(Buffer.from('blob ' + bytes.length + '\0'))
    .update(bytes)
    .digest('hex');
  assert.equal(
    blob,
    PATCHED_MAGICAST_BLOB,
    'Unknown or unpatched complete magicast source; reinstall the reviewed native patch',
  );
}
