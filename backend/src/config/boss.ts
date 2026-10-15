import { PgBoss } from 'pg-boss';

// Initialize pg-boss with your database environment variables or standard config
const boss = new PgBoss(process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'aluxplaza',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

boss.on('error', (error) => console.error('pg-boss connection error:', error));

export async function startBoss() {
    await boss.start();
    console.log('✅ pg-boss background worker started successfully');
    return boss;
}

export default boss;
