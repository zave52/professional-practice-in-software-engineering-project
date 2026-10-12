import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { checkDatabaseConnection } from './db.js';
import deploymentRoutes from './routes/deploymentRoutes.js';
import projectRoutes from './routes/projectRoutes.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res, next) => {
  try {
    await checkDatabaseConnection();
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'connected',
    });
  } catch (error) {
    error.status = 503;
    error.message = 'Database is unavailable.';
    return next(error);
  }
});

app.use('/api/projects', projectRoutes);
app.use('/api/deployments', deploymentRoutes);

app.use((req, res) => {
  res.status(404).json({ status: 404, message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = Number.isInteger(error.status) ? error.status : 500;
  const message = status === 503
    ? error.message
    : status >= 500
      ? 'Internal server error.'
      : error.message;
  if (status >= 500) {
    console.error(error);
  }
  return res.status(status).json({ status, message });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}

export default app;
