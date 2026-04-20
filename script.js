        const CONFIG = {
            API_URL: 'https://script.google.com/macros/s/AKfycbzlhWrPbOiKJ9tymhIuqS_dCW6YHO6ZEAruLJajeRRg4xBS_XKKvsc_KoTn90I5YsPbJA/exec',
            STATUS: {
                PENDING: 'pending',
                APPROVED: 'approved',
                REJECTED: 'rejected'
            },
            MONTHS: ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
        };

        const Utils = {
            formatThaiDate: (dateString) => {
                if (!dateString) return '';
                try {
                    return new Date(dateString + 'T00:00:00').toLocaleDateString('th-TH', { 
                        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' 
                    });
                } catch(e) { return dateString; }
            },
            generateTimeSlots: (startHour = 8, endHour = 18, interval = 15) => {
                const slots = [];
                for (let h = startHour; h <= endHour; h++) {
                    for (let m = 0; m < 60; m += interval) {
                        if (h === endHour && m > 0) break;
                        slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
                    }
                }
                return slots;
            },
            refreshIcons: () => {
                if (window.lucide) try { lucide.createIcons(); } catch(e) {}
            }
        };


        /**
         * 2. STATE MANAGEMENT (Model)
         * จัดการ Data ของระบบแบบรวมศูนย์ (Single Source of Truth)
         */
        class AppState {
            constructor() {
                this.bookings = JSON.parse(localStorage.getItem('cachedBookings')) || [];
                this.currentDate = new Date();
                this.isAdminLoggedIn = false;
            }

            setBookings(newBookings) {
                this.bookings = newBookings;
                localStorage.setItem('cachedBookings', JSON.stringify(this.bookings));
            }

            addBooking(booking) {
                this.bookings.push(booking);
                this.setBookings(this.bookings);
            }

            updateBookingStatus(id, newStatus) {
                const b = this.bookings.find(item => item.id === id);
                if (b) {
                    b.status = newStatus;
                    this.setBookings(this.bookings);
                }
            }

            removeBooking(id) {
                this.bookings = this.bookings.filter(b => b.id !== id);
                this.setBookings(this.bookings);
            }

            getBookingsByDate(dateStr) {
                return this.bookings.filter(b => b.date === dateStr && b.status !== CONFIG.STATUS.REJECTED);
            }
        }
        const state = new AppState();


        /**
         * 3. API SERVICE
         * แยกชั้นจัดการเรื่อง Network Request ชัดเจน
         */
        class ApiService {
            static async request(payload) {
                try {
                    const res = await fetch(CONFIG.API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload)
                    });
                    return await res.json();
                } catch (error) {
                    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
                }
            }
        }


        /**
         * 4. TEMPLATES
         * แยก HTML Injection ออกมาเป็น Pure Functions
         */
        class Template {
            static badge(status) {
                const maps = {
                    [CONFIG.STATUS.PENDING]: { class: 'badge-pending', icon: 'clock', text: 'รออนุมัติ' },
                    [CONFIG.STATUS.APPROVED]: { class: 'badge-approved', icon: 'check-circle', text: 'อนุมัติแล้ว' },
                    [CONFIG.STATUS.REJECTED]: { class: 'badge-rejected', icon: 'x-circle', text: 'ไม่อนุมัติ' }
                };
                const c = maps[status] || maps[CONFIG.STATUS.PENDING];
                return `<span class="badge ${c.class}"><i data-lucide="${c.icon}" class="w-3 h-3"></i> ${c.text}</span>`;
            }

            static adminBookingItem(b) {
                const isPending = b.status === CONFIG.STATUS.PENDING;
                const isApproved = b.status === CONFIG.STATUS.APPROVED;
                
                return `
                    <div class="booking-item status-${b.status}">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <div class="font-bold text-lg">${b.room_id}</div>
                                <div class="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                    <i data-lucide="calendar" class="w-3 h-3"></i> ${Utils.formatThaiDate(b.date)} 
                                    <i data-lucide="clock" class="w-3 h-3 ml-2"></i> ${b.start_time} - ${b.end_time} น.
                                </div>
                                ${b.meeting_title ? `<div class="text-sm mt-2"><span class="text-gray-500">หัวข้อ:</span> <span class="font-medium">${b.meeting_title}</span></div>` : ''}
                            </div>
                            ${this.badge(b.status)}
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-gray-50 p-4 rounded-xl mb-4 border border-gray-100">
                            <div class="flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-gray-400"></i> ${b.booker}</div>
                            <div class="flex items-center gap-2"><i data-lucide="phone" class="w-4 h-4 text-gray-400"></i> ${b.phone}</div>
                            <div class="flex items-center gap-2 sm:col-span-2"><i data-lucide="mail" class="w-4 h-4 text-gray-400"></i> ${b.email || '-'}</div>
                            ${b.equipment ? `<div class="flex items-start gap-2"><i data-lucide="monitor" class="w-4 h-4 text-gray-400 mt-0.5"></i> <span>${b.equipment}</span></div>` : ''}
                            ${b.drinks ? `<div class="flex items-start gap-2"><i data-lucide="coffee" class="w-4 h-4 text-gray-400 mt-0.5"></i> <span>${b.drinks}</span></div>` : ''}
                        </div>
                        <div class="flex flex-col sm:flex-row gap-2">
                            ${isPending ? `
                                <button class="btn-action btn-approve flex-1 py-2.5" data-action="approve" data-id="${b.id}">
                                    <i data-lucide="check-circle-2" class="w-4 h-4"></i> อนุมัติการจอง
                                </button>
                                <button class="btn-action btn-reject flex-1 py-2.5" data-action="reject" data-id="${b.id}">
                                    <i data-lucide="x-circle" class="w-4 h-4"></i> ไม่อนุมัติ
                                </button>
                            ` : `
                                <button class="btn-action flex-1 py-2.5 bg-gray-100 text-gray-500 cursor-not-allowed" disabled>
                                    <i data-lucide="${isApproved ? 'check' : 'x'}" class="w-4 h-4"></i> ${isApproved ? 'อนุมัติแล้ว' : 'ถูกปฏิเสธการจอง'}
                                </button>
                            `}
                            <button class="btn-action btn-delete w-full sm:w-auto px-5 py-2.5" data-action="delete" data-id="${b.id}">
                                <i data-lucide="trash-2" class="w-4 h-4"></i> ลบ
                            </button>
                        </div>
                    </div>
                `;
            }

            static calendarModalItem(b, index) {
                return `
                    <div class="bg-gray-50 rounded-xl p-4 border-l-4 ${b.status === CONFIG.STATUS.APPROVED ? 'border-green-500' : 'border-orange-500'}">
                        <div class="flex justify-between items-center mb-3">
                            <span class="font-bold text-sm">รายการที่ ${index + 1}</span>
                            ${this.badge(b.status)}
                        </div>
                        <div class="grid grid-cols-1 gap-2 text-sm">
                            <div class="flex"><span class="text-gray-500 w-20">หัวข้อ:</span> <span class="font-medium">${b.meeting_title || '-'}</span></div>
                            <div class="flex"><span class="text-gray-500 w-20">ห้อง:</span> <span class="font-medium">${b.room_id}</span></div>
                            <div class="flex"><span class="text-gray-500 w-20">เวลา:</span> <span class="font-medium">${b.start_time} - ${b.end_time} น.</span></div>
                            <div class="flex"><span class="text-gray-500 w-20">ผู้จอง:</span> <span class="font-medium">${b.booker}</span></div>
                        </div>
                    </div>
                `;
            }
        }


        /**
         * 5. UI CONTROLLERS
         * ควบคุมการแสดงผลแยกตามหน้า
         */
        const UIView = {
            switchSection(sectionId) {
                document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
                document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
                
                document.getElementById(`${sectionId}-section`)?.classList.remove('hidden');
                
                const navBtn = document.querySelector(`[data-nav="${sectionId}"]`);
                if (navBtn && sectionId !== 'manage') navBtn.classList.add('active');

                if (sectionId === 'calendar') CalendarController.render();
                if (sectionId === 'manage' && state.isAdminLoggedIn) AdminController.renderDashboard();
            },

            showAlert(message, type = 'success') {
                const el = document.getElementById('toastAlert');
                document.getElementById('toastIcon').innerHTML = type === 'success' ? 
                    '<i data-lucide="check-circle" class="w-5 h-5"></i>' : '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
                document.getElementById('toastMessage').textContent = message;
                el.className = `alert ${type}`;
                el.classList.remove('hidden');
                Utils.refreshIcons();
                setTimeout(() => el.classList.add('hidden'), 5000);
            },

            toggleModal(modalId, forceState = null) {
                const modal = document.getElementById(modalId);
                if(forceState === true) modal.classList.remove('hidden');
                else if(forceState === false) modal.classList.add('hidden');
                else modal.classList.toggle('hidden');
            },

            setLoadingBtn(btnId, isLoading, originalText = '') {
                const btn = document.getElementById(btnId);
                if (isLoading) {
                    btn.dataset.orig = btn.innerHTML;
                    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> กำลังประมวลผล...';
                    btn.disabled = true;
                } else {
                    btn.innerHTML = originalText || btn.dataset.orig;
                    btn.disabled = false;
                }
                Utils.refreshIcons();
            }
        };

        const BookingController = {
            init() {
                this.form = document.getElementById('bookingForm');
                this.dateInput = document.getElementById('bookingDate');
                this.roomInput = document.getElementById('roomSelectInput');
                this.startSelect = document.getElementById('startTime');
                this.endSelect = document.getElementById('endTime');
                this.roomCards = document.querySelectorAll('.room-card');

                // Set Min Date
                const today = new Date();
                today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
                this.dateInput.min = today.toISOString().split('T')[0];

                this.populateTimeSlots();
                this.bindEvents();
            },

            bindEvents() {
                this.roomCards.forEach(card => {
                    card.addEventListener('click', (e) => {
                        this.roomCards.forEach(c => c.classList.remove('selected'));
                        card.classList.add('selected');
                        this.roomInput.value = card.dataset.roomId;
                        document.getElementById('roomErrorMsg').classList.add('hidden');
                        this.updateAvailableSlots();
                    });
                });

                this.dateInput.addEventListener('change', () => this.updateAvailableSlots());
                this.startSelect.addEventListener('change', () => this.updateEndTimeOptions());
                this.form.addEventListener('submit', (e) => this.handleSubmit(e));
            },

            populateTimeSlots() {
                const slots = Utils.generateTimeSlots();
                slots.forEach(t => {
                    this.startSelect.appendChild(new Option(t, t));
                    this.endSelect.appendChild(new Option(t, t));
                });
            },

            updateAvailableSlots() {
                const date = this.dateInput.value;
                const room = this.roomInput.value;
                if (!date || !room) return;

                const dayBookings = state.getBookingsByDate(date).filter(b => b.room_id === room);
                
                Array.from(this.startSelect.options).slice(1).forEach(opt => {
                    const isTaken = dayBookings.some(b => opt.value >= b.start_time && opt.value < b.end_time);
                    opt.disabled = isTaken;
                    opt.style.color = isTaken ? '#ef4444' : '';
                    opt.textContent = isTaken ? opt.value + ' (มีคนจองแล้ว)' : opt.value;
                });
            },

            updateEndTimeOptions() {
                const start = this.startSelect.value;
                Array.from(this.endSelect.options).slice(1).forEach(opt => {
                    opt.disabled = opt.value <= start;
                });
            },

            async handleSubmit(e) {
                e.preventDefault();
                if (!this.roomInput.value) {
                    document.getElementById('roomErrorMsg').classList.remove('hidden');
                    return;
                }

                UIView.setLoadingBtn('submitBtn', true);
                
                const getChecked = (name) => Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value).join(', ');
                
                const payload = {
                    date: this.dateInput.value,
                    meeting_title: document.getElementById('meetingTitle').value,
                    room_id: this.roomInput.value,
                    start_time: this.startSelect.value,
                    end_time: this.endSelect.value,
                    booker: document.getElementById('bookerName').value,
                    phone: document.getElementById('phoneNumber').value,
                    email: document.getElementById('emailAddress').value,
                    equipment: getChecked('equipment'),
                    drinks: getChecked('drinks'),
                    documents: document.getElementById('documents').value,
                    status: CONFIG.STATUS.PENDING
                };

                try {
                    const res = await ApiService.request({ action: 'saveBooking', data: payload });
                    if (res.ok) {
                        UIView.showAlert('ส่งคำขอจองเรียบร้อย ข้อมูลเข้าสู่ระบบแล้ว', 'success');
                        this.form.reset();
                        this.roomCards.forEach(c => c.classList.remove('selected'));
                        this.roomInput.value = '';
                        
                        payload.id = res.id;
                        state.addBooking(payload);
                    } else {
                        if (res.error?.includes('จองแล้ว')) {
                            document.getElementById('conflictMessageTxt').innerHTML = `${res.error}<br><span class="text-red-500">โปรดเลือกเวลาอื่น</span>`;
                            UIView.toggleModal('conflictModal', true);
                        } else {
                            UIView.showAlert(res.error || 'การจองล้มเหลว', 'error');
                        }
                    }
                } catch (err) {
                    UIView.showAlert(err.message, 'error');
                }
                UIView.setLoadingBtn('submitBtn', false);
            }
        };

        const CalendarController = {
            init() {
                document.getElementById('btnPrevMonth').addEventListener('click', () => this.changeMonth(-1));
                document.getElementById('btnNextMonth').addEventListener('click', () => this.changeMonth(1));
                this.loadData();
            },

            async loadData() {
                const year = state.currentDate.getFullYear();
                const month = String(state.currentDate.getMonth() + 1).padStart(2, '0');
                try {
                    const res = await ApiService.request({ action: 'getBookings', month: `${year}-${month}` });
                    if (res.ok) {
                        state.setBookings(res.data);
                        this.render();
                        BookingController.updateAvailableSlots();
                        if (state.isAdminLoggedIn) AdminController.renderDashboard();
                    }
                } catch (e) { console.warn('Silent Fetch Error'); }
            },

            async changeMonth(offset) {
                state.currentDate.setMonth(state.currentDate.getMonth() + offset);
                this.render();
                await this.loadData();
            },

            render() {
                const grid = document.getElementById('calendarGrid');
                const year = state.currentDate.getFullYear();
                const month = state.currentDate.getMonth();
                
                document.getElementById('currentMonthDisplay').textContent = `${CONFIG.MONTHS[month]} ${year + 543}`;
                grid.innerHTML = '';

                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();

                for (let i = 0; i < firstDay; i++) {
                    grid.innerHTML += `<div class="empty-day min-h-[50px] bg-transparent"></div>`;
                }

                for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const dayBookings = state.getBookingsByDate(dateStr);
                    
                    const hasPending = dayBookings.some(b => b.status === CONFIG.STATUS.PENDING);
                    const hasApproved = dayBookings.some(b => b.status === CONFIG.STATUS.APPROVED);
                    
                    let bgClass = 'bg-white border border-gray-100';
                    if (hasPending && hasApproved) bgClass = 'day-mixed';
                    else if (hasApproved) bgClass = 'day-approved';
                    else if (hasPending) bgClass = 'day-pending';

                    const el = document.createElement('div');
                    el.className = `calendar-day flex flex-col items-center justify-center p-1 rounded min-h-[50px] transition-all ${bgClass} ${dayBookings.length ? 'cursor-pointer hover:shadow-md' : ''}`;
                    el.innerHTML = `<span class="font-bold">${day}</span>${dayBookings.length ? `<span class="text-[10px] opacity-90">${dayBookings.length} รายการ</span>` : ''}`;
                    
                    if (dayBookings.length > 0) {
                        el.addEventListener('click', () => this.showModal(dateStr, dayBookings));
                    }
                    grid.appendChild(el);
                }
                Utils.refreshIcons();
            },

            showModal(dateStr, dayBookings) {
                const html = `
                    <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
                        <p class="font-bold text-blue-800">${Utils.formatThaiDate(dateStr)}</p>
                        <p class="text-sm text-blue-600 mt-1">การจองทั้งหมด ${dayBookings.length} รายการ</p>
                    </div>
                    <div class="space-y-3 custom-scrollbar pr-1">
                        ${dayBookings.map((b, i) => Template.calendarModalItem(b, i)).join('')}
                    </div>
                `;
                document.getElementById('modalContentBody').innerHTML = html;
                UIView.toggleModal('bookingModal', true);
                Utils.refreshIcons();
            }
        };

        const AdminController = {
            chartStatus: null,
            chartRoom: null,

            init() {
                document.getElementById('adminLoginForm').addEventListener('submit', (e) => this.handleLogin(e));
                document.getElementById('adminLogoutBtn').addEventListener('click', () => this.handleLogout());
                
                // Live Filters
                document.getElementById('searchFilterInput').addEventListener('input', () => this.renderList());
                document.getElementById('roomFilterSelect').addEventListener('change', () => this.renderList());
                document.getElementById('statusFilterSelect').addEventListener('change', () => this.renderList());

                // Event Delegation for action buttons
                document.getElementById('bookingsListContainer').addEventListener('click', (e) => {
                    const btn = e.target.closest('.btn-action');
                    if (!btn || !btn.dataset.action) return;
                    
                    const id = btn.dataset.id;
                    const booking = state.bookings.find(b => b.id === id);
                    if (!booking) return;

                    if (btn.dataset.action === 'approve') this.doAction('approveBooking', booking, `ยืนยันการอนุมัติ?\nระบบจะส่งอีเมลแจ้งไปยัง ${booking.email}`);
                    if (btn.dataset.action === 'reject') this.doAction('rejectBooking', booking, `ไม่อนุมัติการจองนี้ใช่หรือไม่?`);
                    if (btn.dataset.action === 'delete') this.doAction('deleteBooking', booking, `ลบการจองนี้ใช่หรือไม่?\nการกระทำนี้ย้อนกลับไม่ได้`);
                });
            },

            async handleLogin(e) {
                e.preventDefault();
                const user = document.getElementById('adminUser').value.trim();
                const pass = document.getElementById('adminPass').value;
                const err = document.getElementById('loginErrorMsg');
                
                UIView.setLoadingBtn('adminLoginBtn', true);
                
                try {
                    const res = await ApiService.request({ action: 'adminLogin', data: { user, pass } });
                    if (res.ok) {
                        state.isAdminLoggedIn = true;
                        err.classList.add('hidden');
                        document.getElementById('adminLoginBox').classList.add('hidden');
                        document.getElementById('adminPanel').classList.remove('hidden');
                        this.renderDashboard();
                    } else {
                        err.classList.remove('hidden');
                    }
                } catch(e) {
                    err.innerHTML = '<i data-lucide="wifi-off" class="w-4 h-4"></i> ' + e.message;
                    err.classList.remove('hidden');
                }
                UIView.setLoadingBtn('adminLoginBtn', false, 'เข้าสู่ระบบ');
            },

            handleLogout() {
                state.isAdminLoggedIn = false;
                document.getElementById('adminPass').value = '';
                document.getElementById('adminLoginBox').classList.remove('hidden');
                document.getElementById('adminPanel').classList.add('hidden');
                UIView.switchSection('booking');
            },

            renderDashboard() {
                const counts = { pending: 0, approved: 0, rejected: 0, total: state.bookings.length };
                state.bookings.forEach(b => { if(counts[b.status] !== undefined) counts[b.status]++; });

                document.getElementById('statPending').textContent = counts.pending;
                document.getElementById('statApproved').textContent = counts.approved;
                document.getElementById('statRejected').textContent = counts.rejected;
                document.getElementById('statTotal').textContent = counts.total;

                this.renderCharts();
                this.renderList();
            },

            renderCharts() {
                const textColor = '#4b5563';
                const gridColor = '#f3f4f6';

                // Data gathering
                let p = 0, a = 0, r = 0;
                const rooms = {};
                state.bookings.forEach(b => {
                    if (b.status === CONFIG.STATUS.PENDING) p++;
                    if (b.status === CONFIG.STATUS.APPROVED) a++;
                    if (b.status === CONFIG.STATUS.REJECTED) r++;
                    if (b.status !== CONFIG.STATUS.REJECTED) rooms[b.room_id] = (rooms[b.room_id] || 0) + 1;
                });

                // Status Chart
                if (this.chartStatus) this.chartStatus.destroy();
                this.chartStatus = new Chart(document.getElementById('statusChartCanvas'), {
                    type: 'doughnut',
                    data: {
                        labels: ['รออนุมัติ', 'อนุมัติแล้ว', 'ไม่อนุมัติ'],
                        datasets: [{ data: [p, a, r], backgroundColor: ['#f97316', '#10b981', '#ef4444'], borderWidth: 0 }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor, font: {family:'Kanit'} } } } }
                });

                // Room Chart
                if (this.chartRoom) this.chartRoom.destroy();
                this.chartRoom = new Chart(document.getElementById('roomChartCanvas'), {
                    type: 'bar',
                    data: {
                        labels: ['ห้อง 1', 'ห้อง 2', 'ห้อง 3'],
                        datasets: [{ 
                            data: [rooms['ห้องประชุม 1 (รองรับ 13 คน)']||0, rooms['ห้องประชุม 2 (รองรับ 30 คน)']||0, rooms['ห้องประชุม 3 (รองรับ 100 คน)']||0], 
                            backgroundColor: '#3b82f6', borderRadius: 4 
                        }]
                    },
                    options: { 
                        responsive: true, maintainAspectRatio: false,
                        scales: { y: { ticks: { stepSize: 1, color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { display: false } } },
                        plugins: { legend: { display: false } }
                    }
                });
            },

            renderList() {
                const search = document.getElementById('searchFilterInput').value.toLowerCase();
                const room = document.getElementById('roomFilterSelect').value;
                const status = document.getElementById('statusFilterSelect').value;

                let filtered = state.bookings.filter(b => {
                    return (!search || b.booker.toLowerCase().includes(search) || b.phone.includes(search) || (b.email||'').toLowerCase().includes(search))
                        && (!room || b.room_id === room)
                        && (!status || b.status === status);
                });

                filtered.sort((a, b) => b.date.localeCompare(a.date) || a.start_time.localeCompare(b.start_time));

                const container = document.getElementById('bookingsListContainer');
                if (filtered.length === 0) {
                    container.innerHTML = '<div class="text-center text-gray-500 py-10 bg-gray-50 rounded-xl"><i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i> ไม่มีข้อมูลการจอง</div>';
                } else {
                    container.innerHTML = filtered.map(b => Template.adminBookingItem(b)).join('');
                }
                Utils.refreshIcons();
            },

            async doAction(actionName, bookingObj, confirmMsg) {
                if (!confirm(confirmMsg)) return;
                
                try {
                    // Mapper to match old backend requirement
                    const payload = {
                        action: actionName,
                        id: bookingObj.id,
                        email: bookingObj.email,
                        booker: bookingObj.booker,
                        date: bookingObj.date,
                        startTime: bookingObj.start_time,
                        endTime: bookingObj.end_time,
                        room: bookingObj.room_id,
                        meeting_title: bookingObj.meeting_title
                    };

                    const res = await ApiService.request(payload);
                    if (res.ok) {
                        UIView.showAlert('ดำเนินการสำเร็จ', 'success');
                        
                        if (actionName === 'deleteBooking') state.removeBooking(bookingObj.id);
                        else if (actionName === 'approveBooking') state.updateBookingStatus(bookingObj.id, CONFIG.STATUS.APPROVED);
                        else if (actionName === 'rejectBooking') state.updateBookingStatus(bookingObj.id, CONFIG.STATUS.REJECTED);
                        
                        this.renderDashboard();
                    } else {
                        UIView.showAlert(res.error || 'ผิดพลาดจากฝั่งเซิร์ฟเวอร์', 'error');
                    }
                } catch (err) {
                    UIView.showAlert(err.message, 'error');
                }
            }
        };


        /**
         * 6. INITIALIZATION (Entry Point)
         * เริ่มต้นระบบเมื่อโหลด DOM เสร็จสมบูรณ์
         */
        document.addEventListener('DOMContentLoaded', () => {
            BookingController.init();
            CalendarController.init();
            AdminController.init();
            
            // Global Navigation Listener
            document.querySelectorAll('[data-nav]').forEach(btn => {
                btn.addEventListener('click', (e) => UIView.switchSection(e.currentTarget.dataset.nav));
            });

            // Global Modal Close Listeners
            document.querySelectorAll('.modal').forEach(modal => {
                modal.addEventListener('click', (e) => { if (e.target === modal) UIView.toggleModal(modal.id, false); });
            });
            document.querySelectorAll('[data-close]').forEach(btn => {
                btn.addEventListener('click', (e) => UIView.toggleModal(e.currentTarget.dataset.close, false));
            });

            Utils.refreshIcons();
        });