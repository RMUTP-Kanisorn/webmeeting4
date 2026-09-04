// ============================================================
//  ระบบช่วยการประชุมออนไลน์ — Google Apps Script Backend v2.1
//  อัปเดต: Admin Backend Auth, LockService, Calendar API, ไม่อนุมัติพร้อมเหตุผล
// ============================================================

// 🔧 ตั้งค่าหลัก
const SHEET_ID   = '1l18X59fRswRrugUz6kokw7h-oaD0JCYasCYYkn6Hpc0';  
const SHEET_NAME = 'Bookings';

// 🔒 ตั้งค่าความปลอดภัย Admin (ข้อ 1: ย้ายรหัสผ่านมาฝั่ง Backend)
const ADMIN_USER = 'admin';
const ADMIN_PASS = '112233';

// 📅 ตั้งค่า Google Calendar ID (ข้อ 4)
// หากต้องการให้บันทึกลง Calendar ของอีเมลนี้เลย ให้ใช้ 'primary'
const CALENDAR_ID = 'primary'; 

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
//  doPost — รับ POST request
// ============================================================
function doPost(e) {
    try {
        const body   = JSON.parse(e.postData.contents);
        const action = body.action;

        // แยก Action ตามคำสั่ง
        if (action === 'adminLogin')     return makeResponse(checkAdminLogin(body.data));
        if (action === 'saveBooking')    return makeResponse(saveBooking(body.data));
        if (action === 'approveBooking') return makeResponse(approveBooking(body));
        if (action === 'rejectBooking')  return makeResponse(rejectBooking(body)); // เพิ่มการรองรับ Reject
        if (action === 'deleteBooking')  return makeResponse(deleteBooking(body.id));

        return makeResponse({ ok: false, error: 'Unknown action' });
    } catch (err) {
        return makeResponse({ ok: false, error: err.message });
    }
}

// สร้าง JSON Response
function makeResponse(data) {
    const out = ContentService.createTextOutput(JSON.stringify(data));
    out.setMimeType(ContentService.MimeType.JSON);
    // เพิ่ม Header สำหรับ CORS
    return out;
}

// ============================================================
//  1. ตรวจสอบ Login Admin (ใหม่)
// ============================================================
function checkAdminLogin(data) {
    if (data.user === ADMIN_USER && data.pass === ADMIN_PASS) {
        return { ok: true };
    }
    return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}

// ============================================================
//  2. getBookings
// ============================================================
function getBookings(month) {
    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; 
    
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
//  3. saveBooking — บันทึกการจอง (ใช้ LockService ป้องกันชนกัน)
// ============================================================
function saveBooking(data) {
    if (!data.date || !data.room_id || !data.start_time || !data.end_time || !data.booker || !data.phone || !data.email) {
        return { ok: false, error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' };
    }
    if (data.start_time >= data.end_time) {
        return { ok: false, error: 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น' };
    }

    // 🔒 ใช้งาน LockService (ข้อ 2: ป้องกันคนจองพร้อมกันเป๊ะๆ)
    const lock = LockService.getScriptLock();
    try {
        // ให้รอคิวล็อกสูงสุด 10 วินาที
        lock.waitLock(10000);

        // -- เริ่มกระบวนการเช็คและบันทึกในขณะที่ถูกล็อค --
        const existing = getBookings(data.date.substring(0, 7));
        const conflict = existing.find(b =>
            b.date === data.date &&
            b.room_id === data.room_id &&
            b.status !== 'rejected' && // ไม่นับห้องที่โดน Reject ไปแล้ว
            data.start_time < b.end_time &&
            data.end_time > b.start_time
        );
        
        if (conflict) {
            return { ok: false, error: `ห้องนี้มีการจองแล้วในช่วงเวลา ${conflict.start_time}–${conflict.end_time}` };
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
            'pending'
        ]);

        return { ok: true, id };

    } catch (e) {
        return { ok: false, error: 'มีผู้ใช้งานจำนวนมากพร้อมกัน (ระบบกำลังยุ่ง) โปรดลองกดส่งใหม่อีกครั้ง' };
    } finally {
        // ปลดล็อคให้คนอื่นทำรายการต่อ
        lock.releaseLock();
    }
}

// ============================================================
//  4. approveBooking — อนุมัติ, ส่งอีเมล, และลง Calendar API
// ============================================================
function approveBooking(body) {
    const { id, email, booker, date, startTime, endTime, room, meeting_title } = body;
    if (!id) return { ok: false, error: 'ไม่พบรหัสการจอง' };

    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol   = headers.indexOf('id');
    const statusCol = headers.indexOf('status');

    let updated = false;
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(id)) {
            sheet.getRange(i + 1, statusCol + 1).setValue('approved'); 
            updated = true;
            break;
        }
    }

    if (!updated) return { ok: false, error: 'ไม่พบการจองที่ต้องการอนุมัติ' };

    let noticeMsg = '';

    // 📅 การทำงานส่วน Google Calendar API (ข้อ 4)
    try {
        const [yyyy, mm, dd] = date.split('-');
        const [sh, sm] = startTime.split(':');
        const [eh, em] = endTime.split(':');
        
        const eventStart = new Date(yyyy, parseInt(mm)-1, dd, sh, sm);
        const eventEnd = new Date(yyyy, parseInt(mm)-1, dd, eh, em);
        
        const cal = CalendarApp.getCalendarById(CALENDAR_ID);
        cal.createEvent(
            `[ประชุม] ${room} - ${meeting_title || 'ไม่ได้ระบุหัวข้อ'}`,
            eventStart,
            eventEnd,
            { description: `ผู้จอง: ${booker}\nอีเมล: ${email}\nโทร: ระบบจองห้องอัตโนมัติ` }
        );
    } catch (calErr) {
        noticeMsg += ` (ไม่สามารถลง Calendar ได้: ตรวจสอบ Permission)`;
        console.error('Calendar Error: ' + calErr);
    }

    // 📧 การส่งอีเมล
    try {
        const dateParts = date.split('-');
        const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${parseInt(dateParts[0]) + 543}`;
        const subject = '✅ ยืนยันการจองห้องประชุม — ' + room;
        const body_text = `
เรียน คุณ${booker}

การจองห้องประชุมของท่านได้รับการ อนุมัติ เรียบร้อยแล้ว 

รายละเอียดการจอง:
━━━━━━━━━━━━━━━━━━
 วันที่:        ${dateFormatted}
 ห้องประชุม:    ${room}
 เวลา:          ${startTime} – ${endTime} น.
━━━━━━━━━━━━━━━━━━

แบบสอบถามความพึงพอใจการใช้ห้องประชุม https://forms.gle/MPdVeGH3hZjohK4n6

กรุณาตรงต่อเวลาและส่งคืนอุปกรณ์ต่างๆ ให้เรียบร้อยหลังใช้งาน
ขอบคุณที่ใช้บริการระบบจองห้องประชุมออนไลน์
        `.trim();

        MailApp.sendEmail({ to: email, subject: subject, body: body_text });
    } catch (mailErr) {
         noticeMsg += ` (ส่งอีเมลไม่สำเร็จ)`;
    }

    return { ok: true, notice: noticeMsg !== '' ? noticeMsg : undefined };
}

// ============================================================
//  5. rejectBooking — ไม่อนุมัติการจองพร้อมระบุเหตุผล (เพิ่มใหม่)
// ============================================================
function rejectBooking(body) {
    const { id, email, booker, date, startTime, endTime, room, reason } = body;
    if (!id) return { ok: false, error: 'ไม่พบรหัสการจอง' };

    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol   = headers.indexOf('id');
    const statusCol = headers.indexOf('status');

    let updated = false;
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(id)) {
            sheet.getRange(i + 1, statusCol + 1).setValue('rejected'); 
            updated = true;
            break;
        }
    }

    if (!updated) return { ok: false, error: 'ไม่พบการจองที่ต้องการไม่อนุมัติ' };

    let noticeMsg = '';

    // 📧 การส่งอีเมลแจ้งเหตุผล
    try {
        const dateParts = date.split('-');
        const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${parseInt(dateParts[0]) + 543}`;
        const subject = '❌ แจ้งผลการจองห้องประชุม — ไม่สามารถอนุมัติได้';
        const body_text = `
เรียน คุณ${booker}

ระบบไม่สามารถอนุมัติการจองห้องประชุมของท่านได้ เนื่องจาก:
👉 ${reason ? reason : "ห้องประชุมไม่ว่างในช่วงเวลาดังกล่าว หรือเหตุผลอื่นจากผู้ดูแลระบบ"}

รายละเอียดที่ทำรายการ:
━━━━━━━━━━━━━━━━━━
 วันที่:        ${dateFormatted}
 ห้องประชุม:    ${room}
 เวลา:          ${startTime} – ${endTime} น.
━━━━━━━━━━━━━━━━━━

แบบสอบถามความพึงพอใจการใช้ห้องประชุม https://forms.gle/MPdVeGH3hZjohK4n6

กรุณาตรวจสอบห้องว่างและทำรายการใหม่อีกครั้ง
ขออภัยในความไม่สะดวกครับ
        `.trim();

        MailApp.sendEmail({ to: email, subject: subject, body: body_text });
    } catch (mailErr) {
         noticeMsg += ` (ส่งอีเมลแจ้งเตือนไม่สำเร็จ)`;
         console.error("Mail Error: " + mailErr);
    }

    return { ok: true, notice: noticeMsg !== '' ? noticeMsg : undefined };
}

// ============================================================
//  6. deleteBooking — ลบการจอง
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

// สร้าง Sheet และ Header
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