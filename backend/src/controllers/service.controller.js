import { pool } from '../config/database.js';
import { rowOrNotFound, updateStatement } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import { readBoolean, readEnum, readId, readMoney, readPositiveInteger, readString, requireJsonObject } from '../utils/validation.js';

const COLUMNS =
  'id, service_type AS "serviceType", service_code AS "serviceCode", billing_frequency AS "billingFrequency", payment_due_day AS "paymentDueDay", active, price::float8 AS price, created_at AS "createdAt", updated_at AS "updatedAt"';
const BILLING_FREQUENCIES = ['once', 'monthly', 'semester'];

function assertAutomaticBillingFrequency(serviceCode, billingFrequency) {
  if (serviceCode === 'INTERNET' && billingFrequency !== 'monthly') {
    throw new HttpError(400, 'The INTERNET tariff must use monthly billing.');
  }
  if (serviceCode === 'ACCOMMODATION' && billingFrequency !== 'semester') {
    throw new HttpError(400, 'The ACCOMMODATION tariff must use semester billing.');
  }
}

export async function listServices(_request, response) {
  const result = await pool.query(`SELECT ${COLUMNS} FROM service ORDER BY service_type`);
  response.json(result.rows);
}

export async function getService(request, response) {
  const id = readId(request.params.id);
  const result = await pool.query(`SELECT ${COLUMNS} FROM service WHERE id = $1`, [id]);
  response.json(rowOrNotFound(result, 'Service'));
}

export async function createService(request, response) {
  requireJsonObject(request.body);
  const serviceType = readString(request.body, 'serviceType', {
    required: true,
    maxLength: 100,
  });
  const price = readMoney(request.body, 'price', { required: true });
  const serviceCode = readString(request.body, 'serviceCode', { nullable: true, maxLength: 40 });
  const billingFrequency =
    readEnum(request.body, 'billingFrequency', BILLING_FREQUENCIES) ?? 'once';
  assertAutomaticBillingFrequency(serviceCode, billingFrequency);
  const paymentDueDay = readPositiveInteger(request.body, 'paymentDueDay') ?? 10;
  if (paymentDueDay > 28) {
    throw new HttpError(400, 'paymentDueDay must be between 1 and 28.');
  }
  const result = await pool.query(
    `INSERT INTO service (service_type, service_code, billing_frequency, payment_due_day, price)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [serviceType, serviceCode ?? null, billingFrequency, paymentDueDay, price],
  );
  response.status(201).json(result.rows[0]);
}

export async function updateService(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const current = rowOrNotFound(
    await pool.query(`SELECT ${COLUMNS} FROM service WHERE id = $1`, [id]),
    'Service',
  );
  const serviceCode = readString(request.body, 'serviceCode', { nullable: true, maxLength: 40 });
  const billingFrequency = readEnum(request.body, 'billingFrequency', BILLING_FREQUENCIES);
  assertAutomaticBillingFrequency(
    serviceCode === undefined ? current.serviceCode : serviceCode,
    billingFrequency ?? current.billingFrequency,
  );
  const paymentDueDay = readPositiveInteger(request.body, 'paymentDueDay');
  if (paymentDueDay !== undefined && paymentDueDay > 28) {
    throw new HttpError(400, 'paymentDueDay must be between 1 and 28.');
  }
  const query = updateStatement(
    'service',
    id,
    {
      serviceType: readString(request.body, 'serviceType', { maxLength: 100 }),
      serviceCode,
      billingFrequency,
      active: readBoolean(request.body, 'active'),
      paymentDueDay,
      price: readMoney(request.body, 'price'),
    },
    {
      serviceType: 'service_type',
      serviceCode: 'service_code',
      billingFrequency: 'billing_frequency',
      active: 'active',
      paymentDueDay: 'payment_due_day',
      price: 'price',
    },
    COLUMNS,
  );
  const result = await pool.query(query);
  response.json(rowOrNotFound(result, 'Service'));
}

export async function deleteService(request, response) {
  const id = readId(request.params.id);
  const result = await pool.query(`DELETE FROM service WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  rowOrNotFound(result, 'Service');
  response.status(204).send();
}
