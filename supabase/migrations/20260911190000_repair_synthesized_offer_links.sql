-- Repair only synthesized item URLs introduced for catalog offers; preserve prices and evidence.
update public.commercial_watchlist
set preview=jsonb_set(preview,'{url}',to_jsonb('https://www.mercadolivre.com.br/p/'||(preview->>'catalog_product_id')||'?pdp_filters=item_id%3A'||(preview->>'offer_item_id')||'#wid='||(preview->>'offer_item_id')))
where preview->>'catalog_product_id' ~ '^MLB[0-9]+$'
 and preview->>'offer_item_id' ~ '^MLB[0-9]+$'
 and preview->>'url'='https://produto.mercadolivre.com.br/MLB-'||substring(preview->>'offer_item_id' from 4)||'-_JM';
