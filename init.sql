CREATE TABLE roles
(
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

CREATE TABLE users
(
    id            SERIAL PRIMARY KEY,
    role_id       INT          NOT NULL,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    github_id     VARCHAR(40) UNIQUE,
    avatar_url    VARCHAR(500),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id)
        REFERENCES roles (id) ON DELETE RESTRICT
);

CREATE TABLE projects
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

CREATE TABLE deployments
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
        REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_deploy_status CHECK (deploy_status IN ('SUCCESS', 'FAILED', 'RUNNING', 'CANCELED'))
);
