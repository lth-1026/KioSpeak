import * as jsonPatch from 'fast-json-patch';
import type { StoreProfile, JsonDiff, DiffOperation } from './types';

export class DiffEngine {
  /**
   * Create a diff between two profiles
   * Returns the operations needed to transform oldProfile into newProfile
   */
  static createDiff(
    oldProfile: StoreProfile,
    newProfile: StoreProfile
  ): JsonDiff {
    const operations = jsonPatch.compare(oldProfile, newProfile);
    return {
      operations: operations.map((op) => this.convertOperation(op)),
    };
  }

  /**
   * Apply a diff to a profile
   * Returns a new profile with the diff applied
   */
  static applyDiff(profile: StoreProfile, diff: JsonDiff): StoreProfile {
    const cloned = jsonPatch.deepClone(profile);
    const patchOperations = diff.operations.map((op) =>
      this.toJsonPatchOperation(op)
    );
    const result = jsonPatch.applyPatch(cloned, patchOperations);
    return result.newDocument as StoreProfile;
  }

  /**
   * Reverse a diff (for rollback purposes)
   * Note: This creates a diff that undoes the original diff
   */
  static reverseDiff(
    originalProfile: StoreProfile,
    diff: JsonDiff
  ): JsonDiff {
    // Apply the diff to get the new state
    const newProfile = this.applyDiff(originalProfile, diff);
    // Create a diff from new state back to original
    return this.createDiff(newProfile, originalProfile);
  }

  /**
   * Validate that a diff can be applied to a profile
   */
  static validateDiff(profile: StoreProfile, diff: JsonDiff): boolean {
    try {
      const cloned = jsonPatch.deepClone(profile);
      const patchOperations = diff.operations.map((op) =>
        this.toJsonPatchOperation(op)
      );
      const result = jsonPatch.applyPatch(cloned, patchOperations, true);
      return result.newDocument !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get a human-readable summary of the diff
   */
  static getDiffSummary(diff: JsonDiff): string[] {
    return diff.operations.map((op) => {
      const pathParts = op.path.split('/').filter(Boolean);
      const target = pathParts.join(' > ');

      switch (op.op) {
        case 'add':
          return `Added: ${target}`;
        case 'remove':
          return `Removed: ${target}`;
        case 'replace':
          return `Changed: ${target}`;
        case 'move':
          return `Moved: ${op.from} → ${target}`;
        case 'copy':
          return `Copied: ${op.from} → ${target}`;
        default:
          return `${op.op}: ${target}`;
      }
    });
  }

  /**
   * Check if the diff is empty (no changes)
   */
  static isEmpty(diff: JsonDiff): boolean {
    return diff.operations.length === 0;
  }

  /**
   * Merge multiple diffs into one
   * Note: This is a simple concatenation, not a smart merge
   */
  static mergeDiffs(...diffs: JsonDiff[]): JsonDiff {
    return {
      operations: diffs.flatMap((d) => d.operations),
    };
  }

  /**
   * Filter diff operations by path prefix
   */
  static filterByPath(diff: JsonDiff, pathPrefix: string): JsonDiff {
    return {
      operations: diff.operations.filter((op) =>
        op.path.startsWith(pathPrefix)
      ),
    };
  }

  /**
   * Deep clone a profile
   */
  static cloneProfile(profile: StoreProfile): StoreProfile {
    return jsonPatch.deepClone(profile);
  }

  // ============ Private Helpers ============

  private static convertOperation(
    op: jsonPatch.Operation
  ): DiffOperation {
    const result: DiffOperation = {
      op: op.op as DiffOperation['op'],
      path: op.path,
    };

    if ('value' in op) {
      result.value = op.value;
    }
    if ('from' in op) {
      result.from = op.from;
    }

    return result;
  }

  private static toJsonPatchOperation(
    op: DiffOperation
  ): jsonPatch.Operation {
    switch (op.op) {
      case 'add':
        return { op: 'add', path: op.path, value: op.value };
      case 'remove':
        return { op: 'remove', path: op.path };
      case 'replace':
        return { op: 'replace', path: op.path, value: op.value };
      case 'move':
        return { op: 'move', path: op.path, from: op.from! };
      case 'copy':
        return { op: 'copy', path: op.path, from: op.from! };
      case 'test':
        return { op: 'test', path: op.path, value: op.value };
      default:
        throw new Error(`Unknown operation: ${op.op}`);
    }
  }
}
