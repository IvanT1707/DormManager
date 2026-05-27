import { pool } from '../config/database.js';
import { verifyFirebaseIdToken } from '../config/firebase.js';
import { HttpError } from '../utils/http-error.js';

const PROFILE_COLUMNS =
  'id, firebase_uid AS "firebaseUid", email, role, full_name AS "fullName", faculty, specialty, created_at AS "createdAt", updated_at AS "updatedAt"';

export async function authenticate(request, _response, next) {
  const authorization = request.get('authorization');
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    next(new HttpError(401, 'A Firebase bearer token is required.'));
    return;
  }

  try {
    const decodedToken = await verifyFirebaseIdToken(token);

    if (!decodedToken.uid) {
      throw new Error('Decoded Firebase token has no uid.');
    }

    request.auth = {
      uid: decodedToken.uid,
      email: decodedToken.email ?? null,
    };
    next();
  } catch (error) {
    if (error.statusCode) {
      next(error);
      return;
    }

    next(new HttpError(401, 'The Firebase bearer token is invalid or expired.'));
  }
}

export async function requireProfile(request, _response, next) {
  const result = await pool.query(`SELECT ${PROFILE_COLUMNS} FROM users WHERE firebase_uid = $1`, [
    request.auth.uid,
  ]);

  if (result.rowCount === 0) {
    next(new HttpError(403, 'No DormManager profile is linked to this Firebase account.'));
    return;
  }

  request.user = result.rows[0];
  next();
}

export function authorize(...allowedRoles) {
  return function roleGuard(request, _response, next) {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      next(new HttpError(403, 'You do not have permission to perform this operation.'));
      return;
    }

    next();
  };
}
