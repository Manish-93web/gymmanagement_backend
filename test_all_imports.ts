async function testImports() {
    const modules = [
        'express',
        'http',
        'cors',
        'helmet',
        'hpp',
        'express-rate-limit',
        'morgan',
        './src/config/config',
        './src/config/database',
        './src/config/redis',
        './src/services/websocket.service',
        './src/routes/auth.routes',
        './src/routes/tenant.routes',
        './src/routes/member.routes',
        './src/routes/community.routes',
        './src/routes/gamification.routes'
    ];

    for (const mod of modules) {
        try {
            console.log(`Importing ${mod}...`);
            await import(mod);
            console.log(`✅ ${mod} imported.`);
        } catch (error) {
            console.error(`❌ FAILED to import ${mod}:`, error);
            process.exit(1);
        }
    }
    console.log('All imports tested successfully!');
}

testImports();
