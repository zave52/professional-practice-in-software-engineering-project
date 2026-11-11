# CI/CD Dashboard

A full-stack web application for monitoring and controlling GitHub Actions pipelines, and the
CI/CD pipeline that builds, tests and deploys the application itself.

Course project for **"Professional Practice in Software Engineering"** (Vasyl Stefanyk Carpathian
National University, ІПЗ-42).

- **Frontend:** React 19, Vite, Tailwind CSS, served by nginx (MVVM).
- **Backend:** Node.js 24, Express 5, PostgreSQL 18 (layered architecture + GoF patterns).
- **Delivery:** GitHub Actions → GHCR images → Azure VM (Docker Compose), with a health check and
  automatic rollback.

## Features

- Sign-in with GitHub OAuth 2.0. GitHub tokens are encrypted at rest with AES-256-GCM, and
  sessions are httpOnly JWT cookies.
- Role-based access control. **Developers** see and manage their own projects; **Admins** see
  everything. Admins are configured with `ADMIN_GITHUB_LOGINS`.
- Projects are bound to a GitHub repository and a workflow. The workflow is verified against the
  repository when the project is created.
- Deployments are a persisted mirror of GitHub Actions runs. Runs are synchronised on every
  dashboard poll, dispatches are linked to the runs they produced, and the lifecycle is controlled
  by a state machine (`RUNNING → CANCELING → CANCELED`, `RUNNING → SUCCESS | FAILED`, reruns).
- You can trigger a deployment from a branch or tag (optionally creating the tag), cancel it, or
  rerun it.
- **DORA metrics:** deployment frequency, lead time for changes, change failure rate, time to
  restore service, plus pipeline duration against the NFR-04 target.
- A persistent **audit log** of every action, including rejected ones.

## Architecture

```mermaid
flowchart LR
    Browser -->|HTTP| Nginx[nginx: SPA + /api proxy]
    Nginx --> API[Express API]
    API --> Facade[DeploymentFacade]
    Facade --> Commands[Commands + Invoker]
    Facade --> Sync[DeploymentSyncService]
    Facade --> Metrics[MetricsService]
    Commands --> State[State machine]
    Sync --> State
    Commands --> Provider
    Sync --> Provider[CiProvider - Adapter]
    Provider --> Proxy[Caching Proxy] --> Client[GitHubApiClient] --> Http[Retry + Logging decorators] --> GitHub[(GitHub REST API)]
    Commands --> Events[EventPublisher]
    Sync --> Events
    Events --> Audit[AuditLogObserver] --> DB[(PostgreSQL)]
    Events --> Activity[MetricsObserver]
    API --> Repos[Repositories + QueryBuilder] --> DB
```

Server layers: `routes` → `services` / `DeploymentFacade` → `patterns` → `repositories` → `db`.
All wiring happens in one composition root, `server/src/container.js`. Every other module gets
its collaborators through its constructor, so each one can be unit-tested with fakes.

## Design patterns

| Pattern | GoF group | Where | Problem it solves |
|---|---|---|---|
| **State** | Behavioral | `server/src/patterns/state/` | Lifecycle of a deployment. Each state decides which user commands (cancel, rerun) and which CI observations (completed, cancelled, new attempt) are legal. Illegal transitions return `409 INVALID_STATE_TRANSITION`. The UI buttons come from `allowedActions()`. |
| **Observer** | Behavioral | `server/src/patterns/observer/` | Commands and the synchroniser publish domain events without knowing their consumers. `AuditLogObserver` persists them and `MetricsObserver` counts them. A failing observer does not break the others. |
| **Command** | Behavioral | `server/src/patterns/command/` | Trigger, cancel and rerun are objects run by a `CommandInvoker`. The invoker keeps an execution history and reports failed attempts to the audit log. |
| **Template Method** | Behavioral | `Command.execute()`, `RunOperationCommand`, `CiProviderFactory.createProvider()` | Fixes the algorithm skeleton (validate → perform → publish; transport → client → adapter). Subclasses override only the steps that vary. |
| **Chain of Responsibility** | Behavioral | `server/src/patterns/chain/` | Request validation and authorisation as small handlers (id format → existence → access → git ref → tag). Each command assembles only the handlers it needs. |
| **Strategy** | Behavioral | `server/src/patterns/strategy/` | (1) Access policies selected by role: `AdminAccessPolicy` / `OwnerAccessPolicy`. (2) Interchangeable metric algorithms (the four DORA metrics and pipeline duration) run by `MetricsCalculator`. |
| **Adapter** | Structural | `server/src/patterns/adapter/` | `GitHubActionsAdapter` turns GitHub payloads (`status` + `conclusion`, `head_branch`...) into the domain `CiProvider` interface. A GitLab or Jenkins adapter could be added without touching services. |
| **Proxy** | Structural | `server/src/patterns/proxy/` | `CachingGitHubClientProxy` has the same interface as `GitHubApiClient`. It caches reads per token, merges concurrent identical requests and invalidates the cache after writes, which protects the 5000 requests/hour GitHub limit. |
| **Decorator** | Structural | `server/src/patterns/decorator/` | `RetryingHttpClient` (exponential backoff, idempotent methods only) and `LoggingHttpClient` (duration, never the token) are stacked around the `fetch` transport. |
| **Facade** | Structural | `server/src/patterns/facade/` | `DeploymentFacade` gives controllers one method per endpoint over sync, commands, state, metrics, repositories and the audit log. |
| **Factory Method** | Creational | `server/src/patterns/factory/`, `DeploymentStateFactory`, `DeploymentCommandFactory` | Builds the CI provider stack, state objects and commands without callers knowing the concrete classes. |
| **Builder** | Creational | `server/src/patterns/builder/` | `DeploymentQueryBuilder` composes filtered, fully parameterised SQL step by step. |
| **Singleton** | Creational | `server/src/config/AppConfig.js`, `server/src/db/Database.js` | One validated, frozen configuration and one PostgreSQL pool per process. |
| **Repository** | Architectural | `server/src/repositories/` | All SQL is isolated from the business logic. |
| **MVVM** | Architectural (UI) | `client/src/viewmodels/`, `client/src/models/`, `client/src/components/` | `useDashboardViewModel` owns state and commands; components are passive Views; `models/` holds pure logic. |

Each pattern has tests in `server/test/unit/*` and `client/test/viewModel.test.js`.

## Requirements traceability (Labs 1–2)

| Requirement | Implementation |
|---|---|
| FR-01: run checks on pull requests | `pull_request` trigger in `.github/workflows/deploy.yml` |
| FR-02: release on merge to `main` or a `v*.*.*` tag | `push` trigger (branch `main`, tags `v*.*.*`) |
| FR-03: ESLint | `npm run lint` job (client and server) |
| FR-04: dependency audit | `npm audit --omit=dev --audit-level=high` |
| FR-05: unit and integration tests | Vitest + Supertest; server integration tests run against a PostgreSQL service container |
| FR-06: coverage gate at 70% | `coverage.thresholds` in both `vitest.config.js` files |
| FR-07: multi-stage Docker images | `server/Dockerfile`, `client/Dockerfile` |
| FR-08: images tagged with the SHA and version | `docker/metadata-action` → `ghcr.io/<repo>/{server,client}:<sha>`, `latest`, semver |
| FR-09: deploy over SSH | `appleboy/ssh-action` → `deploy/deploy.sh` (pull, restart) |
| FR-10: health check after deploy | `deploy.sh` waits for `/api/health` to report the new version; the workflow re-checks from outside |
| FR-11: report in GitHub Checks | Job summaries (coverage tables, release summary) |
| NFR-01/02: secrets in GitHub Secrets, masked | `secrets.*` only; tokens are never logged |
| NFR-03: least privilege | Workflow `permissions: contents: read`, widened per job (`packages: write` only for image builds) |
| NFR-05: caching | npm cache + BuildKit `type=gha` layer cache |
| NFR-06: idempotent deploys | Immutable SHA-tagged images; migrations are recorded and run once |
| NFR-07: minimal downtime, rollback | Health-gated deploy with automatic rollback to the previous tag |

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Database check and running version (public) |
| GET | `/api/auth/github`, `/api/auth/github/callback` | OAuth flow |
| GET / POST | `/api/auth/session`, `/api/auth/logout` | Session |
| GET / POST | `/api/projects` | List visible projects / create a project |
| GET / DELETE | `/api/projects/:id` | Project details / delete |
| GET | `/api/projects/:id/refs` | Branches and tags |
| GET | `/api/repositories/workflows?repo_url=` | Workflows of a repository |
| GET / POST | `/api/deployments` | Synchronise and list runs / trigger a deployment |
| GET | `/api/deployments/:id` | Deployment details |
| POST | `/api/deployments/:id/cancel`, `/api/deployments/:id/rerun` | Lifecycle commands (guarded by the state machine) |
| GET | `/api/metrics?days=30&project_id=` | DORA metrics |
| GET | `/api/audit?limit=50` | Audit log |

Errors always have the shape `{status, code, message}`.

## Running locally

```bash
# database
docker run -d --name cicd-pg -e POSTGRES_USER=app_admin -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=cicd_hub_db -p 127.0.0.1:5432:5432 postgres:18.6-alpine3.24

# backend (migrations run automatically on start)
cd server && cp .env.example .env   # fill in the GitHub OAuth app and secrets
npm ci && npm run dev               # http://localhost:5000

# frontend (proxies /api to :5000)
cd client && npm ci && npm run dev  # http://localhost:5173
```

You can also run the whole stack in containers with `docker compose up --build`, using a root
`.env` based on `.env.example`.

## Tests

```bash
cd server && TEST_DATABASE_URL=postgres://user:pass@localhost:5432/test_db npm run test:coverage
cd client && npm run test:coverage
```

Without `TEST_DATABASE_URL` the PostgreSQL integration suite is skipped.

## Deployment

On every push to `main` (or a `v*.*.*` tag), after lint, audit, tests and image builds pass:

1. The images are pushed to GHCR, tagged with the commit SHA.
2. The VM checks out that commit and runs `deploy/deploy.sh <sha>`.
3. The script pulls the images and recreates the containers. Migrations run when the backend
   starts.
4. It waits until `/api/health` reports the new version. Otherwise it restores the previous tag
   and fails the pipeline.

The database is bound to `127.0.0.1` and the API has no published port; only nginx (port 80) is
exposed. To enable HTTPS, see `docker-compose.https.yml`. It requires opening TCP 443 in the Azure
network security group and switching the OAuth callback URL to `https://`.

Note: rolling back restores the previous images but keeps the current schema. Migrations are
therefore written to be backward-compatible (additive).
