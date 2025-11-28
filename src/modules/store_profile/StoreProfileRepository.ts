import type {
  StoreProfile,
  ProfileCommit,
  StoreProfileConfig,
} from './types';
import { DiffEngine } from './DiffEngine';

const DB_NAME = 'KioSpeakProfileDB';
const DB_VERSION = 1;
const COMMITS_STORE = 'commits';

export class StoreProfileRepository {
  private config: StoreProfileConfig;
  private db: IDBDatabase | null = null;
  private profilePath: string;
  private memoryOnlyMode: boolean = false;
  private memoryCommits: Map<string, ProfileCommit> = new Map();
  private memoryProfile: StoreProfile | null = null;

  constructor(config: StoreProfileConfig = {}) {
    this.config = {
      profilePath: '/profile/current.json',
      maxHistoryEntries: 100,
      ...config,
    };
    this.profilePath = this.config.profilePath!;
  }

  // ============ Environment Detection ============

  private isBrowserEnvironment(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof indexedDB !== 'undefined' &&
      typeof localStorage !== 'undefined'
    );
  }

  /**
   * Check if running in memory-only mode (SSR/Node environment)
   */
  isMemoryOnlyMode(): boolean {
    return this.memoryOnlyMode;
  }

  // ============ Initialization ============

  async initialize(): Promise<void> {
    if (!this.isBrowserEnvironment()) {
      // SSR/Node environment: use memory-only mode
      this.memoryOnlyMode = true;
      return;
    }
    await this.openDatabase();
  }

  async destroy(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.memoryCommits.clear();
    this.memoryProfile = null;
  }

  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(COMMITS_STORE)) {
          const store = db.createObjectStore(COMMITS_STORE, {
            keyPath: 'commitId',
          });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('parentCommitId', 'parentCommitId', {
            unique: false,
          });
        }
      };
    });
  }

  // ============ Profile Operations ============

  async loadProfile(): Promise<StoreProfile> {
    const response = await fetch(this.profilePath);
    if (!response.ok) {
      throw new Error(`Failed to load profile: ${response.statusText}`);
    }
    return response.json();
  }

  async saveProfile(profile: StoreProfile): Promise<void> {
    if (this.memoryOnlyMode) {
      // Memory-only mode: store in memory
      this.memoryProfile = profile;
      return;
    }
    // In browser environment, we'll use localStorage as a fallback
    // In production, this would POST to a server endpoint
    const key = `profile:${this.profilePath}`;
    localStorage.setItem(key, JSON.stringify(profile));
  }

  async getStoredProfile(): Promise<StoreProfile | null> {
    if (this.memoryOnlyMode) {
      return this.memoryProfile;
    }
    const key = `profile:${this.profilePath}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  }

  /**
   * Reconstruct profile from commit history (IndexedDB or memory)
   * This is used when localStorage is cleared but commit history exists
   */
  async reconstructProfileFromCommits(): Promise<StoreProfile | null> {
    // Check if we have any commits to work with
    if (!this.memoryOnlyMode && !this.db) {
      return null;
    }

    const latestCommit = await this.getLatestCommit();
    if (!latestCommit) {
      return null;
    }

    // Get the full commit chain from initial commit to latest
    const commits = await this.getCommitChain(null, latestCommit.commitId);
    if (commits.length === 0) {
      return null;
    }

    // Find the initial commit (the one with a snapshot)
    const initialCommit = commits.find((c) => c.snapshot);
    if (!initialCommit?.snapshot) {
      return null;
    }

    // Start with the initial snapshot and apply all subsequent diffs
    let profile = DiffEngine.cloneProfile(initialCommit.snapshot);

    for (const commit of commits) {
      // Skip the initial commit (already have its snapshot)
      if (commit.commitId === initialCommit.commitId) {
        continue;
      }

      // Apply the diff if present
      if (commit.diff) {
        profile = DiffEngine.applyDiff(profile, commit.diff);
      }
    }

    return profile;
  }

  // ============ Commit Operations ============

  async saveCommit(commit: ProfileCommit): Promise<void> {
    if (this.memoryOnlyMode) {
      this.memoryCommits.set(commit.commitId, commit);
      return;
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([COMMITS_STORE], 'readwrite');
      const store = transaction.objectStore(COMMITS_STORE);
      const request = store.add(commit);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to save commit'));
    });
  }

  async getCommit(commitId: string): Promise<ProfileCommit | null> {
    if (this.memoryOnlyMode) {
      return this.memoryCommits.get(commitId) || null;
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([COMMITS_STORE], 'readonly');
      const store = transaction.objectStore(COMMITS_STORE);
      const request = store.get(commitId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Failed to get commit'));
    });
  }

  async getCommits(
    limit: number = 50,
    offset: number = 0
  ): Promise<ProfileCommit[]> {
    if (this.memoryOnlyMode) {
      // Sort by timestamp descending (newest first)
      const allCommits = Array.from(this.memoryCommits.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      return allCommits.slice(offset, offset + limit);
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([COMMITS_STORE], 'readonly');
      const store = transaction.objectStore(COMMITS_STORE);
      const index = store.index('timestamp');
      const commits: ProfileCommit[] = [];

      const request = index.openCursor(null, 'prev'); // newest first
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
          } else if (commits.length < limit) {
            commits.push(cursor.value);
            cursor.continue();
          } else {
            resolve(commits);
          }
        } else {
          resolve(commits);
        }
      };

      request.onerror = () => reject(new Error('Failed to get commits'));
    });
  }

  async getLatestCommit(): Promise<ProfileCommit | null> {
    const commits = await this.getCommits(1, 0);
    return commits[0] || null;
  }

  async getCommitChain(
    fromCommitId: string | null,
    toCommitId: string
  ): Promise<ProfileCommit[]> {
    // Works for both memory and IndexedDB mode since getCommit handles it
    const chain: ProfileCommit[] = [];
    let currentId: string | null = toCommitId;

    while (currentId && currentId !== fromCommitId) {
      const commit = await this.getCommit(currentId);
      if (!commit) {
        throw new Error(`Commit not found: ${currentId}`);
      }
      chain.unshift(commit);
      currentId = commit.parentCommitId;
    }

    return chain;
  }

  async getCommitCount(): Promise<number> {
    if (this.memoryOnlyMode) {
      return this.memoryCommits.size;
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([COMMITS_STORE], 'readonly');
      const store = transaction.objectStore(COMMITS_STORE);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to count commits'));
    });
  }

  async clearHistory(): Promise<void> {
    if (this.memoryOnlyMode) {
      this.memoryCommits.clear();
      return;
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([COMMITS_STORE], 'readwrite');
      const store = transaction.objectStore(COMMITS_STORE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear history'));
    });
  }

  // ============ Utility ============

  async pruneOldCommits(): Promise<number> {
    const maxEntries = this.config.maxHistoryEntries || 100;
    const count = await this.getCommitCount();

    if (count <= maxEntries) {
      return 0;
    }

    // Get old commits to delete
    const commits = await this.getCommits(count, maxEntries);
    let deleted = 0;

    for (const commit of commits) {
      // Don't delete commits with snapshots (initial commits)
      if (!commit.snapshot) {
        await this.deleteCommit(commit.commitId);
        deleted++;
      }
    }

    return deleted;
  }

  private async deleteCommit(commitId: string): Promise<void> {
    if (this.memoryOnlyMode) {
      this.memoryCommits.delete(commitId);
      return;
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([COMMITS_STORE], 'readwrite');
      const store = transaction.objectStore(COMMITS_STORE);
      const request = store.delete(commitId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete commit'));
    });
  }
}
