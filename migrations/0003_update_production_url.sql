UPDATE settings
SET value_json = '{"canonical":"https://bonaqu.github.io/nte-meta/","description":"Русскоязычный meta-hub по Neverness to Everness"}',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'seo';
