/**
 * In-memory hand-off for the selected category between CategorySelection and
 * DataPackages. Router state can be empty on the first render after navigation,
 * which briefly showed the "all categories" (brand) view before the real
 * category view. This keeps the intent available immediately, without URLs.
 */
type CategoryIntent = { id: string; name: string } | null;

let intent: CategoryIntent = null;

export function setCategoryIntent(id: string, name: string) {
  intent = { id, name };
}

export function getCategoryIntent(): CategoryIntent {
  return intent;
}

export function clearCategoryIntent() {
  intent = null;
}
