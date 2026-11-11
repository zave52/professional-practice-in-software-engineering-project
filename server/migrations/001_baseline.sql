-- Baseline schema (formerly init.sql + migrateObsoleteColumns()).
-- Every statement is idempotent so this migration can be applied both to an empty database
-- and to databases created by the earlier init.sql script.

CREATE TABLE IF NOT EXISTS roles
(
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS users
(
    id                  SERIAL PRIMARY KEY,
    role_id             INT          NOT NULL,
    username            VARCHAR(50)  NOT NULL UNIQUE,
    email               VARCHAR(100) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    github_id           VARCHAR(40) UNIQUE,
    avatar_url          VARCHAR(500),
    github_access_token TEXT,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id)
        REFERENCES roles (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS projects
(
    id            SERIAL PRIMARY KEY,
    user_id       INT          NOT NULL,
    name          VARCHAR(100) NOT NULL UNIQUE,
    repo_url      VARCHAR(255) NOT NULL,
    workflow_id   BIGINT       NOT NULL,
    workflow_name VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS deployments
(
    id            SERIAL PRIMARY KEY,
    project_id    INT         NOT NULL,
    triggered_by  INT         NOT NULL,
    version_tag   VARCHAR(30) NOT NULL,
    commit_sha    CHAR(40)    NOT NULL,
    deploy_status VARCHAR(20) NOT NULL,
    deployed_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_deployments_project FOREIGN KEY (project_id)
        REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_deployments_user FOREIGN KEY (triggered_by)
        REFERENCES users (id) ON DELETE RESTRICT
);

-- Upgrades for databases created by the original Lab 5 schema.
ALTER TABLE projects DROP COLUMN IF EXISTS environment;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workflow_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id VARCHAR(40) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE deployments DROP CONSTRAINT IF EXISTS chk_health_status;
ALTER TABLE deployments DROP COLUMN IF EXISTS health_status;

-- Tokens stored before AES-256-GCM encryption was introduced are discarded.
UPDATE users
SET github_access_token = NULL
WHERE github_access_token IS NOT NULL
  AND github_access_token !~ '^[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$';
