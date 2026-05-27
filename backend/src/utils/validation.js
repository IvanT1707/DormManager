import { HttpError } from './http-error.js';

export function hasField(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

export function requireJsonObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
}

export function readId(value, name = 'id') {
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw new HttpError(400, `${name} must be a positive integer.`);
  }

  return String(value);
}

export function readString(body, key, options = {}) {
  const {
    required = false,
    nullable = false,
    maxLength,
    label = key,
    allowEmpty = false,
  } = options;

  if (!hasField(body, key)) {
    if (required) {
      throw new HttpError(400, `${label} is required.`);
    }

    return undefined;
  }

  if (body[key] === null && nullable) {
    return null;
  }

  if (typeof body[key] !== 'string') {
    throw new HttpError(400, `${label} must be a string.`);
  }

  const value = body[key].trim();

  if (!allowEmpty && value.length === 0) {
    throw new HttpError(400, `${label} must not be empty.`);
  }

  if (maxLength && value.length > maxLength) {
    throw new HttpError(400, `${label} must be at most ${maxLength} characters.`);
  }

  return value;
}

export function readEmail(body, key = 'email', options = {}) {
  const email = readString(body, key, {
    ...options,
    label: options.label ?? 'email',
    maxLength: 255,
  });

  if (email !== undefined && email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'email must be a valid email address.');
  }

  return email;
}

export function readPositiveInteger(body, key, options = {}) {
  const { required = false, label = key } = options;

  if (!hasField(body, key)) {
    if (required) {
      throw new HttpError(400, `${label} is required.`);
    }

    return undefined;
  }

  const value = Number(body[key]);

  if (!Number.isInteger(value) || value < 1) {
    throw new HttpError(400, `${label} must be a positive integer.`);
  }

  return value;
}

export function readForeignId(body, key, options = {}) {
  const { required = false, nullable = false, label = key } = options;

  if (!hasField(body, key)) {
    if (required) {
      throw new HttpError(400, `${label} is required.`);
    }

    return undefined;
  }

  if (body[key] === null && nullable) {
    return null;
  }

  return readId(body[key], label);
}

export function readMoney(body, key, options = {}) {
  const { required = false, label = key } = options;

  if (!hasField(body, key)) {
    if (required) {
      throw new HttpError(400, `${label} is required.`);
    }

    return undefined;
  }

  const value = Number(body[key]);

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    Math.abs(Math.round(value * 100) - value * 100) > Number.EPSILON * 100
  ) {
    throw new HttpError(400, `${label} must be a non-negative amount with up to two decimals.`);
  }

  return value;
}

export function readEnum(body, key, allowedValues, options = {}) {
  const { required = false, label = key } = options;

  if (!hasField(body, key)) {
    if (required) {
      throw new HttpError(400, `${label} is required.`);
    }

    return undefined;
  }

  if (!allowedValues.includes(body[key])) {
    throw new HttpError(400, `${label} must be one of: ${allowedValues.join(', ')}.`);
  }

  return body[key];
}

export function readBoolean(body, key) {
  if (!hasField(body, key)) {
    return undefined;
  }

  if (typeof body[key] !== 'boolean') {
    throw new HttpError(400, `${key} must be a boolean.`);
  }

  return body[key];
}

export function readDate(body, key, options = {}) {
  const { required = false, nullable = false, label = key } = options;

  if (!hasField(body, key)) {
    if (required) {
      throw new HttpError(400, `${label} is required.`);
    }

    return undefined;
  }

  if (body[key] === null && nullable) {
    return null;
  }

  const value = body[key];

  const date = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : null;

  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !date ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new HttpError(400, `${label} must be a valid date in YYYY-MM-DD format.`);
  }

  return value;
}

export function readDateTime(body, key, options = {}) {
  const { nullable = false, label = key } = options;

  if (!hasField(body, key)) {
    return undefined;
  }

  if (body[key] === null && nullable) {
    return null;
  }

  if (typeof body[key] !== 'string' || Number.isNaN(Date.parse(body[key]))) {
    throw new HttpError(400, `${label} must be a valid ISO date-time.`);
  }

  return body[key];
}

export function assertDateRange(startDate, endDate) {
  if (startDate && endDate && endDate < startDate) {
    throw new HttpError(400, 'endDate must be on or after startDate.');
  }
}
