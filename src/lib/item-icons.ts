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
