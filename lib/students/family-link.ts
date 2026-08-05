/**
 * Which students the sibling picker must NOT offer.
 *
 * Only confirmed members — students who actually hold a row in the family
 * group — are already linked and therefore hidden. A "suspected" group is a
 * phone match and nothing more: hiding those students filtered out the exact
 * siblings staff had opened the picker to link, so the list looked as if it had
 * silently dropped them.
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
