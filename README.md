# change_server_ainbox
โปรเจคนี้เป็นโปรเจค ที่สร้างขึ้นมาเพื่อแก้ไขปัญหาเรื่อง Webhook ของ Line

## คู่มือการใช้งาน

โปรแกรมนี้ถูกสร้างขึ้นเพื่อจัดการ webhooks สำหรับรับข้อมูลจากแหล่งอื่นและส่งข้อมูลไปยัง callback URL ที่กำหนด โดยมีความสามารถดังนี้:

1. **เพิ่ม Webhook** สามารถเพิ่ม webhook ใหม่โดยระบุ page_id และ callback_url
2. **Webhook Line จะโพสต์ distination กลับมา** เมื่อมีการส่งข้อมูลมายัง webhook ที่ตั้งค่าไว้ โปรแกรมจะส่งข้อมูลไปยัง callback_url ที่กำหนดไว้
3. **ลบ Webhook** สามารถลบ webhook ที่ไม่ต้องการใช้งานแล้วออกจากระบบได้
4. **แสดงรายการ Webhooks** แสดงรายการ webhooks ทั้งหมดที่มีอยู่ในระบบ
5. **ดูไฟล์ Log** สามารถดูไฟล์ log ของโปรแกรมได้ผ่าน endpoint `/logs/:logFileName`
*หมายเหตุ กรณี  Line ส่ง dis กลับมายัง Endpoint ที่ลบไปแล้วจะทำการส่งไปยัง  callback_url ล่าสุดที่ใช้งานได้

โปรแกรมนี้ใช้งานร่วมกับ Express.js, Node.js, และมีการเขียนไฟล์ log โดยใช้ Winston รวมถึงการตรวจสอบข้อมูลนำเข้าด้วย Joi

## ตัวอย่างการใช้งาน

### 1. เพิ่ม Webhook

**URL:** `/add_webhook`
**Method:** `POST`
**Headers:**
```
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```
**Body:**
```json
{
    "page_id": "page123",
    "callback_url": "https://example.com/callback"
}
```

ตัวอย่างการเรียกใช้งานด้วย cURL:

```
curl -X POST \
     -H "Authorization: Bearer <ACCESS_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"page_id":"page123","callback_url":"https://example.com/callback"}' \
     http://localhost:5000/add_webhook
```

หากสำเร็จ จะได้รับผลลัพธ์แบบนี้:

```json
{
    "status": "success",
    "message": "Webhook added",
    "url": "http://localhost:5000/page123/webhook/"
}
```

### 2. Webhook ที่Line จะโพสต์ distination กลับมา

**URL:** `/:page_id/webhook`
**Method:** `POST`
**Headers:** ไม่จำเป็นต้องมี
**Body:**
```json
{
    "destination": "some_destination"
}
```

ตัวอย่างการเรียกใช้งานด้วย cURL:

```
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"destination":"some_destination"}' \
     http://localhost:5000/page123/webhook
```

หากสำเร็จ จะได้รับผลลัพธ์แบบนี้:

```json
{
    "status": "success",
    "page_id": "page123",
    "destination": "some_destination"
}
```

### 3. ลบ Webhook

**URL:** `/remove_webhook/:page_id`
**Method:** `DELETE`
**Headers:**
```
Authorization: Bearer <ACCESS_TOKEN>
```

ตัวอย่างการเรียกใช้งานด้วย cURL:

```
curl -X DELETE \
     -H "Authorization: Bearer <ACCESS_TOKEN>" \
     http://localhost:5000/remove_webhook/page123
```

หากสำเร็จ จะได้รับผลลัพธ์แบบนี้:

```json
{
    "status": "success",
    "message": "Webhook removed"
}
```

หากต้องการลบ webhooks ทั้งหมด ให้ใช้ `page_id` เป็น `all` แทน เช่น:

```
curl -X DELETE \
     -H "Authorization: Bearer <ACCESS_TOKEN>" \
     http://localhost:5000/remove_webhook/all
```

### 4. แสดงรายการ Webhooks

**URL:** `/list_webhooks`
**Method:** `GET`
**Headers:**
```
Authorization: Bearer <ACCESS_TOKEN>
```

ตัวอย่างการเรียกใช้งานด้วย cURL:

```
curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
     http://localhost:5000/list_webhooks
```

หากสำเร็จ จะได้รับผลลัพธ์แบบนี้:

```json
{
    "webhooks": {
        "page123": {
            "createdAt": "2023-06-17T12:34:56.789Z",
            "status": true,
            "callbackUrl": "https://example.com/callback"
        },
        "page456": {
            "createdAt": "2023-06-18T09:10:11.012Z",
            "status": false,
            "callbackUrl": "https://another.com/callback"
        }
    },
    "lastUpdated": "2023-06-18T12:34:56.789Z"
}
```

โดยที่
`status: false` หมายถึง endpoint ถูกสร้างแล้ว แต่ยังไม่ได้รับการยืนยันทาง Line.
`status: true` หมายถึง endpoint ได้รับการยืนยันทาง Line แล้ว.

### 5. ดูไฟล์ Log

**URL:** `/logs/:logFileName`
**Method:** `GET`
**Headers:** ไม่จำเป็นต้องมี

ตัวอย่างการเรียกใช้งานด้วย cURL:

```
curl http://localhost:5000/logs/error.log
```

จะแสดงเนื้อหาของไฟล์ `error.log` ออกมา

## API Space

โปรแกรมนี้มี API space ดังนี้:

- `POST /add_webhook`: เพิ่ม webhook ใหม่
- `POST /:page_id/webhook`: Webhook ที่Line จะโพสต์ distination กลับมา และส่งข้อมูลไปยัง callback URL
- `DELETE /remove_webhook/:page_id`: ลบ webhook
- `GET /list_webhooks`: แสดงรายการ webhooks ทั้งหมด
- `GET /logs/:logFileName`: แสดงเนื้อหาของไฟล์ log

## หมายเหตุ
โปรแกรมนี้มีการตั้งค่าให้ทำการลบไฟล์ error.log และ combined.log ทุกๆ วันที่ 30 ของทุกเดือนโดยใช้ Node Cron

นอกจากนี้ยังมีการใช้งาน middleware สำหรับตรวจสอบ token (`authenticateToken`) สำหรับ API ที่ต้องการความปลอดภัย ยกเว้น `POST /:page_id/webhook` และ `GET /logs/:logFileName`
