const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;
const WEBHOOKS_FILE = path.join(__dirname, process.env.WEBHOOKS_FILE || 'webhooks.json');
const CALLBACK = process.env.CALLBACK_URL || 'https://webhook.site/default';
const HOST = process.env.HOST || 'http://localhost';

// ฟังก์ชันสำหรับอ่านข้อมูล webhooks จากไฟล์
async function readWebhooks() {
    try {
      const data = await fs.readFile(WEBHOOKS_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      // ตรวจสอบว่า webhooks เป็นออบเจ็กต์ ถ้าไม่ใช่ให้สร้างใหม่
      if (!parsedData.webhooks || typeof parsedData.webhooks !== 'object') {
        parsedData.webhooks = {};
      }
      return parsedData;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // ถ้าไฟล์ไม่มีอยู่ ให้สร้างไฟล์ใหม่พร้อมข้อมูลเริ่มต้น
        const initialData = { webhooks: {}, lastUpdated: new Date().toISOString() };
        await fs.writeFile(WEBHOOKS_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
      }
      throw error;
    }
  }
  
  // ฟังก์ชันสำหรับเพิ่ม webhook ใหม่
  async function addWebhook(req, res) {
    const { page_id } = req.body;
  
    if (!page_id) {
      return res.status(400).json({ status: 'error', message: 'page_id required' });
    }
  
    const data = await readWebhooks();
    // ตรวจสอบอีกครั้งให้แน่ใจว่า webhooks เป็นออบเจ็กต์
    if (!data.webhooks || typeof data.webhooks !== 'object') {
      data.webhooks = {};
    }
    data.webhooks[page_id] = { createdAt: new Date().toISOString() };
    await writeWebhooks(data.webhooks);
  
    res.status(201).json({ status: 'success', message: 'Webhook added', url: `${HOST}/${page_id}/webhook/` });
  }

// ฟังก์ชันสำหรับเขียนข้อมูล webhooks ลงไฟล์
async function writeWebhooks(webhooks) {
  const data = {
    webhooks,
    lastUpdated: new Date().toISOString()
  };
  await fs.writeFile(WEBHOOKS_FILE, JSON.stringify(data, null, 2));
}

// ฟังก์ชันสำหรับส่งข้อมูลแบบ POST ไปยัง CALLBACK
async function sendCallback(data, url) {
  try {
    const response = await axios.post(url, data);
    return response.data;
  } catch (error) {
    console.error('Error sending callback:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    } else if (error.request) {
      console.error('No response received');
    } else {
      console.error('Error setting up request:', error.message);
    }
    throw error;
  }
}

// ฟังก์ชันสำหรับรับ webhook
async function handleWebhook(req, res) {
  const { page_id } = req.params;
  const data = req.body;
  const { webhooks } = await readWebhooks();
  const newDataRes = { 
    status: 'success',
    page_id: page_id,
    destination: data.destination
  };

  if (webhooks[page_id]) {
    console.log(`Webhook received for ${page_id}:`, data);
    try {
      await sendCallback(newDataRes, CALLBACK);
      res.status(200).json(newDataRes);
    } catch (error) {
      res.status(500).json({ 
        status: 'error',
        message: 'Failed to send callback',
        error: error.message
      });
    }
  } else {
    await sendCallback(newDataRes, CALLBACK);
    res.status(200).json('send msg to default url');
  }
}

// ฟังก์ชันสำหรับลบ webhook
async function removeWebhook(req, res) {
  const { page_id } = req.params;
  const data = await readWebhooks();

  if (page_id === 'all') {
    data.webhooks = {};
    await writeWebhooks(data.webhooks);
    return res.status(200).json({ status: 'success', message: 'All webhooks removed' });
  }

  if (!data.webhooks[page_id]) {
    return res.status(400).json({ status: 'error', message: 'Invalid page_id' });
  }

  delete data.webhooks[page_id];
  await writeWebhooks(data.webhooks);

  res.status(200).json({ status: 'success', message: 'Webhook removed' });
}

// ฟังก์ชันสำหรับแสดงข้อมูล webhooks ทั้งหมด
async function listWebhooks(req, res) {
  const data = await readWebhooks();
  res.status(200).json(data);
}

// กำหนด routes และเรียกใช้ฟังก์ชัน
app.post('/:page_id/webhook', handleWebhook);
app.post('/add_webhook', addWebhook);
app.delete('/remove_webhook/:page_id', removeWebhook);
app.get('/list_webhooks', listWebhooks);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
