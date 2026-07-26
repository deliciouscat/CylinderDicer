import { env } from '../_generated/server'

export function qaToolsEnabled(): boolean {
	return env.QA_TOOLS_ENABLED === 'true' || env.LADDER_DEV_FIXTURES === 'true'
}

export function requireQaToolsEnabled(): void {
	if (!qaToolsEnabled()) {
		throw new Error('QA_TOOLS_DISABLED')
	}
}
