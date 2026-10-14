import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import {migrateObsoleteColumns} from './db.js';
import deploymentRoutes from './routes/deploymentRoutes.js';
import pipelineRoutes from './routes/pipelineRoutes.js';
import projectRoutes from './routes/projectRoutes.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json({limit: '1mb'}));

app.use('/api/projects', projectRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/pipelines', pipelineRoutes);

app.use((req, res) => {
    res.status(404).json({status: 404, message: 'Route not found.'});
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
    return res.status(status).json({status, message});
});

if (process.env.NODE_ENV !== 'test') {
    migrateObsoleteColumns()
        .then(() => app.listen(port, () => {
            console.log(`API server listening on port ${port}`);
        }))
        .catch((error) => {
            console.error('Database migration failed:', error);
            process.exitCode = 1;
        });
}

export default app;
