import type { Character, Guide, SiteData, Tier } from '../types';

export const tierOrder: Tier[] = ['S', 'A', 'B', 'C', 'D'];

export function normalizeTier(value: string): Tier {
  return tierOrder.includes(value as Tier) ? (value as Tier) : 'S';
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

export function getCharacter(data: SiteData, id: string) {
  return data.characters.find(
    (character) => character.id === id || character.slug === id,
  );
}

export function getGuideCharacter(data: SiteData, guide: Guide) {
  const direct = getCharacter(data, guide.characterId);
  if (direct) return direct;

  const guideText = normalizeSearchText(
    [guide.characterId, guide.slug, guide.title].join(' '),
  );
  return data.characters.find((character) => {
    const candidates = [character.id, character.slug, character.name, character.originalName]
      .map(normalizeSearchText)
      .filter(Boolean);
    return candidates.some((candidate) => candidate && guideText.includes(candidate));
  });
}

export function getGuideForCharacter(data: SiteData, character: Character) {
  const characterCandidates = [
    character.id,
    character.slug,
    character.name,
    character.originalName,
  ]
    .map(normalizeSearchText)
    .filter(Boolean);

  return data.guides.find((guide) => {
    if (guide.characterId === character.id || guide.characterId === character.slug) {
      return true;
    }
    const guideText = normalizeSearchText(
      [guide.characterId, guide.slug, guide.title].join(' '),
    );
    return characterCandidates.some(
      (candidate) => candidate && guideText.includes(candidate),
    );
  });
}

export function getUnifiedTierList(data: SiteData) {
  return (
    data.tierlists.find(
      (item) => item.kind === 'base' && item.status !== 'archived',
    ) ||
    data.tierlists.find((item) => item.status !== 'archived') ||
    data.tierlists[0]
  );
}

export function groupTierItems(data: SiteData) {
  const tierlist = getUnifiedTierList(data);
  const grouped = Object.fromEntries(
    tierOrder.map((tier) => [tier, [] as Character[]]),
  ) as Record<Tier, Character[]>;

  tierlist?.items.forEach((item) => {
    const character = getCharacter(data, item.characterId);
    if (character) {
      grouped[normalizeTier(item.tier)].push(character);
    }
  });

  return { tierlist, grouped };
}

export function getCharacterTierPlacement(data: SiteData, characterId: string) {
  const tierlist = getUnifiedTierList(data);
  const itemIndex = tierlist?.items.findIndex(
    (item) => item.characterId === characterId,
  );

  if (!tierlist || itemIndex === undefined || itemIndex < 0) {
    return null;
  }

  const item = tierlist.items[itemIndex];
  const tier = normalizeTier(item.tier);
  const position =
    tierlist.items
      .slice(0, itemIndex + 1)
      .filter((candidate) => normalizeTier(candidate.tier) === tier).length || 1;

  return {
    tier,
    position,
    note: item.note,
    patch: tierlist.patch,
    updatedAt: tierlist.updatedAt,
  };
}

export function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU');
}

export function getCharacterSearchText(character: Character) {
  return normalizeSearchText(
    [
      character.name,
      character.originalName,
      character.role,
      character.type,
      character.attribute,
      character.rarity,
      character.tier,
      character.premiumTier,
      character.tags.join(' '),
      character.profile?.faction || '',
      character.profile?.roleTags.join(' ') || '',
      character.profile?.biographyShort || '',
    ].join(' '),
  );
}
