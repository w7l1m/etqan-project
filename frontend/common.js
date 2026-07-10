(function(window){
  // Set the backend API base for production deployment.
  // Change this to your backend host before deploying the frontend to Vercel.
  window.ETQAN_API_BASE = window.ETQAN_API_BASE || 'http://localhost:4000';

  // Deprecated local mock removed. Use EtqanAPI for all data/auth operations.
  function warn(){ console.warn('EtqanDB shim: local mock removed — use EtqanAPI instead.'); }

  async function loginAdmin(email, password){
    warn();
    const res = await window.EtqanAPI.login({ email, password });
    if(!res.ok) return { ok:false, error: (res.errors && res.errors[0]) || 'Login failed' };
    if(res.user && res.user.role!=='admin') return { ok:false, error: 'هذا الحساب ليس حساب مدير.' };
    return { ok:true, admin: res.user };
  }

  async function loginTeacher(email, password){
    warn();
    const res = await window.EtqanAPI.login({ email, password });
    if(!res.ok) return { ok:false, error: (res.errors && res.errors[0]) || 'Login failed' };
    if(res.user && res.user.role!=='teacher') return { ok:false, error: 'هذا الحساب ليس حساب مدرس.' };
    return { ok:true, teacher: res.user };
  }

  async function loginStudent(email, password){
    warn();
    const res = await window.EtqanAPI.login({ email, password });
    if(!res.ok) return { ok:false, error: (res.errors && res.errors[0]) || 'Login failed' };
    if(res.user && res.user.role!=='student') return { ok:false, error: 'هذا الحساب ليس حساب طالب.' };
    return { ok:true, student: res.user };
  }

  async function registerStudent({ name, email, password, phone, grade }){
    warn();
    const res = await window.EtqanAPI.signup({ name, email, password, role: 'student', phone, grade });
    if(!res.ok) return { ok:false, error: (res.errors && res.errors[0]) || 'Signup failed' };
    return { ok:true, student: res.user };
  }

  async function logout(){ warn(); return window.EtqanAPI.logout(); }
  async function getSession(){ warn(); return window.EtqanAPI.me(); }

  // Admin wrappers
  async function listTeachers(){ warn(); return window.EtqanAPI.adminGetTeachers(); }
  async function listStudents(){ warn(); return window.EtqanAPI.adminGetStudents(); }
  async function listLogs(){ warn(); return window.EtqanAPI.adminGetLogs(); }
  async function addTeacher(payload){ warn(); return window.EtqanAPI.adminCreateTeacher(payload); }
  async function updateTeacher(id,payload){ warn(); return window.EtqanAPI.adminUpdateTeacher(id,payload); }
  async function setTeacherActive(id,active){ warn(); return window.EtqanAPI.adminSetTeacherActive(id,active); }
  async function setTeacherPermissions(id,perms){ warn(); return window.EtqanAPI.adminSetTeacherPermissions(id,perms); }
  async function deleteTeacher(id){ warn(); return window.EtqanAPI.adminDeleteTeacher(id); }
  async function deleteStudent(id){ warn(); return window.EtqanAPI.adminDeleteStudent(id); }
  async function setStudentActive(id,active){ warn(); return window.EtqanAPI.adminSetStudentActive(id,active); }

  window.EtqanDB = {
    // auth
    loginAdmin, loginTeacher, loginStudent, registerStudent, logout, getSession,
    // admin
    listTeachers, listStudents, listLogs, addTeacher, updateTeacher, setTeacherActive, setTeacherPermissions, deleteTeacher, deleteStudent, setStudentActive
  };
})(window);
