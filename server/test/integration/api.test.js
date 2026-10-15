import request from 'supertest';
import {expect, it} from 'vitest';
import app from '../../src/app.js';

it('returns a JSON 404 for unknown routes', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({status: 404, message: 'Route not found.'});
});

it('returns validation errors without querying the database', async () => {
    const response = await request(app)
        .post('/api/projects')
        .send({name: 'ab', repo_url: 'not-a-github-url'});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Project name must be at least 3 characters long.');
});

it('validates CRUD route parameters and deployment payloads', async () => {
    const project = await request(app).get('/api/projects/not-an-id');
    expect(project.status).toBe(400);
    expect(project.body.message).toContain('positive integer');

    const deleted = await request(app).delete('/api/projects/not-an-id');
    expect(deleted.status).toBe(400);

    const deployment = await request(app).post('/api/deployments').send({project_id: 'bad', version_tag: 'v1'});
    expect(deployment.status).toBe(400);
    expect(deployment.body.message).toContain('positive integer');

    const deploymentById = await request(app).get('/api/deployments/not-an-id');
    expect(deploymentById.status).toBe(400);
});
