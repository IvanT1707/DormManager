import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { addAssignedDormFilter, assertCanManageDorm } from '../services/dorm-scope.service.js';
import { createNotification } from '../services/notification.service.js';
import { addFilter, rowOrNotFound, updateStatement, whereClause } from '../utils/controller-helpers.js';
import { HttpError } from '../utils/http-error.js';
import {
  hasField,
  readBoolean,
  readEnum,
  readForeignId,
  readId,
  readString,
  requireJsonObject,
} from '../utils/validation.js';

const TYPES = ['settlement', 'renewal', 'repair', 'eviction', 'relocation'];
const STATUSES = ['pending', 'in_review', 'waiting_materials', 'approved', 'rejected', 'completed', 'cancelled'];
const REPAIR_CATEGORIES = ['general', 'electrical', 'plumbing'];
const COMMENT_VISIBILITIES = ['public', 'staff'];
const COLUMNS =
  'id, user_id AS "userId", room_id AS "roomId", assigned_room_id AS "assignedRoomId", managed_dorm_id AS "managedDormId", application_type AS "applicationType", repair_category AS "repairCategory", status, description, resolution_note AS "resolutionNote", disciplinary_basis AS "disciplinaryBasis", eligibility_verified AS "eligibilityVerified", documents_verified AS "documentsVerified", payment_verified AS "paymentVerified", medical_clearance_verified AS "medicalClearanceVerified", safety_briefing_completed AS "safetyBriefingCompleted", pass_issued AS "passIssued", housing_conditions_confirmed AS "housingConditionsConfirmed", processed_by AS "processedBy", processed_at AS "processedAt", created_at AS "createdAt", updated_at AS "updatedAt"';
const HOUSING_TYPES = ['settlement', 'renewal', 'eviction', 'relocation'];
const COMMENT_COLUMNS =
  'comment.id, comment.application_id AS "applicationId", comment.author_id AS "authorId", comment.message, comment.visibility, comment.created_at AS "createdAt", author.full_name AS "authorName", author.role AS "authorRole"';

function readDisciplinaryRecordIds(body) {
  if (!hasField(body, 'disciplinaryRecordIds')) {
    return undefined;
  }
  if (!Array.isArray(body.disciplinaryRecordIds)) {
    throw new HttpError(400, 'disciplinaryRecordIds must be an array.');
  }
  return [...new Set(body.disciplinaryRecordIds.map((id) => readId(id, 'disciplinaryRecordId')))];
}

async function activeResidenceForUser(client, userId) {
  const result = await client.query(
    `SELECT residence.id, residence.room_id AS "roomId", room.dorm_id AS "dormId"
     FROM residence
     JOIN room ON room.id = residence.room_id
     WHERE user_id = $1 AND status = 'active'
     FOR UPDATE`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function assertApplicationScope(user, application, client = pool) {
  if ([ROLES.COMMANDANT, ROLES.MAINTENANCE_STAFF].includes(user.role)) {
    if (!application.managedDormId) {
      throw new HttpError(403, 'This application has not been routed to an assigned dormitory.');
    }
    await assertCanManageDorm(user, application.managedDormId, client);
  }
}

async function assertMaintenanceCategoryScope(user, application, client = pool) {
  if (user.role !== ROLES.MAINTENANCE_STAFF) {
    return;
  }
  const technician = rowOrNotFound(
    await client.query(
      'SELECT maintenance_specialization AS "maintenanceSpecialization" FROM users WHERE id = $1',
      [user.id],
    ),
    'Maintenance profile',
  );
  const specialization = technician.maintenanceSpecialization ?? 'general';
  const permitted =
    specialization === 'general'
    || (specialization === 'electrician' && application.repairCategory === 'electrical')
    || (specialization === 'plumber' && application.repairCategory === 'plumbing');
  if (!permitted) {
    throw new HttpError(403, 'This repair category is outside your specialization.');
  }
}

async function assertAssignedRoomMatchesDorm(client, assignedRoomId, managedDormId) {
  if (!assignedRoomId) {
    return;
  }
  if (!managedDormId) {
    throw new HttpError(409, 'Route the application to a dormitory before assigning a room.');
  }
  const result = await client.query('SELECT dorm_id AS "dormId" FROM room WHERE id = $1', [assignedRoomId]);
  const room = rowOrNotFound(result, 'Assigned room');
  if (String(room.dormId) !== String(managedDormId)) {
    throw new HttpError(409, 'The assigned room must belong to the routed dormitory.');
  }
}

async function assertAvailableCapacity(client, roomId) {
  const roomResult = await client.query('SELECT capacity FROM room WHERE id = $1 FOR UPDATE', [roomId]);

  if (roomResult.rowCount === 0) {
    throw new HttpError(404, 'Assigned room was not found.');
  }

  const occupiedResult = await client.query(
    `SELECT COUNT(*)::integer AS occupied
     FROM residence WHERE room_id = $1 AND status = 'active'`,
    [roomId],
  );

  if (occupiedResult.rows[0].occupied >= roomResult.rows[0].capacity) {
    throw new HttpError(409, 'Assigned room has no available places.');
  }
}

function requireChecked(application, fields, message) {
  if (fields.some((field) => !application[field])) {
    throw new HttpError(409, message);
  }
}

async function completeHousingWorkflow(client, application) {
  const currentResidence = await activeResidenceForUser(client, application.userId);
  const today = new Date().toISOString().slice(0, 10);

  if (application.applicationType === 'settlement') {
    if (currentResidence) {
      throw new HttpError(409, 'The student already has an active residence.');
    }
    if (!application.assignedRoomId) {
      throw new HttpError(409, 'A room must be assigned before settlement can be completed.');
    }
    requireChecked(
      application,
      [
        'eligibilityVerified',
        'documentsVerified',
        'paymentVerified',
        'medicalClearanceVerified',
        'safetyBriefingCompleted',
        'passIssued',
      ],
      'Settlement verification steps must be completed before residence is created.',
    );
    await assertAvailableCapacity(client, application.assignedRoomId);
    await client.query(
      `INSERT INTO residence (user_id, room_id, start_date, status)
       VALUES ($1, $2, $3, 'active')`,
      [application.userId, application.assignedRoomId, today],
    );
  }

  if (application.applicationType === 'renewal') {
    if (!currentResidence) {
      throw new HttpError(409, 'An active residence is required for continuation of residence.');
    }
    requireChecked(
      application,
      ['eligibilityVerified', 'paymentVerified'],
      'Eligibility and absence of accommodation debt must be verified.',
    );
  }

  if (application.applicationType === 'relocation') {
    if (!currentResidence) {
      throw new HttpError(409, 'An active residence is required for relocation.');
    }
    if (!application.assignedRoomId) {
      throw new HttpError(409, 'A destination room must be assigned before relocation.');
    }
    if (String(currentResidence.roomId) === String(application.assignedRoomId)) {
      throw new HttpError(409, 'The relocation destination must differ from the current room.');
    }
    requireChecked(
      application,
      ['housingConditionsConfirmed'],
      'Confirm that relocation does not worsen residence conditions.',
    );
    await assertAvailableCapacity(client, application.assignedRoomId);
    await client.query(
      `UPDATE residence
       SET status = 'archived', end_date = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [today, currentResidence.id],
    );
    await client.query(
      `INSERT INTO residence (user_id, room_id, start_date, status)
       VALUES ($1, $2, $3, 'active')`,
      [application.userId, application.assignedRoomId, today],
    );
  }

  if (application.applicationType === 'eviction') {
    if (!currentResidence) {
      throw new HttpError(409, 'An active residence is required for eviction.');
    }
    if (!application.resolutionNote?.trim()) {
      throw new HttpError(409, 'Record the basis for eviction before completion.');
    }
    await client.query(
      `UPDATE residence
       SET status = 'archived', end_date = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [today, currentResidence.id],
    );
  }
}

export async function listApplications(request, response) {
  const filters = [];
  const values = [];
  const userId = request.query.userId === undefined ? undefined : readId(request.query.userId, 'userId');
  const status =
    request.query.status === undefined
      ? undefined
      : readEnum({ status: request.query.status }, 'status', STATUSES);
  const applicationType =
    request.query.applicationType === undefined
      ? undefined
      : readEnum({ applicationType: request.query.applicationType }, 'applicationType', TYPES);
  addFilter(filters, values, 'application.user_id', userId);
  addFilter(filters, values, 'application.status', status);
  addFilter(filters, values, 'application.application_type', applicationType);
  if (request.user.role === ROLES.STUDENT) {
    addFilter(filters, values, 'application.user_id', String(request.user.id));
  }
  if (request.user.role === ROLES.MAINTENANCE_STAFF) {
    addFilter(filters, values, 'application.application_type', 'repair');
    values.push(request.user.id);
    filters.push(
      `(EXISTS (
          SELECT 1 FROM users AS technician
          WHERE technician.id = $${values.length}
            AND (
              COALESCE(technician.maintenance_specialization::text, 'general') = 'general'
              OR (technician.maintenance_specialization = 'electrician' AND application.repair_category = 'electrical')
              OR (technician.maintenance_specialization = 'plumber' AND application.repair_category = 'plumbing')
            )
        ))`,
    );
  }
  addAssignedDormFilter(filters, values, request.user, 'application.managed_dorm_id');
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM application${whereClause(filters)} ORDER BY created_at DESC`,
    values,
  );
  response.json(result.rows);
}

export async function getApplication(request, response) {
  const id = readId(request.params.id);
  const filters = ['id = $1'];
  const values = [id];

  if (request.user.role === ROLES.STUDENT) {
    addFilter(filters, values, 'user_id', String(request.user.id));
  }
  if (request.user.role === ROLES.MAINTENANCE_STAFF) {
    addFilter(filters, values, 'application_type', 'repair');
  }
  addAssignedDormFilter(filters, values, request.user, 'application.managed_dorm_id');

  const result = await pool.query(
    `SELECT ${COLUMNS} FROM application WHERE ${filters.join(' AND ')}`,
    values,
  );
  const application = rowOrNotFound(result, 'Application');
  await assertMaintenanceCategoryScope(request.user, application);
  response.json(application);
}

export async function createApplication(request, response) {
  requireJsonObject(request.body);
  const submittedUserId = readForeignId(request.body, 'userId', {
    required: request.user.role !== ROLES.STUDENT,
  });
  const isStudent = request.user.role === ROLES.STUDENT;

  if (isStudent && submittedUserId && String(submittedUserId) !== String(request.user.id)) {
    throw new HttpError(403, 'Students can submit applications only for themselves.');
  }

  const userId = isStudent ? String(request.user.id) : submittedUserId;
  let roomId = readForeignId(request.body, 'roomId', { nullable: true });
  const applicationType = readEnum(request.body, 'applicationType', TYPES, { required: true });
  const repairCategory =
    applicationType === 'repair'
      ? readEnum(request.body, 'repairCategory', REPAIR_CATEGORIES, { required: true })
      : null;
  const submittedStatus = readEnum(request.body, 'status', STATUSES);
  const assignedRoomId = isStudent
    ? undefined
    : readForeignId(request.body, 'assignedRoomId', { nullable: true });
  const activeResidenceResult = await pool.query(
    `SELECT residence.room_id AS "roomId", room.dorm_id AS "dormId"
     FROM residence JOIN room ON room.id = residence.room_id
     WHERE residence.user_id = $1 AND residence.status = 'active'`,
    [userId],
  );
  const activeResidence = activeResidenceResult.rows[0] ?? null;
  let managedDormId =
    request.user.role === ROLES.ADMINISTRATOR
      ? readForeignId(request.body, 'managedDormId', { nullable: true })
      : undefined;

  if (isStudent && applicationType === 'settlement') {
    if (activeResidence) {
      throw new HttpError(409, 'Students with an active residence must apply for continuation.');
    }
    if (roomId) {
      throw new HttpError(400, 'A room is assigned by dormitory administration after review.');
    }
    roomId = null;
    managedDormId = null;
  }

  if (isStudent && applicationType === 'renewal') {
    if (!activeResidence) {
      throw new HttpError(409, 'An active residence is required for continuation.');
    }
    if (roomId && String(roomId) !== String(activeResidence.roomId)) {
      throw new HttpError(403, 'Students may refer only to their active room.');
    }
    roomId = activeResidence.roomId;
    managedDormId = activeResidence.dormId;
  }

  if (isStudent && ['repair', 'eviction'].includes(applicationType)) {
    if (!activeResidence) {
      throw new HttpError(409, 'An active residence is required for this application.');
    }
    if (roomId && String(roomId) !== String(activeResidence.roomId)) {
      throw new HttpError(403, 'Students may submit this application only for their active room.');
    }
    roomId = activeResidence.roomId;
    managedDormId = activeResidence.dormId;
  }

  if (isStudent && applicationType === 'relocation') {
    throw new HttpError(403, 'Relocation is initiated by dormitory administration.');
  }

  if (isStudent && submittedStatus && submittedStatus !== 'pending') {
    throw new HttpError(403, 'Student applications must be submitted with pending status.');
  }

  if (HOUSING_TYPES.includes(applicationType)) {
    const existingApplication = await pool.query(
      `SELECT id FROM application
       WHERE user_id = $1 AND application_type = $2
         AND status IN ('pending', 'in_review', 'approved')`,
      [userId, applicationType],
    );
    if (existingApplication.rowCount > 0) {
      throw new HttpError(409, 'There is already an open application of this type.');
    }
  }

  if (!isStudent && applicationType === 'relocation') {
    if (!activeResidence) {
      throw new HttpError(409, 'An active residence is required for relocation.');
    }
    roomId = activeResidence.roomId;
    managedDormId = activeResidence.dormId;
  }

  if (!isStudent && !managedDormId && activeResidence) {
    managedDormId = activeResidence.dormId;
  }
  if (request.user.role === ROLES.COMMANDANT) {
    if (!managedDormId) {
      throw new HttpError(403, 'Commandants can create applications only for assigned residents.');
    }
    await assertCanManageDorm(request.user, managedDormId);
  }
  await assertAssignedRoomMatchesDorm(pool, assignedRoomId, managedDormId);

  const status = isStudent ? 'pending' : submittedStatus ?? 'pending';
  const description = readString(request.body, 'description', { nullable: true, allowEmpty: true });
  const result = await pool.query(
    `INSERT INTO application
       (user_id, room_id, assigned_room_id, managed_dorm_id, application_type, repair_category, status, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
    [userId, roomId ?? null, assignedRoomId ?? null, managedDormId ?? null, applicationType, repairCategory, status, description ?? null],
  );
  response.status(201).json(result.rows[0]);
}

export async function updateApplication(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const isMaintenance = request.user.role === ROLES.MAINTENANCE_STAFF;

  if (isMaintenance) {
    const allowedFields = ['status', 'resolutionNote'];
    const unsupportedField = Object.keys(request.body).find(
      (field) => !allowedFields.includes(field),
    );

    if (unsupportedField) {
      throw new HttpError(403, 'Maintenance staff may update only repair status and resolution note.');
    }

    const repair = await pool.query(
      `SELECT ${COLUMNS} FROM application WHERE id = $1 AND application_type = 'repair'`,
      [id],
    );
    const repairApplication = rowOrNotFound(repair, 'Repair application');
    await assertApplicationScope(request.user, repairApplication);
    await assertMaintenanceCategoryScope(request.user, repairApplication);

    const status = readEnum(request.body, 'status', ['in_review', 'waiting_materials', 'completed']);
    const resolutionNote = readString(request.body, 'resolutionNote', {
      nullable: true,
      allowEmpty: true,
    });
    const query = updateStatement(
      'application',
      id,
      {
        status,
        resolutionNote,
        processedBy:
          status !== undefined || resolutionNote !== undefined ? request.user.id : undefined,
        processedAt:
          status !== undefined || resolutionNote !== undefined
            ? new Date().toISOString()
            : undefined,
      },
      {
        status: 'status',
        resolutionNote: 'resolution_note',
        processedBy: 'processed_by',
        processedAt: 'processed_at',
      },
      COLUMNS,
    );
    const result = await pool.query(query);
    const updatedRepair = result.rows[0];
    if (status && status !== repairApplication.status) {
      await createNotification({
        recipientUserId: updatedRepair.userId,
        notificationType: 'application_update',
        title: 'Оновлення ремонтної заявки',
        message: `Статус заявки змінено: ${status}.`,
        relatedEntityType: 'application',
        relatedEntityId: updatedRepair.id,
        deduplicationKey: `application:${updatedRepair.id}:status:${status}:${updatedRepair.userId}`,
      });
    }
    response.json(updatedRepair);
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const current = rowOrNotFound(
      await client.query(`SELECT ${COLUMNS} FROM application WHERE id = $1 FOR UPDATE`, [id]),
      'Application',
    );
    await assertApplicationScope(request.user, current, client);
    const status = readEnum(request.body, 'status', STATUSES);
    const disciplinaryRecordIds = readDisciplinaryRecordIds(request.body);
    if (disciplinaryRecordIds && current.applicationType !== 'eviction') {
      throw new HttpError(400, 'Disciplinary grounds can be attached only to an eviction application.');
    }
    if (disciplinaryRecordIds) {
      const grounds = await client.query(
        `SELECT record.id, record.residence_id AS "residenceId"
         FROM disciplinary_record AS record
         JOIN residence ON residence.id = record.residence_id
         WHERE record.id = ANY($1::bigint[]) AND residence.user_id = $2
           AND record.status = 'active'`,
        [disciplinaryRecordIds, current.userId],
      );
      if (grounds.rowCount !== disciplinaryRecordIds.length) {
        throw new HttpError(400, 'Every disciplinary ground must be an active record for this student.');
      }
      for (const ground of grounds.rows) {
        await assertCanManageDorm(
          request.user,
          (
            await client.query(
              `SELECT room.dorm_id AS "dormId" FROM residence
               JOIN room ON room.id = residence.room_id WHERE residence.id = $1`,
              [ground.residenceId],
            )
          ).rows[0].dormId,
          client,
        );
      }
    }
    const fields = {
      assignedRoomId: readForeignId(request.body, 'assignedRoomId', { nullable: true }),
      repairCategory:
        current.applicationType === 'repair'
          ? readEnum(request.body, 'repairCategory', REPAIR_CATEGORIES)
          : undefined,
      status,
      description: readString(request.body, 'description', { nullable: true, allowEmpty: true }),
      resolutionNote: readString(request.body, 'resolutionNote', { nullable: true, allowEmpty: true }),
      disciplinaryBasis:
        disciplinaryRecordIds === undefined
          ? undefined
          : disciplinaryRecordIds.map((recordId) => ({ disciplinaryRecordId: recordId })),
      eligibilityVerified: readBoolean(request.body, 'eligibilityVerified'),
      documentsVerified: readBoolean(request.body, 'documentsVerified'),
      paymentVerified: readBoolean(request.body, 'paymentVerified'),
      medicalClearanceVerified: readBoolean(request.body, 'medicalClearanceVerified'),
      safetyBriefingCompleted: readBoolean(request.body, 'safetyBriefingCompleted'),
      passIssued: readBoolean(request.body, 'passIssued'),
      housingConditionsConfirmed: readBoolean(request.body, 'housingConditionsConfirmed'),
      processedBy:
        status !== undefined || hasField(request.body, 'resolutionNote') ? request.user.id : undefined,
      processedAt:
        status !== undefined || hasField(request.body, 'resolutionNote')
          ? new Date().toISOString()
          : undefined,
    };
    const resultingApplication = { ...current };
    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined) {
        resultingApplication[field] = value;
      }
    }
    await assertAssignedRoomMatchesDorm(
      client,
      resultingApplication.assignedRoomId,
      current.managedDormId,
    );

    if (
      status === 'approved'
      && current.applicationType === 'settlement'
      && !resultingApplication.assignedRoomId
    ) {
      throw new HttpError(409, 'A room must be assigned before the settlement place can be approved.');
    }

    if (status === 'completed' && current.status !== 'completed') {
      await completeHousingWorkflow(client, resultingApplication);
    }

    const query = updateStatement(
      'application',
      id,
      fields,
      {
        assignedRoomId: 'assigned_room_id',
        repairCategory: 'repair_category',
        status: 'status',
        description: 'description',
        resolutionNote: 'resolution_note',
        disciplinaryBasis: 'disciplinary_basis',
        eligibilityVerified: 'eligibility_verified',
        documentsVerified: 'documents_verified',
        paymentVerified: 'payment_verified',
        medicalClearanceVerified: 'medical_clearance_verified',
        safetyBriefingCompleted: 'safety_briefing_completed',
        passIssued: 'pass_issued',
        housingConditionsConfirmed: 'housing_conditions_confirmed',
        processedBy: 'processed_by',
        processedAt: 'processed_at',
      },
      COLUMNS,
    );
    const result = await client.query(query);
    await client.query('COMMIT');
    const updatedApplication = result.rows[0];
    if (status && status !== current.status) {
      let notificationTitle = 'Статус заявки оновлено';
      let notificationMessage = `Ваша заявка має новий статус: ${status}.`;

      if (
        status === 'approved'
        && updatedApplication.applicationType === 'settlement'
        && updatedApplication.assignedRoomId
      ) {
        const placement = await pool.query(
          `SELECT room.room_number AS "roomNumber", dorm.dorm_number AS "dormNumber"
           FROM room JOIN dorm ON dorm.id = room.dorm_id
           WHERE room.id = $1`,
          [updatedApplication.assignedRoomId],
        );
        if (placement.rows[0]) {
          notificationTitle = 'Місце для поселення погоджено';
          notificationMessage =
            `Вам призначено гуртожиток ${placement.rows[0].dormNumber}, ` +
            `кімнату ${placement.rows[0].roomNumber}. ` +
            'Подайте необхідні документи коменданту для завершення оформлення.';
        }
      }
      await createNotification({
        recipientUserId: updatedApplication.userId,
        notificationType: 'application_update',
        title: notificationTitle,
        message: notificationMessage,
        relatedEntityType: 'application',
        relatedEntityId: updatedApplication.id,
        deduplicationKey: `application:${updatedApplication.id}:status:${status}:${updatedApplication.userId}`,
      });
    }
    response.json(updatedApplication);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function assignApplicationDorm(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const managedDormId = readForeignId(request.body, 'managedDormId', { required: true });
  const current = rowOrNotFound(
    await pool.query(`SELECT ${COLUMNS} FROM application WHERE id = $1`, [id]),
    'Application',
  );
  await assertAssignedRoomMatchesDorm(pool, current.assignedRoomId, managedDormId);
  const result = await pool.query(
    `UPDATE application
     SET managed_dorm_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 RETURNING ${COLUMNS}`,
    [managedDormId, id],
  );
  response.json(rowOrNotFound(result, 'Application'));
}

async function assertCanAccessRepairThread(user, application, client = pool) {
  if (application.applicationType !== 'repair') {
    throw new HttpError(404, 'Repair application was not found.');
  }
  if (user.role === ROLES.STUDENT && String(application.userId) !== String(user.id)) {
    throw new HttpError(403, 'Students may read comments only for their own repair requests.');
  }
  await assertApplicationScope(user, application, client);
  await assertMaintenanceCategoryScope(user, application, client);
}

export async function listApplicationComments(request, response) {
  const id = readId(request.params.id);
  const application = rowOrNotFound(
    await pool.query(`SELECT ${COLUMNS} FROM application WHERE id = $1`, [id]),
    'Application',
  );
  await assertCanAccessRepairThread(request.user, application);
  const values = [id];
  const visibilityFilter =
    request.user.role === ROLES.STUDENT ? ` AND comment.visibility = 'public'` : '';
  const result = await pool.query(
    `SELECT ${COMMENT_COLUMNS}
     FROM application_comment AS comment
     JOIN users AS author ON author.id = comment.author_id
     WHERE comment.application_id = $1${visibilityFilter}
     ORDER BY comment.created_at, comment.id`,
    values,
  );
  response.json(result.rows);
}

export async function createApplicationComment(request, response) {
  const id = readId(request.params.id);
  requireJsonObject(request.body);
  const application = rowOrNotFound(
    await pool.query(`SELECT ${COLUMNS} FROM application WHERE id = $1`, [id]),
    'Application',
  );
  await assertCanAccessRepairThread(request.user, application);
  const message = readString(request.body, 'message', { required: true, maxLength: 2000 });
  const visibility =
    request.user.role === ROLES.STUDENT
      ? 'public'
      : readEnum(request.body, 'visibility', COMMENT_VISIBILITIES) ?? 'public';
  const result = await pool.query(
    `INSERT INTO application_comment (application_id, author_id, message, visibility)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [id, request.user.id, message, visibility],
  );
  const comment = rowOrNotFound(
    await pool.query(
      `SELECT ${COMMENT_COLUMNS}
       FROM application_comment AS comment
       JOIN users AS author ON author.id = comment.author_id
       WHERE comment.id = $1`,
      [result.rows[0].id],
    ),
    'Application comment',
  );
  response.status(201).json(comment);
}

export async function deleteApplication(request, response) {
  const id = readId(request.params.id);
  const result = await pool.query(`DELETE FROM application WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  rowOrNotFound(result, 'Application');
  response.status(204).send();
}
