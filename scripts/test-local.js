const http = require('http');

const TEST_ADDRESS = '8ZELLTBuxeTS3so35QxMGugqvKN9nrGCq4DTdPSWcSQX';

const mockPayload = JSON.stringify([
    {
        signature: "TEST_SIG_" + Math.random().toString(36).slice(2, 10),
        type: "TRANSFER",
        source: "PHANTOM",
        feePayer: TEST_ADDRESS,
        nativeTransfers: [
            {
                amount: 500000000,
                fromUser: TEST_ADDRESS,
                toUser: "ReceiverAddress1111111111111111111111111"
            }
        ],
        tokenTransfers: [],
        timestamp: Math.floor(Date.now() / 1000)
    }
]);

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/webhook/helius',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(mockPayload)
    }
};

console.log('🧪 Sending mock webhook payload to http://localhost:3000/api/webhook/helius...');

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log(`📡 Server Status: ${res.statusCode}`);
        console.log(`📡 Server Response: ${data}`);
        console.log('✅ Check your terminal logs and Telegram.');
    });
});

req.on('error', (e) => {
    console.error(`❌ Connection failed: ${e.message}`);
});

req.write(mockPayload);
req.end();
