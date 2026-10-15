import { startBoss } from './config/boss';
import { setupWorkers } from './queues';

async function bootstrap() {
    try {
        // 1. Start pg-boss engine and register workers
        await startBoss();
        await setupWorkers();

        // 2. Start your web server framework (Express, Fastify, etc.)
        // const PORT = process.env.PORT || 3000;
        // app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

        console.log('✨ Aluxplaza backend is fully up with background queues!');
    } catch (error) {
        console.error('❌ Error during application startup:', error);
        process.exit(1);
    }
}

bootstrap();
