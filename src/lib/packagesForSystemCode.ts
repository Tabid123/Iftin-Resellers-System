/** Restrict System Codes package choices to the selected provider/category.
 * Category is optional: without it, show all packages for that provider.
 * Inactive packages remain selectable so their delivery code can be set
 * before the package is activated for customers.
 */
export function packagesForSystemCode<T extends {
  provider_id: string | null;
  category_id: string | null;
}>(
  packages: readonly T[],
  providerId: string,
  categoryId: string,
): T[] {
  if (!providerId) return [];
  return packages.filter(pkg =>
    pkg.provider_id === providerId &&
    (!categoryId || pkg.category_id === categoryId)
  );
}
