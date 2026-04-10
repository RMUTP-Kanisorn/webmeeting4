       const API_URL = 'https://script.google.com/macros/s/AKfycbzlhWrPbOiKJ9tymhIuqS_dCW6YHO6ZEAruLJajeRRg4xBS_XKKvsc_KoTn90I5YsPbJA/exec';

        let bookings = JSON.parse(localStorage.getItem('cachedBookings')) || [];
        let currentDate = new Date();
        let currentSection = 'booking';
        let isAdminLoggedIn = false;
        
        let chartStatusInstance = null;
        let chartRoomInstance = null;

        // Theme Management
        const themeToggleBtn = document.getElementById('themeToggle');
        const htmlElement = document.documentElement;
        let isDark = localStorage.getItem('theme') === 'dark';

        function updateTheme() {
            if (isDark) {
                htmlElement.classList.add('dark');
                themeToggleBtn.innerHTML = '<i data-lucide="sun" class="w-5 h-5"></i>';
                localStorage.setItem('theme', 'dark');
            } else {
                htmlElement.classList.remove('dark');
                themeToggleBtn.innerHTML = '<i data-lucide="moon" class="w-5 h-5"></i>';
                localStorage.setItem('theme', 'light');
            }
            if (window.lucide) lucide.createIcons();
            if (isAdminLoggedIn) updateAdminStats(); // Re-render charts for new colors
        }

        themeToggleBtn.addEventListener('click', () => {
            isDark = !isDark;
            updateTheme();
        });

        document.addEventListener('DOMContentLoaded', () => {
            updateTheme();
            generateTimeSlots();
            loadBookingsForCalendar(new Date());

            const today = new Date().toISOString().split('T')[0];
            document.getElementById('bookingDate').min = today;

            document.getElementById('bookingDate').addEventListener('change', updateAvailableSlots);
            document.getElementById('roomSelect').addEventListener('change', updateAvailableSlots);
            document.getElementById('startTime').addEventListener('change', updateEndTimeOptions);
            document.getElementById('bookingForm').addEventListener('submit', handleBookingSubmit);
            document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);

            document.addEventListener('input', e => { if (e.target.id === 'searchBookings') filterBookings(); });
            document.addEventListener('change', e => { if (e.target.id === 'filterRoom' || e.target.id === 'filterStatus') filterBookings(); });
        });

        async function apiPost(body = {}) {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body)
            });
            return res.json();
        }

        function showSection(section) {
            document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
            ['booking', 'calendar'].forEach(s => document.getElementById('nav-' + s)?.classList.remove('active'));
            
            if (section !== 'manage') document.getElementById('nav-' + section)?.classList.add('active');
            document.getElementById(section + '-section').classList.remove('hidden');
            currentSection = section;

            if (section === 'calendar') generateCalendar();
            else if (section === 'manage' && isAdminLoggedIn) loadBookingsList();
        }

        function selectRoom(roomValue, cardEl) {
            document.querySelectorAll('.room-card').forEach(c => c.classList.remove('selected'));
            cardEl.classList.add('selected');
            document.getElementById('roomSelect').value = roomValue;
            document.getElementById('roomError').classList.add('hidden');
            updateAvailableSlots();
        }

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
                date: document.getElementById('bookingDate').value,
                meeting_title: document.getElementById('meetingTitle').value,
                room_id: room,
                start_time: document.getElementById('startTime').value,
                end_time: document.getElementById('endTime').value,
                booker: document.getElementById('bookerName').value,
                phone: document.getElementById('phoneNumber').value,
                email: document.getElementById('emailAddress').value,
                equipment: equipment.join(', '),
                drinks: drinks.join(', '),
                documents: document.getElementById('documents').value,
                status: 'pending'
            };

            try {
                const result = await apiPost({ action: 'saveBooking', data });
                if (!result.ok) {
                    if (result.error && (result.error.includes('มีการจองแล้ว') || result.error.includes('ระบบกำลังยุ่ง'))) {
                        document.getElementById('conflictMessage').innerHTML = `${result.error}<br><br><span class="font-bold text-red-500">โปรดตรวจสอบเวลาหรือห้องใหม่อีกครั้ง</span>`;
                        document.getElementById('conflictModal').classList.remove('hidden');
                    } else {
                        showAlert(result.error || 'การจองล้มเหลว', 'error');
                    }
                } else {
                    showAlert('ส่งคำขอจองเรียบร้อย! ข้อมูลถูกส่งไปที่ระบบ (รออนุมัติ)', 'success');
                    document.getElementById('bookingForm').reset();
                    document.querySelectorAll('.room-card').forEach(c => c.classList.remove('selected'));
                    document.getElementById('roomSelect').value = '';
                    
                    data.id = result.id;
                    bookings.push(data);
                    localStorage.setItem('cachedBookings', JSON.stringify(bookings));
                    if (currentSection === 'calendar') generateCalendar();
                }
            } catch (err) {
                showAlert('กรุณาเช็คการเชื่อมต่อ', 'error');
            }
            hideLoading();
        }

        async function loadBookingsForCalendar(date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            try {
                const result = await apiPost({ action: 'getBookings', month: `${year}-${month}` });
                if (result.ok) {
                    bookings = result.data;
                    localStorage.setItem('cachedBookings', JSON.stringify(bookings));
                    if (currentSection === 'calendar') generateCalendar();
                    if (currentSection === 'booking') updateAvailableSlots();
                }
            } catch (err) {}
        }

        function generateCalendar() {
            const grid = document.getElementById('calendarGrid');
            const monthEl = document.getElementById('currentMonth');
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const names = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
            monthEl.textContent = `${names[month]} ${year + 543}`;
            
            if (bookings.length === 0 && !localStorage.getItem('cachedBookings')) {
                grid.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500 text-sm"><i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2"></i> กำลังโหลดข้อมูล...</div>';
                lucide.createIcons();
            }

            setTimeout(() => {
                grid.innerHTML = '';
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();

                for (let i = 0; i < firstDay; i++) {
                    const emp = document.createElement('div');
                    emp.className = 'empty-day rounded min-h-[50px]';
                    grid.appendChild(emp);
                }

                for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const dayBookings = bookings.filter(b => b.date === dateStr);
                    const hasPending  = dayBookings.some(b => b.status === 'pending');
                    const hasApproved = dayBookings.some(b => b.status === 'approved');

                    const el = document.createElement('div');
                    let colorClass = '';
                    if (hasPending && hasApproved) colorClass = 'day-mixed';
                    else if (hasApproved) colorClass = 'day-approved'; 
                    else if (hasPending) colorClass = 'day-pending'; 

                    el.className = `calendar-day flex flex-col items-center justify-center p-1 ${colorClass}`;
                    el.innerHTML = `<span class="font-bold">${day}</span>${dayBookings.length > 0 ? `<span class="text-[10px] opacity-90">${dayBookings.length} รายการ</span>` : ''}`;

                    if (dayBookings.length > 0) el.addEventListener('click', () => showBookingModal(dateStr, dayBookings));
                    grid.appendChild(el);
                }
                lucide.createIcons();
            }, 50);
        }

        async function previousMonth() { currentDate.setMonth(currentDate.getMonth() - 1); generateCalendar(); await loadBookingsForCalendar(currentDate); }
        async function nextMonth() { currentDate.setMonth(currentDate.getMonth() + 1); generateCalendar(); await loadBookingsForCalendar(currentDate); }

        function showBookingModal(dateStr, dayBookings) {
            const modal = document.getElementById('bookingModal');
            const content = document.getElementById('modalContent');
            const dateFormatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

            content.innerHTML = `
                <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 mb-4">
                    <p class="font-bold text-blue-800 dark:text-blue-300">${dateFormatted}</p>
                    <p class="text-sm text-blue-600 dark:text-blue-400 mt-1">มีการจองทั้งหมด ${dayBookings.length} รายการ</p>
                </div>
                <div class="space-y-3 custom-scrollbar pr-1">
                    ${dayBookings.map((b, i) => `
                        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border-l-4 ${b.status === 'approved' ? 'border-green-500' : 'border-orange-500'}">
                            <div class="flex justify-between items-center mb-3">
                                <span class="font-bold text-sm">รายการที่ ${i+1}</span>
                                <span class="badge ${b.status === 'approved' ? 'badge-approved' : 'badge-pending'}">
                                    <i data-lucide="${b.status === 'approved' ? 'check-circle' : 'clock'}" class="w-3 h-3"></i> 
                                    ${b.status === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติ'}
                                </span>
                            </div>
                            <div class="grid grid-cols-1 gap-2 text-sm">
                                <div class="flex"><span class="text-gray-500 w-20">หัวข้อ:</span> <span class="font-medium">${b.meeting_title || '-'}</span></div>
                                <div class="flex"><span class="text-gray-500 w-20">ห้อง:</span> <span class="font-medium">${b.room_id}</span></div>
                                <div class="flex"><span class="text-gray-500 w-20">เวลา:</span> <span class="font-medium">${b.start_time} - ${b.end_time} น.</span></div>
                                <div class="flex"><span class="text-gray-500 w-20">ผู้จอง:</span> <span class="font-medium">${b.booker}</span></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            modal.classList.remove('hidden');
            lucide.createIcons();
        }

        function closeModal(modalId) { document.getElementById(modalId)?.classList.add('hidden'); }

        async function handleAdminLogin(e) {
            e.preventDefault();
            const user = document.getElementById('adminUser').value.trim();
            const pass = document.getElementById('adminPass').value;
            const errEl = document.getElementById('loginError');
            const btn = document.getElementById('adminLoginBtn');
            
            btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> กำลังตรวจสอบ...';
            btn.disabled = true;
            lucide.createIcons();

            try {
                const result = await apiPost({ action: 'adminLogin', data: { user, pass } });
                if (result.ok) {
                    isAdminLoggedIn = true;
                    errEl.classList.add('hidden');
                    document.getElementById('admin-login-box').classList.add('hidden');
                    document.getElementById('admin-panel').classList.remove('hidden');
                    loadBookingsList(); 
                } else {
                    errEl.classList.remove('hidden');
                    document.getElementById('adminPass').value = '';
                }
            } catch(e) {
                errEl.classList.remove('hidden');
                errEl.innerHTML = '<i data-lucide="wifi-off" class="w-4 h-4"></i> ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
            } finally {
                btn.innerHTML = 'เข้าสู่ระบบ';
                btn.disabled = false;
                lucide.createIcons();
            }
        }

        function adminLogout() {
            isAdminLoggedIn = false;
            document.getElementById('admin-login-box').classList.remove('hidden');
            document.getElementById('admin-panel').classList.add('hidden');
            document.getElementById('adminPass').value = '';
            showSection('booking'); 
        }

        async function loadBookingsList() {
            updateAdminStats();
            renderBookingsList(bookings);
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
            renderDashboardCharts(pending, approved);
        }

        function getChartColors() {
            const textColor = isDark ? '#9ca3af' : '#4b5563';
            const gridColor = isDark ? '#404040' : '#f3f4f6';
            return { textColor, gridColor };
        }

        function renderDashboardCharts(pending, approved) {
            if(!document.getElementById('statusChart')) return;
            const { textColor, gridColor } = getChartColors();

            // Doughnut
            const ctxStatus = document.getElementById('statusChart').getContext('2d');
            if(chartStatusInstance) chartStatusInstance.destroy();
            chartStatusInstance = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: ['รออนุมัติ', 'อนุมัติแล้ว'],
                    datasets: [{ data: [pending, approved], backgroundColor: ['#f97316', '#10b981'], borderWidth: 0, hoverOffset: 4 }]
                },
                options: { 
                    responsive: true, maintainAspectRatio: false, 
                    plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Maledpan' } } } } 
                }
            });

            // Bar
            const roomCounts = { 'ห้องประชุม 1 (รองรับ 13 คน)': 0, 'ห้องประชุม 2 (รองรับ 30 คน)': 0, 'ห้องประชุม 3 (รองรับ 100 คน)': 0 };
            bookings.forEach(b => { if(roomCounts[b.room_id] !== undefined) roomCounts[b.room_id]++; else roomCounts[b.room_id] = 1; });
            const ctxRoom = document.getElementById('roomChart').getContext('2d');
            if(chartRoomInstance) chartRoomInstance.destroy();
            chartRoomInstance = new Chart(ctxRoom, {
                type: 'bar',
                data: {
                    labels: ['ห้อง 1', 'ห้อง 2', 'ห้อง 3'],
                    datasets: [{ label: 'จำนวนครั้ง', data: [roomCounts['ห้องประชุม 1 (รองรับ 13 คน)'], roomCounts['ห้องประชุม 2 (รองรับ 30 คน)'], roomCounts['ห้องประชุม 3 (รองรับ 100 คน)']], backgroundColor: '#3b82f6', borderRadius: 4 }]
                },
                options: { 
                    responsive: true, maintainAspectRatio: false,
                    scales: { 
                        y: { beginAtZero: true, ticks: { stepSize: 1, color: textColor }, grid: { color: gridColor } },
                        x: { ticks: { color: textColor }, grid: { display: false } }
                    },
                    plugins: { legend: { display: false }, tooltip: { titleFont: { family: 'Maledpan' }, bodyFont: { family: 'Maledpan' } } }
                }
            });
        }

        function renderBookingsList(list) {
            const container = document.getElementById('bookingsList');
            const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || a.start_time.localeCompare(b.start_time));

            if (sorted.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-500 py-10 bg-gray-50 dark:bg-gray-800/50 rounded-xl"><i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i> ไม่มีข้อมูลการจอง</div>';
                lucide.createIcons();
                return;
            }

            container.innerHTML = sorted.map(b => {
                const isPending = b.status !== 'approved';
                return `
                    <div class="booking-item status-${isPending ? 'pending' : 'approved'}">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <div class="font-bold text-lg">${b.room_id}</div>
                                <div class="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                    <i data-lucide="calendar" class="w-3 h-3"></i> ${formatDate(b.date)} 
                                    <i data-lucide="clock" class="w-3 h-3 ml-2"></i> ${b.start_time} - ${b.end_time} น.
                                </div>
                                ${b.meeting_title ? `<div class="text-sm mt-2"><span class="text-gray-500">หัวข้อ:</span> <span class="font-medium">${b.meeting_title}</span></div>` : ''}
                            </div>
                            <span class="badge ${isPending ? 'badge-pending' : 'badge-approved'}">
                                <i data-lucide="${isPending ? 'clock' : 'check-circle'}" class="w-3 h-3"></i> ${isPending ? 'รออนุมัติ' : 'อนุมัติแล้ว'}
                            </span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl mb-4 border border-gray-100 dark:border-gray-700">
                            <div class="flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-gray-400"></i> ${b.booker}</div>
                            <div class="flex items-center gap-2"><i data-lucide="phone" class="w-4 h-4 text-gray-400"></i> ${b.phone}</div>
                            <div class="flex items-center gap-2 sm:col-span-2"><i data-lucide="mail" class="w-4 h-4 text-gray-400"></i> ${b.email || '-'}</div>
                            ${b.equipment ? `<div class="flex items-start gap-2"><i data-lucide="monitor" class="w-4 h-4 text-gray-400 mt-0.5"></i> <span>${b.equipment}</span></div>` : ''}
                            ${b.drinks ? `<div class="flex items-start gap-2"><i data-lucide="coffee" class="w-4 h-4 text-gray-400 mt-0.5"></i> <span>${b.drinks}</span></div>` : ''}
                        </div>
                        <div class="flex flex-col sm:flex-row gap-2">
                            ${isPending ? `
                                <button class="btn-action btn-approve flex-1 py-2.5" onclick="approveBooking('${b.id}', '${b.email}', '${b.booker}', '${b.date}', '${b.start_time}', '${b.end_time}', '${b.room_id}', '${b.meeting_title}')">
                                    <i data-lucide="check-circle-2" class="w-4 h-4"></i> อนุมัติการจอง
                                </button>
                            ` : `
                                <button class="btn-action flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-not-allowed" disabled>
                                    <i data-lucide="check" class="w-4 h-4"></i> อนุมัติแล้ว
                                </button>
                            `}
                            <button class="btn-action btn-delete w-full sm:w-auto px-5 py-2.5" onclick="confirmDeleteBooking('${b.id}')">
                                <i data-lucide="trash-2" class="w-4 h-4"></i> ลบ
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
            lucide.createIcons();
        }

        async function approveBooking(id, email, booker, date, startTime, endTime, room, title) {
            if (!confirm(`ยืนยันการอนุมัติห้องประชุม\nระบบจะส่งอีเมลไปยัง ${email} และลงปฏิทิน`)) return;
            try {
                const result = await apiPost({ action: 'approveBooking', id, email, booker, date, startTime, endTime, room, meeting_title: title });
                if (result.ok) {
                    showAlert('อนุมัติเรียบร้อย! ส่งอีเมล และลง Calendar แล้ว', 'success');
                    const b = bookings.find(b => b.id === id);
                    if (b) b.status = 'approved';
                    localStorage.setItem('cachedBookings', JSON.stringify(bookings));
                    updateAdminStats(); renderBookingsList(bookings);
                } else { showAlert(result.error || 'เกิดข้อผิดพลาดในการอนุมัติ', 'error'); }
            } catch (err) { showAlert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์', 'error'); }
        }

        async function confirmDeleteBooking(id) {
            if (!confirm('ลบข้อมูลการจองนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) return;
            try {
                const result = await apiPost({ action: 'deleteBooking', id });
                if (result.ok) {
                    showAlert('ลบการจองเรียบร้อย', 'success');
                    bookings = bookings.filter(b => b.id !== id);
                    localStorage.setItem('cachedBookings', JSON.stringify(bookings));
                    updateAdminStats(); renderBookingsList(bookings);
                } else { showAlert(result.error || 'ลบไม่สำเร็จ', 'error'); }
            } catch (err) { showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error'); }
        }

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

        function formatDate(dateString) {
            if (!dateString) return '';
            try { return new Date(dateString + 'T00:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }); } catch(e) { return dateString; }
        }

        function showAlert(message, type = 'success') {
            const el = document.getElementById('alert');
            const icon = document.getElementById('alertIcon');
            icon.innerHTML = type === 'success' ? '<i data-lucide="check-circle" class="w-5 h-5"></i>' : '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
            document.getElementById('alertMessage').textContent = message;
            el.className = `alert ${type}`;
            el.classList.remove('hidden');
            lucide.createIcons();
            setTimeout(() => el.classList.add('hidden'), 5000);
        }

        function showLoading() {
            const btn = document.getElementById('submitBtn');
            btn.dataset.orig = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> ระบบกำลังประมวลผล...';
            btn.disabled = true;
            lucide.createIcons();
        }

        function hideLoading() {
            const btn = document.getElementById('submitBtn');
            btn.innerHTML = btn.dataset.orig;
            btn.disabled = false;
        }