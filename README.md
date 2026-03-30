ระบบช่วยการประชุมออนไลน์ v2.1 (Security & Feature Update)

เว็บแอปจองห้องประชุมแบบเต็มรูปแบบ — GitHub Pages (Frontend) + Google Apps Script (Backend API) + Google Sheets / Calendar (Database / Schedule)

🚀 ฟีเจอร์ใหม่ที่อัปเดตใน v2.1

🔒 Secure Admin Backend: ย้ายรหัสผ่านแอดมินไปฝั่งเซิร์ฟเวอร์ (GAS) ทำให้การแฮคขโมยรหัสผ่านจากหน้าเว็บเป็นไปไม่ได้

🚧 LockService Integration: ป้องกันปัญหาคนจองห้องพร้อมกัน (Race Condition) ระบบจะล็อกคิวรันทีละคน ช่วยให้การเช็คคิวซ้ำซ้อนแม่นยำ 100%

📊 Admin Dashboard Charts: มีกราฟสถิติสรุปภาพรวม (Chart.js) แสดงสัดส่วนสถานะ และสถิติความนิยมของห้องในหน้า Admin Panel

📅 Google Calendar Auto-Sync: เมื่อแอดมินกด "อนุมัติ" ระบบจะเพิ่มกำหนดการลงใน Google Calendar ของแอดมินโดยอัตโนมัติ

โครงสร้างไฟล์ใหม่ (อัปเดตเป็น Single-page structure)

meeting-room-system/
├── index.html      ← (ใหม่) รวมหน้าเว็บหลัก + สไตล์(CSS) + สคริปต์(JS) ในไฟล์เดียว (โหลดเร็วขึ้น)
├── Code.gs         ← Google Apps Script (Backend)
└── README.md


🛠️ ขั้นตอนการอัปเดต (Deploy)

1. นำโค้ดขึ้น Google Apps Script

เปิดโปรเจค Google Apps Script เดิมของคุณ

คัดลอกโค้ดจากไฟล์ Code.gs อันใหม่ไปทับของเดิม

ข้อควรระวัง: - อย่าลืมใส่ SHEET_ID ของคุณในบรรทัดที่ 8

คุณสามารถเปลี่ยนรหัสผ่านแอดมินในบรรทัดที่ 12, 13

CALENDAR_ID แนะนำให้ใช้คำว่า 'primary' (จะบันทึกลงปฏิทินหลักของบัญชี Gmail นั้น)

2. อนุมัติสิทธิ์ (Permission) สำหรับ Google Calendar

เนื่องจากมีการใช้ Calendar API เพิ่มเข้ามา คุณจะต้องทำการขอสิทธิ์ใหม่:

กดปุ่ม Run (เรียกใช้) ฟังก์ชันอะไรก็ได้สัก 1 ครั้งใน Apps Script (เช่น ฟังก์ชัน doGet)

ระบบจะขึ้นแจ้งเตือนให้ Review Permissions (ตรวจสอบสิทธิ์)

ให้ล็อกอินบัญชี Gmail > เลือก Advanced (ขั้นสูง) > ไปที่โปรเจค (ไม่ปลอดภัย)

กด Allow (อนุญาต) เพื่อให้โปรเจคสามารถแก้ไข Calendar ของคุณได้

3. Deploy เป็น Web App ใหม่ (บังคับ)

มุมขวาบน กด Deploy > Manage deployments (จัดการการทำให้ใช้งานได้)

กดสัญลักษณ์ ✏️ เพื่อแก้ไข

ตรง Version ให้เลือกเป็น New version (เวอร์ชันใหม่)

กด Deploy

คัดลอก Web App URL อันใหม่มาไว้

4. อัปเดตฝั่ง Frontend

นำ Web App URL ที่ได้จากข้อ 3 ไปวางในไฟล์ index.html บรรทัดที่ 465 ตรงตัวแปร const API_URL = '...'

อัปโหลดไฟล์ index.html ขึ้น GitHub แทนที่ชุดไฟล์เดิมของคุณ (index.html, style.css, script.js เดิม ลบออกได้เลยเพราะถูกรวมกันไว้แล้ว)

การใช้งานหน้า Admin

เปิดหน้าเว็บไปที่มุมขวาบนสุด กดปุ่มฟันเฟือง ⚙️

กรอก Username: admin และ Password: 112233 (หรือตามที่คุณแก้ใน Code.gs)

คุณจะเห็น Dashboard ที่มีกราฟสถิติใหม่ และสามารถอนุมัติได้เลย