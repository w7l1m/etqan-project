/* ======================================================
   إتقان — عميل API للمصادقة (يتصل بالباك-إند الحقيقي)
   ====================================================== */
(function (window) {
  // Point this at your backend. Change for production deployment.
  const API_BASE = window.ETQAN_API_BASE || (window.location.hostname ? `${window.location.protocol}//${window.location.host}` : 'http://localhost:4000');

  const TOKEN_KEY = 'etqan_token_v1';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, { method = 'GET', body, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    let res;
    try {
      const targetUrl = new URL(path, `${API_BASE}/`);
      res = await fetch(targetUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      return { ok: false, status: 0, errors: ['تعذّر الاتصال بالخادم. تأكد إن الباك-إند شغّال.'] };
    }
    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      return { ok: false, status: res.status, errors: data.errors || ['حدث خطأ غير متوقع.'] };
    }
    return { ok: true, status: res.status, ...data };
  }

  async function signup({ name, email, password, role }) {
    const res = await request('/api/auth/signup', { method: 'POST', body: { name, email, password, role } });
    if (res.ok) setToken(res.token);
    return res;
  }

  async function login({ email, password }) {
    const res = await request('/api/auth/login', { method: 'POST', body: { email, password } });
    if (res.ok) setToken(res.token);
    return res;
  }

  async function logout() {
    const res = await request('/api/auth/logout', { method: 'POST', auth: true });
    clearToken(); // remove client-side regardless of server response
    return res;
  }

  async function me() {
    return request('/api/me', { method: 'GET', auth: true });
  }

  async function updateMe(payload) {
    return request('/api/me', { method: 'PUT', body: payload, auth: true });
  }

  /* ---------- Admin APIs ---------- */
  async function adminStats() {
    return request('/api/admin/stats', { method: 'GET', auth: true });
  }

  async function adminGetTeachers() {
    return request('/api/admin/teachers', { method: 'GET', auth: true });
  }

  async function adminCreateTeacher(payload) {
    return request('/api/admin/teachers', { method: 'POST', body: payload, auth: true });
  }

  async function adminUpdateTeacher(id, payload) {
    return request(`/api/admin/teachers/${id}`, { method: 'PUT', body: payload, auth: true });
  }

  async function adminDeleteTeacher(id) {
    return request(`/api/admin/teachers/${id}`, { method: 'DELETE', auth: true });
  }

  async function adminSetTeacherActive(id, active) {
    return request(`/api/admin/teachers/${id}/active`, { method: 'POST', body: { active }, auth: true });
  }

  async function adminSetTeacherPermissions(id, permissions) {
    return request(`/api/admin/teachers/${id}/permissions`, { method: 'PUT', body: { permissions }, auth: true });
  }

  async function adminGetStudents() {
    return request('/api/admin/students', { method: 'GET', auth: true });
  }

  async function adminDeleteStudent(id) {
    return request(`/api/admin/students/${id}`, { method: 'DELETE', auth: true });
  }

  async function adminSetStudentActive(id, active) {
    return request(`/api/admin/students/${id}/active`, { method: 'POST', body: { active }, auth: true });
  }

  async function adminGetLogs() {
    return request('/api/admin/logs', { method: 'GET', auth: true });
  }

  function isLoggedIn() {
    return !!getToken();
  }

  window.EtqanAPI = { signup, login, logout, me, isLoggedIn, getToken,
    adminStats, adminGetTeachers, adminCreateTeacher, adminUpdateTeacher, adminDeleteTeacher, adminSetTeacherActive, adminSetTeacherPermissions,
    adminGetStudents, adminDeleteStudent, adminSetStudentActive, adminGetLogs };
  window.EtqanAPI.updateMe = updateMe;
})(window);
