const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./password');

const dbFile = process.env.DB_FILE || './data/etqan.db';
const resolved = path.isAbsolute(dbFile) ? dbFile : path.join(__dirname, '..', dbFile);
fs.mkdirSync(path.dirname(resolved), { recursive: true });

const db = new DatabaseSync(resolved);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','teacher','admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    subject TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    permissions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL UNIQUE,
    parentPhone TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    grade TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL,
    ts TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function seedDemoData() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count > 0) return;

  const demoTeachers = [
    {
      name: 'أ. سارة محمود',
      email: 'sara@etqan.com',
      password: 'Teacher@123',
      subject: 'الرياضيات',
      permissions: {
        viewStudents: true,
        toggleStudentStatus: true,
        deleteStudent: false,
        addAnnouncements: false,
        viewParentPhones: false,
      },
    },
    {
      name: 'أ. أحمد فتحي',
      email: 'ahmed@etqan.com',
      password: 'Teacher@123',
      subject: 'اللغة الإنجليزية',
      permissions: {
        viewStudents: true,
        toggleStudentStatus: false,
        deleteStudent: false,
        addAnnouncements: true,
        viewParentPhones: true,
      },
    },
  ];

  const demoStudents = [
    {
      name: 'يوسف كريم',
      email: 'youssef@etqan.com',
      password: 'Student@123',
      phone: '01012345678',
      parentPhone: '01098765432',
      subject: 'الرياضيات',
      grade: 'الأول الثانوي',
    },
  ];

  const userStmt = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
  const teacherStmt = db.prepare(
    'INSERT INTO teachers (user_id, name, email, password, subject, active, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)' 
  );
  const studentStmt = db.prepare(
    'INSERT INTO students (user_id, name, email, phone, parentPhone, subject, grade, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)' 
  );
  const logStmt = db.prepare('INSERT INTO logs (actor, role, action) VALUES (?, ?, ?)');

  userStmt.run('Admin Etqan', 'admin@etqan.com', hashPassword('Admin@123'), 'admin');

  for (const teacher of demoTeachers) {
    const info = userStmt.run(teacher.name, teacher.email, hashPassword(teacher.password), 'teacher');
    teacherStmt.run(
      info.lastInsertRowid,
      teacher.name,
      teacher.email,
      hashPassword(teacher.password),
      teacher.subject,
      1,
      JSON.stringify(teacher.permissions)
    );
  }

  for (const student of demoStudents) {
    const info = userStmt.run(student.name, student.email, hashPassword(student.password), 'student');
    studentStmt.run(
      info.lastInsertRowid,
      student.name,
      student.email,
      student.phone,
      student.parentPhone,
      student.subject,
      student.grade,
      1
    );
  }

  logStmt.run('النظام', 'system', 'تهيئة قاعدة بيانات الديمو وتسجيل المستخدمين التجريبيين');
}

seedDemoData();

module.exports = { db };
