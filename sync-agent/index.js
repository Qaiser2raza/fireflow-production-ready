require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

console.log('Sync Agent starting...');

const prisma = new PrismaClient();

// Example connection to Redis
const connection = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null
});

connection.on('connect', () => {
    console.log('Connected to Redis');
});

connection.on('error', (err) => {
    console.error('Redis connection error:', err);
});

// Create a queue example
const myQueue = new Queue('sync-queue', { connection });

async function main() {
    console.log('Agent is running');
    // Keep the process alive
    setInterval(() => {
        // Heartbeat
    }, 10000);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
