const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const subdomain = process.argv[2];
const port = parseInt(process.argv[3]);

// Webhook endpoint
app.post('/webhook', (req, res) => {
    const { destination } = req.body;

    if (destination === subdomain) {
        // ประมวลผลตามต้องการ
        res.status(200).json({ status: 'success', message: 'Webhook received and processed', destination });
    } else {
        res.status(400).json({ status: 'error', message: 'Unknown destination' });
    }
});

app.listen(port, () => {
    console.log(`Temporary server for subdomain ${subdomain} is running on port ${port}`);
});
