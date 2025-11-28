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

  describe('reconstructProfileFromCommits()', () => {
    it('should return null when no commits exist', async () => {
      const result = await repository.reconstructProfileFromCommits();
      expect(result).toBeNull();
    });

    it('should reconstruct profile from initial commit snapshot', async () => {
      const profile = createMockProfile();
      const initialCommit: ProfileCommit = {
        commitId: 'initial',
        timestamp: '2024-01-01T00:00:00.000Z',
        message: 'Initial commit',
        parentCommitId: null,
        snapshot: profile,
      };

      await repository.saveCommit(initialCommit);
      const reconstructed = await repository.reconstructProfileFromCommits();

      expect(reconstructed).toEqual(profile);
    });

    it('should apply diffs to reconstruct latest state', async () => {
      const profile = createMockProfile();

      // Initial commit with snapshot
      const initialCommit: ProfileCommit = {
        commitId: 'initial',
        timestamp: '2024-01-01T00:00:00.000Z',
        message: 'Initial commit',
        parentCommitId: null,
        snapshot: profile,
      };

      // Second commit that changes version
      const secondCommit: ProfileCommit = {
        commitId: 'second',
        timestamp: '2024-01-02T00:00:00.000Z',
        message: 'Update version',
        parentCommitId: 'initial',
        diff: {
          operations: [{ op: 'replace', path: '/version', value: '2.0.0' }],
        },
      };

      // Third commit that changes store name
      const thirdCommit: ProfileCommit = {
        commitId: 'third',
        timestamp: '2024-01-03T00:00:00.000Z',
        message: 'Update store name',
        parentCommitId: 'second',
        diff: {
          operations: [
            { op: 'replace', path: '/store/name', value: 'Updated Store' },
          ],
        },
      };

      await repository.saveCommit(initialCommit);
      await repository.saveCommit(secondCommit);
      await repository.saveCommit(thirdCommit);

      const reconstructed = await repository.reconstructProfileFromCommits();

      expect(reconstructed).not.toBeNull();
      expect(reconstructed!.version).toBe('2.0.0');
      expect(reconstructed!.store.name).toBe('Updated Store');
    });

    it('should return null when no snapshot exists in commit chain', async () => {
      // Commit without snapshot
      const commitWithoutSnapshot: ProfileCommit = {
        commitId: 'orphan',
        timestamp: '2024-01-01T00:00:00.000Z',
        message: 'Orphan commit',
        parentCommitId: null,
        diff: {
          operations: [{ op: 'replace', path: '/version', value: '2.0.0' }],
        },
      };

      await repository.saveCommit(commitWithoutSnapshot);
      const result = await repository.reconstructProfileFromCommits();

      expect(result).toBeNull();
    });

    it('should handle complex diff operations', async () => {
      const profile = createMockProfile();
      profile.menu.categories = [
        {
          id: 'cat-1',
          name: 'Burgers',
          displayOrder: 1,
          items: [
            {
              id: 'item-1',
              name: 'Cheese Burger',
              price: 5000,
              hasSet: true,
              available: true,
            },
          ],
        },
      ];

      const initialCommit: ProfileCommit = {
        commitId: 'initial',
        timestamp: '2024-01-01T00:00:00.000Z',
        message: 'Initial commit',
        parentCommitId: null,
        snapshot: profile,
      };

      // Add a new item
      const addItemCommit: ProfileCommit = {
        commitId: 'add-item',
        timestamp: '2024-01-02T00:00:00.000Z',
        message: 'Add new burger',
        parentCommitId: 'initial',
        diff: {
          operations: [
            {
              op: 'add',
              path: '/menu/categories/0/items/-',
              value: {
                id: 'item-2',
                name: 'Double Burger',
                price: 7000,
                hasSet: true,
                available: true,
              },
            },
          ],
        },
      };

      // Update price
      const updatePriceCommit: ProfileCommit = {
        commitId: 'update-price',
        timestamp: '2024-01-03T00:00:00.000Z',
        message: 'Update price',
        parentCommitId: 'add-item',
        diff: {
          operations: [
            {
              op: 'replace',
              path: '/menu/categories/0/items/0/price',
              value: 5500,
            },
          ],
        },
      };

      await repository.saveCommit(initialCommit);
      await repository.saveCommit(addItemCommit);
      await repository.saveCommit(updatePriceCommit);

      const reconstructed = await repository.reconstructProfileFromCommits();

      expect(reconstructed).not.toBeNull();
      expect(reconstructed!.menu.categories[0].items).toHaveLength(2);
      expect(reconstructed!.menu.categories[0].items[0].price).toBe(5500);
      expect(reconstructed!.menu.categories[0].items[1].name).toBe(
        'Double Burger'
      );
    });
  });
});
