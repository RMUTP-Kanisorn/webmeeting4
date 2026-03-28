// ============================================================
//  ระบบช่วยการประชุมออนไลน์ — Frontend Script
// ============================================================

// 🔴 สำคัญมาก: เปลี่ยน URL ตรงนี้เป็น Web App URL ที่ได้จาก Google Apps Script ของคุณ
const API_URL = 'https://script.google.com/macros/s/AKfycbzlhWrPbOiKJ9tymhIuqS_dCW6YHO6ZEAruLJajeRRg4xBS_XKKvsc_KoTn90I5YsPbJA/exec';

// ตั้งค่ารหัสผ่านเข้าหน้า Admin
const ADMIN_USER = 'admin';
const ADMIN_PASS = '112233';

// 1. ดึงข้อมูลที่จำไว้ในเครื่อง (localStorage) ขึ้นมาก่อน เพื่อให้ข้อมูลแสดงผลทันทีเวลากด F5
let bookings = JSON.parse(localStorage.getItem('cachedBookings')) || [];
let currentDate = new Date();
let currentSection = 'booking';
let isAdminLoggedIn = false;

document.addEventListener('DOMContentLoaded', () => {
    generateTimeSlots();
    
    // โหลดข้อมูลล่าสุดจากเซิร์ฟเวอร์
    loadBookingsForCalendar(new Date());

    // ป้องกันการเลือกวันในอดีต
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('bookingDate').min = today;

    document.getElementById('bookingDate').addEventListener('change', updateAvailableSlots);
    document.getElementById('roomSelect').addEventListener('change', updateAvailableSlots);
    document.getElementById('startTime').addEventListener('change', updateEndTimeOptions);
    document.getElementById('bookingForm').addEventListener('submit', handleBookingSubmit);
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);

    document.addEventListener('input', e => {
        if (e.target.id === 'searchBookings') filterBookings();
    });
    document.addEventListener('change', e => {
        if (e.target.id === 'filterRoom' || e.target.id === 'filterStatus') filterBookings();
    });
});

// ฟังก์ชันเรียก API ไปยัง Google Apps Script
async function apiPost(body = {}) {
    if (!API_URL || API_URL === 'ใส่_WEB_APP_URL_จาก_GOOGLE_APPS_SCRIPT_ที่นี่') {
        throw new Error('กรุณาตั้งค่า API_URL ในไฟล์ script.js ก่อนใช้งาน');
    }
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // ใช้ text/plain เลี่ยง CORS Preflight
        body: JSON.stringify(body)
    });
    return res.json();
}

// สลับหน้าจอ เมนูด้านบน
function showSection(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    
    // จัดการแถบเมนู (ยกเว้น nav-manage เพราะตอนนี้เป็นไอคอนมุมขวา)
    ['booking', 'calendar'].forEach(s => {
        document.getElementById('nav-' + s)?.classList.remove('active');
    });
    
    if (section !== 'manage') {
        document.getElementById('nav-' + section)?.classList.add('active');
    }
    
    document.getElementById(section + '-section').classList.remove('hidden');
    currentSection = section;

    if (section === 'calendar') generateCalendar();
    else if (section === 'manage') {
        if (isAdminLoggedIn) loadBookingsList();
    }
}

// การเลือกการ์ดห้องประชุม
function selectRoom(roomValue, cardEl) {
    document.querySelectorAll('.room-card').forEach(c => c.classList.remove('selected'));
    cardEl.classList.add('selected');
    document.getElementById('roomSelect').value = roomValue;
    document.getElementById('roomError').classList.add('hidden');
    updateAvailableSlots();
}

// สร้าง Dropdown เลือกเวลา (ทุก 15 นาที)
function generateTimeSlots() {
    const startSel = document.getElementById('startTime');
    const endSel = document.getElementById('endTime');
    startSel.innerHTML = '<option value="">เลือกเวลาเริ่มต้น</option>';
    endSel.innerHTML = '<option value="">เลือกเวลาสิ้นสุด</option>';

    for (let hour = 8; hour <= 18; hour++) {
        for (let min = 0; min < 60; min += 15) {
            if (hour === 18 && min > 0) break;
            const t = `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
            startSel.appendChild(new Option(t, t));
            endSel.appendChild(new Option(t, t));
        }
    }
}

// อัปเดตเวลาให้ไม่สามารถจองทับกันได้
function updateAvailableSlots() {
    const date = document.getElementById('bookingDate').value;
    const room = document.getElementById('roomSelect').value;
    if (!date || !room) return;

    const dayBookings = bookings.filter(b => b.date === date && b.room_id === room && b.status !== 'rejected');
    Array.from(document.getElementById('startTime').querySelectorAll('option')).slice(1).forEach(opt => {
        const taken = dayBookings.some(b => opt.value >= b.start_time && opt.value < b.end_time);
        opt.disabled = taken;
        opt.style.color = taken ? '#ef4444' : '';
        opt.textContent = taken ? opt.value + ' (มีคนจองแล้ว)' : opt.value;
    });
}

function updateEndTimeOptions() {
    const start = document.getElementById('startTime').value;
    if (!start) return;
    Array.from(document.getElementById('endTime').querySelectorAll('option')).slice(1).forEach(opt => {
        opt.disabled = opt.value <= start;
    });
}

// กด Submit จองห้อง
async function handleBookingSubmit(e) {
    e.preventDefault();

    const room = document.getElementById('roomSelect').value;
    if (!room) {
        document.getElementById('roomError').classList.remove('hidden');
        document.getElementById('roomCards').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    showLoading();

    const equipment = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(cb => cb.value);
    const drinks = Array.from(document.querySelectorAll('input[name="drinks"]:checked')).map(cb => cb.value);

    const data = {
        date:         document.getElementById('bookingDate').value,
        meeting_title: document.getElementById('meetingTitle').value,
        room_id:      room,
        start_time:   document.getElementById('startTime').value,
        end_time:     document.getElementById('endTime').value,
        booker:       document.getElementById('bookerName').value,
        phone:        document.getElementById('phoneNumber').value,
        email:        document.getElementById('emailAddress').value,
        equipment:    equipment.join(', '),
        drinks:       drinks.join(', '),
        documents:    document.getElementById('documents').value,
        status:       'pending'
    };

    try {
        const result = await apiPost({ action: 'saveBooking', data });
        if (!result.ok) {
            // 2. ถ้ามีการจองทับกัน ให้แสดง Modal พิเศษ
            if (result.error && result.error.includes('มีการจองแล้ว')) {
                const msgEl = document.getElementById('conflictMessage');
                msgEl.innerHTML = `${result.error}<br><br><span class="font-bold text-red-500">โปรดจองห้องประชุมใหม่</span>`;
                
                const conflictModal = document.getElementById('conflictModal');
                conflictModal.classList.remove('hidden');
                conflictModal.classList.add('flex');
            } else {
                showAlert(result.error || 'การจองล้มเหลว', 'error');
            }
        } else {
            showAlert('✅ ส่งคำขอจองเรียบร้อยแล้ว! ข้อมูลถูกส่งไปที่ระบบแอดมิน (รอการอนุมัติ)', 'success');
            document.getElementById('bookingForm').reset();
            document.querySelectorAll('.room-card').forEach(c => c.classList.remove('selected'));
            document.getElementById('roomSelect').value = '';
            
            // นำข้อมูลเข้าตัวแปรในเครื่อง และบันทึกลง localStorage ทันที
            data.id = result.id;
            bookings.push(data);
            localStorage.setItem('cachedBookings', JSON.stringify(bookings));
            
            if (currentSection === 'calendar') generateCalendar();
        }
    } catch (err) {
        showAlert('❌ ข้อมูลยังไม่ถูกส่ง: กรุณาเช็คการเชื่อมต่อ', 'error');
        console.error(err);
    }

    hideLoading();
}

// โหลดข้อมูลการจองทั้งหมดของเดือนนั้น
async function loadBookingsForCalendar(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    try {
        const result = await apiPost({ action: 'getBookings', month: `${year}-${month}` });
        if (result.ok) {
            bookings = result.data;
            // เซฟข้อมูลลง localStorage ไว้ใช้ตอนรีเฟรชหน้าเว็บ
            localStorage.setItem('cachedBookings', JSON.stringify(bookings));
            
            // อัปเดตหน้าจอทันทีถ้าเปิดค้างอยู่
            if (currentSection === 'calendar') generateCalendar();
            if (currentSection === 'booking') updateAvailableSlots();
        }
    } catch (err) {
        console.error('โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ อาศัยข้อมูลจาก Cache แทน:', err);
    }
}

// วาดปฏิทิน
function generateCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthEl = document.getElementById('currentMonth');
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const names = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                   'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    monthEl.textContent = `${names[month]} ${year + 543}`;
    
    // หากข้อมูลยังเป็น array ว่างเปล่าอยู่ ให้ขึ้นว่ากำลังโหลด
    if (bookings.length === 0 && !localStorage.getItem('cachedBookings')) {
        grid.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">กำลังโหลดข้อมูล...</div>';
    }

    setTimeout(() => {
        grid.innerHTML = '';
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // ช่องว่างก่อนเริ่มวันที่ 1
        for (let i = 0; i < firstDay; i++) {
            const emp = document.createElement('div');
            emp.className = 'bg-gray-200/40 rounded min-h-[40px] md:min-h-[52px]';
            grid.appendChild(emp);
        }

        // สร้างช่องวันที่
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dayBookings = bookings.filter(b => b.date === dateStr);
            const hasPending  = dayBookings.some(b => b.status === 'pending');
            const hasApproved = dayBookings.some(b => b.status === 'approved');

            const el = document.createElement('div');
            // เงื่อนไขสีในปฏิทิน: ส้ม (รอ), เขียว (อนุมัติแล้ว)
            let colorClass = 'bg-white text-gray-700 hover:bg-blue-50';
            if (hasPending && hasApproved) colorClass = 'day-mixed';
            else if (hasApproved) colorClass = 'day-approved'; 
            else if (hasPending) colorClass = 'day-pending'; 

            el.className = `calendar-day rounded shadow-sm flex flex-col items-center justify-center font-semibold transition-all p-1 text-sm md:text-base ${colorClass}`;
            el.innerHTML = `<span>${day}</span>${dayBookings.length > 0 ? `<span class="text-[9px] md:text-[10px] font-normal opacity-90">${dayBookings.length} คิวจอง</span>` : ''}`;

            if (dayBookings.length > 0) {
                el.addEventListener('click', () => showBookingModal(dateStr, dayBookings));
            }
            grid.appendChild(el);
        }
    }, 50);
}

async function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    generateCalendar(); // แสดงปฏิทินทันทีด้วย Cache
    await loadBookingsForCalendar(currentDate); // โหลดข้อมูลเบื้องหลังเพื่ออัปเดต
}

async function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    generateCalendar(); 
    await loadBookingsForCalendar(currentDate);
}

// หน้าต่างแสดงข้อมูลเมื่อกดที่วันที่ในปฏิทิน
function showBookingModal(dateStr, dayBookings) {
    const modal = document.getElementById('bookingModal');
    const content = document.getElementById('modalContent');
    const dateFormatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });

    content.innerHTML = `
        <div class="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
            <p class="font-bold text-blue-800 text-sm md:text-base">📅 ${dateFormatted}</p>
            <p class="text-xs md:text-sm text-blue-600">มีการจองทั้งหมด ${dayBookings.length} รายการ</p>
        </div>
        <div class="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            ${dayBookings.map((b, i) => `
                <div class="modal-booking-entry status-${b.status || 'pending'}">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 gap-2">
                        <span class="font-bold text-gray-800 text-sm md:text-base">รายการจองที่ ${i+1}</span>
                        <span class="badge badge-${b.status === 'approved' ? 'approved' : 'pending'} self-start sm:self-auto">
                            ${b.status === 'approved' ? '✅ อนุมัติแล้ว' : '⏳ รออนุมัติจาก Admin'}
                        </span>
                    </div>
                    <div class="modal-row"><span class="modal-label">📌 หัวข้อ:</span><span class="modal-value">${b.meeting_title || '-'}</span></div>
                    <div class="modal-row"><span class="modal-label">🏠 ห้อง:</span><span class="modal-value">${b.room_id}</span></div>
                    <div class="modal-row"><span class="modal-label">⏰ เวลา:</span><span class="modal-value">${b.start_time} – ${b.end_time} น.</span></div>
                    <div class="modal-row"><span class="modal-label">👤 ผู้จอง:</span><span class="modal-value">${b.booker}</span></div>
                    <div class="modal-row"><span class="modal-label">🖥️ อุปกรณ์:</span><span class="modal-value">${b.equipment || 'ไม่ระบุ'}</span></div>
                </div>
            `).join('')}
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// ฟังก์ชันปิด Modal ทั่วไป (ใช้ร่วมกัน)
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// ระบบ Login ของ Admin
function handleAdminLogin(e) {
    e.preventDefault();
    const user = document.getElementById('adminUser').value.trim();
    const pass = document.getElementById('adminPass').value;
    const errEl = document.getElementById('loginError');

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        isAdminLoggedIn = true;
        errEl.classList.add('hidden');
        document.getElementById('admin-login-box').classList.add('hidden');
        document.getElementById('admin-panel').classList.remove('hidden');
        loadBookingsList(); // โหลดข้อมูลเมื่อ Login สำเร็จ
    } else {
        errEl.classList.remove('hidden');
        document.getElementById('adminPass').value = '';
    }
}

function adminLogout() {
    isAdminLoggedIn = false;
    document.getElementById('admin-login-box').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('adminUser').value = '';
    document.getElementById('adminPass').value = '';
    showSection('booking'); // เด้งกลับหน้าจองห้องเมื่อออก
}

// โหลดข้อมูลในหน้า Admin
async function loadBookingsList() {
    // ใช้อันที่มีใน cache วาดไปก่อน
    updateAdminStats();
    renderBookingsList(bookings);
    
    // โหลดของจริงอัปเดตตาม
    await loadBookingsForCalendar(currentDate);
    updateAdminStats();
    renderBookingsList(bookings);
}

function updateAdminStats() {
    const pending  = bookings.filter(b => b.status !== 'approved').length;
    const approved = bookings.filter(b => b.status === 'approved').length;
    document.getElementById('statPending').textContent  = pending;
    document.getElementById('statApproved').textContent = approved;
    document.getElementById('statTotal').textContent    = bookings.length;
}

function renderBookingsList(list) {
    const container = document.getElementById('bookingsList');
    // เรียงคิวจองที่รอดำเนินการขึ้นก่อน หรือตามวันที่
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || a.start_time.localeCompare(b.start_time));

    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-10 bg-gray-50 rounded-xl">ไม่มีข้อมูลการจองในระบบ</p>';
        return;
    }

    container.innerHTML = sorted.map(b => adminBookingCard(b)).join('');
}

// สร้างการ์ดแสดงในหน้า Admin
function adminBookingCard(b) {
    const isPending  = b.status !== 'approved';
    const statusBadge = isPending
        ? '<span class="badge badge-pending">⏳ รออนุมัติ (Pending)</span>'
        : '<span class="badge badge-approved">✅ อนุมัติแล้ว (Approved)</span>';

    let dateDisplay = b.date;
    try { if(b.date) dateDisplay = formatDate(b.date); } catch(e) {}

    return `
        <div class="booking-item status-${isPending ? 'pending' : 'approved'}" id="card-${b.id}">
            <div class="booking-header">
                <div class="w-full sm:w-auto">
                    <div class="booking-date-time text-sm md:text-base">📅 ${dateDisplay} | ⏰ ${b.start_time} – ${b.end_time} น.</div>
                    <div class="font-semibold text-gray-800 mt-1">${b.room_id}</div>
                    ${b.meeting_title ? `<div class="text-xs md:text-sm text-gray-500">📌 ${b.meeting_title}</div>` : ''}
                </div>
                <div class="mt-2 sm:mt-0">${statusBadge}</div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs md:text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded-lg border">
                <div>👤 <strong class="text-gray-700">ผู้จอง:</strong> ${b.booker}</div>
                <div>📞 <strong class="text-gray-700">เบอร์โทร:</strong> ${b.phone}</div>
                <div>📧 <strong class="text-gray-700">อีเมล:</strong> ${b.email || '-'}</div>
                ${b.equipment ? `<div>🖥️ <strong class="text-gray-700">อุปกรณ์:</strong> ${b.equipment}</div>` : ''}
                ${b.drinks    ? `<div>🥤 <strong class="text-gray-700">เครื่องดื่ม:</strong> ${b.drinks}</div>` : ''}
                ${b.documents ? `<div class="sm:col-span-2 mt-1">📝 <strong class="text-gray-700">หมายเหตุ:</strong> ${b.documents}</div>` : ''}
            </div>

            <div class="booking-actions flex flex-col sm:flex-row w-full gap-2">
                ${isPending ? `
                    <button class="btn-approve flex-1 py-2 md:py-3 text-sm md:text-base" onclick="approveBooking('${b.id}', '${b.email}', '${b.booker}', '${b.date}', '${b.start_time}', '${b.end_time}', '${b.room_id}')">
                        ✅ กดอนุมัติห้อง และ ส่งอีเมลยืนยัน
                    </button>
                ` : `
                    <button class="btn-approve flex-1 py-2 md:py-3 text-sm md:text-base" disabled style="opacity:0.6">✅ อนุมัติเรียบร้อยแล้ว</button>
                `}
                <button class="btn-delete w-full sm:w-auto py-2 md:py-3 px-4 text-sm md:text-base" onclick="confirmDeleteBooking('${b.id}')">🗑️ ลบข้อมูล</button>
            </div>
        </div>
    `;
}

// Admin กดปุ่ม "อนุมัติ"
async function approveBooking(id, email, booker, date, startTime, endTime, room) {
    if (!confirm(`ยืนยันการอนุมัติห้องประชุม\nระบบจะส่งอีเมลแจ้งเตือนไปยัง ${email} ทันที?`)) return;

    try {
        const result = await apiPost({
            action: 'approveBooking',
            id, email, booker, date, startTime, endTime, room
        });

        if (result.ok) {
            if(result.emailError) {
                 showAlert(`✅ อนุมัติสำเร็จ! แต่ระบบส่งอีเมลไม่ได้ (คุณอาจยังไม่ได้กด Allow Permission ใน Google Script)`, 'success');
            } else {
                 showAlert(`✅ อนุมัติเรียบร้อย! ส่งอีเมลยืนยันไปยัง ${email} แล้ว`, 'success');
            }
           
            // เปลี่ยนสถานะในเครื่องเป็น Approved
            const b = bookings.find(b => b.id === id);
            if (b) b.status = 'approved';
            
            // อัปเดตข้อมูลใน localStorage
            localStorage.setItem('cachedBookings', JSON.stringify(bookings));
            
            // อัปเดตหน้าจอ Admin
            updateAdminStats();
            renderBookingsList(bookings);

        } else {
            showAlert(result.error || 'เกิดข้อผิดพลาดในการอนุมัติ', 'error');
        }
    } catch (err) {
        showAlert('❌ ไม่สามารถเชื่อมต่อกับ Google Sheet ได้', 'error');
        console.error(err);
    }
}

// Admin กดลบข้อมูล
async function confirmDeleteBooking(id) {
    if (!confirm('ลบข้อมูลการจองนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) return;
    try {
        const result = await apiPost({ action: 'deleteBooking', id });
        if (result.ok) {
            showAlert('🗑️ ลบการจองเรียบร้อย', 'success');
            
            // ลบออกจากตัวแปรและ localStorage
            bookings = bookings.filter(b => b.id !== id);
            localStorage.setItem('cachedBookings', JSON.stringify(bookings));
            
            updateAdminStats();
            renderBookingsList(bookings);
        } else {
            showAlert(result.error || 'ลบไม่สำเร็จ', 'error');
        }
    } catch (err) {
        showAlert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    }
}

// กรองข้อมูลในหน้า Admin
function filterBookings() {
    const search = document.getElementById('searchBookings')?.value.toLowerCase() || '';
    const room   = document.getElementById('filterRoom')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';

    const filtered = bookings.filter(b => {
        const matchSearch = b.booker.toLowerCase().includes(search) || b.phone.includes(search) || (b.email || '').toLowerCase().includes(search);
        const matchRoom   = !room   || b.room_id === room;
        const matchStatus = !status || (status === 'approved' ? b.status === 'approved' : b.status !== 'approved');
        return matchSearch && matchRoom && matchStatus;
    });
    renderBookingsList(filtered);
}

// ============================================================
//  ส่วนแสดงผล UI Helpers
// ============================================================
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        return new Date(dateString + 'T00:00:00').toLocaleDateString('th-TH', {
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
        });
    } catch(e) { return dateString; }
}

function showAlert(message, type = 'success') {
    const el = document.getElementById('alert');
    document.getElementById('alertMessage').textContent = message;
    el.className = `alert ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 6000);
}

function showLoading() {
    const btn = document.getElementById('submitBtn');
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '⏳ ระบบกำลังประมวลผล...';
    btn.disabled = true;
}

function hideLoading() {
    const btn = document.getElementById('submitBtn');
    btn.innerHTML = btn.dataset.orig || '📨 ส่งคำขอจองห้องประชุม';
    btn.disabled = false;
}