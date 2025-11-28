import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { StoreProfileRepository } from '@/modules/store_profile/StoreProfileRepository';
import type { ProfileCommit, StoreProfile } from '@/modules/store_profile/types';

// Mock profile for testing
const createMockProfile = (): StoreProfile => ({
  profileId: 'test-profile',
  version: '1.0.0',
  store: {
    id: 'store-001',
    name: 'Test Store',
    currency: 'KRW',
  },
  menu: {
    categories: [],
    options: {
      setChoices: [],
      drinks: [],
      sides: [],
    },
  },
  promotions: [],
  settings: {
    language: 'ko',
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

// Mock commit for testing
const createMockCommit = (
  id: string,
  parentId: string | null = null,
  timestamp?: string
): ProfileCommit => ({
  commitId: id,
  timestamp: timestamp || new Date().toISOString(),
  message: `Commit ${id}`,
  parentCommitId: parentId,
  diff: { operations: [] },
});

describe('StoreProfileRepository', () => {
  let repository: StoreProfileRepository;

  beforeEach(async () => {
    // Clear IndexedDB before each test
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }

    repository = new StoreProfileRepository();
    await repository.initialize();
  });

  afterEach(async () => {
    await repository.destroy();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newRepo = new StoreProfileRepository();
      await expect(newRepo.initialize()).resolves.not.toThrow();
      await newRepo.destroy();
    });

    it('should accept custom config', async () => {
      const newRepo = new StoreProfileRepository({
        profilePath: '/custom/path.json',
        maxHistoryEntries: 50,
      });
      await newRepo.initialize();
      await newRepo.destroy();
    });
  });

  describe('commit operations', () => {
    it('should save and retrieve a commit', async () => {
      const commit = createMockCommit('commit-1');

      await repository.saveCommit(commit);
      const retrieved = await repository.getCommit('commit-1');

      expect(retrieved).toEqual(commit);
    });

    it('should return null for non-existent commit', async () => {
      const result = await repository.getCommit('non-existent');
      expect(result).toBeNull();
    });

    it('should save commit with snapshot', async () => {
      const commit: ProfileCommit = {
        commitId: 'initial',
        timestamp: new Date().toISOString(),
        message: 'Initial commit',
        parentCommitId: null,
        snapshot: createMockProfile(),
      };

      await repository.saveCommit(commit);
      const retrieved = await repository.getCommit('initial');

      expect(retrieved?.snapshot).toEqual(commit.snapshot);
    });

    it('should save commit with diff', async () => {
      const commit: ProfileCommit = {
        commitId: 'commit-2',
        timestamp: new Date().toISOString(),
        message: 'Second commit',
        parentCommitId: 'commit-1',
        diff: {
          operations: [
            { op: 'replace', path: '/version', value: '2.0.0' },
          ],
        },
      };

      await repository.saveCommit(commit);
      const retrieved = await repository.getCommit('commit-2');

      expect(retrieved?.diff).toEqual(commit.diff);
    });
  });

  describe('getCommits()', () => {
    beforeEach(async () => {
      // Create commits with different timestamps
      const commits = [
        createMockCommit('commit-1', null, '2024-01-01T00:00:00.000Z'),
        createMockCommit('commit-2', 'commit-1', '2024-01-02T00:00:00.000Z'),
        createMockCommit('commit-3', 'commit-2', '2024-01-03T00:00:00.000Z'),
        createMockCommit('commit-4', 'commit-3', '2024-01-04T00:00:00.000Z'),
        createMockCommit('commit-5', 'commit-4', '2024-01-05T00:00:00.000Z'),
      ];

      for (const commit of commits) {
        await repository.saveCommit(commit);
      }
    });

    it('should return commits in reverse chronological order', async () => {
      const commits = await repository.getCommits(10);

      expect(commits[0].commitId).toBe('commit-5');
      expect(commits[commits.length - 1].commitId).toBe('commit-1');
    });

    it('should respect limit parameter', async () => {
      const commits = await repository.getCommits(2);
      expect(commits).toHaveLength(2);
    });

    it('should respect offset parameter', async () => {
      const commits = await repository.getCommits(2, 2);

      expect(commits).toHaveLength(2);
      expect(commits[0].commitId).toBe('commit-3');
    });
  });

  describe('getLatestCommit()', () => {
    it('should return null when no commits exist', async () => {
      const latest = await repository.getLatestCommit();
      expect(latest).toBeNull();
    });

    it('should return the most recent commit', async () => {
      await repository.saveCommit(
        createMockCommit('old', null, '2024-01-01T00:00:00.000Z')
      );
      await repository.saveCommit(
        createMockCommit('new', 'old', '2024-01-02T00:00:00.000Z')
      );

      const latest = await repository.getLatestCommit();
      expect(latest?.commitId).toBe('new');
    });
  });

  describe('getCommitChain()', () => {
    beforeEach(async () => {
      await repository.saveCommit(createMockCommit('c1', null));
      await repository.saveCommit(createMockCommit('c2', 'c1'));
      await repository.saveCommit(createMockCommit('c3', 'c2'));
      await repository.saveCommit(createMockCommit('c4', 'c3'));
    });

    it('should return full chain from null to target', async () => {
      const chain = await repository.getCommitChain(null, 'c4');

      expect(chain).toHaveLength(4);
      expect(chain[0].commitId).toBe('c1');
      expect(chain[3].commitId).toBe('c4');
    });

    it('should return partial chain', async () => {
      const chain = await repository.getCommitChain('c2', 'c4');

      expect(chain).toHaveLength(2);
      expect(chain[0].commitId).toBe('c3');
      expect(chain[1].commitId).toBe('c4');
    });

    it('should throw for non-existent commit', async () => {
      await expect(
        repository.getCommitChain(null, 'non-existent')
      ).rejects.toThrow();
    });
  });

  describe('getCommitCount()', () => {
    it('should return 0 for empty repository', async () => {
      const count = await repository.getCommitCount();
      expect(count).toBe(0);
    });

    it('should return correct count', async () => {
      await repository.saveCommit(createMockCommit('c1'));
      await repository.saveCommit(createMockCommit('c2', 'c1'));
      await repository.saveCommit(createMockCommit('c3', 'c2'));

      const count = await repository.getCommitCount();
      expect(count).toBe(3);
    });
  });

  describe('clearHistory()', () => {
    it('should clear all commits', async () => {
      await repository.saveCommit(createMockCommit('c1'));
      await repository.saveCommit(createMockCommit('c2', 'c1'));

      await repository.clearHistory();

      const count = await repository.getCommitCount();
      expect(count).toBe(0);
    });
  });

  describe('profile storage (localStorage)', () => {
    it('should return null when no stored profile', async () => {
      // Use a new repository with different path to ensure no prior data
      const freshRepo = new StoreProfileRepository({
        profilePath: '/fresh/unique-path.json',
      });
      await freshRepo.initialize();

      const stored = await freshRepo.getStoredProfile();
      expect(stored).toBeNull();

      await freshRepo.destroy();
    });

    it('should save and retrieve profile from localStorage', async () => {
      const profile = createMockProfile();

      await repository.saveProfile(profile);
      const stored = await repository.getStoredProfile();

      expect(stored).toEqual(profile);
    });
  });
});
