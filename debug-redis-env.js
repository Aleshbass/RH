require('dotenv').config({ path: '.env.local' });

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

console.log('UPSTASH_REDIS_REST_URL:', url ? url.substring(0, 20) + '...' : 'UNDEFINED');
console.log('UPSTASH_REDIS_REST_TOKEN:', token ? token.substring(0, 10) + '...' : 'UNDEFINED');

if (url && url.includes('upstash.io')) {
    console.log('URL domain seems correct (upstash.io)');
} else {
    console.log('URL domain might be incorrect');
}
