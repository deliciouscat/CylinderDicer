export interface SnapshotIdentity {
	matchId: string
	revision: number
}

export interface SnapshotScope {
	matchId: string
	generation: number
}

export class SnapshotCoordinator {
	private generation = 0
	private currentMatchId = ''
	private latestRevision = -1
	private disposed = false

	begin(matchId: string): SnapshotScope {
		this.generation += 1
		this.currentMatchId = matchId
		this.latestRevision = -1
		this.disposed = false
		return this.capture(matchId)
	}

	capture(matchId = this.currentMatchId): SnapshotScope {
		return {
			matchId,
			generation: this.generation,
		}
	}

	canApply(
		scope: SnapshotScope,
		publicSnapshot: SnapshotIdentity | null | undefined,
		privateDelta: SnapshotIdentity | null | undefined,
	): boolean {
		if (
			this.disposed
			|| scope.generation !== this.generation
			|| scope.matchId !== this.currentMatchId
			|| !publicSnapshot
			|| !privateDelta
			|| publicSnapshot.matchId !== scope.matchId
			|| privateDelta.matchId !== scope.matchId
			|| publicSnapshot.revision !== privateDelta.revision
			|| !Number.isSafeInteger(publicSnapshot.revision)
			|| publicSnapshot.revision < this.latestRevision
		) {
			return false
		}
		return true
	}

	commit(scope: SnapshotScope, revision: number): boolean {
		if (
			this.disposed
			|| scope.generation !== this.generation
			|| scope.matchId !== this.currentMatchId
			|| !Number.isSafeInteger(revision)
			|| revision < this.latestRevision
		) {
			return false
		}
		this.latestRevision = revision
		return true
	}

	isCurrent(scope: SnapshotScope): boolean {
		return !this.disposed
			&& scope.generation === this.generation
			&& scope.matchId === this.currentMatchId
	}

	invalidate(): void {
		this.generation += 1
		this.currentMatchId = ''
		this.latestRevision = -1
		this.disposed = true
	}
}
