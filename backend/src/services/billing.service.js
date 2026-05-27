import { pool } from '../config/database.js';
import { rowOrNotFound } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';

const CHARGE_COLUMNS =
  'billing_charge.id, billing_charge.service_id AS "serviceId", billing_charge.subject_type AS "subjectType", billing_charge.residence_id AS "residenceId", billing_charge.room_id AS "roomId", billing_charge.responsible_user_id AS "responsibleUserId", billing_charge.period_start AS "periodStart", billing_charge.period_end AS "periodEnd", billing_charge.due_date AS "dueDate", billing_charge.amount::float8 AS amount, billing_charge.status, billing_charge.created_at AS "createdAt", billing_charge.updated_at AS "updatedAt"';

export function billingChargeColumns() {
  return CHARGE_COLUMNS;
}

export function kyivBillingDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

function monthlyPeriod(businessDate, dueDay) {
  const [year, month] = businessDate.split('-').map(Number);
  const monthCode = String(month).padStart(2, '0');
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  return {
    periodStart: `${year}-${monthCode}-01`,
    periodEnd: end,
    dueDate: `${year}-${monthCode}-${String(dueDay).padStart(2, '0')}`,
  };
}

export async function generateCharges({ serviceId, periodStart, periodEnd, dueDate }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const service = rowOrNotFound(
      await client.query(
        `SELECT id, service_code AS "serviceCode", billing_frequency AS "billingFrequency",
                payment_due_day AS "paymentDueDay", price::float8 AS price, active
         FROM service WHERE id = $1 FOR UPDATE`,
        [serviceId],
      ),
      'Service',
    );

    if (!service.active || !['ACCOMMODATION', 'INTERNET'].includes(service.serviceCode)) {
      throw new HttpError(400, 'Charges can be generated for active ACCOMMODATION or INTERNET services.');
    }

    if (service.serviceCode === 'ACCOMMODATION' && service.billingFrequency !== 'semester') {
      throw new HttpError(409, 'The ACCOMMODATION service must use semester billing.');
    }

    if (service.serviceCode === 'INTERNET' && service.billingFrequency !== 'monthly') {
      throw new HttpError(409, 'The INTERNET service must use monthly billing.');
    }

    let result;
    if (service.serviceCode === 'ACCOMMODATION') {
      result = await client.query(
        `INSERT INTO billing_charge
           (service_id, subject_type, residence_id, responsible_user_id,
            period_start, period_end, due_date, amount)
         SELECT $1, 'residence', residence.id, residence.user_id, $2, $3, $4, $5
         FROM residence
         WHERE residence.status = 'active'
         ON CONFLICT DO NOTHING
         RETURNING ${CHARGE_COLUMNS}`,
        [serviceId, periodStart, periodEnd, dueDate, service.price],
      );
    } else {
      result = await client.query(
        `INSERT INTO billing_charge
           (service_id, subject_type, room_id, responsible_user_id,
            period_start, period_end, due_date, amount)
         SELECT $1, 'room', subscription.room_id, MIN(residence.user_id), $2, $3, $4, $5
         FROM room_internet_subscription AS subscription
         JOIN residence
           ON residence.room_id = subscription.room_id AND residence.status = 'active'
         WHERE subscription.service_id = $1 AND subscription.status IN ('active', 'suspended')
         GROUP BY subscription.room_id
         ON CONFLICT DO NOTHING
         RETURNING ${CHARGE_COLUMNS}`,
        [serviceId, periodStart, periodEnd, dueDate, service.price],
      );
    }

    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function runAutomaticBilling(businessDate = kyivBillingDate()) {
  const services = await pool.query(
    `SELECT id, service_code AS "serviceCode", payment_due_day AS "paymentDueDay"
     FROM service
     WHERE active = TRUE AND service_code IN ('ACCOMMODATION', 'INTERNET')
     ORDER BY service_code`,
  );
  const internetCreated = [];
  const accommodationCreated = [];

  for (const service of services.rows.filter((item) => item.serviceCode === 'INTERNET')) {
    const period = monthlyPeriod(businessDate, service.paymentDueDay);
    internetCreated.push(
      ...(await generateCharges({
        serviceId: service.id,
        ...period,
      })),
    );
  }

  const semesterPeriods = await pool.query(
    `SELECT period.service_id AS "serviceId", period.name,
            period.period_start AS "periodStart", period.period_end AS "periodEnd",
            period.due_date AS "dueDate"
     FROM accommodation_billing_period AS period
     JOIN service ON service.id = period.service_id
     WHERE period.active = TRUE
       AND service.active = TRUE
       AND service.service_code = 'ACCOMMODATION'
       AND period.charge_date <= $1
       AND period.period_end >= $1
     ORDER BY period.period_start`,
    [businessDate],
  );

  for (const period of semesterPeriods.rows) {
    accommodationCreated.push(
      ...(await generateCharges({
        serviceId: period.serviceId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        dueDate: period.dueDate,
      })),
    );
  }

  const overdue = await pool.query(
    `UPDATE billing_charge
     SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'pending' AND due_date < $1`,
    [businessDate],
  );

  await pool.query(
    `INSERT INTO billing_job_run
       (job_name, business_date, internet_created_count, accommodation_created_count)
     VALUES ('automatic-billing', $1, $2, $3)
     ON CONFLICT (job_name, business_date) DO UPDATE SET
       internet_created_count =
         billing_job_run.internet_created_count + EXCLUDED.internet_created_count,
       accommodation_created_count =
         billing_job_run.accommodation_created_count + EXCLUDED.accommodation_created_count,
       completed_at = CURRENT_TIMESTAMP`,
    [businessDate, internetCreated.length, accommodationCreated.length],
  );

  return {
    businessDate,
    internetCreatedCount: internetCreated.length,
    accommodationCreatedCount: accommodationCreated.length,
    overdueUpdatedCount: overdue.rowCount,
    createdCount: internetCreated.length + accommodationCreated.length,
  };
}
