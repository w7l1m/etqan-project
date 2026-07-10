// Password hashing using Node's built-in crypto.scrypt.
// Security-equivalent to bcrypt: salted, slow, memory-hard KDF.
// (If you `npm install bcryptjs` later, you can swap this module out —
// the rest of the app only calls hashPassword/verifyPassword.)
const crypto = require('node:crypto');

const KEY_LEN = 64;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, KEY_LEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(plain, stored) {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const derived = crypto.scryptSync(plain, salt, KEY_LEN);
  const stored_ = Buffer.from(hashHex, 'hex');
  if (derived.length !== stored_.length) return false;
  return crypto.timingSafeEqual(derived, stored_);
}

module.exports = { hashPassword, verifyPassword };
