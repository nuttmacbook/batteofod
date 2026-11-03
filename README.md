# Dungeon RPG OD

หน้าแรกเป็นเกม idle dungeon crawler (ระบบแบบ Dungeon Crawler RPG OD) — ซ่อนแอพแชทไว้ใน **⚙️ Settings → Login Guild**

- Frontend: HTML/CSS/JS ล้วน (ไม่ต้อง build) อยู่ใน `public/`
- Backend: Vercel Serverless Function `api/guild.js` (endpoint เดียว)
- Database: Upstash Redis

## Deploy (ประมาณ 5 นาที)

1. **อัปโค้ดขึ้น GitHub** (ทั้งโฟลเดอร์นี้) แล้วไปที่ vercel.com → *Add New → Project* → เลือก repo → Framework Preset: **Other** → Deploy
2. **สร้าง Redis**: ในโปรเจกต์ Vercel ไปที่ *Storage → Create Database → Upstash for Redis* → Connect กับโปรเจกต์นี้
   (Vercel จะใส่ `KV_REST_API_URL` / `KV_REST_API_TOKEN` ให้อัตโนมัติ — หรือถ้าสร้างเองที่ upstash.com ให้ใส่ `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` เองก็ได้ โค้ดรองรับทั้งสองแบบ)
3. **ตั้งรหัส root**: *Settings → Environment Variables* เพิ่ม
   `ROOT_KEY` = รหัสลับยาวอย่างน้อย 8 ตัว (เช่น `my-very-secret-root-2026`)
4. กด **Redeploy** ให้ env มีผล

## สมัคร root (แอดมิน) — ทำครั้งแรกครั้งเดียว

เปิดเว็บ → ตั้งชื่อฮีโร่เข้าเกม → ⚙️ → **Login Guild** → แท็บ *สมัครสมาชิก* → ใส่ username / password และช่อง **รหัสเชิญ ใส่ค่า `ROOT_KEY`**
→ จะได้บัญชี User ID = `root` สิทธิ์แอดมิน (ใช้ ROOT_KEY ได้แค่ครั้งเดียว หลังจากนั้นใช้สมัครไม่ได้อีก)

## การใช้งาน

| ฟีเจอร์ | วิธี |
|---|---|
| ชวนคนใหม่ | 🎟️ รหัสเชิญ → สร้างรหัส (8 ตัว, ใช้ได้ครั้งเดียว, อายุ 7 วัน, คนทั่วไปถือได้พร้อมกัน 5 รหัส, root ไม่จำกัด) |
| สมัคร | ต้องมีรหัสเชิญจากสมาชิกเท่านั้น → ได้ User ID ตัวเลข (100001, 100002, …) |
| เพิ่มเพื่อน | ➕ → ค้นหาด้วย User ID → ส่งคำขอ → อีกฝ่ายกดตอบรับใน 📨 |
| แชท | คุยแบบ 1:1 กับเพื่อน ส่งทิ้งไว้ได้แม้อีกฝ่ายออฟไลน์/ปิดเว็บ — ข้อความเก็บถาวรบน Upstash (3,000 ข้อความล่าสุดต่อห้อง) เปิดเครื่องไหนก็เห็นครบ |
| ยังไม่อ่าน / อ่านแล้ว | ตัวเลขข้อความค้างต่อเพื่อน (เก็บที่เซิร์ฟเวอร์ ตรงกันทุกเครื่อง), แจ้ง "มีข้อความใหม่ N ข้อความ ระหว่างที่คุณไม่อยู่" ตอนเข้า, ใต้ข้อความล่าสุดของเราแสดง ส่งแล้ว / อ่านแล้ว |
| ข้อความเก่า | ปุ่ม "โหลดข้อความก่อนหน้า" ด้านบนห้องแชท (ทีละ 60) |
| แอดมิน | 🛡️ ดูสมาชิกทั้งหมด ใครเชิญใคร และระงับ/ปลดระงับบัญชี (ระงับแล้วเด้งออกทันที) |
| กลับเกม | ปุ่ม ⚔️ มุมซ้ายบน หรือกด `Shift + Esc` — หน้าแชทจะถูกล้างออกจากจอทันที |

## หมายเหตุ

- **ข้อความเด้งทันที (realtime)**: ส่งข้อความ → `PUBLISH` เข้า Upstash Pub/Sub → `api/stream.js` (Server-Sent Events) ส่งต่อให้เบราว์เซอร์ของเพื่อนทันที คำขอเป็นเพื่อน/ตอบรับ/ลบเพื่อน/โดนระงับ ก็เด้งทันทีเหมือนกัน
  - stream เปิดเฉพาะตอนอยู่หน้า Guild (กลับไปเกม = ตัดการเชื่อมต่อ) ต่ออายุเองทุก ~4.5 นาที และต่อใหม่อัตโนมัติถ้าหลุด
  - จุดเขียวข้างชื่อ = เชื่อมต่อ realtime อยู่ · ถ้าหลุดจะ sync ทุก 3 วิแทนจนกว่าจะต่อได้ และมี sync สำรองทุก 30 วิ
  - `vercel.json` ตั้ง `maxDuration: 300` ให้ `api/stream.js` (ใช้ได้บน Hobby ที่เปิด Fluid compute ซึ่งเป็นค่าเริ่มต้นของโปรเจกต์ใหม่)
- รหัสผ่านเก็บแบบ scrypt + salt, session token อายุ 30 วัน, มี rate-limit ตอน login/สมัคร/ส่งข้อความ
- เซฟเกมเก็บใน localStorage ของเบราว์เซอร์ (Export/Import ได้ใน Settings) ไม่เกี่ยวกับบัญชีแชท
- ทดสอบในเครื่อง: `npm i -g vercel && vercel dev` (ต้องมี env ข้างบนในไฟล์ `.env.local`)

## โครงสร้าง

```
api/_lib.js       helper: redis client, hash, rate-limit
api/guild.js      POST /api/guild { action, ... } ทุกฟังก์ชันของแชท
api/stream.js     POST /api/stream  realtime (Upstash Pub/Sub → SSE)
public/index.html
public/css/style.css
public/js/game.js   เกม: ชั้น/ห้อง, อีเวนต์ (มอนสเตอร์, หีบ, รูปปั้นพร, โทเท็มคำสาป, กองไฟ), บอส, ต่อสู้อัตโนมัติ,
                    อุปกรณ์ 6 ช่อง 6 ระดับความหายาก, เลือกโบนัสตอนเลเวลอัป (reroll 2 ครั้ง), ตายแล้วเริ่มใหม่แต่ของยังอยู่
public/js/guild.js  แอพแชท
public/js/ui.js     modal / toast
```
# batteofod
