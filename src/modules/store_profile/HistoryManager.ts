import { v4 as uuidv4 } from 'uuid';
import type {
  StoreProfile,
  ProfileCommit,
  HistoryEntry,
  JsonDiff,
} from './types';
import { StoreProfileRepository } from './StoreProfileRepository';
import { DiffEngine } from './DiffEngine';

export class HistoryManager {
  private repository: StoreProfileRepository;

  constructor(repository: StoreProfileRepository) {
    this.repository = repository;
  }

  /**
   * Create a new commit
   * @param currentProfile The current state of the profile
   * @param previousProfile The previous state (before changes)
   * @param message Commit message
   * @param author Optional author name
   */
  async createCommit(
    currentProfile: StoreProfile,
    previousProfile: StoreProfile | null,
    message: string,
    author?: string
  ): Promise<ProfileCommit> {
    const latestCommit = await this.repository.getLatestCommit();
    const commitId = uuidv4();
    const timestamp = new Date().toISOString();

    let commit: ProfileCommit;

    if (!latestCommit || !previousProfile) {
      // Initial commit - store full snapshot
      commit = {
        commitId,
        timestamp,
        message,
        author,
        parentCommitId: latestCommit?.commitId || null,
        snapshot: DiffEngine.cloneProfile(currentProfile),
      };
    } else {
      // Subsequent commit - store only diff
      const diff = DiffEngine.createDiff(previousProfile, currentProfile);

      if (DiffEngine.isEmpty(diff)) {
        throw new Error('No changes to commit');
      }

      commit = {
        commitId,
        timestamp,
        message,
        author,
        parentCommitId: latestCommit.commitId,
        diff,
      };
    }

    await this.repository.saveCommit(commit);
    return commit;
  }

  /**
   * Get the profile state at a specific commit
   */
  async getProfileAtCommit(commitId: string): Promise<StoreProfile> {
    const commit = await this.repository.getCommit(commitId);
    if (!commit) {
      throw new Error(`Commit not found: ${commitId}`);
    }

    // If this commit has a snapshot, return it
    if (commit.snapshot) {
      return DiffEngine.cloneProfile(commit.snapshot);
    }

    // Otherwise, we need to rebuild from the initial snapshot
    const chain = await this.repository.getCommitChain(null, commitId);

    // Find the initial commit with snapshot
    const initialCommit = chain.find((c) => c.snapshot);
    if (!initialCommit || !initialCommit.snapshot) {
      throw new Error('No initial snapshot found in commit chain');
    }

    // Apply all diffs in sequence
    let profile = DiffEngine.cloneProfile(initialCommit.snapshot);

    for (const c of chain) {
      if (c.commitId === initialCommit.commitId) continue;
      if (c.diff) {
        profile = DiffEngine.applyDiff(profile, c.diff);
      }
    }

    return profile;
  }

  /**
   * Get commit history
   */
  async getHistory(
    limit: number = 50,
    offset: number = 0
  ): Promise<HistoryEntry[]> {
    const commits = await this.repository.getCommits(limit, offset);
    return commits.map((commit) => ({
      commitId: commit.commitId,
      timestamp: commit.timestamp,
      message: commit.message,
      author: commit.author,
    }));
  }

  /**
   * Rollback to a specific commit
   * Creates a new commit that reverts to the target state
   */
  async rollback(
    commitId: string,
    currentProfile: StoreProfile,
    author?: string
  ): Promise<ProfileCommit> {
    const targetProfile = await this.getProfileAtCommit(commitId);
    const targetCommit = await this.repository.getCommit(commitId);

    if (!targetCommit) {
      throw new Error(`Commit not found: ${commitId}`);
    }

    // Create a new commit that reverts to the target state
    const rollbackCommit = await this.createCommit(
      targetProfile,
      currentProfile,
      `Rollback to commit: ${commitId.slice(0, 8)} - ${targetCommit.message}`,
      author
    );

    return rollbackCommit;
  }

  /**
   * Get the diff between two commits
   */
  async getDiff(
    fromCommitId: string,
    toCommitId: string
  ): Promise<JsonDiff> {
    const fromProfile = await this.getProfileAtCommit(fromCommitId);
    const toProfile = await this.getProfileAtCommit(toCommitId);
    return DiffEngine.createDiff(fromProfile, toProfile);
  }

  /**
   * Get details of a specific commit
   */
  async getCommit(commitId: string): Promise<ProfileCommit | null> {
    return this.repository.getCommit(commitId);
  }

  /**
   * Get the latest commit
   */
  async getLatestCommit(): Promise<ProfileCommit | null> {
    return this.repository.getLatestCommit();
  }

  /**
   * Check if there are any commits
   */
  async hasHistory(): Promise<boolean> {
    const count = await this.repository.getCommitCount();
    return count > 0;
  }

  /**
   * Get the initial profile (from the first snapshot)
   */
  async getInitialProfile(): Promise<StoreProfile | null> {
    const commits = await this.repository.getCommits(1000, 0);

    // Find the commit with snapshot (should be oldest)
    for (const commit of commits.reverse()) {
      if (commit.snapshot) {
        return DiffEngine.cloneProfile(commit.snapshot);
      }
    }

    return null;
  }

  /**
   * Get a summary of changes for a commit
   */
  async getCommitSummary(commitId: string): Promise<string[]> {
    const commit = await this.repository.getCommit(commitId);
    if (!commit) {
      throw new Error(`Commit not found: ${commitId}`);
    }

    if (commit.snapshot) {
      return ['Initial commit (full snapshot)'];
    }

    if (commit.diff) {
      return DiffEngine.getDiffSummary(commit.diff);
    }

    return [];
  }

  /**
   * Clear all history (for testing/reset purposes)
   */
  async clearHistory(): Promise<void> {
    await this.repository.clearHistory();
  }
}
