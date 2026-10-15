import boss, { QUEUES } from '../queues';

/**
 * Queue a welcome or notification email
 */
export async function dispatchEmail(to: string, subject: string, template: string) {
    const jobId = await boss.send(QUEUES.EMAIL_SEND, { to, subject, template }, {
        retryLimit: 3,         // Try 3 times if it fails
        retryDelay: 60,        // Wait 60 seconds between retries
        expireInMinutes: 15    // Job timeout window
    });

    console.log(`📧 Queued email job ID: ${jobId}`);
    return jobId;
}

/**
 * Queue an order for background processing
 */
export async function dispatchOrderProcessing(orderId: string, userId: string) {
    const jobId = await boss.send(QUEUES.ORDER_PROCESS, { orderId, userId }, {
        retryLimit: 5,
        retryDelay: 30,
    });

    console.log(`📦 Queued order processing job ID: ${jobId}`);
    return jobId;
}
