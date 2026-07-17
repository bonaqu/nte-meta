-- Migration 0022 intentionally used guarded seed replacements, but its markdown
-- line breaks were stored as the two literal characters "\\n". Normalize only
-- those known Hotori guide sections to real line feeds.

UPDATE guide_sections
SET
  content_markdown = replace(content_markdown, char(92) || 'n', char(10)),
  updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  'hotori-guide-builds-0012',
  'hotori-guide-teams-0012',
  'hotori-guide-rotations-0012',
  'hotori-guide-mistakes-0012'
)
  AND instr(content_markdown, char(92) || 'n') > 0;
