// ============================================================
//  ระบบช่วยการประชุมออนไลน์ — Google Apps Script Backend
//  วางไฟล์นี้ใน Google Apps Script แล้ว Deploy เป็น Web App
// ============================================================

// ตั้งค่า: ใส่ Sheet ID ของคุณที่นี่
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';
const SHEET_NAME = 'Bookings';

// ============================================================
//  CORS Helper — ต้องใส่ทุก response เพื่อให้ GitHub Pages เรียกได้
// ============================================================
function corsHeaders() {
  return ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.JSON);
}

function makeResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================================
//  doGet — รับ GET request (ดึงข้อมูลการจอง)
//  ?action=getBookings&month=2025-01
// ============================================================
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'getBookings') {
      const month = e.parameter.month || '';
      const bookings = getBookings(month);
      return makeResponse({ ok: true, data: bookings });
    }

    return makeResponse({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return makeResponse({ ok: false, error: err.message });
  }
}

// ============================================================
//  doPost — รับ POST request (บันทึก / ลบ การจอง)
//  body: { action: 'saveBooking'|'deleteBooking', ...data }
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'saveBooking') {
      const result = saveBooking(body.data);
      return makeResponse(result);
    }

    if (action === 'deleteBooking') {
      const result = deleteBooking(body.id);
      return makeResponse(result);
    }

    return makeResponse({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return makeResponse({ ok: false, error: err.message });
  }
}

// ============================================================
//  getBookings — ดึงข้อมูลการจองตามเดือน
// ============================================================
function getBookings(month) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0]; // ['id','date','room_id','start_time','end_time','booker','phone','documents']
  const rows = data.slice(1);

  return rows
    .filter(row => !month || String(row[1]).startsWith(month))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

// ============================================================
//  saveBooking — ตรวจสอบการชนกันแล้วบันทึกลง Sheet
// ============================================================
function saveBooking(data) {
  // Validate required fields
  if (!data.date || !data.room_id || !data.start_time || !data.end_time || !data.booker || !data.phone) {
    return { ok: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
  }

  if (data.start_time >= data.end_time) {
    return { ok: false, error: 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น' };
  }

  // Check for conflicts
  const existing = getBookings(data.date.substring(0, 7));
  const conflict = existing.find(b =>
    b.date === data.date &&
    b.room_id === data.room_id &&
    b.id !== (data.id || '') &&
    data.start_time < b.end_time &&
    data.end_time > b.start_time
  );

  if (conflict) {
    return { ok: false, error: `ห้องนี้มีการจองแล้ว (${conflict.start_time}–${conflict.end_time}) กรุณาเลือกเวลาอื่น` };
  }

  const sheet = getSheet();

  // Generate unique ID
  const id = 'BK' + Date.now();

  sheet.appendRow([
    id,
    data.date,
    data.room_id,
    data.start_time,
    data.end_time,
    data.booker,
    data.phone,
    data.documents || ''
  ]);

  return { ok: true, id: id };
}

// ============================================================
//  deleteBooking — ลบแถวที่ตรงกับ id
// ============================================================
function deleteBooking(id) {
  if (!id) return { ok: false, error: 'ไม่พบรหัสการจอง' };

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }

  return { ok: false, error: 'ไม่พบการจองที่ต้องการลบ' };
}

// ============================================================
//  getSheet — คืนค่า Sheet object พร้อม auto-create headers
// ============================================================
function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['id', 'date', 'room_id', 'start_time', 'end_time', 'booker', 'phone', 'documents']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  return sheet;
}
