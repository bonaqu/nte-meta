import dictionary from '../data/native-item-descriptions.json';

export type ItemDescription = {
  name: string;
  description: string;
  usage: string;
  type?: string;
  rarity?: number;
};
const entries: Record<string, ItemDescription> = dictionary.byId;
const names: Record<string, string> = dictionary.byName;
const aliases: Record<string, string> = dictionary.aliases;
export function findItemDescription(id: string, name: string) {
  const key = id.toLowerCase();
  const normalized = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  return entries[aliases[key]] || entries[key] || entries[names[normalized]];
}
