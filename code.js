/**
 * =======================================================================================
 *  Club Registration System - Server-Side (Google Apps Script)
 *  เวอร์ชันปรับปรุง: เพิ่ม UI, ผู้ใช้งานทั่วไป, และหน้าแสดงรายละเอียดวิชา
 * =======================================================================================
 *  - จัดการข้อมูลจากชีต 'Clubs', 'Students', 'GeneralUsers', 'Config'
 *  - ใช้การเข้ารหัสรหัสผ่าน (Hashing) เพื่อความปลอดภัย
 *  - ให้บริการข้อมูลทั้งหมดที่จำเป็นสำหรับ UI ที่สมบูรณ์
 * =======================================================================================
 */

// --- 🚀 การกำหนดค่าและค่าคงที่ 🚀 ---
const STUDENTS_SHEET_NAME = 'Students';
const CLUBS_SHEET_NAME = 'Clubs';
const GENERAL_USERS_SHEET_NAME = 'GeneralUsers';
const CONFIG_SHEET_NAME = 'Config'; 

// ❗️❗️ สำคัญ: เปลี่ยนค่านี้เป็นข้อความลับเฉพาะของคุณ เพื่อความปลอดภัยในการเข้ารหัสรหัสผ่าน
const PASSWORD_SECRET_ = 'your-very-secret-and-unique-key-for-hashing-kruarthur';

// --- ค่าคงที่สำหรับคอลัมน์ในชีต (1-based index) ---
const COL_CLUB_ID = 1, COL_CLUB_CAPACITY = 10, COL_CLUB_REGISTERED = 11, 
      COL_CLUB_ISACTIVE = 13, COL_CLUB_LAST_COLUMN = 18;
const COL_STUDENT_ID = 1, COL_STUDENT_PASSWORD_HASH = 4, COL_STUDENT_REG_CLUB_IDS = 5;
const COL_GEN_EMAIL = 1, COL_GEN_PASSWORD_HASH = 3, COL_GEN_REG_CLUB_IDS = 4;


/**
 * @description ฟังก์ชันหลักที่แสดงผลหน้าเว็บ HTML เมื่อมีการเรียกใช้งาน
 */
function doGet(e) {
  Logger.log(`Serving HTML for request: ${JSON.stringify(e?.parameter)}`);
  try {
    const template = HtmlService.createTemplateFromFile('index.html'); // ตรวจสอบว่าไฟล์ HTML ของคุณชื่อ 'index.html'
    const siteConfig = getSiteConfiguration_();
    template.siteConfig = siteConfig;
    template.academicYear = siteConfig.academicYearNumber && String(siteConfig.academicYearNumber).trim() !== '' 
                             ? siteConfig.academicYearNumber 
                             : (new Date().getFullYear() + 543);
    return template.evaluate()
        .setTitle(siteConfig.siteTitle || 'ระบบห้องเรียนออนไลน์ครูอาร์เธอร์')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
     Logger.log(`Error in doGet: ${error.message}\n${error.stack}`);
     return HtmlService.createHtmlOutput(`<b>เกิดข้อผิดพลาดในการโหลดหน้าเว็บ:</b> ${error.message}.`);
  }
}

/**
 * @description ดึงการตั้งค่าเว็บไซต์จากชีต 'Config'
 */
function getSiteConfiguration_() {
    const defaultConfig = { 
      siteTitle: 'ระบบห้องเรียนออนไลน์ครูอาร์เธอร์', 
      academicYearPrefix: 'ปีการศึกษา', 
      defaultClubImageURL: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="%239ca3af"%3E%3Cpath stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /%3E%3C/svg%3E'
    };
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET_NAME);
        if (!sheet) return defaultConfig;
        const values = sheet.getDataRange().getValues();
        const configFromSheet = values.reduce((acc, row) => {
            const key = String(row[0] || '').trim();
            const value = String(row[1] || '').trim();
            if (key) acc[key] = value;
            return acc;
        }, {});
        const mergedConfig = { ...defaultConfig, ...configFromSheet };
        if (!mergedConfig.defaultClubImageURL) mergedConfig.defaultClubImageURL = defaultConfig.defaultClubImageURL;
        return mergedConfig;
    } catch (error) {
        Logger.log(`Error in getSiteConfiguration_: ${error.message}`);
        return defaultConfig;
    }
}

/**
 * @description ดึงข้อมูลวิชาทั้งหมดที่เปิดใช้งาน (isActive = TRUE) จากชีต
 */
function getClubs() {
  Logger.log("Server: getClubs function started.");
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CLUBS_SHEET_NAME);
    if (!sheet) throw new Error(`ไม่พบชีต '${CLUBS_SHEET_NAME}'`);
    
    const siteConfig = getSiteConfiguration_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, COL_CLUB_LAST_COLUMN);
    return dataRange.getValues().reduce((acc, row) => {
      if (row[COL_CLUB_ISACTIVE - 1] === true) {
        const clubId = parseInt(row[0], 10); 
        if (!isNaN(clubId)) {
          const capacity = parseInt(row[9], 10); 
          const registered = parseInt(row[10], 10);
          acc.push({ 
            id: clubId, name: String(row[1] || ''), category: String(row[2] || ''), level: String(row[3] || ''), teacher: String(row[4] || ''), description: String(row[5] || ''), location: String(row[6] || ''), day: String(row[7] || ''), time: String(row[8] || ''), 
            capacity: isNaN(capacity) ? 0 : capacity, registered: isNaN(registered) ? 0 : registered, 
            image: String(row[11] || '').trim() || siteConfig.defaultClubImageURL,
            playLink: String(row[13] || ''), hours: String(row[14] || ''), topics: String(row[15] || '').replace(/\n/g, '<br>'), syllabusPdf: String(row[16] || ''), materialsPdf: String(row[17] || '')
          });
        }
      }
      return acc;
    }, []);
  } catch (error) { 
    Logger.log(`Server Error in getClubs: ${error.message}\n${error.stack}`); 
    return { error: `เกิดข้อผิดพลาดในการดึงข้อมูลรายวิชา: ${error.message}` }; 
  }
}

// --- 👤 ฟังก์ชันสำหรับผู้ใช้ (นักเรียนและทั่วไป) ---

function loginStudent(studentId, password) {
  if (!studentId || !password) return { error: "กรุณากรอกรหัสนักเรียนและรหัสผ่าน" };
  const userRowData = findStudentRow_(studentId);
  if (!userRowData) return { error: "รหัสนักเรียนนี้ไม่มีในระบบ" };
  if (!verifyPassword_(password, userRowData.data.passwordHash)) return { error: "รหัสผ่านไม่ถูกต้อง" };
  Logger.log(`Login success (student): ${studentId}`);
  return { id: userRowData.data.id, name: userRowData.data.name, class: userRowData.data.class, registeredClub: userRowData.data.registeredClub, userType: 'student' };
}

function registerStudent(userData) {
  if (!userData?.id || !userData.name || !userData.class || !userData.password) return { error: "ข้อมูลลงทะเบียนไม่ครบถ้วน" };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STUDENTS_SHEET_NAME);
  if (findStudentRow_(userData.id, sheet)) return { error: "รหัสนักเรียนนี้มีผู้ใช้งานแล้ว" };
  sheet.appendRow([userData.id, userData.name, userData.class, hashPassword_(userData.password), ""]);
  SpreadsheetApp.flush();
  Logger.log(`Registration success (student): ${userData.id}`);
  return { id: userData.id, name: userData.name, class: userData.class, registeredClub: [], userType: 'student' };
}

function loginGeneralUser(email, password) {
    if (!email || !password) return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };
    const userRowData = findGeneralUserRow_(email);
    if (!userRowData) return { error: "ไม่พบอีเมลนี้ในระบบ" };
    if (!verifyPassword_(password, userRowData.data.passwordHash)) return { error: "รหัสผ่านไม่ถูกต้อง" };
    Logger.log(`Login success (general): ${email}`);
    return { id: userRowData.data.email, name: userRowData.data.name, registeredClub: userRowData.data.registeredClub, userType: 'general' };
}

function registerGeneralUser(userData) {
    if (!userData?.name || !userData.email || !userData.password) return { error: "ข้อมูลลงทะเบียนไม่ครบถ้วน" };
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GENERAL_USERS_SHEET_NAME);
    if (findGeneralUserRow_(userData.email, sheet)) return { error: "อีเมลนี้มีผู้ใช้งานแล้ว" };
    sheet.appendRow([userData.email, userData.name, hashPassword_(userData.password), ""]);
    SpreadsheetApp.flush();
    Logger.log(`Registration success (general): ${userData.email}`);
    return { id: userData.email, name: userData.name, registeredClub: [], userType: 'general' };
}

// --- 📝 ฟังก์ชันการลงทะเบียนรายวิชา (ใช้ร่วมกัน) ---

function registerForClub(userId, clubId, userType) {
  if (!userId || !clubId || !userType) return { error: "ข้อมูลไม่ถูกต้อง (ID ผู้ใช้/วิชา/ประเภท)" };
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) throw new Error("ระบบเครือข่ายไม่เสถียร โปรดลองอีกครั้งในภายหลัง");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clubSheet = ss.getSheetByName(CLUBS_SHEET_NAME);
    const clubRowData = findClubRow_(clubId, clubSheet);
    if (!clubRowData) throw new Error("ไม่พบข้อมูลรายวิชาที่เลือก");
    if (clubRowData.data.registered >= clubRowData.data.capacity) throw new Error("รายวิชานี้รับผู้เข้าเรียนเต็มจำนวนแล้ว");
    const userRowData = (userType === 'student') ? findStudentRow_(userId) : findGeneralUserRow_(userId);
    if (!userRowData) throw new Error("ไม่พบข้อมูลผู้ใช้");
    if (userRowData.data.registeredClub.includes(clubId)) throw new Error("คุณได้ลงทะเบียนเรียนในรายวิชานี้แล้ว");
    clubSheet.getRange(clubRowData.rowIndex, COL_CLUB_REGISTERED).setValue(clubRowData.data.registered + 1);
    const userSheetName = (userType === 'student') ? STUDENTS_SHEET_NAME : GENERAL_USERS_SHEET_NAME;
    const userClubColumn = (userType === 'student') ? COL_STUDENT_REG_CLUB_IDS : COL_GEN_REG_CLUB_IDS;
    const updatedUserClubs = [...userRowData.data.registeredClub, clubId];
    ss.getSheetByName(userSheetName).getRange(userRowData.rowIndex, userClubColumn).setValue(updatedUserClubs.join(','));
    SpreadsheetApp.flush();
    Logger.log(`${userType} ${userId} registered for club ${clubId}`);
    return { success: true, allUserClubs: updatedUserClubs, updatedClubData: { id: clubId, registered: clubRowData.data.registered + 1, capacity: clubRowData.data.capacity } };
  } catch (e) {
    Logger.log(`Error registerForClub: ${e.message}`);
    return { error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function cancelClubRegistration(userId, clubId, userType) {
  if (!userId || !clubId || !userType) return { error: "ข้อมูลไม่ถูกต้อง" };
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) throw new Error("ระบบเครือข่ายไม่สเถียร โปรดลองอีกครั้งในภายหลัง");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userRowData = (userType === 'student') ? findStudentRow_(userId) : findGeneralUserRow_(userId);
    if (!userRowData) throw new Error("ไม่พบข้อมูลผู้ใช้");
    if (!userRowData.data.registeredClub.includes(clubId)) throw new Error("คุณยังไม่ได้ลงทะเบียนเรียนในรายวิชานี้");
    const userSheetName = (userType === 'student') ? STUDENTS_SHEET_NAME : GENERAL_USERS_SHEET_NAME;
    const userClubColumn = (userType === 'student') ? COL_STUDENT_REG_CLUB_IDS : COL_GEN_REG_CLUB_IDS;
    const updatedUserClubs = userRowData.data.registeredClub.filter(id => id !== clubId);
    ss.getSheetByName(userSheetName).getRange(userRowData.rowIndex, userClubColumn).setValue(updatedUserClubs.join(','));
    const clubSheet = ss.getSheetByName(CLUBS_SHEET_NAME);
    const clubRowData = findClubRow_(clubId, clubSheet);
    let updatedClubData = null;
    if (clubRowData && clubRowData.data.registered > 0) {
        const newCount = clubRowData.data.registered - 1;
        clubSheet.getRange(clubRowData.rowIndex, COL_CLUB_REGISTERED).setValue(newCount);
        updatedClubData = { id: clubId, registered: newCount, capacity: clubRowData.data.capacity };
    }
    SpreadsheetApp.flush();
    Logger.log(`${userType} ${userId} cancelled registration for club ${clubId}`);
    return { success: true, remainingUserClubs: updatedUserClubs, updatedClubData: updatedClubData };
  } catch (e) {
    Logger.log(`Error cancelClubRegistration: ${e.message}`);
    return { error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// --- 🛠️ ฟังก์ชันเสริมและฟังก์ชันความปลอดภัย 🛠️ ---

function findStudentRow_(studentId, sheet) {
  const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STUDENTS_SHEET_NAME);
  const data = targetSheet.getDataRange().getValues();
  const searchIdLower = String(studentId).trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_STUDENT_ID - 1]).trim().toLowerCase() === searchIdLower) {
      const registeredClubIds = String(data[i][COL_STUDENT_REG_CLUB_IDS - 1]).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
      return { data: { id: data[i][0], name: data[i][1], class: data[i][2], passwordHash: String(data[i][3]), registeredClub: registeredClubIds }, rowIndex: i + 1 };
    }
  }
  return null;
}

function findGeneralUserRow_(email, sheet) {
    const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GENERAL_USERS_SHEET_NAME);
    const data = targetSheet.getDataRange().getValues();
    const searchEmailLower = String(email).trim().toLowerCase();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][COL_GEN_EMAIL - 1]).trim().toLowerCase() === searchEmailLower) {
            const registeredClubIds = String(data[i][COL_GEN_REG_CLUB_IDS - 1]).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
            return { data: { email: data[i][0], name: data[i][1], passwordHash: String(data[i][2]), registeredClub: registeredClubIds }, rowIndex: i + 1 };
        }
    }
    return null;
}

function findClubRow_(clubId, sheet) {
  const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CLUBS_SHEET_NAME);
  const data = targetSheet.getRange(2, 1, targetSheet.getLastRow() - 1, COL_CLUB_REGISTERED).getValues();
  for (let i = 0; i < data.length; i++) {
    if (parseInt(data[i][COL_CLUB_ID - 1]) === clubId) {
      const capacity = parseInt(data[i][COL_CLUB_CAPACITY - 1], 10);
      const registered = parseInt(data[i][COL_CLUB_REGISTERED - 1], 10);
      return { data: { id: clubId, name: data[i][1], capacity: isNaN(capacity) ? 0 : capacity, registered: isNaN(registered) ? 0 : registered }, rowIndex: i + 2 };
    }
  }
  return null;
}

function hashPassword_(password) {
  const toHash = password + PASSWORD_SECRET_;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, toHash);
  return Utilities.base64Encode(digest);
}

function verifyPassword_(password, hash) {
  const generatedHash = hashPassword_(password);
  return generatedHash === hash;
}