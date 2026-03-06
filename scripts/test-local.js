const http = require('http');

const MONITOR_ADDRESS = '8ZELLTBuxeTS3so35QxMGugqvKN9nrGCq4DTdPSWcSQX';
const MAXXING_MINT = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs'; // example
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Simulate: wallet used 1 USDC to buy MAXXING tokens on Jupiter
const mockPayload = JSON.stringify([
    {
        signature: "USDC_MAXXING_" + Math.random().toString(36).slice(2, 8),
        type: "SWAP",
        source: "JUPITER",
        feePayer: MONITOR_ADDRESS,
        nativeTransfers: [
            { amount: 5000000, fromUser: MONITOR_ADDRESS, toUser: "11111111111111111111111111111111" } // tiny fee
        ],
        tokenTransfers: [
            {
                fromUserAccount: MONITOR_ADDRESS,
                fromUser: MONITOR_ADDRESS,
                toUserAccount: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
                toUser: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
                tokenAmount: 1.0,
                mint: USDC_MINT,
                tokenStandard: "Fungible"
            },
            {
                fromUserAccount: "SomePoolAddress111111111111111111111111111",
                fromUser: "SomePoolAddress111111111111111111111111111",
                toUserAccount: MONITOR_ADDRESS,
                toUser: MONITOR_ADDRESS,
                tokenAmount: 420690,
                mint: MAXXING_MINT,
                tokenStandard: "Fungible"
            }
        ],
        accountData: [
            { account: MONITOR_ADDRESS },
            { account: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" }
        ],
        description: `${MONITOR_ADDRESS} swapped 1 USDC for 420,690 MAXXING`,
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

console.log('🧪 Sending MOCK USDC→MAXXING swap...');

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log(`📡 Status: ${res.statusCode}`);
        console.log(`📡 Response: ${data}`);
    });
});

req.on('error', (e) => {
    console.error(`❌ Connection failed: ${e.message}`);
});

req.write(mockPayload);
req.end();
