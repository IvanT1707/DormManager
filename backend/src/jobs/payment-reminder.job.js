import { runAutomaticBilling } from '../services/billing.service.js';
import { generatePaymentReminders } from '../services/reminder.service.js';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function startPaymentReminderJob() {
  async function run() {
    try {
      const billing = await runAutomaticBilling();
      const reminders = await generatePaymentReminders(billing.businessDate);
      if (billing.createdCount > 0 || reminders.generatedCount > 0) {
        console.log(
          `Automatic billing created ${billing.createdCount} charges and generated ${reminders.generatedCount} reminders.`,
        );
      }
    } catch (error) {
      console.error('Automatic billing job failed:', error.message);
    }
  }

  void run();
  const timer = setInterval(run, DAY_IN_MILLISECONDS);
  timer.unref();
  return timer;
}
