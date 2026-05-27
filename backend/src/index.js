import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDatabaseConnection, closeDatabaseConnection } from './config/database.js';
import { env } from './config/env.js';
import { setupSwagger } from './config/swagger.js';
import { startPaymentReminderJob } from './jobs/payment-reminder.job.js';
import { authenticate, requireProfile } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import applicationRoutes from './routes/application.routes.js';
import authRoutes from './routes/auth.routes.js';
import billingRoutes from './routes/billing.routes.js';
import disciplinaryRoutes from './routes/disciplinary.routes.js';
import dormRoutes from './routes/dorm.routes.js';
import healthRoutes from './routes/health.routes.js';
import internetRoutes from './routes/internet.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import residenceRoutes from './routes/residence.routes.js';
import roomRoutes from './routes/room.routes.js';
import serviceRoutes from './routes/service.routes.js';
import staffDormRoutes from './routes/staff-dorm.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import userRoutes from './routes/user.routes.js';

// The Express instance must exist before Swagger or routes are mounted.
const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }),
);
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

setupSwagger(app);

app.get('/api', (_request, response) => {
  response.json({
    name: 'DormManager API',
    version: '0.6.0',
    documentation: '/api-docs',
  });
});
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dorms', authenticate, requireProfile, dormRoutes);
app.use('/api/rooms', authenticate, requireProfile, roomRoutes);
app.use('/api/users', authenticate, requireProfile, userRoutes);
app.use('/api/services', authenticate, requireProfile, serviceRoutes);
app.use('/api/residences', authenticate, requireProfile, residenceRoutes);
app.use('/api/applications', authenticate, requireProfile, applicationRoutes);
app.use('/api/transactions', authenticate, requireProfile, transactionRoutes);
app.use('/api/charges', authenticate, requireProfile, billingRoutes);
app.use('/api/notifications', authenticate, requireProfile, notificationRoutes);
app.use('/api/room-internet', authenticate, requireProfile, internetRoutes);
app.use('/api/disciplinary-records', authenticate, requireProfile, disciplinaryRoutes);
app.use('/api/staff-dorm-assignments', authenticate, requireProfile, staffDormRoutes);

if (env.serveFrontend) {
  const frontendDistPath = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));

  app.use(express.static(frontendDistPath));
  app.get('/{*clientRoute}', (request, response, next) => {
    if (request.path.startsWith('/api') || request.path.startsWith('/api-docs')) {
      next();
      return;
    }

    response.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

let server;
let reminderTimer;

export async function startServer() {
  try {
    await checkDatabaseConnection();
    console.log('Connected to PostgreSQL.');
  } catch (_error) {
    console.warn(
      'PostgreSQL is unavailable at startup. Configure database environment values and apply the migration.',
    );
  }

  server = app.listen(env.port, () => {
    console.log(`DormManager API listening at ${env.apiBaseUrl}`);
    console.log(`${env.apiBaseUrl}/api-docs`);
  });
  reminderTimer = startPaymentReminderJob();

  return server;
}

async function shutdown(signal) {
  console.log(`${signal} received. Closing DormManager API.`);

  if (server) {
    server.close();
  }
  if (reminderTimer) {
    clearInterval(reminderTimer);
  }

  await closeDatabaseConnection();
  process.exit(0);
}

if (env.nodeEnv !== 'test') {
  startServer();
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export { app };
