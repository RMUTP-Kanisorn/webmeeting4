// ============================================================
//  ระบบช่วยการประชุมออนไลน์ — Google Apps Script Backend v2
//  Features: บันทึก, ดึงข้อมูล, อนุมัติ (พร้อมส่งอีเมล), ลบ
// ============================================================

// 🔧 ตั้งค่า: ใส่ Sheet ID ของคุณที่นี่ (เอามาจาก URL ของ Google Sheet)
const SHEET_ID   = '1iKY0Sr59F6AOA7YunLcHamzLRWZYQwNJhOAy7tjkAFw';  
const SHEET_NAME = 'Bookings';

// ============================================================
//  doGet — รับ GET request (ดึงข้อมูล)
// ============================================================
function doGet(e) {
    try {
        const action = e.parameter.action;
        if (action === 'getBookings') {
            const month = e.parameter.month || '';
            return makeResponse({ ok: true, data: getBookings(month) });
        }
        return makeResponse({ ok: false, error: 'Unknown action' });
    } catch (err) {
        return makeResponse({ ok: false, error: err.message });
    }
}

// ============================================================
//  doPost — รับ POST request (บันทึก, อนุมัติ, ลบ)
// ============================================================
function doPost(e) {
    try {
        // ใช้ JSON.parse จาก text/plain เพื่อเลี่ยงปัญหา CORS Preflight
        const body   = JSON.parse(e.postData.contents);
        const action = body.action;

        if (action === 'saveBooking')    return makeResponse(saveBooking(body.data));
        if (action === 'approveBooking') return makeResponse(approveBooking(body));
        if (action === 'deleteBooking')  return makeResponse(deleteBooking(body.id));

        return makeResponse({ ok: false, error: 'Unknown action' });
    } catch (err) {
        return makeResponse({ ok: false, error: err.message });
    }
}

// ============================================================
//  makeResponse — สร้าง JSON Response
// ============================================================
function makeResponse(data) {
    const out = ContentService.createTextOutput(JSON.stringify(data));
    out.setMimeType(ContentService.MimeType.JSON);
    return out;
}

// ============================================================
//  getBookings
// ============================================================
function getBookings(month) {
    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // มีแค่ Header
    
    const headers = data[0];

    return data.slice(1)
        .filter(row => !month || String(row[headers.indexOf('date')]).startsWith(month))
        .map(row => {
            const obj = {};
            headers.forEach((h, i) => obj[h] = row[i] !== undefined ? String(row[i]) : '');
            return obj;
        });
}

// ============================================================
//  saveBooking — บันทึกการจองใหม่
// ============================================================
function saveBooking(data) {
    if (!data.date || !data.room_id || !data.start_time || !data.end_time || !data.booker || !data.phone || !data.email) {
        return { ok: false, error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' };
    }
    if (data.start_time >= data.end_time) {
        return { ok: false, error: 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น' };
    }

    const existing = getBookings(data.date.substring(0, 7));
    const conflict = existing.find(b =>
        b.date === data.date &&
        b.room_id === data.room_id &&
        data.start_time < b.end_time &&
        data.end_time > b.start_time
    );
    if (conflict) {
        return { ok: false, error: `ห้องนี้มีการจองแล้วในช่วงเวลา ${conflict.start_time}–${conflict.end_time} กรุณาเลือกเวลาอื่น` };
    }

    const id = 'BK' + Date.now();
    const sheet = getSheet();
    sheet.appendRow([
        id,
        data.date,
        data.meeting_title || '',
        data.room_id,
        data.start_time,
        data.end_time,
        data.booker,
        data.phone,
        data.email,
        data.equipment || '',
        data.drinks    || '',
        data.documents || '',
        'pending'        // สถานะเริ่มต้นคือรออนุมัติ
    ]);

    return { ok: true, id };
}

// ============================================================
//  approveBooking — อนุมัติและส่งอีเมล
// ============================================================
function approveBooking(body) {
    const { id, email, booker, date, startTime, endTime, room } = body;
    if (!id) return { ok: false, error: 'ไม่พบรหัสการจอง' };

    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol   = headers.indexOf('id');
    const statusCol = headers.indexOf('status');

    let updated = false;
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(id)) {
            sheet.getRange(i + 1, statusCol + 1).setValue('approved'); // อัปเดตสถานะใน Sheet
            updated = true;
            break;
        }
    }

    if (!updated) return { ok: false, error: 'ไม่พบการจองที่ต้องการอนุมัติ' };

    // ส่งอีเมลยืนยันไปยังผู้จอง
    try {
        const dateParts = date.split('-'); // แปลง YYYY-MM-DD เป็น DD/MM/YYYY
        const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${parseInt(dateParts[0]) + 543}`;
        const subject = '✅ ยืนยันการจองห้องประชุม — ' + room;
        const body_text = `
เรียน คุณ${booker}

การจองห้องประชุมของท่านได้รับการ อนุมัติ เรียบร้อยแล้ว 🎉

รายละเอียดการจอง:
━━━━━━━━━━━━━━━━━━
📅 วันที่:        ${dateFormatted}
🏠 ห้องประชุม:    ${room}
⏰ เวลา:          ${startTime} – ${endTime} น.
━━━━━━━━━━━━━━━━━━

กรุณาตรงต่อเวลาและส่งคืนอุปกรณ์ต่างๆ ให้เรียบร้อยหลังใช้งาน

หากมีข้อสงสัยกรุณาติดต่อแอดมินหรือผู้ดูแลระบบ
ขอบคุณที่ใช้บริการระบบจองห้องประชุมออนไลน์
        `.trim();

        MailApp.sendEmail({
            to: email,
            subject: subject,
            body: body_text
        });
    } catch (mailErr) {
        return { ok: true, emailError: 'อนุมัติแล้ว แต่ส่งอีเมลไม่สำเร็จ (กรุณาเช็ค Permission): ' + mailErr.message };
    }

    return { ok: true };
}

// ============================================================
//  deleteBooking — ลบการจอง
// ============================================================
function deleteBooking(id) {
    if (!id) return { ok: false, error: 'ไม่พบรหัสการจอง' };

    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const idCol   = data[0].indexOf('id');

    for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(id)) {
            sheet.deleteRow(i + 1);
            return { ok: true };
        }
    }
    return { ok: false, error: 'ไม่พบการจองที่ต้องการลบ' };
}

// ============================================================
//  getSheet — สร้าง Sheet และ Header อัตโนมัติหากยังไม่มี
// ============================================================
function getSheet() {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    let sheet   = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME);
        const headers = [
            'id', 'date', 'meeting_title', 'room_id',
            'start_time', 'end_time', 'booker', 'phone',
            'email', 'equipment', 'drinks', 'documents', 'status'
        ];
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length)
            .setFontWeight('bold')
            .setBackground('#1e3a8a')
            .setFontColor('#ffffff');
        sheet.setFrozenRows(1);
    }
    return sheet;
}