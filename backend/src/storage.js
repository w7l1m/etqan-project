const path = require('node:path');
const fs = require('node:fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

function buildQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      params.append(key, `eq.${value}`);
    } else if (Array.isArray(value)) {
      params.append(key, `in.(${value.map(String).join(',')})`);
    } else {
      params.append(key, `eq.${String(value)}`);
    }
  }
  return params.toString();
}

async function supabaseRequest(path, options = {}) {
  const url = new URL(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${path}`);
  if (options.query) {
    url.search = options.query;
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Accept: 'application/json',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  const res = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    const message = data && data.message ? data.message : `Supabase request failed: ${res.status}`;
    throw new Error(message);
  }

  return data;
}

function supabaseSelect(table, filters = {}, select = '*', order = null) {
  const query = buildQuery(filters);
  const params = new URLSearchParams();
  params.append('select', select);
  if (order) params.append('order', order);
  const finalQuery = query ? `${query}&${params.toString()}` : params.toString();
  return supabaseRequest(table, { query: finalQuery, method: 'GET' });
}

function supabaseCount(table, filters = {}) {
  const query = buildQuery(filters);
  const params = new URLSearchParams();
  params.append('select', 'count');
  if (query) params.append('count', 'exact');
  else params.append('count', 'exact');
  const finalQuery = query ? `${query}&${params.toString()}` : params.toString();
  return supabaseRequest(table, { query: finalQuery, method: 'GET' });
}

function supabaseInsert(table, payload) {
  return supabaseRequest(table, { method: 'POST', body: payload, prefer: 'return=representation' });
}

function supabaseUpdate(table, payload, filters = {}) {
  const query = buildQuery(filters);
  return supabaseRequest(table, { method: 'PATCH', query, body: payload, prefer: 'return=representation' });
}

function supabaseDelete(table, filters = {}) {
  const query = buildQuery(filters);
  return supabaseRequest(table, { method: 'DELETE', query });
}

if (useSupabase) {
  module.exports = {
    useSupabase,
    async getUserByEmail(email) {
      const users = await supabaseSelect('users', { email });
      return users[0] || null;
    },
    async getUserById(id) {
      const users = await supabaseSelect('users', { id });
      return users[0] || null;
    },
    async getUserByEmailExcludeId(email, excludeId) {
      const users = await supabaseRequest('users', {
        query: `select=*&email=eq.${encodeURIComponent(email)}&id=not.eq.${encodeURIComponent(excludeId)}`,
        method: 'GET',
      });
      return users[0] || null;
    },
    async createUser({ name, email, password, role }) {
      const rows = await supabaseInsert('users', [{ name, email, password, role }]);
      return rows[0];
    },
    async updateUser(id, { name, email, password }) {
      const rows = await supabaseUpdate('users', { name, email, password }, { id });
      return rows[0];
    },
    async getTeacherByUserId(userId) {
      const teachers = await supabaseSelect('teachers', { user_id: userId });
      return teachers[0] || null;
    },
    async getTeacherById(id) {
      const teachers = await supabaseSelect('teachers', { id });
      return teachers[0] || null;
    },
    async createTeacher({ user_id, name, email, password, subject, active, permissions }) {
      const rows = await supabaseInsert('teachers', [{ user_id, name, email, password, subject, active, permissions }]);
      return rows[0];
    },
    async updateTeacherById(id, payload) {
      const rows = await supabaseUpdate('teachers', payload, { id });
      return rows[0];
    },
    async deleteTeacherById(id) {
      await supabaseDelete('teachers', { id });
    },
    async deleteStudentById(id) {
      await supabaseDelete('students', { id });
    },
    async deleteUserById(id) {
      await supabaseDelete('users', { id });
    },
    async getAllTeachers() {
      return supabaseSelect('teachers', {}, '*', 'name.asc');
    },
    async getStudentByUserId(userId) {
      const students = await supabaseSelect('students', { user_id: userId });
      return students[0] || null;
    },
    async getStudentById(id) {
      const students = await supabaseSelect('students', { id });
      return students[0] || null;
    },
    async createStudent({ user_id, name, email, phone, parentPhone, subject, grade, active }) {
      const rows = await supabaseInsert('students', [{ user_id, name, email, phone, parentPhone, subject, grade, active }]);
      return rows[0];
    },
    async updateStudentByUserId(userId, payload) {
      const rows = await supabaseUpdate('students', payload, { user_id: userId });
      return rows[0];
    },
    async getAllStudents() {
      return supabaseSelect('students', {}, '*', 'name.asc');
    },
    async addLog(actor, role, action) {
      await supabaseInsert('logs', [{ actor, role, action }]);
    },
    async getAllLogs() {
      return supabaseSelect('logs', {}, '*', 'ts.desc');
    },
    async isTokenRevoked(jti) {
      const rows = await supabaseSelect('revoked_tokens', { jti });
      return rows.length > 0;
    },
    async revokeToken(jti) {
      await supabaseInsert('revoked_tokens', [{ jti }]);
    },
    async getCount(table, filters = {}) {
      const result = await supabaseCount(table, filters);
      return Number(result[0]?.count || 0);
    },
    async seedDemoData() {
      const users = await supabaseSelect('users', {}, 'id');
      if (users.length > 0) return;
      const defaultUsers = [
        { name: 'Admin Etqan', email: 'admin@etqan.com', password: 'Admin@123', role: 'admin' },
      ];
      for (const user of defaultUsers) {
        await this.createUser(user);
      }
    },
  };
} else {
  const { db, seedDemoData } = require('./db');
  module.exports = {
    useSupabase,
    getUserByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    },
    getUserById(id) {
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    },
    getUserByEmailExcludeId(email, excludeId) {
      return db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, excludeId);
    },
    createUser({ name, email, password, role }) {
      const info = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(name, email, password, role);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    },
    updateUser(id, { name, email, password }) {
      db.prepare('UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?').run(name, email, password, id);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    },
    getTeacherByUserId(userId) {
      return db.prepare('SELECT * FROM teachers WHERE user_id = ?').get(userId);
    },
    getTeacherById(id) {
      return db.prepare('SELECT * FROM teachers WHERE id = ?').get(id);
    },
    createTeacher({ user_id, name, email, password, subject, active, permissions }) {
      const info = db
        .prepare('INSERT INTO teachers (user_id, name, email, password, subject, active, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(user_id, name, email, password, subject, active, JSON.stringify(permissions));
      return db.prepare('SELECT * FROM teachers WHERE id = ?').get(info.lastInsertRowid);
    },
    updateTeacherById(id, payload) {
      const fields = [];
      const params = [];
      if (payload.name !== undefined) { fields.push('name = ?'); params.push(payload.name); }
      if (payload.email !== undefined) { fields.push('email = ?'); params.push(payload.email); }
      if (payload.password !== undefined) { fields.push('password = ?'); params.push(payload.password); }
      if (payload.subject !== undefined) { fields.push('subject = ?'); params.push(payload.subject); }
      if (payload.active !== undefined) { fields.push('active = ?'); params.push(payload.active ? 1 : 0); }
      if (payload.permissions !== undefined) { fields.push('permissions = ?'); params.push(JSON.stringify(payload.permissions)); }
      if (!fields.length) return null;
      params.push(id);
      db.prepare(`UPDATE teachers SET ${fields.join(', ')} WHERE id = ?`).run(...params);
      return this.getTeacherById(id);
    },
    deleteTeacherById(id) {
      return db.prepare('DELETE FROM teachers WHERE id = ?').run(id);
    },
    getAllTeachers() {
      return db.prepare('SELECT * FROM teachers ORDER BY name ASC').all();
    },
    deleteStudentById(id) {
      return db.prepare('DELETE FROM students WHERE id = ?').run(id);
    },
    deleteUserById(id) {
      return db.prepare('DELETE FROM users WHERE id = ?').run(id);
    },
    getStudentByUserId(userId) {
      return db.prepare('SELECT * FROM students WHERE user_id = ?').get(userId);
    },
    getStudentById(id) {
      return db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    },
    createStudent({ user_id, name, email, phone, parentPhone, subject, grade, active }) {
      const info = db
        .prepare('INSERT INTO students (user_id, name, email, phone, parentPhone, subject, grade, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(user_id, name, email, phone, parentPhone, subject, grade, active ? 1 : 0);
      return db.prepare('SELECT * FROM students WHERE id = ?').get(info.lastInsertRowid);
    },
    updateStudentByUserId(userId, payload) {
      const fields = [];
      const params = [];
      if (payload.name !== undefined) { fields.push('name = ?'); params.push(payload.name); }
      if (payload.email !== undefined) { fields.push('email = ?'); params.push(payload.email); }
      if (payload.phone !== undefined) { fields.push('phone = ?'); params.push(payload.phone); }
      if (payload.parentPhone !== undefined) { fields.push('parentPhone = ?'); params.push(payload.parentPhone); }
      if (payload.subject !== undefined) { fields.push('subject = ?'); params.push(payload.subject); }
      if (payload.grade !== undefined) { fields.push('grade = ?'); params.push(payload.grade); }
      if (payload.active !== undefined) { fields.push('active = ?'); params.push(payload.active ? 1 : 0); }
      if (!fields.length) return null;
      params.push(userId);
      db.prepare(`UPDATE students SET ${fields.join(', ')} WHERE user_id = ?`).run(...params);
      return this.getStudentByUserId(userId);
    },
    updateStudentById(id, payload) {
      const fields = [];
      const params = [];
      if (payload.name !== undefined) { fields.push('name = ?'); params.push(payload.name); }
      if (payload.email !== undefined) { fields.push('email = ?'); params.push(payload.email); }
      if (payload.phone !== undefined) { fields.push('phone = ?'); params.push(payload.phone); }
      if (payload.parentPhone !== undefined) { fields.push('parentPhone = ?'); params.push(payload.parentPhone); }
      if (payload.subject !== undefined) { fields.push('subject = ?'); params.push(payload.subject); }
      if (payload.grade !== undefined) { fields.push('grade = ?'); params.push(payload.grade); }
      if (payload.active !== undefined) { fields.push('active = ?'); params.push(payload.active ? 1 : 0); }
      if (!fields.length) return null;
      params.push(id);
      db.prepare(`UPDATE students SET ${fields.join(', ')} WHERE id = ?`).run(...params);
      return this.getStudentById(id);
    },
    getAllStudents() {
      return db.prepare('SELECT * FROM students ORDER BY name ASC').all();
    },
    addLog(actor, role, action) {
      return db.prepare('INSERT INTO logs (actor, role, action) VALUES (?, ?, ?)').run(actor, role, action);
    },
    getAllLogs() {
      return db.prepare('SELECT * FROM logs ORDER BY ts DESC').all();
    },
    isTokenRevoked(jti) {
      const row = db.prepare('SELECT jti FROM revoked_tokens WHERE jti = ?').get(jti);
      return !!row;
    },
    revokeToken(jti) {
      return db.prepare('INSERT OR IGNORE INTO revoked_tokens (jti) VALUES (?)').run(jti);
    },
    getCount(table, filters = {}) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}${filters.active !== undefined ? ' WHERE active = ?' : ''}`).get(filters.active !== undefined ? (filters.active ? 1 : 0) : undefined);
      return Number(row.count || 0);
    },
    seedDemoData,
  };
}
