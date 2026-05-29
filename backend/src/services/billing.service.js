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

function fallbackSemesterPeriod(businessDate) {
  const [year, month] = businessDate.split('-').map(Number);

  if (month >= 9) {
    return {
      periodStart: `${year}-09-01`,
      periodEnd: `${year + 1}-01-31`,
      dueDate: businessDate,
    };
  }

  if (month >= 7) {
    return {
      periodStart: `${year}-07-01`,
      periodEnd: `${year}-08-31`,
      dueDate: businessDate,
    };
  }

  if (month >= 2) {
    return {
      periodStart: `${year}-02-01`,
      periodEnd: `${year}-06-30`,
      dueDate: businessDate,
    };
  }

  return {
    periodStart: `${year - 1}-09-01`,
    periodEnd: `${year}-01-31`,
    dueDate: businessDate,
  };
}

async function currentAccommodationPeriod(client, serviceId, businessDate) {
  const result = await client.query(
    `SELECT period_start AS "periodStart", period_end AS "periodEnd", due_date AS "dueDate"
     FROM accommodation_billing_period
     WHERE service_id = $1
       AND active = TRUE
       AND charge_date <= $2
       AND period_end >= $2
     ORDER BY period_start DESC
     LIMIT 1`,
    [serviceId, businessDate],
  );

  return result.rows[0] ?? fallbackSemesterPeriod(businessDate);
}

export async function createSettlementCharges(
  client,
  { residenceId, roomId, userId, businessDate = kyivBillingDate() },
) {
  const services = await client.query(
    `SELECT id, service_code AS "serviceCode", payment_due_day AS "paymentDueDay",
            price::float8 AS price
     FROM service
     WHERE active = TRUE AND service_code IN ('ACCOMMODATION', 'INTERNET')`,
  );
  const created = {
    accommodationCharge: null,
    internetCharge: null,
  };

  const accommodationService = services.rows.find(
    (service) => service.serviceCode === 'ACCOMMODATION',
  );
  if (accommodationService) {
    const period = await currentAccommodationPeriod(client, accommodationService.id, businessDate);
    const result = await client.query(
      `INSERT INTO billing_charge
         (service_id, subject_type, residence_id, responsible_user_id,
          period_start, period_end, due_date, amount)
       VALUES ($1, 'residence', $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING
       RETURNING ${CHARGE_COLUMNS}`,
      [
        accommodationService.id,
        residenceId,
        userId,
        period.periodStart,
        period.periodEnd,
        period.dueDate,
        accommodationService.price,
      ],
    );
    created.accommodationCharge = result.rows[0] ?? null;
  }

  const internetService = services.rows.find((service) => service.serviceCode === 'INTERNET');
  if (internetService) {
    const period = monthlyPeriod(businessDate, internetService.paymentDueDay ?? 10);
    await client.query(
      `UPDATE room
       SET internet_service_id = $2,
           internet_status = CASE
             WHEN internet_status = 'suspended' THEN internet_status
             ELSE 'active'::room_service_status
           END,
           internet_activated_at = CASE
             WHEN internet_status IN ('active', 'suspended') THEN internet_activated_at
             ELSE NULL
           END,
           internet_suspended_at = CASE
             WHEN internet_status = 'suspended' THEN internet_suspended_at
             ELSE NULL
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [roomId, internetService.id],
    );
    const result = await client.query(
      `INSERT INTO billing_charge
         (service_id, subject_type, room_id, responsible_user_id,
          period_start, period_end, due_date, amount)
       VALUES ($1, 'room', $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING
       RETURNING ${CHARGE_COLUMNS}`,
      [
        internetService.id,
        roomId,
        userId,
        period.periodStart,
        period.periodEnd,
        period.dueDate,
        internetService.price,
      ],
    );
    created.internetCharge = result.rows[0] ?? null;
  }

  return created;
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
         SELECT $1, 'room', room.id, MIN(residence.user_id), $2, $3, $4, $5
         FROM room
         JOIN residence
           ON residence.room_id = room.id AND residence.status = 'active'
         WHERE room.internet_service_id = $1 AND room.internet_status IN ('active', 'suspended')
         GROUP BY room.id
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
    `INSERT INTO job_run (job_name, business_date, payload)
     VALUES (
       'automatic-billing',
       $1,
       jsonb_build_object(
         'internetCreatedCount', $2::integer,
         'accommodationCreatedCount', $3::integer
       )
     )
     ON CONFLICT (job_name, business_date) DO UPDATE SET
       payload = jsonb_build_object(
         'internetCreatedCount',
         COALESCE((job_run.payload->>'internetCreatedCount')::integer, 0) + $2::integer,
         'accommodationCreatedCount',
         COALESCE((job_run.payload->>'accommodationCreatedCount')::integer, 0) + $3::integer
       ),
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
