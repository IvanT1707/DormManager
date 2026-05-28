import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { addAssignedDormFilter, assertCanManageResidence } from '../services/dorm-scope.service.js';
import { createNotification } from '../services/notification.service.js';
import { rowOrNotFound, whereClause } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import {
  hasField,
  readBoolean,
  readDate,
  readEnum,
  readForeignId,
  readId,
  readString,
  requireJsonObject,
} from '../utils/validation.js';

const TYPES = ['formal_warning', 'violation'];
const STATUSES = ['active', 'resolved', 'revoked'];
const COLUMNS =
  'record.id, record.residence_id AS "residenceId", residence.user_id AS "userId", residence.room_id AS "roomId", room.dorm_id AS "dormId", record.issued_by AS "issuedBy", record.record_type AS "recordType", record.status, record.incident_date AS "incidentDate", record.violation_rule_id AS "violationRuleId", rule.code AS "ruleCode", rule.title AS "ruleTitle", record.rule_reference AS "ruleReference", record.penalty_points AS "penaltyPoints", record.description, record.resolution_note AS "resolutionNote", record.resolved_by AS "resolvedBy", record.resolved_at AS "resolvedAt", record.created_at AS "createdAt", record.updated_at AS "updatedAt", COALESCE((SELECT SUM(active_record.penalty_points)::integer FROM disciplinary_record AS active_record JOIN residence AS active_residence ON active_residence.id = active_record.residence_id WHERE active_residence.user_id = residence.user_id AND active_record.status = \'active\'), 0) AS "studentActivePoints"';
const RULE_COLUMNS =
  'rule.id, rule.code, rule.title, rule.record_type AS "recordType", rule.rule_reference AS "ruleReference", rule.default_points AS "defaultPoints", rule.active, rule.created_at AS "createdAt", rule.updated_at AS "updatedAt"';
const DISCIPLINARY_POLICY = Object.freeze({
  id: 1,
  title: 'Чинна політика дисциплінарного обліку',
  noRenewalThreshold: 25,
  evictionThreshold: 35,
  maxActivePoints: 35,
  active: true,
});

function readPoints(body, key, { required = false } = {}) {
  if (!hasField(body, key)) {
    if (required) {
      throw new HttpError(400, `${key} is required.`);
    }
    return undefined;
  }

  const points = Number(body[key]);
  if (!Number.isInteger(points) || points < 0 || points > 35) {
    throw new HttpError(400, `${key} must be an integer between 0 and 35.`);
  }
  return points;
}

function assertRulePoints(recordType, points) {
  if (recordType === 'formal_warning' && points !== 0) {
    throw new HttpError(400, 'A formal warning must have 0 penalty points.');
  }
  if (recordType === 'violation' && points < 1) {
    throw new HttpError(400, 'A violation must have at least 1 penalty point.');
  }
}

async function getActivePolicy() {
  return DISCIPLINARY_POLICY;
}

async function getActivePointTotal(userId, client = pool) {
  const result = await client.query(
    `SELECT COALESCE(SUM(record.penalty_points)::integer, 0) AS "activePoints"
     FROM disciplinary_record AS record
     JOIN residence ON residence.id = record.residence_id
     WHERE residence.user_id = $1 AND record.status = 'active'`,
    [userId],
  );
  return Number(result.rows[0].activePoints);
}

export async function listViolationRules(request, response) {
  const result = await pool.query(
    `SELECT ${RULE_COLUMNS}
     FROM violation_rule AS rule
     ${request.user.role === ROLES.ADMINISTRATOR ? '' : 'WHERE rule.active = TRUE'}
     ORDER BY rule.active DESC, rule.record_type, rule.default_points, rule.title`,
  );
  response.json(result.rows);
}

export async function createViolationRule(request, response) {
  requireJsonObject(request.body);
  const code = readString(request.body, 'code', { required: true, maxLength: 40 }).toUpperCase();
  if (!/^[A-Z0-9_]+$/.test(code)) {
    throw new HttpError(400, 'code may contain only uppercase Latin letters, digits and underscores.');
  }
  const title = readString(request.body, 'title', { required: true, maxLength: 160 });
  const recordType = readEnum(request.body, 'recordType', TYPES, { required: true });
  const ruleReference = readString(request.body, 'ruleReference', { required: true, maxLength: 255 });
  const defaultPoints = readPoints(request.body, 'defaultPoints', { required: true });
  assertRulePoints(recordType, defaultPoints);

  const result = await pool.query(
    `INSERT INTO violation_rule (code, title, record_type, rule_reference, default_points)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [code, title, recordType, ruleReference, defaultPoints],
  );
  const created = rowOrNotFound(
    await pool.query(`SELECT ${RULE_COLUMNS} FROM violation_rule AS rule WHERE rule.id = $1`, [
      result.rows[0].id,
    ]),
    'Violation rule',
  );
  response.status(201).json(created);
}

export async function updateViolationRule(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const current = rowOrNotFound(
    await pool.query(`SELECT ${RULE_COLUMNS} FROM violation_rule AS rule WHERE rule.id = $1`, [id]),
    'Violation rule',
  );
  const title = readString(request.body, 'title', { maxLength: 160 }) ?? current.title;
  const recordType = readEnum(request.body, 'recordType', TYPES) ?? current.recordType;
  const ruleReference =
    readString(request.body, 'ruleReference', { maxLength: 255 }) ?? current.ruleReference;
  const defaultPoints = readPoints(request.body, 'defaultPoints') ?? Number(current.defaultPoints);
  const active = readBoolean(request.body, 'active') ?? current.active;
  assertRulePoints(recordType, defaultPoints);

  await pool.query(
    `UPDATE violation_rule
     SET title = $1, record_type = $2, rule_reference = $3, default_points = $4,
         active = $5, updated_at = CURRENT_TIMESTAMP
     WHERE id = $6`,
    [title, recordType, ruleReference, defaultPoints, active, id],
  );
  const updated = rowOrNotFound(
    await pool.query(`SELECT ${RULE_COLUMNS} FROM violation_rule AS rule WHERE rule.id = $1`, [id]),
    'Violation rule',
  );
  response.json(updated);
}

export async function getDisciplinaryPolicy(_request, response) {
  response.json(await getActivePolicy());
}

export async function updateDisciplinaryPolicy(_request, response) {
  response.json(await getActivePolicy());
}

export async function listDisciplinaryRecords(request, response) {
  const filters = [];
  const values = [];
  if (request.user.role === ROLES.STUDENT) {
    values.push(request.user.id);
    filters.push(`residence.user_id = $${values.length}`);
  }
  addAssignedDormFilter(filters, values, request.user, 'room.dorm_id');
  const result = await pool.query(
    `SELECT ${COLUMNS}
     FROM disciplinary_record AS record
     JOIN residence ON residence.id = record.residence_id
     JOIN room ON room.id = residence.room_id
     JOIN violation_rule AS rule ON rule.id = record.violation_rule_id
     ${whereClause(filters)}
     ORDER BY record.incident_date DESC, record.id DESC`,
    values,
  );
  response.json(result.rows);
}

export async function createDisciplinaryRecord(request, response) {
  requireJsonObject(request.body);
  const residenceId = readForeignId(request.body, 'residenceId', { required: true });
  const violationRuleId = readForeignId(request.body, 'violationRuleId', { required: true });
  const incidentDate = readDate(request.body, 'incidentDate', { required: true });
  const description = readString(request.body, 'description', { required: true });
  const requestedRecordType = readEnum(request.body, 'recordType', TYPES);
  const client = await pool.connect();
  let created;
  let residence;

  try {
    await client.query('BEGIN');
    await assertCanManageResidence(request.user, residenceId, client);
    residence = rowOrNotFound(
      await client.query(
        'SELECT user_id AS "userId", status FROM residence WHERE id = $1 FOR UPDATE',
        [residenceId],
      ),
      'Residence',
    );
    if (residence.status !== 'active') {
      throw new HttpError(409, 'A disciplinary record can be issued only for an active residence.');
    }
    const rule = rowOrNotFound(
      await client.query(
        `SELECT ${RULE_COLUMNS} FROM violation_rule AS rule WHERE rule.id = $1 AND rule.active = TRUE`,
        [violationRuleId],
      ),
      'Active violation rule',
    );
    if (requestedRecordType && requestedRecordType !== rule.recordType) {
      throw new HttpError(400, 'recordType must correspond to the selected violation rule.');
    }
    const policy = await getActivePolicy(client);
    const activePoints = await getActivePointTotal(residence.userId, client);
    if (activePoints + Number(rule.defaultPoints) > Number(policy.maxActivePoints)) {
      throw new HttpError(
        409,
        `The active disciplinary total cannot exceed ${policy.maxActivePoints} points.`,
      );
    }
    const result = await client.query(
      `INSERT INTO disciplinary_record
         (residence_id, issued_by, record_type, incident_date, violation_rule_id,
          rule_reference, penalty_points, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        residenceId,
        request.user.id,
        rule.recordType,
        incidentDate,
        rule.id,
        rule.ruleReference,
        rule.defaultPoints,
        description,
      ],
    );
    created = rowOrNotFound(
      await client.query(
        `SELECT ${COLUMNS}
         FROM disciplinary_record AS record
         JOIN residence ON residence.id = record.residence_id
         JOIN room ON room.id = residence.room_id
         JOIN violation_rule AS rule ON rule.id = record.violation_rule_id
         WHERE record.id = $1`,
        [result.rows[0].id],
      ),
      'Disciplinary record',
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await createNotification({
    recipientUserId: residence.userId,
    notificationType: 'disciplinary_record',
    priority: created.recordType === 'violation' ? 'warning' : 'info',
    title: created.recordType === 'violation' ? 'Зафіксовано порушення' : 'Офіційне попередження',
    message: `${created.ruleTitle}: ${created.description}`,
    relatedEntityType: 'disciplinary_record',
    relatedEntityId: created.id,
    deduplicationKey: `disciplinary:${created.id}:issued:${residence.userId}`,
  });
  response.status(201).json(created);
}

export async function updateDisciplinaryRecord(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const current = rowOrNotFound(
    await pool.query(
      `SELECT ${COLUMNS}
       FROM disciplinary_record AS record
       JOIN residence ON residence.id = record.residence_id
       JOIN room ON room.id = residence.room_id
       JOIN violation_rule AS rule ON rule.id = record.violation_rule_id
       WHERE record.id = $1`,
      [id],
    ),
    'Disciplinary record',
  );
  await assertCanManageResidence(request.user, current.residenceId);
  const status = readEnum(request.body, 'status', STATUSES, { required: true });
  if (status === 'revoked' && request.user.role !== ROLES.ADMINISTRATOR) {
    throw new HttpError(403, 'Only an administrator may revoke a disciplinary record.');
  }
  const resolutionNote = readString(request.body, 'resolutionNote', {
    nullable: true,
    allowEmpty: true,
  });
  const result = await pool.query(
    `UPDATE disciplinary_record
     SET status = $1, resolution_note = $2, resolved_by = $3,
         resolved_at = CASE WHEN $1 = 'active' THEN NULL ELSE CURRENT_TIMESTAMP END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 RETURNING id`,
    [status, resolutionNote ?? null, status === 'active' ? null : request.user.id, id],
  );
  const updated = await pool.query(
    `SELECT ${COLUMNS}
     FROM disciplinary_record AS record
     JOIN residence ON residence.id = record.residence_id
     JOIN room ON room.id = residence.room_id
     JOIN violation_rule AS rule ON rule.id = record.violation_rule_id
     WHERE record.id = $1`,
    [result.rows[0].id],
  );
  response.json(updated.rows[0]);
}
