const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const Joi = require('joi');
const winston = require('winston');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(express.json());

// Middleware สำหรับให้ Express สามารถใช้งานไฟล์ static ในโฟลเดอร์ logs
app.use('/logs', express.static(path.join(__dirname, 'logs')));

const PORT = process.env.PORT || 5000;
const WEBHOOKS_FILE = path.join(__dirname, process.env.WEBHOOKS_FILE || 'webhooks.json');
const HOST = process.env.HOST || 'http://localhost';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const LOGS_DIRECTORY = path.join(__dirname, 'logs');
let LastCallBackUrl = '';

// กำหนด Logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error', format: winston.format.json() }),
        new winston.transports.File({ filename: 'combined.log', format: winston.format.json() }),
    ],
});

// กำหนด Schema สำหรับการตรวจสอบข้อมูล
const webhookSchema = Joi.object({
    page_id: Joi.string().required(),
    callback_url: Joi.string().uri().required(),
});

// Middleware สำหรับตรวจสอบ Token
function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];

    if (token && token.startsWith('Bearer ')) {
        const authToken = token.split(' ')[1];
        if (authToken === ACCESS_TOKEN) {
            next(); // ผ่าน middleware ไปยังต่อไป
        } else {
            logger.error({ timestamp: new Date().toISOString(), message: 'Forbidden: Invalid token' });
            return res.status(403).json({ status: 'error', message: 'Forbidden: Invalid token' });
        }
    } else {
        logger.error({ timestamp: new Date().toISOString(), message: 'Unauthorized: Token missing or invalid' });
        return res.status(401).json({ status: 'error', message: 'Unauthorized: Token missing or invalid' });
    }
}

// ฟังก์ชันสำหรับอ่านข้อมูล webhooks จากไฟล์
async function readWebhooks() {
    try {
        const data = await fs.readFile(WEBHOOKS_FILE, 'utf8');
        const parsedData = JSON.parse(data);
        if (!parsedData.webhooks || typeof parsedData.webhooks !== 'object') {
            parsedData.webhooks = {};
        }
        return parsedData;
    } catch (error) {
        if (error.code === 'ENOENT') {
            const initialData = { webhooks: {}, lastUpdated: new Date().toISOString() };
            await fs.writeFile(WEBHOOKS_FILE, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        logger.error({ timestamp: new Date().toISOString(), message: 'Error reading webhooks file', error: error.message });
        throw error;
    }
}

// ฟังก์ชันสำหรับเขียนข้อมูล webhooks ลงไฟล์
async function writeWebhooks(webhooks) {
    const data = {
        webhooks,
        lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(WEBHOOKS_FILE, JSON.stringify(data, null, 2));
}

// ฟังก์ชันสำหรับเพิ่ม webhook ใหม่
async function addWebhook(req, res) {
    const { error } = webhookSchema.validate(req.body);
    if (error) {
        logger.error({ timestamp: new Date().toISOString(), message: 'Validation error', details: error.details[0].message });
        return res.status(400).json({ status: 'error', message: error.details[0].message });
    }

    const { page_id, callback_url } = req.body;
    LastCallBackUrl = callback_url;
    try {
        const data = await readWebhooks();
        if (!data.webhooks || typeof data.webhooks !== 'object') {
            data.webhooks = {};
        }
        data.webhooks[page_id] = {
            createdAt: new Date().toISOString(),
            status: false,
            callbackUrl: callback_url
        };
        await writeWebhooks(data.webhooks);

        logger.info({ timestamp: new Date().toISOString(), message: 'Webhook added', page_id, callback_url });
        res.status(201).json({ status: 'success', message: 'Webhook added', url: `${HOST}/${page_id}/webhook/` });
    } catch (error) {
        logger.error({ timestamp: new Date().toISOString(), message: 'Failed to add webhook', error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to add webhook', error: error.message });
    }
}

// ฟังก์ชันสำหรับส่งข้อมูลแบบ POST ไปยัง CALLBACK
async function sendCallback(data, url) {
    try {
        const response = await axios.post(url, data);
        return response.data;
    } catch (error) {
        logger.error({ timestamp: new Date().toISOString(), message: 'Error sending callback', error: error.message });
        if (error.response) {
            logger.error({ timestamp: new Date().toISOString(), message: 'Response data', responseData: error.response.data });
            logger.error({ timestamp: new Date().toISOString(), message: 'Response status', responseStatus: error.response.status });
        } else if (error.request) {
            logger.error({ timestamp: new Date().toISOString(), message: 'No response received' });
        } else {
            logger.error({ timestamp: new Date().toISOString(), message: 'Error setting up request', error: error.message });
        }
        throw error;
    }
}

// ฟังก์ชันสำหรับรับ webhook
async function handleWebhook(req, res) {
  const { page_id } = req.params;
  const data = req.body;
  try {
      const { webhooks } = await readWebhooks();
      const newDataRes = {
          status: 'success',
          page_id: page_id,
          destination: data.destination
      };

      if (webhooks[page_id]) {
          logger.info({ timestamp: new Date().toISOString(), message: `Webhook received for ${page_id}`, data });
          await sendCallback(newDataRes, webhooks[page_id].callbackUrl);
          webhooks[page_id].status = true;
          await writeWebhooks(webhooks);
          res.status(200).json(newDataRes);
      } else {
          logger.warn({ timestamp: new Date().toISOString(), message: `Webhook for ${page_id} not found. Posting to default URL.` });

          // ใช้งาน CallBackUrl ตัวล่าสุด
          const defaultCallbackUrl = LastCallBackUrl;

          await sendCallback(newDataRes, defaultCallbackUrl); // โพสข้อมูลไปยัง default URL
          res.status(404).json({ status: 'error', message: 'Webhook not found. Posted to default URL.' });
      }
  } catch (error) {
      logger.error({ timestamp: new Date().toISOString(), message: 'Failed to handle webhook', error: error.message });
      res.status(500).json({ status: 'error', message: 'Failed to handle webhook', error: error.message });
  }
}


// ฟังก์ชันสำหรับลบ webhook
async function removeWebhook(req, res) {
    const { page_id } = req.params;

    try {
        const data = await readWebhooks();
        if (page_id === 'all') {
            data.webhooks = {};
            await writeWebhooks(data.webhooks);
            logger.info({ timestamp: new Date().toISOString(), message: 'All webhooks removed' });
            return res.status(200).json({ status: 'success', message: 'All webhooks removed' });
        }

        if (!data.webhooks[page_id]) {
            logger.warn({ timestamp: new Date().toISOString(), message: `Invalid page_id ${page_id} for removal.` });
            return res.status(400).json({ status: 'error', message: 'Invalid page_id' });
        }

        delete data.webhooks[page_id];
        await writeWebhooks(data.webhooks);

        logger.info({ timestamp: new Date().toISOString(), message: 'Webhook removed', page_id });
        res.status(200).json({ status: 'success', message })
        logger.info({ timestamp: new Date().toISOString(), message: 'Webhook removed', page_id });
        res.status(200).json({ status: 'success', message: 'Webhook removed' });
    } catch (error) {
        logger.error({ timestamp: new Date().toISOString(), message: 'Failed to remove webhook', error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to remove webhook', error: error.message });
    }
}

// ฟังก์ชันสำหรับแสดงข้อมูล webhooks ทั้งหมด
async function listWebhooks(req, res) {
    try {
        const data = await readWebhooks();
        res.status(200).json(data);
    } catch (error) {
        logger.error({ timestamp: new Date().toISOString(), message: 'Failed to list webhooks', error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to list webhooks', error: error.message });
    }
}

// Endpoint เพื่อ GET logs
// ใช้งาน http://localhost:5000/logs/error.log เพื่อดู error.log หรือ http://localhost:5000/logs/combined.log เพื่อดู combined.log.
app.get('/logs/:logFileName', (req, res) => {
    const logFileName = req.params.logFileName;
    const filePath = path.join(__dirname, 'logs', logFileName);
    res.sendFile(filePath);
});

// สร้าง cronjob เพื่อลบไฟล์ log ทุกๆ วันที่ 30 เวลา 00:00
cron.schedule('0 0 30 * *', async () => {
  try {
      const files = ['error.log', 'combined.log']; // รายชื่อไฟล์ log ที่ต้องการลบ
      for (const file of files) {
          const filePath = path.join(LOGS_DIRECTORY, file);
          await fs.unlink(filePath);
          logger.info(`Deleted file: ${file}`);
      }
  } catch (error) {
      logger.error('Error deleting log files:', error);
  }
});

// กำหนด routes และเรียกใช้ฟังก์ชัน
app.post('/:page_id/webhook', handleWebhook);
app.post('/add_webhook', authenticateToken, addWebhook);
app.delete('/remove_webhook/:page_id', authenticateToken, removeWebhook);
app.get('/list_webhooks', authenticateToken, listWebhooks);

app.listen(PORT, () => {
    logger.info({ timestamp: new Date().toISOString(), message: `Server running on port ${PORT}` });
});

