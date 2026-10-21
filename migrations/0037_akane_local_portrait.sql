-- Replace only the exact inaccessible Fandom portrait; preserve editor uploads.
UPDATE characters SET image_url='/nte-meta/game-assets/58a99ea41891587f5e38.webp'
WHERE id='akane' AND instr(image_url,'https://static.wikia.nocookie.net/neverness-to-everness/images/a/a3/')=1;
