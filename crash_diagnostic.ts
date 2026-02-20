console.log("🚀 Starting crash diagnostic...");
process.on('uncaughtException', (err) => {
    console.error("💥 UNCAUGHT EXCEPTION:");
    console.error(err);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error("💥 UNHANDLED REJECTION at:", promise, "reason:", reason);
    process.exit(1);
});

try {
    console.log("📦 Loading server module...");
    require('./src/server.ts');
    console.log("✅ Server module loaded.");
} catch (error) {
    console.error("❌ CAUGHT ERROR DURING LOAD:");
    console.error(error);
    process.exit(1);
}
