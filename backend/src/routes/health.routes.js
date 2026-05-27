import { Router } from 'express';
import { checkDatabaseConnection } from '../config/database.js';

const router = Router();

router.get('/', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'DormManager API',
    timestamp: new Date().toISOString(),
  });
});

router.get('/database', async (_request, response) => {
  try {
    const serverTime = await checkDatabaseConnection();

    response.json({
      status: 'ok',
      database: 'connected',
      serverTime,
    });
  } catch (_error) {
    response.status(503).json({
      status: 'unavailable',
      database: 'disconnected',
      message: 'PostgreSQL connection is not available.',
    });
  }
});

export default router;
