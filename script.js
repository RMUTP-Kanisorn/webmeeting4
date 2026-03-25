// ============================================================
//  ระบบช่วยการประชุมออนไลน์ — Frontend Script
//  ใช้ fetch() เรียก Google Apps Script Web App (API)
// ============================================================

// 🔧 ตั้งค่า: วาง URL ของ Google Apps Script Web App ที่นี่
//    (ได้มาหลังจาก Deploy → Manage Deployments → Copy Web App URL)
const API_URL = 'https://script.googleusercontent.com/macros/echo?user_content_key=AWDtjMXhwfmbQF45WSF1sUHXBoPwAmn8l1LAYOStL35hsKnRIX4xPBDuvBHCmHT4KUxO2idYabs9j-yJ7nPALnWMm-5VqR6vVflWhmVyVBsXROacReAc772-Wqt8gwM3PxsE_hEC4djDFgnGT7nHuxBUL_DRbGdzvDmn0-0TLt0u1E2HBefoHG_7zjd1J_9IepQQ_4InJYWGKBpqrvI3YNmUfXTfrDtsk8IQsnwfD2gPjT960z2QoO_k4mkPXbpv-vaW1IvY-v3CgqtfE7jwCEmHU6uW1RQ1AtjiM4xOw28O&lib=MCKyycMny6ffWFJ8s3VaHWu6sEYTzGfeE';

// ============================================================
//  State
// ============================================================
let bookings = [];
let currentDate = new Date();
let currentSection = 'booking';
let currentBookingIds = [];

// ============================================================
//  Init
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    generateTimeSlots();
    loadBookingsForCalendar(new Date());

    document.getElementById('bookingDate').min = new Date().toISOString().split('T')[0];
    document.getElementById('bookingDate').addEventListener('change', function () {
        updateAvailableSlots();
        updateCalendarOnDateChange();
    });
    document.getElementById('roomSelect').addEventListener('change', updateAvailableSlots);
    document.getElementById('startTime').addEventListener('change', updateEndTimeOptions);
    document.getElementById('bookingForm').addEventListener('submit', handleBookingSubmit);
    document.getElementById('searchBookings').addEventListener('input', filterBookings);
    document.getElementById('filterRoom').addEventListener('change', filterBookings);
    document.getElementById('bookingModal').addEventListener('click', function (e) {
        if (e.target === this) closeModal();
    });
});

// ============================================================
//  API Helper — fetch wrapper
// ============================================================
async function apiGet(params = {}) {
    const url = new URL(API_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    const res = await fetch(url.toString());
    return res.json();
}

async function apiPost(body = {}) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

// ============================================================
//  Navigation
// ============================================================
function showSection(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[onclick="showSection('${section}')"]`).classList.add('active');
    document.getElementById(section + '-section').classList.remove('hidden');
    currentSection = section;

    if (section === 'calendar') generateCalendar();
    else if (section === 'manage') loadBookingsList();
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
        for (let minute = 0; minute < 60; minute += 15) {
            if (hour === 18 && minute > 0) break;
            const t = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
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
        const ok = !dayBookings.some(b => opt.value >= b.start_time && opt.value < b.end_time);
        opt.disabled = !ok;
        opt.style.color = ok ? 'black' : 'red';
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
    showLoading();

    const data = {
        date: document.getElementById('bookingDate').value,
        room_id: document.getElementById('roomSelect').value,
        start_time: document.getElementById('startTime').value,
        end_time: document.getElementById('endTime').value,
        booker: document.getElementById('bookerName').value,
        phone: document.getElementById('phoneNumber').value,
        documents: document.getElementById('documents').value
    };

    try {
        const result = await apiPost({ action: 'saveBooking', data });
        if (!result.ok) {
            showAlert(result.error || 'การจองล้มเหลว', 'error');
        } else {
            showAlert('จองห้องประชุมเรียบร้อยแล้ว!', 'success');
            document.getElementById('bookingForm').reset();
            await loadBookingsForCalendar(new Date(data.date));
            if (currentSection === 'calendar') generateCalendar();
            if (currentSection === 'manage') loadBookingsList();
        }
    } catch (err) {
        showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาตรวจสอบ API URL', 'error');
        console.error(err);
    }

    hideLoading();
}

// ============================================================
//  Load Bookings from API
// ============================================================
async function loadBookingsForCalendar(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    try {
        const result = await apiGet({ action: 'getBookings', month: `${year}-${month}` });
        if (result.ok) {
            bookings = result.data;
        }
    } catch (err) {
        console.error('ไม่สามารถโหลดข้อมูลการจองได้:', err);
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
    const names = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                   'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    monthEl.textContent = `${names[month]} ${year + 543}`;
    grid.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">กำลังโหลด...</div>';

    setTimeout(() => {
        grid.innerHTML = '';
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'aspect-square bg-gray-200/50 rounded shadow-sm';
            grid.appendChild(empty);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayBookings = bookings.filter(b => b.date === dateStr);
            const hasBookings = dayBookings.length > 0;

            const el = document.createElement('div');
            el.className = `calendar-day aspect-square rounded shadow-sm flex flex-col items-center justify-center cursor-pointer font-semibold transition-all duration-300 ${
                hasBookings ? 'booked-day shadow-md' : 'bg-white text-gray-700 hover:bg-blue-50 hover:shadow-md hover:scale-105'
            }`;
            el.innerHTML = `<span>${day}</span>${hasBookings ? `<span style="font-size:10px;font-weight:400">${dayBookings.length} การจอง</span>` : ''}`;

            if (hasBookings) {
                el.addEventListener('click', () => showBookingDetails(dateStr, dayBookings));
            }
            grid.appendChild(el);
        }
    }, 50);
}

function updateCalendarOnDateChange() {
    const val = document.getElementById('bookingDate').value;
    if (!val) return;
    currentDate = new Date(val + 'T00:00:00');
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
//  Modal
// ============================================================
function showBookingDetails(date, dayBookings) {
    const modal = document.getElementById('bookingModal');
    const content = document.getElementById('modalContent');

    content.innerHTML = `
        <div class="border-b pb-2 mb-4">
            <h4 class="font-semibold text-lg">วันที่ ${new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</h4>
        </div>
        ${dayBookings.map(b => `
            <div class="bg-gray-50 p-4 rounded-lg mb-3 border-l-4 border-blue-400">
                <p><strong>ห้อง:</strong> ${b.room_id}</p>
                <p><strong>เวลา:</strong> ${b.start_time} – ${b.end_time}</p>
                <p><strong>ผู้จอง:</strong> ${b.booker}</p>
                <p><strong>เบอร์ติดต่อ:</strong> ${b.phone}</p>
                ${b.documents ? `<p><strong>หมายเหตุ:</strong> ${b.documents}</p>` : ''}
            </div>
        `).join('')}
    `;

    currentBookingIds = dayBookings.map(b => b.id);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = document.getElementById('bookingModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function cancelBookingFromModal() {
    if (!currentBookingIds.length) return showAlert('ไม่พบข้อมูลการจอง', 'error');
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการจองทั้งหมดในวันนี้?')) {
        for (const id of currentBookingIds) {
            await confirmDeleteBooking(id);
        }
        closeModal();
    }
}

// ============================================================
//  Booking List (Manage Tab)
// ============================================================
function loadBookingsList() {
    const list = document.getElementById('bookingsList');
    const sorted = [...bookings].sort((a, b) => b.date.localeCompare(a.date) || a.start_time.localeCompare(b.start_time));

    if (sorted.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-500 py-8">ไม่มีการจองที่ถูกบันทึก</p>';
        return;
    }
    list.innerHTML = sorted.map(b => bookingCard(b)).join('');
}

function bookingCard(b) {
    return `
        <div class="booking-item">
            <div class="booking-header">
                <div>
                    <div class="booking-date-time">${formatDate(b.date)} | ${b.start_time} – ${b.end_time}</div>
                    <div class="font-medium">${b.room_id}</div>
                </div>
                <div class="booking-actions">
                    <button class="edit-btn" onclick="editBooking('${b.id}')">แก้ไข</button>
                    <button class="delete-btn" onclick="confirmDeleteBooking('${b.id}')">ลบ</button>
                </div>
            </div>
            <div class="booking-details">
                <p><strong>ผู้จอง:</strong> ${b.booker}</p>
                <p><strong>เบอร์ติดต่อ:</strong> ${b.phone}</p>
                ${b.documents ? `<p><strong>หมายเหตุ:</strong> ${b.documents}</p>` : ''}
            </div>
        </div>
    `;
}

function formatDate(dateString) {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });
}

function filterBookings() {
    const search = document.getElementById('searchBookings').value.toLowerCase();
    const room = document.getElementById('filterRoom').value;
    const filtered = bookings.filter(b => {
        const matchSearch = b.booker.toLowerCase().includes(search) || b.phone.includes(search);
        const matchRoom = !room || b.room_id === room;
        return matchSearch && matchRoom;
    });
    const list = document.getElementById('bookingsList');
    if (filtered.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-500 py-8">ไม่พบการจองที่ตรงกับเงื่อนไข</p>';
    } else {
        list.innerHTML = filtered.map(b => bookingCard(b)).join('');
    }
}

// ============================================================
//  Edit / Delete
// ============================================================
function editBooking(id) {
    const b = bookings.find(b => b.id === id);
    if (!b) return;
    document.getElementById('bookingDate').value = b.date;
    document.getElementById('roomSelect').value = b.room_id;
    generateTimeSlots();
    document.getElementById('startTime').value = b.start_time;
    document.getElementById('endTime').value = b.end_time;
    document.getElementById('bookerName').value = b.booker;
    document.getElementById('phoneNumber').value = b.phone;
    document.getElementById('documents').value = b.documents || '';
    showSection('booking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function confirmDeleteBooking(id) {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการจองนี้?')) return;
    try {
        const result = await apiPost({ action: 'deleteBooking', id });
        if (result.ok) {
            showAlert('ยกเลิกการจองเรียบร้อยแล้ว', 'success');
            bookings = bookings.filter(b => b.id !== id);
            if (currentSection === 'manage') loadBookingsList();
            if (currentSection === 'calendar') generateCalendar();
        } else {
            showAlert(result.error || 'ลบไม่สำเร็จ', 'error');
        }
    } catch (err) {
        showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    }
}

// ============================================================
//  UI Helpers
// ============================================================
function showAlert(message, type) {
    const alertDiv = document.getElementById('alert');
    document.getElementById('alertMessage').textContent = message;
    alertDiv.className = `alert ${type}`;
    alertDiv.classList.remove('hidden');
    setTimeout(() => alertDiv.classList.add('hidden'), 5000);
}

function showLoading() {
    const btn = document.getElementById('submitBtn');
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '⏳ กำลังประมวลผล...';
    btn.disabled = true;
}

function hideLoading() {
    const btn = document.getElementById('submitBtn');
    btn.innerHTML = btn.dataset.originalText || 'จองห้องประชุม';
    btn.disabled = false;
}
