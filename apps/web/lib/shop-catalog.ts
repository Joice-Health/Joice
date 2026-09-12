/**
 * The curated catalogue moved to @joice/utils (epic 285): the companion's
 * catalogue tool sells from the same map, so the data lives where both apps
 * can import it. This re-export keeps every web call site untouched; edit
 * curation in packages/utils/src/shop-catalog.ts.
 */
export {
  SHOP_CATALOG,
  catalogEntriesByArea,
  catalogEntryBySlug,
  catalogImage,
  type CatalogEntry,
} from '@joice/utils';
