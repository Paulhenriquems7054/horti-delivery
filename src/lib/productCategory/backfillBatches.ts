/**
 * Particionamento determinístico de assignments para execução em lotes.
 */
import type { BackfillAssignment } from "./categoryBackfill";

export function chunkBackfillAssignments(
  assignments: BackfillAssignment[],
  batchSize: number,
): BackfillAssignment[][] {
  if (batchSize <= 0) throw new Error("batchSize must be > 0");
  const chunks: BackfillAssignment[][] = [];
  for (let i = 0; i < assignments.length; i += batchSize) {
    chunks.push(assignments.slice(i, i + batchSize));
  }
  return chunks;
}

export function assertNoDuplicateProductIds(assignments: BackfillAssignment[]): boolean {
  const seen = new Set<string>();
  for (const a of assignments) {
    if (seen.has(a.productId)) return false;
    seen.add(a.productId);
  }
  return true;
}
