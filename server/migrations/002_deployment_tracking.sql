-- Deployments become a persisted mirror of CI pipeline runs (previously the table was never
-- written). Each row is linked to a GitHub Actions run by run_id and stores the timestamps
-- needed to calculate DORA metrics.

ALTER TABLE deployments ALTER COLUMN triggered_by DROP NOT NULL;
ALTER TABLE deployments ALTER COLUMN commit_sha DROP NOT NULL;
ALTER TABLE deployments ALTER COLUMN commit_sha TYPE VARCHAR(40);
ALTER TABLE deployments ALTER COLUMN version_tag TYPE VARCHAR(255);

ALTER TABLE deployments
    ADD COLUMN IF NOT EXISTS run_id        BIGINT,
    ADD COLUMN IF NOT EXISTS run_number    INT,
    ADD COLUMN IF NOT EXISTS run_attempt   INT         NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS workflow_id   BIGINT,
    ADD COLUMN IF NOT EXISTS workflow_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS workflow_url  VARCHAR(500),
    ADD COLUMN IF NOT EXISTS event         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS ref           VARCHAR(255),
    ADD COLUMN IF NOT EXISTS actor_login   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS commit_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS started_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS finished_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE deployments DROP CONSTRAINT IF EXISTS uq_deployments_run_id;
ALTER TABLE deployments ADD CONSTRAINT uq_deployments_run_id UNIQUE (run_id);

-- CANCELING is the intermediate state between a cancel request and GitHub's confirmation.
ALTER TABLE deployments DROP CONSTRAINT IF EXISTS chk_deploy_status;
ALTER TABLE deployments
    ADD CONSTRAINT chk_deploy_status
        CHECK (deploy_status IN ('RUNNING', 'CANCELING', 'SUCCESS', 'FAILED', 'CANCELED'));

-- A user can be removed without destroying the deployment history.
ALTER TABLE deployments DROP CONSTRAINT IF EXISTS fk_deployments_user;
ALTER TABLE deployments
    ADD CONSTRAINT fk_deployments_user FOREIGN KEY (triggered_by)
        REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_deployments_project_started ON deployments (project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_projects_user ON projects (user_id);

INSERT INTO roles (name, description)
VALUES ('Admin', 'Full access to every project'),
       ('Developer', 'Access to own projects')
ON CONFLICT (name) DO NOTHING;
