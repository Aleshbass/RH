require('dotenv').config({ path: '.env.local' });
const { Redis } = require('@upstash/redis');

async function testConnection() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.error('Missing environment variables');
        return;
    }

    console.log('Using Redis URL:', url);

    const redis = new Redis({
        url: url,
        token: token,
    });

    const key = 'manual_test_key_' + Date.now();
    const value = 'working_' + Date.now();

    try {
        console.log(`Attempting to set key: ${key}`);
        await redis.set(key, value);
        console.log('Set command successful.');

        console.log(`Attempting to get key: ${key}`);
        const result = await redis.get(key);
        console.log('Get result:', result);

        if (result === value) {
            console.log('SUCCESS: Read/Write verified.');
        } else {
            console.error('FAILURE: Value mismatch.');
        }
    } catch (error) {
        console.error('ERROR during Redis operation:', error);
    }
}

testConnection();
