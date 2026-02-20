async function diagnostic() {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    process.on('uncaughtException', (err) => {
        console.error('Uncaught Exception:', err);
    });

    try {
        console.log('--- START DIAGNOSTIC ---');
        console.log('Attempting to import BullMQAutomationService...');
        const service = await import('./src/services/bullmq-automation.service');
        console.log('Import appeared to work, checking default export...');
        if (service.default) {
            console.log('Default export present.');
        } else {
            console.log('Default export MISSING.');
        }
        console.log('--- DIAGNOSTIC SUCCESS ---');
    } catch (error) {
        console.error('--- DIAGNOSTIC FAILURE ---');
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        console.error('Stack Trace:', error.stack);
        process.exit(1);
    }
}

diagnostic();
