import 'dotenv/config';

function readPort(value, name = 'PORT', fallback = 5000) {
  const port = Number(value ?? fallback);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }

  return port;
}

function readBoolean(value) {
  return String(value).toLowerCase() === 'true';
}

function readDatabaseUrl() {
  const postgresParts = [
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
  ];
  const hasPostgresParts = postgresParts.some((name) => process.env[name]);

  if (!hasPostgresParts) {
    return (
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/dormmanager'
    );
  }

  const missingPart = postgresParts.find((name) => !process.env[name]);

  if (missingPart) {
    throw new Error(`${missingPart} must be defined when using POSTGRES_* configuration.`);
  }

  const url = new URL('postgresql://localhost');
  url.hostname = process.env.POSTGRES_HOST;
  url.port = String(readPort(process.env.POSTGRES_PORT, 'POSTGRES_PORT'));
  url.username = process.env.POSTGRES_USER;
  url.password = process.env.POSTGRES_PASSWORD;
  url.pathname = `/${process.env.POSTGRES_DB}`;

  return url.toString();
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: readPort(process.env.PORT),
  databaseUrl: readDatabaseUrl(),
  dbSsl: readBoolean(process.env.DB_SSL),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:5000',
  serveFrontend: readBoolean(process.env.SERVE_FRONTEND),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  firebaseUseApplicationDefault: readBoolean(process.env.FIREBASE_USE_APPLICATION_DEFAULT),
});
