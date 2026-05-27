import { pool } from '../config/database.js';
import { createNotification, publishNotification } from './notification.service.js';

export function kyivBusinessDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

export async function generatePaymentReminders(businessDate = kyivBusinessDate()) {
  const client = await pool.connect();
  const notifications = [];

  try {
    await client.query('BEGIN');
    const run = await client.query(
      `INSERT INTO notification_job_run (job_name, business_date)
       VALUES ('payment-reminders', $1)
       ON CONFLICT (job_name, business_date) DO UPDATE
       SET completed_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [businessDate],
    );

    const charges = await client.query(
      `SELECT charge.id, charge.subject_type AS "subjectType",
              charge.residence_id AS "residenceId", charge.room_id AS "roomId",
              charge.responsible_user_id AS "responsibleUserId",
              charge.amount::float8 AS amount, charge.due_date AS "dueDate",
              service.service_code AS "serviceCode"
       FROM billing_charge AS charge
       JOIN service ON service.id = charge.service_id
       WHERE charge.status IN ('pending', 'overdue') AND charge.due_date <= $1`,
      [businessDate],
    );

    for (const charge of charges.rows) {
      let recipients = [];
      if (charge.serviceCode === 'INTERNET' && charge.roomId) {
        const residents = await client.query(
          `SELECT user_id AS "userId"
           FROM residence WHERE room_id = $1 AND status = 'active'`,
          [charge.roomId],
        );
        recipients = residents.rows.map((resident) => resident.userId);
      } else if (charge.responsibleUserId) {
        recipients = [charge.responsibleUserId];
      }

      for (const recipientUserId of recipients) {
        const isInternet = charge.serviceCode === 'INTERNET';
        const notification = await createNotification(
          {
            recipientUserId,
            notificationType: 'payment_reminder',
            priority: 'warning',
            title: isInternet ? 'Оплата інтернету' : 'Оплата проживання',
            message: `До сплати ${charge.amount.toFixed(2)} грн. Термін оплати: ${charge.dueDate}.`,
            relatedEntityType: 'billing_charge',
            relatedEntityId: charge.id,
            payload: { chargeId: charge.id, serviceCode: charge.serviceCode },
            deduplicationKey: `charge:${charge.id}:${isInternet ? 'internet' : 'housing'}-reminder:${recipientUserId}`,
          },
          { client, publish: false },
        );
        if (notification) {
          notifications.push(notification);
        }
      }
    }

    await client.query(
      `UPDATE notification_job_run SET generated_count = generated_count + $1 WHERE id = $2`,
      [notifications.length, run.rows[0].id],
    );
    await client.query('COMMIT');

    for (const notification of notifications) {
      publishNotification(notification);
    }

    return { businessDate, generatedCount: notifications.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
