const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { loadEnv } = require('./env');
loadEnv();

const storage = require('./storage');
const { hashPassword, verifyPassword } = require('./password');
const jwt = require('./jwt');
const { validateSignup, validateLogin, EMAIL_RE } = require('./validation');

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-etqan-jwt-secret-change-me';
const JWT_EXPIRES_IN_SECONDS = Number(process.env.JWT_EXPIRES_IN_SECONDS) || 3600;
const FRONTEND_DIR = path.resolve(__dirname, '..', '..', 'frontend');
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!JWT_SECRET || JWT_SECRET.includes('change_me') || JWT_SECRET.includes('please_change')) {
  console.warn(
    '[WARN] JWT_SECRET looks like the default placeholder. Set a strong random value in .env before deploying.'
  );
}

// ---------- small helpers ----------
function send(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    const MAX = 1024 * 1024; // 1MB cap against abuse
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  // If no CORS origin is configured, allow all origins for local development
  // (do not enable credentials when using wildcard).
  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function publicUser(row) {
  const base = { id: row.id, name: row.name, email: row.email, role: row.role, created_at: row.created_at };
  if (row.role === 'teacher') {
    const teacher = await storage.getTeacherByUserId(row.id);
    if (teacher) {
      base.subject = teacher.subject;
      base.active = !!teacher.active;
      base.permissions = typeof teacher.permissions === 'string' ? JSON.parse(teacher.permissions || '{}') : teacher.permissions || {};
    }
  }
  if (row.role === 'student') {
    const student = await storage.getStudentByUserId(row.id);
    if (student) {
      base.phone = student.phone;
      base.parentPhone = student.parentPhone;
      base.subject = student.subject;
      base.grade = student.grade;
      base.active = !!student.active;
      base.joined_at = student.joined_at;
    }
  }
  return base;
}

// ---------- auth middleware ----------
function isTokenRevoked(jti) {
  return storage.isTokenRevoked(jti);
}

function requireAuth(req) {
  const header = req.headers['authorization'] || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    const err = new Error('Missing or malformed Authorization header');
    err.status = 401;
    throw err;
  }
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    const err = new Error('Invalid or expired token');
    err.status = 401;
    throw err;
  }
  if (isTokenRevoked(payload.jti)) {
    const err = new Error('Token has been revoked (logged out)');
    err.status = 401;
    throw err;
  }
  return payload;
}

function requireRole(req, allowedRoles) {
  const payload = requireAuth(req);
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(payload.role)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return payload;
}

function toTeacherPublic(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    active: !!row.active,
    permissions: JSON.parse(row.permissions || '{}'),
    created_at: row.created_at,
  };
}

function toStudentPublic(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    parentPhone: row.parentPhone,
    subject: row.subject,
    grade: row.grade,
    active: !!row.active,
    joined_at: row.joined_at,
    created_at: row.created_at,
  };
}

function toLogPublic(row) {
  return { id: row.id, actor: row.actor, role: row.role, action: row.action, ts: row.ts };
}

// ---------- route handlers ----------
async function handleSignup(req, res) {
  const body = await readJsonBody(req);
  const { errors, data } = validateSignup(body);
  if (errors.length) return send(res, 400, { ok: false, errors });

  const existing = await storage.getUserByEmail(data.email);
  if (existing) return send(res, 409, { ok: false, errors: ['Email already exists.'] });

  const hashed = hashPassword(data.password);
  const user = await storage.createUser({ name: data.name, email: data.email, password: hashed, role: data.role });

  if (data.role === 'teacher') {
    await storage.createTeacher({
      user_id: user.id,
      name: data.name,
      email: data.email,
      password: hashed,
      subject: '',
      active: 1,
      permissions: {
        viewStudents: true,
        toggleStudentStatus: false,
        deleteStudent: false,
        addAnnouncements: false,
        viewParentPhones: false,
      },
    });
  }

  if (data.role === 'student') {
    await storage.createStudent({
      user_id: user.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      parentPhone: '',
      subject: '',
      grade: data.grade || '',
      active: 1,
    });
  }

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, JWT_EXPIRES_IN_SECONDS);
  return send(res, 201, { ok: true, token, user: await publicUser(user) });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const { errors, data } = validateLogin(body);
  if (errors.length) return send(res, 400, { ok: false, errors });

  const user = await storage.getUserByEmail(data.email);
  // Same generic error whether email is unknown or password is wrong (don't leak which).
  if (!user || !verifyPassword(data.password, user.password)) {
    return send(res, 401, { ok: false, errors: ['Invalid email or password.'] });
  }

  if (user.role === 'teacher') {
    const teacher = await storage.getTeacherByUserId(user.id);
    if (!teacher || !teacher.active) {
      return send(res, 403, { ok: false, errors: ['This teacher account is not active.'] });
    }
  }

  if (user.role === 'student') {
    const student = await storage.getStudentByUserId(user.id);
    if (!student || !student.active) {
      return send(res, 403, { ok: false, errors: ['This student account is not active.'] });
    }
  }

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, JWT_EXPIRES_IN_SECONDS);
  return send(res, 200, { ok: true, token, user: await publicUser(user) });
}

async function handleLogout(req, res) {
  const payload = requireAuth(req); // throws if invalid
  await storage.revokeToken(payload.jti);
  return send(res, 200, { ok: true, message: 'Logged out. Token revoked server-side.' });
}

async function handleMe(req, res) {
  const payload = requireAuth(req);
  const user = await storage.getUserById(payload.sub);
  if (!user) return send(res, 404, { ok: false, errors: ['User no longer exists.'] });
  return send(res, 200, { ok: true, user: await publicUser(user) });
}

async function handleUpdateMe(req, res) {
  const payload = requireAuth(req);
  const user = await storage.getUserById(payload.sub);
  if (!user) return send(res, 404, { ok: false, errors: ['User no longer exists.'] });

  const body = await readJsonBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : user.name;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : user.email;
  const password = typeof body.password === 'string' && body.password.length ? body.password : null;

  if (!name || !email) return send(res, 400, { ok: false, errors: ['Name and email are required.'] });
  if (!EMAIL_RE.test(email)) return send(res, 400, { ok: false, errors: ['A valid email is required.'] });

  const existing = await storage.getUserByEmailExcludeId(email, user.id);
  if (existing) return send(res, 409, { ok: false, errors: ['Email already exists.'] });

  let hashed = user.password;
  if (password) {
    if (password.length < 8) return send(res, 400, { ok: false, errors: ['Password must be at least 8 characters.'] });
    hashed = hashPassword(password);
  }

  await storage.updateUser(user.id, { name, email, password: hashed });

  if (user.role === 'teacher') {
    const teacher = await storage.getTeacherByUserId(user.id);
    if (teacher) {
      const subject = typeof body.subject === 'string' ? body.subject.trim() : teacher.subject;
      await storage.updateTeacherById(teacher.id, { name, email, subject });
    }
  }

  if (user.role === 'student') {
    const student = await storage.getStudentByUserId(user.id);
    if (student) {
      const phone = typeof body.phone === 'string' ? body.phone.trim() : student.phone;
      const parentPhone = typeof body.parentPhone === 'string' ? body.parentPhone.trim() : student.parentPhone;
      const grade = typeof body.grade === 'string' ? body.grade.trim() : student.grade;
      await storage.updateStudentByUserId(user.id, { name, email, phone, parentPhone, grade });
    }
  }

  await storage.addLog(user.name || 'User', user.role, 'Updated profile');
  const updated = await storage.getUserById(user.id);
  return send(res, 200, { ok: true, user: await publicUser(updated) });
}

function isJsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function addLog(actor, role, action) {
  return storage.addLog(actor, role, action);
}

function getAllTeachers() {
  return storage.getAllTeachers().then((rows) => rows.map(toTeacherPublic));
}

function getAllStudents() {
  return storage.getAllStudents().then((rows) => rows.map(toStudentPublic));
}

function getAllLogs() {
  return storage.getAllLogs().then((rows) => rows.map(toLogPublic));
}

async function handleAdminStats(req, res) {
  requireRole(req, 'admin');
  const teacherCount = await storage.getCount('teachers');
  const studentCount = await storage.getCount('students');
  const activeStudents = await storage.getCount('students', { active: true });
  const logCount = await storage.getCount('logs');
  return send(res, 200, { ok: true, stats: { teacherCount, studentCount, activeStudents, logCount } });
}

async function handleAdminGetTeachers(req, res) {
  requireRole(req, 'admin');
  return send(res, 200, { ok: true, teachers: await storage.getAllTeachers().then((rows) => rows.map(toTeacherPublic)) });
}

async function handleAdminCreateTeacher(req, res) {
  requireRole(req, 'admin');
  const body = await readJsonBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';

  if (!name || !email || !password) {
    return send(res, 400, { ok: false, errors: ['Name, email, and password are required.'] });
  }
  if (!EMAIL_RE.test(email)) {
    return send(res, 400, { ok: false, errors: ['A valid email is required.'] });
  }
  if (password.length < 8) {
    return send(res, 400, { ok: false, errors: ['Password must be at least 8 characters.'] });
  }

  const existing = await storage.getUserByEmail(email);
  if (existing) return send(res, 409, { ok: false, errors: ['Email already exists.'] });

  const hashed = hashPassword(password);
  const user = await storage.createUser({ name, email, password: hashed, role: 'teacher' });
  const teacher = await storage.createTeacher({
    user_id: user.id,
    name,
    email,
    password: hashed,
    subject,
    active: 1,
    permissions: {
      viewStudents: true,
      toggleStudentStatus: false,
      deleteStudent: false,
      addAnnouncements: false,
      viewParentPhones: false,
    },
  });

  await addLog('Admin', 'admin', `Added teacher ${name}`);
  return send(res, 201, { ok: true, teacher: toTeacherPublic(teacher) });
}

async function handleAdminUpdateTeacher(req, res, teacherId) {
  requireRole(req, 'admin');
  const teacher = await storage.getTeacherById(teacherId);
  if (!teacher) return send(res, 404, { ok: false, errors: ['Teacher not found.'] });

  const body = await readJsonBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : teacher.name;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : teacher.email;
  const subject = typeof body.subject === 'string' ? body.subject.trim() : teacher.subject;
  const password = typeof body.password === 'string' && body.password.length ? body.password : null;

  if (!name || !email) {
    return send(res, 400, { ok: false, errors: ['Name and email are required.'] });
  }
  if (!EMAIL_RE.test(email)) {
    return send(res, 400, { ok: false, errors: ['A valid email is required.'] });
  }

  const existing = await storage.getUserByEmailExcludeId(email, teacher.user_id);
  if (existing) return send(res, 409, { ok: false, errors: ['Email already exists.'] });

  let hashed = teacher.password;
  if (password) {
    if (password.length < 8) return send(res, 400, { ok: false, errors: ['Password must be at least 8 characters.'] });
    hashed = hashPassword(password);
  }

  await storage.updateUser(teacher.user_id, { name, email, password: hashed });
  const updatedTeacher = await storage.updateTeacherById(teacherId, { name, email, password: hashed, subject });

  await addLog('Admin', 'admin', `Updated teacher ${name}`);
  return send(res, 200, { ok: true, teacher: toTeacherPublic(updatedTeacher) });
}

async function handleAdminDeleteTeacher(req, res, teacherId) {
  requireRole(req, 'admin');
  const teacher = await storage.getTeacherById(teacherId);
  if (!teacher) return send(res, 404, { ok: false, errors: ['Teacher not found.'] });
  await storage.deleteTeacherById(teacherId);
  await storage.deleteUserById(teacher.user_id);
  await addLog('Admin', 'admin', `Deleted teacher ${teacher.name}`);
  return send(res, 200, { ok: true, message: 'Teacher deleted.' });
}

async function handleAdminTeacherActive(req, res, teacherId) {
  requireRole(req, 'admin');
  const teacher = await storage.getTeacherById(teacherId);
  if (!teacher) return send(res, 404, { ok: false, errors: ['Teacher not found.'] });
  const body = await readJsonBody(req);
  const active = body.active === true;
  const updatedTeacher = await storage.updateTeacherById(teacherId, { active });
  await addLog('Admin', 'admin', `${active ? 'Activated' : 'Deactivated'} teacher ${teacher.name}`);
  return send(res, 200, { ok: true, active: !!updatedTeacher.active });
}

async function handleAdminTeacherPermissions(req, res, teacherId) {
  requireRole(req, 'admin');
  const teacher = await storage.getTeacherById(teacherId);
  if (!teacher) return send(res, 404, { ok: false, errors: ['Teacher not found.'] });
  const body = await readJsonBody(req);
  if (!isJsonObject(body.permissions)) return send(res, 400, { ok: false, errors: ['permissions object is required.'] });
  const updatedTeacher = await storage.updateTeacherById(teacherId, { permissions: body.permissions });
  await addLog('Admin', 'admin', `Updated permissions for teacher ${teacher.name}`);
  return send(res, 200, { ok: true, permissions: body.permissions });
}

async function handleAdminGetStudents(req, res) {
  requireRole(req, 'admin');
  return send(res, 200, { ok: true, students: await getAllStudents() });
}

async function handleAdminDeleteStudent(req, res, studentId) {
  requireRole(req, 'admin');
  const student = await storage.getStudentById(studentId);
  if (!student) return send(res, 404, { ok: false, errors: ['Student not found.'] });
  await storage.deleteStudentById(studentId);
  await storage.deleteUserById(student.user_id);
  await addLog('Admin', 'admin', `Deleted student ${student.name}`);
  return send(res, 200, { ok: true, message: 'Student deleted.' });
}

async function handleAdminStudentActive(req, res, studentId) {
  requireRole(req, 'admin');
  const student = await storage.getStudentById(studentId);
  if (!student) return send(res, 404, { ok: false, errors: ['Student not found.'] });
  const body = await readJsonBody(req);
  const active = body.active === true;
  const updatedStudent = await storage.updateStudentById(studentId, { active });
  await addLog('Admin', 'admin', `${active ? 'Activated' : 'Deactivated'} student ${student.name}`);
  return send(res, 200, { ok: true, active: !!updatedStudent.active });
}

async function handleAdminGetLogs(req, res) {
  requireRole(req, 'admin');
  return send(res, 200, { ok: true, logs: getAllLogs() });
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

function tryServeStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) return false;

  let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!relativePath) relativePath = 'index.html';
  if (relativePath.endsWith('/')) relativePath += 'index.html';
  if (!path.extname(relativePath)) {
    const candidateHtml = path.join(relativePath, 'index.html');
    const candidateNoDir = `${relativePath}.html`;
    const basePath = path.join(FRONTEND_DIR, candidateHtml);
    const basePathAlt = path.join(FRONTEND_DIR, candidateNoDir);
    if (fs.existsSync(basePath)) relativePath = candidateHtml;
    else if (fs.existsSync(basePathAlt)) relativePath = candidateNoDir;
  }

  const safePath = path.resolve(FRONTEND_DIR, relativePath);
  if (!safePath.startsWith(FRONTEND_DIR)) {
    send(res, 403, { ok: false, errors: ['Forbidden.'] });
    return true;
  }

  if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
    send(res, 404, { ok: false, errors: ['Not found.'] });
    return true;
  }

  const body = fs.readFileSync(safePath);
  res.writeHead(200, {
    'Content-Type': getContentType(safePath),
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  res.end(body);
  return true;
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'POST' && url.pathname === '/api/auth/signup') return await handleSignup(req, res);
    if (req.method === 'POST' && url.pathname === '/api/auth/login') return await handleLogin(req, res);
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') return await handleLogout(req, res);
    if (req.method === 'GET' && url.pathname === '/api/me') return await handleMe(req, res);
    if (req.method === 'PUT' && url.pathname === '/api/me') return await handleUpdateMe(req, res);
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/api/admin/stats') return await handleAdminStats(req, res);
    if (req.method === 'GET' && url.pathname === '/api/admin/teachers') return await handleAdminGetTeachers(req, res);
    if (req.method === 'POST' && url.pathname === '/api/admin/teachers') return await handleAdminCreateTeacher(req, res);
    if (req.method === 'GET' && url.pathname === '/api/admin/students') return await handleAdminGetStudents(req, res);
    if (req.method === 'GET' && url.pathname === '/api/admin/logs') return await handleAdminGetLogs(req, res);

    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'api' && pathParts[1] === 'admin') {
      if (pathParts[2] === 'teachers' && pathParts[3]) {
        const teacherId = Number(pathParts[3]);
        if (req.method === 'PUT' && pathParts.length === 4) return await handleAdminUpdateTeacher(req, res, teacherId);
        if (req.method === 'DELETE' && pathParts.length === 4) return await handleAdminDeleteTeacher(req, res, teacherId);
        if (req.method === 'POST' && pathParts[4] === 'active') return await handleAdminTeacherActive(req, res, teacherId);
        if (req.method === 'PUT' && pathParts[4] === 'permissions') return await handleAdminTeacherPermissions(req, res, teacherId);
      }
      if (pathParts[2] === 'students' && pathParts[3]) {
        const studentId = Number(pathParts[3]);
        if (req.method === 'DELETE' && pathParts.length === 4) return await handleAdminDeleteStudent(req, res, studentId);
        if (req.method === 'POST' && pathParts[4] === 'active') return await handleAdminStudentActive(req, res, studentId);
      }
    }

    if (tryServeStatic(req, res)) return;
    return send(res, 404, { ok: false, errors: ['Not found.'] });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    return send(res, status, { ok: false, errors: [err.message || 'Server error.'] });
  }
});

server.listen(PORT, () => {
  console.log(`Etqan backend listening on http://localhost:${PORT}`);
});

module.exports = { server };
