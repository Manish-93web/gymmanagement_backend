try {
    console.log('Attempting to import BullMQAutomationService...');
    const service = require('./src/services/bullmq-automation.service').default;
    console.log('Import successful!');
    process.exit(0);
} catch (error) {
    console.error('Import failed during test:', error);
    process.exit(1);
}
