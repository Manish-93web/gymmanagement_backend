import cluster from 'cluster';
import os from 'os';

const WORKERS = parseInt(process.env.CLUSTER_WORKERS || '0', 10) || os.cpus().length;

if (cluster.isPrimary) {
    console.log(`🧠 Primary ${process.pid} — spawning ${WORKERS} workers`);

    for (let i = 0; i < WORKERS; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.warn(`⚠️  Worker ${worker.process.pid} exited (code=${code}, signal=${signal}) — restarting`);
        cluster.fork();
    });

    cluster.on('online', (worker) => {
        console.log(`✅ Worker ${worker.process.pid} online`);
    });
} else {
    // Worker process — run the express server
    require('./server');
}
