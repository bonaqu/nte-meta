import itemIcons from '../data/native-item-icons.json';
import { resolveAssetUrl } from './assets';
const names: Record<string, string> = itemIcons;
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
