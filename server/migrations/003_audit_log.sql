-- Persistent audit trail written by AuditLogObserver (previously an in-memory array that was
-- lost on every restart).

CREATE TABLE IF NOT EXISTS audit_log
(
    id            BIGSERIAL PRIMARY KEY,
    event         VARCHAR(50) NOT NULL,
    user_id       INT REFERENCES users (id) ON DELETE SET NULL,
    project_id    INT REFERENCES projects (id) ON DELETE SET NULL,
    deployment_id INT REFERENCES deployments (id) ON DELETE SET NULL,
    run_id        BIGINT,
    payload       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_log_user ON audit_log (user_id, created_at DESC);
