import itemIcons from '../data/native-item-icons.json';
import nativeItems from '../data/native-items.json';
import { resolveAssetUrl } from './assets';
const names: Record<string, string> = itemIcons;
const catalog: Record<string, { name: string; iconUrl: string }> = nativeItems;
export function resolveNativeItem<
  T extends { id: string; name: string; iconUrl: string },
>(item: T): T {
  const native =
    catalog[item.id.toLowerCase()] || catalog[item.name.toLowerCase()];
  return native
    ? {
        ...item,
        name:
          !item.name || /^food_\d+$/i.test(item.name) ? native.name : item.name,
        iconUrl: item.iconUrl || native.iconUrl,
      }
    : item;
}
/** Only proven native aliases share identity; a shared texture is not enough. */
export function nativeGiftIdentity(id: string, name: string) {
  const key = id.toLowerCase();
  const label = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  if (
    key === 'specialgift_letter' ||
    ['рукописноеписьмо', 'письмонаписанноеотруки'].includes(label)
  )
    return 'specialgift_letter';
  return /^food_\d+$/.test(key) ? `food_${Number(key.split('_')[1])}` : key;
}
export function displayItemName(name: string) {
  return name === 'Показушное платье с рукавами'
    ? 'Подол платья тщеславия'
    : name;
}
export function resolveItemIcon(name: string, current = '') {
  // A supplied custom image always wins; the registry fills missing images.
  return resolveAssetUrl(
    current ||
      names[
        name
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]/gu, '')
      ],
  );
}
