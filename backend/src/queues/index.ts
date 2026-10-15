import boss from '../config/boss';

// Define your queue names as constants to avoid typos
export const QUEUES = {
    EMAIL_SEND: 'email-send',
    ORDER_PROCESS: 'order-process',
};

export async function setupWorkers() {
    // Optional: Explicitly create queues (pg-boss auto-creates them on send, but this sets rules)
    await boss.createQueue(QUEUES.EMAIL_SEND);
    await boss.createQueue(QUEUES.ORDER_PROCESS);

    // Worker for sending emails asynchronously
    await boss.work(QUEUES.EMAIL_SEND, async ([job]) => {
        console.log(`Processing email job [ID: ${job.id}]`, job.data);
        
        const { to, subject, template } = job.data as { to: string; subject: string; template: string };
        
        // TODO: Plug in your actual email provider service (e.g., Nodemailer, SendGrid)
        console.log(`[Email Service] Sending "${subject}" to ${to} using template: ${template}`);
    });

    // Worker for processing orders asynchronously
    await boss.work(QUEUES.ORDER_PROCESS, async ([job]) => {
        console.log(`Processing order job [ID: ${job.id}]`, job.data);
        
        const { orderId, userId } = job.data as { orderId: string; userId: string };
        
        // TODO: Add order processing logic (inventory update, payment settlement, etc.)
        console.log(`[Order Service] Successfully processed order ${orderId} for user ${userId}`);
    });

    console.log('👷 All background workers are registered and listening.');
}
