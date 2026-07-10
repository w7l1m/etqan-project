const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(v, max = 255) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}

function sanitizeString(v) {
  // Trim + strip control chars. Since the frontend renders values via
  // textContent (not innerHTML), this is defense-in-depth, not the only guard.
  return String(v).trim().replace(/[\x00-\x1F\x7F]/g, '');
}

function validateSignup(body) {
  const errors = [];
  const name = isNonEmptyString(body.name) ? sanitizeString(body.name) : null;
  const email = isNonEmptyString(body.email, 320) ? sanitizeString(body.email).toLowerCase() : null;
  const password = typeof body.password === 'string' ? body.password : null;
  const role = ['student', 'teacher', 'admin'].includes(body.role) ? body.role : 'student';
  const phone = isNonEmptyString(body.phone, 32) ? sanitizeString(body.phone) : null;
  const grade = isNonEmptyString(body.grade, 80) ? sanitizeString(body.grade) : '';

  if (!name) errors.push('Name is required.');
  if (!email || !EMAIL_RE.test(email)) errors.push('A valid email is required.');
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
  if (role === 'student' && !phone) errors.push('Phone number is required for students.');

  return { errors, data: { name, email, password, role, phone, grade } };
}

function validateLogin(body) {
  const errors = [];
  const email = isNonEmptyString(body.email, 320) ? sanitizeString(body.email).toLowerCase() : null;
  const password = typeof body.password === 'string' ? body.password : null;
  if (!email || !EMAIL_RE.test(email)) errors.push('A valid email is required.');
  if (!password) errors.push('Password is required.');
  return { errors, data: { email, password } };
}

module.exports = { validateSignup, validateLogin, sanitizeString, EMAIL_RE };
