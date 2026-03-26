// ============================================================
//  ระบบช่วยการประชุมออนไลน์ — Frontend Script v2 (Fixed API)
// ============================================================

// 🔧 ใส่ URL Google Apps Script Web App ของคุณที่นี่ (เอาอันล่าสุดที่ Deploy มาใส่นะครับ)
const API_URL = 'https://script.google.com/macros/s/AKfycbw1Nzn2_kNWdcHXQonXvRYoHMUzitiCRf8wSyJC1Pp1qyJRMc6fgPO1329h2AJJLpDe/exec';

// 🔧 ตั้งค่า Admin Credentials (สำหรับการเข้าระบบแอดมิน)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin1234';

// ============================================================
//  State
// ============================================================
let bookings = [];
let currentDate = new Date();
let currentSection = 'booking';
let isAdminLoggedIn = false;

// ============================================================
//  Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    generateTimeSlots();
    loadBookingsForCalendar(new Date());

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('bookingDate').min = today;

    document.getElementById('bookingDate').addEventListener('change', () => {
        updateAvailableSlots();
    });
    document.getElementById('roomSelect').addEventListener('change', updateAvailableSlots);
    document.getElementById('startTime').addEventListener('change', updateEndTimeOptions);
    document.getElementById('bookingForm').addEventListener('submit', handleBookingSubmit);
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);

    // Admin filter listeners
    document.addEventListener('input', e => {
        if (e.target.id === 'searchBookings') filterBookings();
    });
    document.addEventListener('change', e => {
        if (e.target.id === 'filterRoom' || e.target.id === 'filterStatus') filterBookings();
    });
});

// ============================================================
//  API Helper — แก้ไขเป็นแบบส่งตรงด้วย text/plain เพื่อแก้ปัญหา CORS
// ============================================================
async function apiGet(params = {}) {
    if (!API_URL || !API_URL.startsWith('http')) throw new Error('API_URL ไม่ถูกต้อง');
    const url = new URL(API_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    const res = await fetch(url.toString());
    return res.json();
}

async function apiPost(body = {}) {
    if (!API_URL || !API_URL.startsWith('http')) throw new Error('API_URL ไม่ถูกต้อง');
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 💡 หัวใจสำคัญในการทะลุ CORS
        body: JSON.stringify(body)
    });
    return res.json();
}

// ============================================================
//  Navigation
// ============================================================
function showSection(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    ['booking', 'calendar', 'manage'].forEach(s => {
        document.getElementById('nav-' + s)?.classList.remove('active');
    });
    document.getElementById('nav-' + section)?.classList.add('active');
    document.getElementById(section + '-section').classList.remove('hidden');
    currentSection = section;

    if (section === 'calendar') generateCalendar();
    else if (section === 'manage') {
        if (isAdminLoggedIn) loadBookingsList();
    }
}

// ============================================================
//  Room Selection (Card UI)
// ============================================================
function selectRoom(roomValue, cardEl) {
    document.querySelectorAll('.room-card').forEach(c => c.classList.remove('selected'));
    cardEl.classList.add('selected');
    document.getElementById('roomSelect').value = roomValue;
    document.getElementById('roomError').classList.add('hidden');
    updateAvailableSlots();
}

// ============================================================
//  Time Slots
// ============================================================
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

function updateAvailableSlots() {
    const date = document.getElementById('bookingDate').value;
    const room = document.getElementById('roomSelect').value;
    if (!date || !room) return;

    const dayBookings = bookings.filter(b => b.date === date && b.room_id === room);
    Array.from(document.getElementById('startTime').querySelectorAll('option')).slice(1).forEach(opt => {
        const taken = dayBookings.some(b => opt.value >= b.start_time && opt.value < b.end_time);
        opt.disabled = taken;
        opt.style.color = taken ? '#ef4444' : '';
        opt.textContent = taken ? opt.value + ' (ไม่ว่าง)' : opt.value;
    });
}

function updateEndTimeOptions() {
    const start = document.getElementById('startTime').value;
    if (!start) return;
    Array.from(document.getElementById('endTime').querySelectorAll('option')).slice(1).forEach(opt => {
        opt.disabled = opt.value <= start;
    });
}

// ============================================================
//  Booking Submit
// ============================================================
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
            showAlert(result.error || 'การจองล้มเหลว', 'error');
        } else {
            showAlert('✅ ส่งคำขอจองเรียบร้อยแล้ว! รอการอนุมัติจากแอดมิน', 'success');
            document.getElementById('bookingForm').reset();
            document.querySelectorAll('.room-card').forEach(c => c.classList.remove('selected'));
            document.getElementById('roomSelect').value = '';
            await loadBookingsForCalendar(new Date(data.date));
            if (currentSection === 'calendar') generateCalendar();
        }
    } catch (err) {
        showAlert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ ตรวจสอบ API URL', 'error');
        console.error(err);
    }

    hideLoading();
}

// ============================================================
//  Load Bookings
// ============================================================
async function loadBookingsForCalendar(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    try {
        const result = await apiGet({ action: 'getBookings', month: `${year}-${month}` });
        if (result.ok) bookings = result.data;
    } catch (err) {
        console.error('โหลดข้อมูลไม่สำเร็จ:', err);
        bookings = [];
    }
}

// ============================================================
//  Calendar
// ============================================================
function generateCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthEl = document.getElementById('currentMonth');
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const names = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                   'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    monthEl.textContent = `${names[month]} ${year + 543}`;
    grid.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">กำลังโหลด...</div>';

    setTimeout(() => {
        grid.innerHTML = '';
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const emp = document.createElement('div');
            emp.className = 'bg-gray-200/40 rounded min-h-[52px]';
            grid.appendChild(emp);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dayBookings = bookings.filter(b => b.date === dateStr);
            const hasPending  = dayBookings.some(b => b.status === 'pending');
            const hasApproved = dayBookings.some(b => b.status === 'approved');

            const el = document.createElement('div');
            let colorClass = 'bg-white text-gray-700 hover:bg-blue-50';
            if (hasPending && hasApproved) colorClass = 'day-mixed';
            else if (hasApproved) colorClass = 'day-approved';
            else if (hasPending) colorClass = 'day-pending';

            el.className = `calendar-day rounded shadow-sm flex flex-col items-center justify-center font-semibold transition-all p-1 ${colorClass}`;
            el.innerHTML = `<span>${day}</span>${dayBookings.length > 0 ? `<span style="font-size:10px;font-weight:400;opacity:0.9">${dayBookings.length} จอง</span>` : ''}`;

            if (dayBookings.length > 0) {
                el.addEventListener('click', () => showBookingModal(dateStr, dayBookings));
            }
            grid.appendChild(el);
        }
    }, 50);
}

async function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    await loadBookingsForCalendar(currentDate);
    generateCalendar();
}

async function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    await loadBookingsForCalendar(currentDate);
    generateCalendar();
}

// ============================================================
//  Calendar Modal
// ============================================================
function showBookingModal(dateStr, dayBookings) {
    const modal = document.getElementById('bookingModal');
    const content = document.getElementById('modalContent');
    const dateFormatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });

    content.innerHTML = `
        <div class="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
            <p class="font-bold text-blue-800 text-base">📅 ${dateFormatted}</p>
            <p class="text-sm text-blue-600">${dayBookings.length} รายการจอง</p>
        </div>
        ${dayBookings.map((b, i) => `
            <div class="modal-booking-entry status-${b.status || 'pending'}">
                <div class="flex justify-between items-center mb-3">
                    <span class="font-bold text-gray-800">การจองที่ ${i+1}</span>
                    <span class="badge badge-${b.status === 'approved' ? 'approved' : 'pending'}">
                        ${b.status === 'approved' ? '✅ อนุมัติแล้ว' : '⏳ รออนุมัติ'}
                    </span>
                </div>
                <div class="modal-row"><span class="modal-label">📌 หัวข้อ:</span><span class="modal-value">${b.meeting_title || '-'}</span></div>
                <div class="modal-row"><span class="modal-label">🏠 ห้องประชุม:</span><span class="modal-value">${b.room_id}</span></div>
                <div class="modal-row"><span class="modal-label">⏰ เวลา:</span><span class="modal-value">${b.start_time} – ${b.end_time}</span></div>
                <div class="modal-row"><span class="modal-label">👤 ผู้จอง:</span><span class="modal-value">${b.booker}</span></div>
                <div class="modal-row"><span class="modal-label">📞 เบอร์ติดต่อ:</span><span class="modal-value">${b.phone}</span></div>
                <div class="modal-row"><span class="modal-label">📧 อีเมล:</span><span class="modal-value">${b.email || '-'}</span></div>
                <div class="modal-row"><span class="modal-label">🖥️ อุปกรณ์:</span><span class="modal-value">${b.equipment || '-'}</span></div>
                <div class="modal-row"><span class="modal-label">🥤 เครื่องดื่ม:</span><span class="modal-value">${b.drinks || '-'}</span></div>
                ${b.documents ? `<div class="modal-row"><span class="modal-label">📝 หมายเหตุ:</span><span class="modal-value">${b.documents}</span></div>` : ''}
            </div>
        `).join('')}
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = document.getElementById('bookingModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ============================================================
//  Admin Login
// ============================================================
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
        loadBookingsList();
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
}

// ============================================================
//  Admin: Load Bookings List
// ============================================================
async function loadBookingsList() {
    await loadBookingsForCalendar(currentDate);

    const pending  = bookings.filter(b => b.status !== 'approved').length;
    const approved = bookings.filter(b => b.status === 'approved').length;
    document.getElementById('statPending').textContent  = pending;
    document.getElementById('statApproved').textContent = approved;
    document.getElementById('statTotal').textContent    = bookings.length;

    renderBookingsList(bookings);
}

function renderBookingsList(list) {
    const container = document.getElementById('bookingsList');
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || a.start_time.localeCompare(b.start_time));

    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-10">ไม่มีรายการจอง</p>';
        return;
    }

    container.innerHTML = sorted.map(b => adminBookingCard(b)).join('');
}

function adminBookingCard(b) {
    const isPending  = b.status !== 'approved';
    const statusBadge = isPending
        ? '<span class="badge badge-pending">⏳ รออนุมัติ</span>'
        : '<span class="badge badge-approved">✅ อนุมัติแล้ว</span>';

    return `
        <div class="booking-item status-${isPending ? 'pending' : 'approved'}" id="card-${b.id}">
            <div class="booking-header">
                <div>
                    <div class="booking-date-time">📅 ${formatDate(b.date)} | ⏰ ${b.start_time} – ${b.end_time}</div>
                    <div class="font-semibold text-gray-700 mt-1">${b.room_id}</div>
                    ${b.meeting_title ? `<div class="text-sm text-gray-500">📌 ${b.meeting_title}</div>` : ''}
                </div>
                <div>${statusBadge}</div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mb-4">
                <div>👤 <strong>ผู้จอง:</strong> ${b.booker}</div>
                <div>📞 <strong>เบอร์:</strong> ${b.phone}</div>
                <div>📧 <strong>อีเมล:</strong> ${b.email || '-'}</div>
                ${b.equipment ? `<div>🖥️ <strong>อุปกรณ์:</strong> ${b.equipment}</div>` : ''}
                ${b.drinks    ? `<div>🥤 <strong>เครื่องดื่ม:</strong> ${b.drinks}</div>` : ''}
                ${b.documents ? `<div class="sm:col-span-2">📝 <strong>หมายเหตุ:</strong> ${b.documents}</div>` : ''}
            </div>

            <div class="booking-actions">
                ${isPending ? `
                    <button class="btn-approve" onclick="approveBooking('${b.id}', '${b.email}', '${b.booker}', '${b.date}', '${b.start_time}', '${b.end_time}', '${b.room_id}')">
                        ✅ อนุมัติ &amp; ส่งอีเมล
                    </button>
                ` : `
                    <button class="btn-approve" disabled>✅ อนุมัติแล้ว</button>
                `}
                <button class="btn-delete" onclick="confirmDeleteBooking('${b.id}')">🗑️ ลบ</button>
            </div>
        </div>
    `;
}

// ============================================================
//  Admin: Approve Booking + Send Email
// ============================================================
async function approveBooking(id, email, booker, date, startTime, endTime, room) {
    if (!confirm(`อนุมัติการจองและส่งอีเมลยืนยันถึง ${email} ?`)) return;

    try {
        const result = await apiPost({
            action: 'approveBooking',
            id,
            email,
            booker,
            date,
            startTime,
            endTime,
            room
        });

        if (result.ok) {
            showAlert(`✅ อนุมัติแล้ว! ส่งอีเมลยืนยันไปยัง ${email} เรียบร้อย`, 'success');
            const b = bookings.find(b => b.id === id);
            if (b) b.status = 'approved';
            renderBookingsList(bookings);
            document.getElementById('statPending').textContent  = bookings.filter(b => b.status !== 'approved').length;
            document.getElementById('statApproved').textContent = bookings.filter(b => b.status === 'approved').length;
        } else {
            showAlert(result.error || 'เกิดข้อผิดพลาด', 'error');
        }
    } catch (err) {
        showAlert('❌ ไม่สามารถเชื่อมต่อกับ API ได้', 'error');
        console.error(err);
    }
}

// ============================================================
//  Admin: Delete Booking
// ============================================================
async function confirmDeleteBooking(id) {
    if (!confirm('ต้องการลบการจองนี้ใช่หรือไม่?')) return;
    try {
        const result = await apiPost({ action: 'deleteBooking', id });
        if (result.ok) {
            showAlert('🗑️ ลบการจองเรียบร้อย', 'success');
            bookings = bookings.filter(b => b.id !== id);
            renderBookingsList(bookings);
            document.getElementById('statTotal').textContent    = bookings.length;
            document.getElementById('statPending').textContent  = bookings.filter(b => b.status !== 'approved').length;
            document.getElementById('statApproved').textContent = bookings.filter(b => b.status === 'approved').length;
            if (currentSection === 'calendar') generateCalendar();
        } else {
            showAlert(result.error || 'ลบไม่สำเร็จ', 'error');
        }
    } catch (err) {
        showAlert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    }
}

// ============================================================
//  Admin: Filter
// ============================================================
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
//  Helpers
// ============================================================
function formatDate(dateString) {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });
}

function showAlert(message, type = 'success') {
    const el = document.getElementById('alert');
    document.getElementById('alertMessage').textContent = message;
    el.className = `alert ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function showLoading() {
    const btn = document.getElementById('submitBtn');
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '⏳ กำลังส่งคำขอ...';
    btn.disabled = true;
}

function hideLoading() {
    const btn = document.getElementById('submitBtn');
    btn.innerHTML = btn.dataset.orig || '📨 ส่งคำขอจองห้องประชุม';
    btn.disabled = false;
}