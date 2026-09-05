/**
 * Splits a typed search query into words. Used so a search only needs to
 * *contain* every typed word somewhere, rather than matching the whole typed
 * string as one literal substring — "1102 Series Flat Beam 23 Hole" should
 * still find "1102 Series Flat Beam (23 Hole, 184mm Length) - 2 Pack" even
 * though the stored name has punctuation the user didn't type.
 */
export function tokenizeQuery(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean);
}
