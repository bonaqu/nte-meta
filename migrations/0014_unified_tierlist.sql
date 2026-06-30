-- Product model: one editorial tier-list only. Keep old premium rows archived
-- for data safety, but remove C0/C6 wording from the published surface.

UPDATE tierlists
SET
  title = 'Единый тир-лист NTE Meta',
  slug = CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM tierlists AS existing
      WHERE existing.slug = 'nte-meta-tier-list'
        AND existing.id != tierlists.id
    )
    THEN 'nte-meta-tier-list'
    ELSE slug
  END,
  tierlist_type = 'base',
  status = 'published',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'tier-base-10'
   OR slug IN ('base-c0-10', 'nte-meta-tier-list');

UPDATE tierlists
SET
  title = 'Архивный premium tier-list',
  status = 'archived',
  updated_at = CURRENT_TIMESTAMP
WHERE tierlist_type = 'premium';
