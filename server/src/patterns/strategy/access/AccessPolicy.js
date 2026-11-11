/**
 * Strategy pattern (authorisation policies).
 *
 * The role of the signed-in user selects an interchangeable policy object. Services ask the
 * policy "can this user view/manage this project?" and "which projects does the user see?"
 * instead of branching on role names, so a new role (for example a read-only Viewer) is a
 * new class rather than edits scattered across services.
 */
export class AccessPolicy {
    // eslint-disable-next-line no-unused-vars
    canView(user, project) {
        throw new Error('AccessPolicy.canView must be implemented.');
    }

    // eslint-disable-next-line no-unused-vars
    canManage(user, project) {
        throw new Error('AccessPolicy.canManage must be implemented.');
    }

    /** Filter for repository queries; `{}` means "all projects". */
    // eslint-disable-next-line no-unused-vars
    projectScope(user) {
        throw new Error('AccessPolicy.projectScope must be implemented.');
    }

    /** Filter for the audit log. */
    // eslint-disable-next-line no-unused-vars
    auditScope(user) {
        throw new Error('AccessPolicy.auditScope must be implemented.');
    }
}

export class AdminAccessPolicy extends AccessPolicy {
    canView() {
        return true;
    }

    canManage() {
        return true;
    }

    projectScope() {
        return {};
    }

    auditScope() {
        return {};
    }
}

export class OwnerAccessPolicy extends AccessPolicy {
    canView(user, project) {
        return Number(project.user_id) === Number(user.id);
    }

    canManage(user, project) {
        return this.canView(user, project);
    }

    projectScope(user) {
        return {ownerId: user.id};
    }

    /** Own actions plus events of own projects (for example status changes found by sync). */
    auditScope(user) {
        return {visibleTo: user.id};
    }
}

export const ROLES = Object.freeze({ADMIN: 'Admin', DEVELOPER: 'Developer'});

const policies = {
    [ROLES.ADMIN]: new AdminAccessPolicy(),
    [ROLES.DEVELOPER]: new OwnerAccessPolicy(),
};

/** Unknown roles fall back to the most restrictive policy. */
export const resolveAccessPolicy = (user) => policies[user?.role] || policies[ROLES.DEVELOPER];
