/**
 * Which students the sibling picker must NOT offer.
 *
 * Only students who actually hold a row in the family group are already linked,
 * and only those are hidden. The `!familyGroupId` guard therefore returns an
 * empty list: a student with no family excludes nobody.
 *
 * That guard used to carry more weight. When the app also surfaced phone-matched
 * "suspected" groups, `members` could be full while `familyGroupId` was null,
 * and excluding those members filtered out the exact siblings staff had opened
 * the picker to link. The detection is gone, so the case is now simply "no
 * family yet" — but the guard stays, because it is what makes that correct.
 *
 * Shared by the desktop family panel and the phone family tab so the two
 * surfaces cannot drift.
 */
export function resolveSiblingPickerExclusions(payload: {
  familyGroupId: string | null;
  members: ReadonlyArray<{ id: string }>;
}): string[] {
  if (!payload.familyGroupId) {
    return [];
  }

  return payload.members.map((member) => member.id);
}
