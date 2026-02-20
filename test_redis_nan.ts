import IORedis from 'ioredis';

try {
    console.log('Testing IORedis with NaN port...');
    const connection = new IORedis({
        host: 'localhost',
        port: parseInt(undefined as any),
        maxRetriesPerRequest: null,
    });
    console.log('IORedis instance created (surprisingly)');
    process.exit(0);
} catch (err) {
    console.error('Caught error during IORedis instantiation:', err);
    process.exit(1);
}
