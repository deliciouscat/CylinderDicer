export const ADMIN_ROLE = 'admin'

export function identityHasAdminRole(identity: unknown): boolean {
	if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
		return false
	}
	return (identity as Record<string, unknown>).role === ADMIN_ROLE
}
