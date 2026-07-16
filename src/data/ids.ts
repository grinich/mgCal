// Google event IDs must be base32hex (RFC2938): lowercase a-v and 0-9,
// 5-1024 chars. Generating the final ID client-side makes creates idempotent
// and eliminates temp-ID rewriting in the outbox.
const ALPHABET = 'abcdefghijklmnopqrstuv0123456789'

export function newEventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(26))
  let id = ''
  for (const b of bytes) id += ALPHABET[b % 32]
  return id
}
