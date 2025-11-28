import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { HistoryManager } from '@/modules/store_profile/HistoryManager';
import { StoreProfileRepository } from '@/modules/store_profile/StoreProfileRepository';
import type { StoreProfile } from '@/modules/store_profile/types';

// Helper to create delay between commits for proper timestamp ordering
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Base profile for testing
const createBaseProfile = (): StoreProfile => ({
  profileId: 'test-profile',
  version: '1.0.0',
  store: {
    id: 'store-001',
    name: 'Test Store',
    currency: 'KRW',
  },
  menu: {
    categories: [
      {
        id: 'cat-1',
        name: 'Category 1',
        displayOrder: 1,
        items: [
          {
            id: 'item-1',
            name: 'Item 1',
            price: 1000,
            hasSet: false,
            available: true,
          },
        ],
      },
    ],
    options: {
      setChoices: [{ id: 'single', name: '단품', price: 0, available: true }],
      drinks: [{ id: 'cola', name: '콜라', price: 0, available: true }],
      sides: [{ id: 'fries', name: '감자튀김', price: 0, available: true }],
    },
  },
  promotions: [],
  settings: {
    language: 'ko',
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

describe('HistoryManager', () => {
  let repository: StoreProfileRepository;
  let historyManager: HistoryManager;

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
    historyManager = new HistoryManager(repository);
  });

  afterEach(async () => {
    await repository.destroy();
  });

  describe('createCommit()', () => {
    it('should create initial commit with snapshot', async () => {
      const profile = createBaseProfile();
      const commit = await historyManager.createCommit(
        profile,
        null,
        'Initial commit',
        'test-user'
      );

      expect(commit.commitId).toBeDefined();
      expect(commit.message).toBe('Initial commit');
      expect(commit.author).toBe('test-user');
      expect(commit.parentCommitId).toBeNull();
      expect(commit.snapshot).toEqual(profile);
      expect(commit.diff).toBeUndefined();
    });

    it('should create subsequent commit with diff', async () => {
      const initialProfile = createBaseProfile();
      await historyManager.createCommit(initialProfile, null, 'Initial commit');

      const updatedProfile = createBaseProfile();
      updatedProfile.version = '2.0.0';

      const commit = await historyManager.createCommit(
        updatedProfile,
        initialProfile,
        'Update version'
      );

      expect(commit.snapshot).toBeUndefined();
      expect(commit.diff).toBeDefined();
      expect(commit.diff!.operations.length).toBeGreaterThan(0);
      expect(commit.parentCommitId).not.toBeNull();
    });

    it('should throw if no changes to commit', async () => {
      const profile = createBaseProfile();
      await historyManager.createCommit(profile, null, 'Initial commit');

      await expect(
        historyManager.createCommit(profile, profile, 'No changes')
      ).rejects.toThrow('No changes to commit');
    });

    it('should chain commits correctly', async () => {
      const profile1 = createBaseProfile();
      const commit1 = await historyManager.createCommit(
        profile1,
        null,
        'Commit 1'
      );

      await delay(10); // Ensure timestamp difference

      const profile2 = createBaseProfile();
      profile2.version = '2.0.0';
      const commit2 = await historyManager.createCommit(
        profile2,
        profile1,
        'Commit 2'
      );

      await delay(10); // Ensure timestamp difference

      const profile3 = createBaseProfile();
      profile3.version = '3.0.0';
      const commit3 = await historyManager.createCommit(
        profile3,
        profile2,
        'Commit 3'
      );

      expect(commit1.parentCommitId).toBeNull();
      expect(commit2.parentCommitId).toBe(commit1.commitId);
      expect(commit3.parentCommitId).toBe(commit2.commitId);
    });
  });

  describe('getProfileAtCommit()', () => {
    it('should return profile at initial commit', async () => {
      const profile = createBaseProfile();
      const commit = await historyManager.createCommit(
        profile,
        null,
        'Initial'
      );

      const retrieved = await historyManager.getProfileAtCommit(commit.commitId);
      expect(retrieved).toEqual(profile);
    });

    it('should reconstruct profile from diffs', async () => {
      const profile1 = createBaseProfile();
      await historyManager.createCommit(profile1, null, 'Commit 1');

      const profile2 = createBaseProfile();
      profile2.version = '2.0.0';
      profile2.store.name = 'Updated Store';
      const commit2 = await historyManager.createCommit(
        profile2,
        profile1,
        'Commit 2'
      );

      const retrieved = await historyManager.getProfileAtCommit(
        commit2.commitId
      );
      expect(retrieved.version).toBe('2.0.0');
      expect(retrieved.store.name).toBe('Updated Store');
    });

    it('should throw for non-existent commit', async () => {
      await expect(
        historyManager.getProfileAtCommit('non-existent')
      ).rejects.toThrow('Commit not found');
    });

    it('should handle complex diff chains', async () => {
      // Create a series of changes
      const profile1 = createBaseProfile();
      await historyManager.createCommit(profile1, null, 'Initial');

      const profile2 = createBaseProfile();
      profile2.version = '1.1.0';
      profile2.menu.categories[0].items[0].price = 1500;
      await historyManager.createCommit(profile2, profile1, 'Update price');

      const profile3 = createBaseProfile();
      profile3.version = '1.2.0';
      profile3.menu.categories[0].items[0].price = 2000;
      profile3.store.name = 'Premium Store';
      const commit3 = await historyManager.createCommit(
        profile3,
        profile2,
        'More updates'
      );

      const retrieved = await historyManager.getProfileAtCommit(
        commit3.commitId
      );
      expect(retrieved.version).toBe('1.2.0');
      expect(retrieved.menu.categories[0].items[0].price).toBe(2000);
      expect(retrieved.store.name).toBe('Premium Store');
    });
  });

  describe('getHistory()', () => {
    it('should return empty array when no commits', async () => {
      const history = await historyManager.getHistory();
      expect(history).toEqual([]);
    });

    it('should return commit history in reverse chronological order', async () => {
      const profile = createBaseProfile();
      await historyManager.createCommit(profile, null, 'Commit 1');

      await delay(10);

      const profile2 = createBaseProfile();
      profile2.version = '2.0.0';
      await historyManager.createCommit(profile2, profile, 'Commit 2');

      await delay(10);

      const profile3 = createBaseProfile();
      profile3.version = '3.0.0';
      await historyManager.createCommit(profile3, profile2, 'Commit 3');

      const history = await historyManager.getHistory();

      expect(history).toHaveLength(3);
      expect(history[0].message).toBe('Commit 3');
      expect(history[2].message).toBe('Commit 1');
    });

    it('should respect limit and offset', async () => {
      const profile = createBaseProfile();
      let prevProfile: StoreProfile | null = null;

      for (let i = 1; i <= 5; i++) {
        const newProfile = createBaseProfile();
        newProfile.version = `${i}.0.0`;
        await historyManager.createCommit(
          newProfile,
          prevProfile,
          `Commit ${i}`
        );
        prevProfile = newProfile;
        await delay(10);
      }

      const limited = await historyManager.getHistory(2);
      expect(limited).toHaveLength(2);

      const offset = await historyManager.getHistory(2, 2);
      expect(offset).toHaveLength(2);
      expect(offset[0].message).toBe('Commit 3');
    });

    it('should return HistoryEntry format', async () => {
      const profile = createBaseProfile();
      await historyManager.createCommit(profile, null, 'Test', 'author');

      const history = await historyManager.getHistory();
      const entry = history[0];

      expect(entry).toHaveProperty('commitId');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('message');
      expect(entry).toHaveProperty('author');
      // Should NOT have snapshot or diff
      expect(entry).not.toHaveProperty('snapshot');
      expect(entry).not.toHaveProperty('diff');
    });
  });

  describe('rollback()', () => {
    it('should rollback to previous state', async () => {
      const profile1 = createBaseProfile();
      const commit1 = await historyManager.createCommit(
        profile1,
        null,
        'Initial'
      );

      const profile2 = createBaseProfile();
      profile2.version = '2.0.0';
      profile2.store.name = 'Changed Store';
      await historyManager.createCommit(profile2, profile1, 'Changes');

      // Rollback to initial
      const rollbackCommit = await historyManager.rollback(
        commit1.commitId,
        profile2,
        'rollback-user'
      );

      expect(rollbackCommit.message).toContain('Rollback');
      expect(rollbackCommit.author).toBe('rollback-user');

      // Verify the profile at rollback commit matches initial
      const rolledBackProfile = await historyManager.getProfileAtCommit(
        rollbackCommit.commitId
      );
      expect(rolledBackProfile.version).toBe('1.0.0');
      expect(rolledBackProfile.store.name).toBe('Test Store');
    });

    it('should throw for non-existent commit', async () => {
      const profile = createBaseProfile();
      await expect(
        historyManager.rollback('non-existent', profile)
      ).rejects.toThrow();
    });
  });

  describe('getDiff()', () => {
    it('should return diff between two commits', async () => {
      const profile1 = createBaseProfile();
      const commit1 = await historyManager.createCommit(
        profile1,
        null,
        'Initial'
      );

      const profile2 = createBaseProfile();
      profile2.version = '2.0.0';
      const commit2 = await historyManager.createCommit(
        profile2,
        profile1,
        'Update'
      );

      const diff = await historyManager.getDiff(
        commit1.commitId,
        commit2.commitId
      );

      expect(diff.operations.length).toBeGreaterThan(0);
      const versionOp = diff.operations.find((op) => op.path === '/version');
      expect(versionOp?.value).toBe('2.0.0');
    });
  });

  describe('getCommit()', () => {
    it('should return commit details', async () => {
      const profile = createBaseProfile();
      const created = await historyManager.createCommit(
        profile,
        null,
        'Test commit'
      );

      const retrieved = await historyManager.getCommit(created.commitId);
      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent commit', async () => {
      const result = await historyManager.getCommit('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getLatestCommit()', () => {
    it('should return null when no commits', async () => {
      const latest = await historyManager.getLatestCommit();
      expect(latest).toBeNull();
    });

    it('should return most recent commit', async () => {
      const profile = createBaseProfile();
      await historyManager.createCommit(profile, null, 'First');

      await delay(10);

      const profile2 = createBaseProfile();
      profile2.version = '2.0.0';
      await historyManager.createCommit(profile2, profile, 'Second');

      const latest = await historyManager.getLatestCommit();
      expect(latest?.message).toBe('Second');
    });
  });

  describe('hasHistory()', () => {
    it('should return false when no commits', async () => {
      const has = await historyManager.hasHistory();
      expect(has).toBe(false);
    });

    it('should return true when commits exist', async () => {
      const profile = createBaseProfile();
      await historyManager.createCommit(profile, null, 'Test');

      const has = await historyManager.hasHistory();
      expect(has).toBe(true);
    });
  });

  describe('getInitialProfile()', () => {
    it('should return null when no commits', async () => {
      const initial = await historyManager.getInitialProfile();
      expect(initial).toBeNull();
    });

    it('should return the initial profile snapshot', async () => {
      const profile1 = createBaseProfile();
      await historyManager.createCommit(profile1, null, 'Initial');

      const profile2 = { ...createBaseProfile(), version: '2.0.0' };
      await historyManager.createCommit(profile2, profile1, 'Update');

      const initial = await historyManager.getInitialProfile();
      expect(initial?.version).toBe('1.0.0');
    });
  });

  describe('getCommitSummary()', () => {
    it('should return summary for initial commit', async () => {
      const profile = createBaseProfile();
      const commit = await historyManager.createCommit(
        profile,
        null,
        'Initial'
      );

      const summary = await historyManager.getCommitSummary(commit.commitId);
      expect(summary).toContain('Initial commit (full snapshot)');
    });

    it('should return change summary for diff commit', async () => {
      const profile1 = createBaseProfile();
      await historyManager.createCommit(profile1, null, 'Initial');

      const profile2 = createBaseProfile();
      profile2.version = '2.0.0';
      profile2.store.name = 'New Name';
      const commit2 = await historyManager.createCommit(
        profile2,
        profile1,
        'Updates'
      );

      const summary = await historyManager.getCommitSummary(commit2.commitId);
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.some((s) => s.includes('Changed'))).toBe(true);
    });

    it('should throw for non-existent commit', async () => {
      await expect(
        historyManager.getCommitSummary('non-existent')
      ).rejects.toThrow('Commit not found');
    });
  });

  describe('clearHistory()', () => {
    it('should clear all history', async () => {
      const profile = createBaseProfile();
      await historyManager.createCommit(profile, null, 'Test');

      await historyManager.clearHistory();

      const has = await historyManager.hasHistory();
      expect(has).toBe(false);
    });
  });
});
