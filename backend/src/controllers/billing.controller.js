import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { generateCharges, billingChargeColumns, runAutomaticBilling } from '../services/billing.service.js';
import { rowOrNotFound, updateStatement } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import { assertDateRange, readBoolean, readDate, readForeignId, readId, readString, requireJsonObject } from '../utils/validation.js';

const BILLING_PERIOD_COLUMNS =
  'id, service_id AS "serviceId", name, period_start AS "periodStart", period_end AS "periodEnd", charge_date AS "chargeDate", due_date AS "dueDate", active, created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"';
const BILLING_PERIOD_LIST_COLUMNS =
  'period.id, period.service_id AS "serviceId", period.name, period.period_start AS "periodStart", period.period_end AS "periodEnd", period.charge_date AS "chargeDate", period.due_date AS "dueDate", period.active, period.created_by AS "createdBy", period.created_at AS "createdAt", period.updated_at AS "updatedAt"';

export async function listCharges(request, response) {
  const filters = [];
  const values = [];

  if (request.user.role === ROLES.STUDENT) {
    values.push(request.user.id);
    filters.push(
      `(billing_charge.responsible_user_id = $${values.length}
        OR EXISTS (
          SELECT 1 FROM residence
          WHERE residence.user_id = $${values.length}
            AND residence.room_id = billing_charge.room_id
            AND residence.status = 'active'
        ))`,
    );
  }

  if ([ROLES.COMMANDANT, ROLES.MAINTENANCE_STAFF].includes(request.user.role)) {
    values.push(request.user.id);
    filters.push(
      `EXISTS (
        SELECT 1
        FROM staff_dorm_assignment AS scope
        WHERE scope.user_id = $${values.length}
          AND scope.active = TRUE
          AND scope.dorm_id = COALESCE(
            (SELECT room.dorm_id FROM room WHERE room.id = billing_charge.room_id),
            (SELECT room.dorm_id FROM residence JOIN room ON room.id = residence.room_id
             WHERE residence.id = billing_charge.residence_id)
          )
      )`,
    );
  }

  const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT ${billingChargeColumns()}, service.service_type AS "serviceType",
            service.service_code AS "serviceCode"
     FROM billing_charge
     JOIN service ON service.id = billing_charge.service_id
     ${where}
     ORDER BY billing_charge.due_date DESC, billing_charge.id DESC`,
    values,
  );
  response.json(result.rows);
}

export async function createPeriodCharges(request, response) {
  requireJsonObject(request.body);
  const serviceId = readForeignId(request.body, 'serviceId', { required: true });
  const periodStart = readDate(request.body, 'periodStart', { required: true });
  const periodEnd = readDate(request.body, 'periodEnd', { required: true });
  const dueDate = readDate(request.body, 'dueDate', { required: true });
  assertDateRange(periodStart, periodEnd);
  const rows = await generateCharges({ serviceId, periodStart, periodEnd, dueDate });
  response.status(201).json({ createdCount: rows.length, charges: rows });
}

async function assertAccommodationService(serviceId) {
  const service = await pool.query(
    `SELECT id FROM service
     WHERE id = $1 AND service_code = 'ACCOMMODATION'
       AND billing_frequency = 'semester' AND active = TRUE`,
    [serviceId],
  );
  if (service.rowCount === 0) {
    throw new HttpError(400, 'An active semester ACCOMMODATION tariff is required.');
  }
}

export async function listBillingPeriods(_request, response) {
  const result = await pool.query(
    `SELECT ${BILLING_PERIOD_LIST_COLUMNS}, service.service_type AS "serviceType"
     FROM accommodation_billing_period AS period
     JOIN service ON service.id = period.service_id
     ORDER BY period.period_start DESC, period.id DESC`,
  );
  response.json(result.rows);
}

export async function createBillingPeriod(request, response) {
  requireJsonObject(request.body);
  const serviceId = readForeignId(request.body, 'serviceId', { required: true });
  const name = readString(request.body, 'name', { required: true, maxLength: 120 });
  const periodStart = readDate(request.body, 'periodStart', { required: true });
  const periodEnd = readDate(request.body, 'periodEnd', { required: true });
  const chargeDate = readDate(request.body, 'chargeDate', { required: true });
  const dueDate = readDate(request.body, 'dueDate', { required: true });
  assertDateRange(periodStart, periodEnd);
  await assertAccommodationService(serviceId);
  const result = await pool.query(
    `INSERT INTO accommodation_billing_period
       (service_id, name, period_start, period_end, charge_date, due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${BILLING_PERIOD_COLUMNS}`,
    [serviceId, name, periodStart, periodEnd, chargeDate, dueDate, request.user.id],
  );
  response.status(201).json(result.rows[0]);
}

export async function updateBillingPeriod(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const serviceId = readForeignId(request.body, 'serviceId');
  if (serviceId) {
    await assertAccommodationService(serviceId);
  }
  const current = rowOrNotFound(
    await pool.query(`SELECT ${BILLING_PERIOD_COLUMNS} FROM accommodation_billing_period WHERE id = $1`, [id]),
    'Billing period',
  );
  const periodStart = readDate(request.body, 'periodStart');
  const periodEnd = readDate(request.body, 'periodEnd');
  assertDateRange(periodStart ?? current.periodStart, periodEnd ?? current.periodEnd);
  const query = updateStatement(
    'accommodation_billing_period',
    id,
    {
      serviceId,
      name: readString(request.body, 'name', { maxLength: 120 }),
      periodStart,
      periodEnd,
      chargeDate: readDate(request.body, 'chargeDate'),
      dueDate: readDate(request.body, 'dueDate'),
      active: readBoolean(request.body, 'active'),
    },
    {
      serviceId: 'service_id',
      name: 'name',
      periodStart: 'period_start',
      periodEnd: 'period_end',
      chargeDate: 'charge_date',
      dueDate: 'due_date',
      active: 'active',
    },
    BILLING_PERIOD_COLUMNS,
  );
  const result = await pool.query(query);
  response.json(rowOrNotFound(result, 'Billing period'));
}

export async function runScheduledBilling(_request, response) {
  const result = await runAutomaticBilling();
  response.json(result);
}
