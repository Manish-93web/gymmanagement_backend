import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function test() {
    console.log('Test start');
    try {
        const connection = new IORedis({
            host: 'localhost',
            port: 6379,
            maxRetriesPerRequest: null,
        });
        console.log('Connection created');

        const q = new Queue('test-queue', { connection });
        console.log('Queue created');

        await q.add('test-job', { foo: 'bar' });
        console.log('Job added');

        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

test();
