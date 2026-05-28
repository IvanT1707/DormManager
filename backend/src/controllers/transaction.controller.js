import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { createNotification } from '../services/notification.service.js';
import { addFilter, rowOrNotFound, updateStatement, whereClause } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import {
  readDateTime,
  readEnum,
  readForeignId,
  readId,
  readMoney,
  requireJsonObject,
} from '../utils/validation.js';

const STATUSES = ['pending', 'succeeded', 'failed', 'refunded'];
const COLUMNS =
  'id, user_id AS "userId", service_id AS "serviceId", charge_id AS "chargeId", amount::float8 AS amount, payment_status AS "paymentStatus", paid_at AS "paidAt", created_at AS "createdAt", updated_at AS "updatedAt"';

async function assertCommandantCanManagePayer(user, userId) {
  if (user.role !== ROLES.COMMANDANT) {
    return;
  }
  const permitted = await pool.query(
    `SELECT 1
     FROM residence
     JOIN room ON room.id = residence.room_id
     JOIN staff_dorm_assignment AS scope
       ON scope.dorm_id = room.dorm_id AND scope.user_id = $1 AND scope.active = TRUE
     WHERE residence.user_id = $2
     LIMIT 1`,
    [user.id, userId],
  );
  if (permitted.rowCount === 0) {
    throw new HttpError(403, 'Payment data is outside your assigned dormitory scope.');
  }
}

export async function listTransactions(request, response) {
  const filters = [];
  const values = [];
  const userId = request.query.userId === undefined ? undefined : readId(request.query.userId, 'userId');
  const paymentStatus =
    request.query.paymentStatus === undefined
      ? undefined
      : readEnum({ paymentStatus: request.query.paymentStatus }, 'paymentStatus', STATUSES);
  addFilter(filters, values, 'user_id', userId);
  addFilter(filters, values, 'payment_status', paymentStatus);
  if (request.user.role === ROLES.STUDENT) {
    addFilter(filters, values, 'user_id', String(request.user.id));
  }
  if (request.user.role === ROLES.COMMANDANT) {
    values.push(request.user.id);
    filters.push(
      `EXISTS (
        SELECT 1 FROM residence
        JOIN room ON room.id = residence.room_id
        JOIN staff_dorm_assignment AS scope
          ON scope.dorm_id = room.dorm_id AND scope.user_id = $${values.length} AND scope.active = TRUE
        WHERE residence.user_id = transactions.user_id
      )`,
    );
  }
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM transactions${whereClause(filters)} ORDER BY created_at DESC`,
    values,
  );
  response.json(result.rows);
}

export async function getTransaction(request, response) {
  const id = readId(request.params.id);
  const isStudent = request.user.role === ROLES.STUDENT;
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM transactions WHERE id = $1${isStudent ? ' AND user_id = $2' : ''}`,
    isStudent ? [id, request.user.id] : [id],
  );
  const transaction = rowOrNotFound(result, 'Transaction');
  await assertCommandantCanManagePayer(request.user, transaction.userId);
  response.json(transaction);
}

export async function createTransaction(request, response) {
  requireJsonObject(request.body);
  const userId = readForeignId(request.body, 'userId', { required: true });
  const serviceId = readForeignId(request.body, 'serviceId', { required: true });
  const amount = readMoney(request.body, 'amount', { required: true });
  const paymentStatus = readEnum(request.body, 'paymentStatus', STATUSES) ?? 'pending';
  const paidAt = readDateTime(request.body, 'paidAt', { nullable: true });
  await assertCommandantCanManagePayer(request.user, userId);
  const result = await pool.query(
    `INSERT INTO transactions
      (user_id, service_id, amount, payment_status, paid_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [userId, serviceId, amount, paymentStatus, paidAt ?? null],
  );
  response.status(201).json(result.rows[0]);
}

export async function createSimulatedPayment(request, response) {
  requireJsonObject(request.body);
  const chargeId = readForeignId(request.body, 'chargeId');
  let serviceId = readForeignId(request.body, 'serviceId', { required: !chargeId });
  let amount;

  if (chargeId) {
    const chargeResult = await pool.query(
      `SELECT charge.service_id AS "serviceId", charge.amount::float8 AS amount
       FROM billing_charge AS charge
       WHERE charge.id = $1
         AND charge.status IN ('pending', 'overdue')
         AND (
           charge.responsible_user_id = $2
           OR EXISTS (
             SELECT 1 FROM residence
             WHERE residence.user_id = $2 AND residence.room_id = charge.room_id
               AND residence.status = 'active'
           )
         )`,
      [chargeId, request.user.id],
    );
    const charge = rowOrNotFound(chargeResult, 'Charge');
    serviceId = charge.serviceId;
    amount = charge.amount;
  } else {
    const service = rowOrNotFound(
      await pool.query('SELECT price::float8 AS price FROM service WHERE id = $1', [serviceId]),
      'Service',
    );
    amount = service.price;
  }
  const result = await pool.query(
    `INSERT INTO transactions (user_id, service_id, charge_id, amount, payment_status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING ${COLUMNS}`,
    [request.user.id, serviceId, chargeId ?? null, amount],
  );

  response.status(201).json(result.rows[0]);
}

export async function completeSimulatedPayment(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const resultStatus = readEnum(request.body, 'result', ['succeeded', 'failed'], {
    required: true,
    label: 'result',
  });
  const client = await pool.connect();
  let activatedInternetRoomId = null;

  try {
    await client.query('BEGIN');
    const pendingResult = await client.query(
      `SELECT ${COLUMNS} FROM transactions
       WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, request.user.id],
    );
    const transaction = rowOrNotFound(pendingResult, 'Transaction');

    if (transaction.paymentStatus !== 'pending') {
      throw new HttpError(409, 'Only a pending simulated payment can be completed.');
    }

    const updated = await client.query(
      `UPDATE transactions
       SET payment_status = $1::payment_status,
           paid_at = CASE WHEN $1::payment_status = 'succeeded' THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING ${COLUMNS}`,
      [resultStatus, id],
    );
    if (resultStatus === 'succeeded' && transaction.chargeId) {
      const charge = rowOrNotFound(
        await client.query(
          `SELECT charge.id, charge.room_id AS "roomId", service.service_code AS "serviceCode"
           FROM billing_charge AS charge
           JOIN service ON service.id = charge.service_id
           WHERE charge.id = $1 FOR UPDATE OF charge`,
          [transaction.chargeId],
        ),
        'Charge',
      );
      await client.query(
        `UPDATE billing_charge SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [transaction.chargeId],
      );
      if (charge.serviceCode === 'INTERNET' && charge.roomId) {
        const activation = await client.query(
          `UPDATE room
           SET internet_status = 'active',
               internet_activated_at = COALESCE(internet_activated_at, CURRENT_DATE),
               internet_suspended_at = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND internet_status IN ('active', 'suspended')
           RETURNING id AS "roomId"`,
          [charge.roomId],
        );
        activatedInternetRoomId = activation.rows[0]?.roomId ?? null;
      }
    }
    await client.query('COMMIT');

    if (activatedInternetRoomId) {
      const residents = await pool.query(
        `SELECT user_id AS "userId" FROM residence
         WHERE room_id = $1 AND status = 'active'`,
        [activatedInternetRoomId],
      );
      await Promise.all(
        residents.rows.map((resident) =>
          createNotification({
            recipientUserId: resident.userId,
            notificationType: 'internet_status',
            title: 'Інтернет активовано',
            message: 'Оплату зараховано. Інтернет-підключення у вашій кімнаті активне.',
            relatedEntityType: 'room',
            relatedEntityId: activatedInternetRoomId,
            deduplicationKey: `charge:${transaction.chargeId}:internet-activated:${resident.userId}`,
          }),
        ),
      );
    }
    response.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTransaction(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const current = rowOrNotFound(
    await pool.query(`SELECT ${COLUMNS} FROM transactions WHERE id = $1`, [id]),
    'Transaction',
  );
  await assertCommandantCanManagePayer(request.user, current.userId);
  const userId = readForeignId(request.body, 'userId');
  if (userId) {
    await assertCommandantCanManagePayer(request.user, userId);
  }
  const query = updateStatement(
    'transactions',
    id,
    {
      userId,
      serviceId: readForeignId(request.body, 'serviceId'),
      amount: readMoney(request.body, 'amount'),
      paymentStatus: readEnum(request.body, 'paymentStatus', STATUSES),
      paidAt: readDateTime(request.body, 'paidAt', { nullable: true }),
    },
    {
      userId: 'user_id',
      serviceId: 'service_id',
      amount: 'amount',
      paymentStatus: 'payment_status',
      paidAt: 'paid_at',
    },
    COLUMNS,
  );
  const result = await pool.query(query);
  response.json(rowOrNotFound(result, 'Transaction'));
}

export async function deleteTransaction(request, response) {
  const id = readId(request.params.id);
  const result = await pool.query(`DELETE FROM transactions WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  rowOrNotFound(result, 'Transaction');
  response.status(204).send();
}
