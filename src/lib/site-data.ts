import type { Character, Guide, SiteData, Tier } from '../types';

export const tierOrder: Tier[] = ['S+', 'S', 'A', 'B', 'C'];

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
  return getCharacter(data, guide.characterId);
}

export function groupTierItems(data: SiteData, kind: 'base' | 'premium') {
  const tierlist =
    data.tierlists.find((item) => item.kind === kind) || data.tierlists[0];
  const grouped = Object.fromEntries(
    tierOrder.map((tier) => [tier, [] as Character[]]),
  ) as Record<Tier, Character[]>;

  tierlist?.items.forEach((item) => {
    const character = getCharacter(data, item.characterId);
    if (character) {
      grouped[item.tier].push(character);
    }
  });

  return { tierlist, grouped };
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
