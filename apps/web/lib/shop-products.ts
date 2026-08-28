/**
 * The curated certification shelf, in display order. This const is the whole
 * merchandising surface: edit it to change what /shop shows. Ids are
 * CarePortals product `_id`s; see them all with
 * `curl -H 'organization: joicehealth_com' https://public-api.portals.care/v2/products`.
 * Disabled products and unknown ids are dropped at render, so a stale entry
 * degrades to "not shown", never to a broken page.
 */
export const SHOP_PRODUCT_IDS: readonly string[] = [
  '6a7a18253c411544080c25ba', // GHK-CU Biocosmetic Cream, 1 month / 30mL, $88
  '6a7a18a99d94da87b1d1d956', // Glutathione Injectable, 1 month / 6000mg / 30mL, $68
  '6a7a18a99d94da87b1d1d95a', // Lipo-B (B12 / MIC) Injectable, 1 month / 10mL, $114
  '6a7a18a99d94da87b1d1d958', // NAD+ Injectable, 1 month / 10mL, $196
  '6a7a198c9d94da87b1d1d992', // Naltrexone Capsules, 1 month / 30 capsules, $28
  '6a7a1d139d94da87b1d1da37', // PT-141 Nasal Spray For Men, $128
  '6a7a19c69d94da87b1d1d9a1', // PT-141 Nasal Spray For Women, $128
  '6a6cadd7b68fb8c53595be30', // Sermorelin Injectable, 6 weeks / 15mg / 5mL, $78
  '6a6cadd7b68fb8c53595be32', // Tesamorelin Injectable, 6 weeks / 24mg / 3mL, $198
  '6a847e8f0537e0d78a3a0980', // Tirzepatide/B12, Standard (Rung 3), $248
];
