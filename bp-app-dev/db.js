/* =================================================================
   db.js — IndexedDB 操作モジュール
   ================================================================= */

const DB_NAME = 'BloodPressureDB';
const DB_VERSION = 3;
let db = null;

/** DB オープン */
function openDB() {
return new Promise((resolve, reject) => {
     const req = indexedDB.open(DB_NAME, DB_VERSION);
     req.onupgradeneeded = (e) => {
       const d = e.target.result;
       if (!d.objectStoreNames.contains('patients')) {
         const ps = d.createObjectStore('patients', { keyPath: 'id' });
         ps.createIndex('name', 'name', { unique: false });
       }
       if (!d.objectStoreNames.contains('readings')) {
         const rs = d.createObjectStore('readings', { keyPath: 'id', autoIncrement: true });
         rs.createIndex('byPatient', 'patientId', { unique: false });
         rs.createIndex('byPatientDate', ['patientId', 'date'], { unique: true });
         rs.createIndex('byDate', 'date', { unique: false });
       }
        if (!d.objectStoreNames.contains('monthly_summaries')) {
          const ms = d.createObjectStore('monthly_summaries', { keyPath: ['patientId', 'year', 'month'] });
          ms.createIndex('byPatient', 'patientId', { unique: false });
        }
        if (!d.objectStoreNames.contains('appointments')) {
          const as = d.createObjectStore('appointments', { keyPath: 'id', autoIncrement: true });
          as.createIndex('byPatient', 'patientId', { unique: false });
          as.createIndex('byDate', 'appointmentDate', { unique: false });
          as.createIndex('byPatientDate', ['patientId', 'appointmentDate'], { unique: true });
        }
      };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

/** トランザクション取得ショートカット */
function tx(store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

/** IDBRequest を Promise 化 */
function prom(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---- 患者マスタ ---- */

async function getPatient(id) {
  return prom(tx('patients', 'readonly').get(id));
}

async function getAllPatients() {
  return prom(tx('patients', 'readonly').getAll());
}

async function putPatient(p) {
  p.updatedAt = new Date().toISOString();
  if (!p.createdAt) p.createdAt = p.updatedAt;
  return prom(tx('patients', 'readwrite').put(p));
}

async function deletePatient(id) {
  await prom(tx('patients', 'readwrite').delete(id));
  // cascade readings
  const readings = await getReadingsByPatient(id);
  for (const r of readings) await deleteReading(r.id);
}

/* ---- 測定データ ---- */

async function getReadingsByPatient(patientId) {
  return prom(tx('readings', 'readonly').index('byPatient').getAll(patientId));
}

async function getReadingsByPatientInMonth(patientId, year, month) {
  const s = tx('readings', 'readonly').index('byPatientDate');
  const pad = m => String(m).padStart(2, '0');
  const start = [patientId, `${year}-${pad(month)}-01`];
  const end   = [patientId, `${year}-${pad(month)}-32`];
  return prom(s.getAll(IDBKeyRange.bound(start, end, false, false)));
}

async function getReadingByDate(patientId, date) {
  return prom(tx('readings', 'readonly').index('byPatientDate').get([patientId, date]));
}

async function putReading(r) {
  r.updatedAt = new Date().toISOString();
  if (!r.createdAt) r.createdAt = r.updatedAt;
  return prom(tx('readings', 'readwrite').put(r));
}

async function deleteReading(id) {
  return prom(tx('readings', 'readwrite').delete(id));
}

async function getAllReadings() {
   return prom(tx('readings', 'readonly').getAll());
}

/* ---- 月間サマリー ---- */

async function getMonthlySummary(patientId, year, month) {
   try {
     return await prom(tx('monthly_summaries', 'readonly').get([patientId, year, month]));
   } catch { return null; }
}

async function putMonthlySummary(s) {
   s.updatedAt = new Date().toISOString();
   return prom(tx('monthly_summaries', 'readwrite').put(s));
}

async function deleteMonthlySummary(patientId, year, month) {
   return prom(tx('monthly_summaries', 'readwrite').delete([patientId, year, month]));
}

async function getMonthlySummariesByPatient(patientId) {
   return prom(tx('monthly_summaries', 'readonly').index('byPatient').getAll(patientId));
}

/* ---- 予約データ ---- */

async function getAppointment(id) {
  return prom(tx('appointments', 'readonly').get(id));
}

async function getAppointmentsByPatient(patientId) {
  return prom(tx('appointments', 'readonly').index('byPatient').getAll(patientId));
}

async function getAppointmentsByDate(date) {
  return prom(tx('appointments', 'readonly').index('byDate').getAll(date));
}

async function getAppointmentsByDateRange(startDate, endDate) {
  const s = tx('appointments', 'readonly').index('byDate');
  return prom(s.getAll(IDBKeyRange.bound(startDate, endDate, false, false)));
}

async function getUpcomingAppointment(patientId) {
  const appointments = await getAppointmentsByPatient(patientId);
  const today = new Date();
  const todayStr = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
  const upcoming = appointments
    .filter(a => a.status === 'scheduled' && a.appointmentDate >= todayStr)
    .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
  return upcoming.length > 0 ? upcoming[0] : null;
}

async function putAppointment(a) {
  a.updatedAt = new Date().toISOString();
  if (!a.createdAt) a.createdAt = a.updatedAt;
  return prom(tx('appointments', 'readwrite').put(a));
}

async function deleteAppointment(id) {
  return prom(tx('appointments', 'readwrite').delete(id));
}

async function getAllAppointments() {
  return prom(tx('appointments', 'readonly').getAll());
}

async function cancelAppointment(id) {
  const a = await getAppointment(id);
  if (!a) return;
  a.status = 'cancelled';
  a.updatedAt = new Date().toISOString();
  return prom(tx('appointments', 'readwrite').put(a));
}

async function markAppointmentDone(id) {
  const a = await getAppointment(id);
  if (!a) return;
  a.status = 'done';
  a.updatedAt = new Date().toISOString();
  return prom(tx('appointments', 'readwrite').put(a));
}