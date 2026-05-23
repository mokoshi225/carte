/* =================================================================
   db.js — IndexedDB 操作モジュール v3.0.0
   ================================================================= */

/**
 * @typedef {Object} PatientData
 * @property {string} id - 患者ID
 * @property {string} name - 氏名
 * @property {string} [gender] - 性別
 * @property {string} [birthDate] - 生年月日
 * @property {string} [memo] - メモ
 * @property {string} [summary] - 評価サマリー
 * @property {Array<{date:string,section:string,text:string}>} [soapHistory] - SOAP履歴
 * @property {string} createdAt - 作成日時
 * @property {string} updatedAt - 更新日時
 */

/**
 * @typedef {Object} ReadingData
 * @property {number} [id] - 自動採番ID
 * @property {string} patientId - 患者ID
 * @property {string} date - 測定日 YYYY-MM-DD
 * @property {number} [systolic] - 受診時収縮期血圧
 * @property {number} [diastolic] - 受診時拡張期血圧
 * @property {number} [meanArterial] - 平均血圧
 * @property {number} [avgSbp] - 家庭SBP平均
 * @property {number} [avgDbp] - 家庭DBP平均
 * @property {number} [minSbp] - 家庭SBP最小
 * @property {number} [minDbp] - 家庭DBP最小
 * @property {number} [maxSbp] - 家庭SBP最大
 * @property {number} [maxDbp] - 家庭DBP最大
 * @property {number} [minSbpPm] - 夕SBP最小
 * @property {number} [maxSbpPm] - 夕SBP最大
 * @property {number} [weight] - 体重
 * @property {string} [note] - メモ
 * @property {string} [subjective] - S（主訴）
 * @property {string} createdAt - 作成日時
 * @property {string} updatedAt - 更新日時
 */

/**
 * @typedef {Object} AppointmentData
 * @property {number} [id] - 自動採番ID
 * @property {string} patientId - 患者ID
 * @property {string} appointmentDate - 予約日 YYYY-MM-DD
 * @property {number} [medicationDays] - 処方日数
 * @property {string} [medicationNote] - 処方メモ
 * @property {string} status - ステータス (scheduled|done|cancelled)
 * @property {string} createdAt - 作成日時
 * @property {string} updatedAt - 更新日時
 */

/**
 * @typedef {Object} DaySettingData
 * @property {string} date - 日付 YYYY-MM-DD
 * @property {{isHoliday:boolean,isBusinessTrip:boolean,isLimited:boolean,isClosed:boolean}} flags - フラグ
 * @property {number} busyLevel - 混雑度 (-1空き〜2激混み)
 * @property {string} [note] - メモ
 * @property {boolean} [isManual] - 手動設定か
 * @property {string} updatedAt - 更新日時
 */

BPApp.DB = (function () {

  const DB_NAME = 'BloodPressureDB';
  const DB_VERSION = 4;
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
        if (!d.objectStoreNames.contains('daySettings')) {
          d.createObjectStore('daySettings', { keyPath: 'date' });
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

  async function getLatestReading(patientId) {
    const readings = await getReadingsByPatient(patientId);
    if (!readings || readings.length === 0) return null;
    readings.sort((a, b) => b.date.localeCompare(a.date));
    return readings[0];
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

  /* ---- 日付設定 ---- */

  async function getDaySetting(date) {
    try { return await prom(tx('daySettings', 'readonly').get(date)); } catch { return null; }
  }

  async function putDaySetting(ds) {
    ds.updatedAt = new Date().toISOString();
    return prom(tx('daySettings', 'readwrite').put(ds));
  }

  async function getDaySettingsByDateRange(startDate, endDate) {
    const s = tx('daySettings', 'readonly');
    return prom(s.getAll(IDBKeyRange.bound(startDate, endDate, false, false)));
  }

  async function deleteDaySetting(date) {
    return prom(tx('daySettings', 'readwrite').delete(date));
  }

  /* ---- グローバル公開（後方互換性） ---- */

  window.openDB = openDB;
  window.tx = tx;
  window.prom = prom;
  window.getPatient = getPatient;
  window.getAllPatients = getAllPatients;
  window.putPatient = putPatient;
  window.deletePatient = deletePatient;
  window.getReadingsByPatient = getReadingsByPatient;
  window.getReadingsByPatientInMonth = getReadingsByPatientInMonth;
  window.getReadingByDate = getReadingByDate;
  window.putReading = putReading;
  window.deleteReading = deleteReading;
  window.getLatestReading = getLatestReading;
  window.getAllReadings = getAllReadings;
  window.getMonthlySummary = getMonthlySummary;
  window.putMonthlySummary = putMonthlySummary;
  window.deleteMonthlySummary = deleteMonthlySummary;
  window.getMonthlySummariesByPatient = getMonthlySummariesByPatient;
  window.getAppointment = getAppointment;
  window.getAppointmentsByPatient = getAppointmentsByPatient;
  window.getAppointmentsByDate = getAppointmentsByDate;
  window.getAppointmentsByDateRange = getAppointmentsByDateRange;
  window.getUpcomingAppointment = getUpcomingAppointment;
  window.putAppointment = putAppointment;
  window.deleteAppointment = deleteAppointment;
  window.getAllAppointments = getAllAppointments;
  window.cancelAppointment = cancelAppointment;
  window.markAppointmentDone = markAppointmentDone;
  window.getDaySetting = getDaySetting;
  window.putDaySetting = putDaySetting;
  window.getDaySettingsByDateRange = getDaySettingsByDateRange;
  window.deleteDaySetting = deleteDaySetting;

  /* ---- 公開API ---- */

  return {
    openDB: openDB,
    getPatient: getPatient,
    getAllPatients: getAllPatients,
    putPatient: putPatient,
    deletePatient: deletePatient,
    getReadingsByPatient: getReadingsByPatient,
    getReadingsByPatientInMonth: getReadingsByPatientInMonth,
    getReadingByDate: getReadingByDate,
    putReading: putReading,
    deleteReading: deleteReading,
    getLatestReading: getLatestReading,
    getAllReadings: getAllReadings,
    getMonthlySummary: getMonthlySummary,
    putMonthlySummary: putMonthlySummary,
    deleteMonthlySummary: deleteMonthlySummary,
    getMonthlySummariesByPatient: getMonthlySummariesByPatient,
    getAppointment: getAppointment,
    getAppointmentsByPatient: getAppointmentsByPatient,
    getAppointmentsByDate: getAppointmentsByDate,
    getAppointmentsByDateRange: getAppointmentsByDateRange,
    getUpcomingAppointment: getUpcomingAppointment,
    putAppointment: putAppointment,
    deleteAppointment: deleteAppointment,
    getAllAppointments: getAllAppointments,
    cancelAppointment: cancelAppointment,
    markAppointmentDone: markAppointmentDone,
    getDaySetting: getDaySetting,
    putDaySetting: putDaySetting,
    getDaySettingsByDateRange: getDaySettingsByDateRange,
    deleteDaySetting: deleteDaySetting
  };

})();
