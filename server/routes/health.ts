import express, { Request, Response } from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Health check endpoint with memory monitoring
router.get('/', async (req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
    };

    const uptime = Math.round(process.uptime());
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    // Check if memory usage is critical
    const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    const isMemoryCritical = heapUsedPercent > 80;

    const health = {
        status: isMemoryCritical ? 'warning' : 'healthy',
        timestamp: new Date().toISOString(),
        uptime: `${uptime}s`,
        memory: {
            ...memoryUsageMB,
            heapUsedPercent: Math.round(heapUsedPercent),
            warning: isMemoryCritical ? 'Memory usage above 80%' : null
        },
        database: {
            mongodb: mongoStatus
        },
        version: process.version
    };

    // Log warning if memory is critical
    if (isMemoryCritical) {
        console.warn('[Health Check] ⚠️  Memory usage critical:', memoryUsageMB);
    }

    res.status(200).json(health);
});

// Detailed metrics endpoint
router.get('/metrics', async (req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const metrics = {
        timestamp: new Date().toISOString(),
        process: {
            pid: process.pid,
            uptime: process.uptime(),
            version: process.version,
            platform: process.platform,
            arch: process.arch
        },
        memory: {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external,
            arrayBuffers: memoryUsage.arrayBuffers
        },
        cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system
        },
        database: {
            mongodb: {
                status: mongoose.connection.readyState,
                host: mongoose.connection.host,
                name: mongoose.connection.name
            }
        }
    };

    res.status(200).json(metrics);
});

export default router;





