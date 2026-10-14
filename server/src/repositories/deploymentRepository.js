import {query} from '../db.js';

const deploymentColumns = `
  d.id,
  d.project_id,
  d.triggered_by,
  d.version_tag,
  d.commit_sha,
  d.deploy_status,
  d.deployed_at
`;

export const findAll = async () => {
    const result = await query(`
        SELECT ${deploymentColumns}
        FROM deployments d
        ORDER BY d.deployed_at DESC
    `);
    return result.rows;
};

export const findById = async (id) => {
    const result = await query(`
    SELECT ${deploymentColumns}
    FROM deployments d
    WHERE d.id = $1
  `, [id]);
    return result.rows[0] || null;
};

export const create = async ({
                                 projectId,
                                 triggeredBy,
                                 versionTag,
                                 commitSha,
                                 deployStatus,
                             }) => {
    const result = await query(`
    INSERT INTO deployments (
      project_id,
      triggered_by,
      version_tag,
      commit_sha,
      deploy_status
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, project_id, triggered_by, version_tag, commit_sha,
      deploy_status, deployed_at
  `, [projectId, triggeredBy, versionTag, commitSha, deployStatus]);
    return result.rows[0];
};

export const remove = async (id) => {
    const result = await query(
        'DELETE FROM deployments WHERE id = $1 RETURNING id',
        [id],
    );
    return result.rows[0] || null;
};
