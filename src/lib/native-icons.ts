import statIcons from '../data/native-stat-icons.json';
import { resolveAssetUrl } from './assets';

const stats: Record<string, string> = statIcons;
export function resolveStatIcon(label: string, nativeId?: string) {
  if (nativeId && stats[nativeId]) return resolveAssetUrl(stats[nativeId]);
  const value = label.toLowerCase();
  const element = /лакшан|lakshana/.test(value)
    ? 'Lakshana'
    : /космос|cosmos/.test(value)
      ? 'Cosmos'
      : /аним|anima/.test(value)
        ? 'Nature'
        : /псих|psyche/.test(value)
          ? 'Psyche'
          : /хаос|chaos/.test(value)
            ? 'Chaos'
            : /чар|инкантац|incantation/.test(value)
              ? 'Incantation'
              : '';
  const id = /крит.*урон|урон.*крит|crit.*(?:dmg|damage)/.test(value)
    ? 'icon_attri_baojishanghai'
    : /крит|crit/.test(value)
      ? 'icon_attri_baoji'
      : element
        ? `DamageUp${element}Base`
        : /атк|атак|\batk\b|attack/.test(value)
          ? 'icon_attri_gongji'
          : /защ|\bdef\b/.test(value)
            ? 'icon_attri_fangyu'
            : /(?:^|\s)оз(?:$|\s)|здоров|\bhp\b|жизн/.test(value)
              ? 'icon_attri_shengming'
              : /восстанов.*энерг|энерги|energy/.test(value)
                ? 'icon_costgainefficiency'
                : /лечен|исцел|heal/.test(value)
                  ? 'icon_healup'
                  : /разруш|брейк|break/.test(value)
                    ? 'icon_tenacitydestroyefficiency'
                    : /урон|лакшан|анима|космос|хаос|психик|чар|damage/.test(
                          value,
                        )
                      ? 'icon_damageup_white'
                      : 'icon_attri_count_up';
  return resolveAssetUrl(stats[id]);
}

export function resolveStatIcons(label: string) {
  return /крит.*шанс\s*\/\s*(?:крит[^/]*\s*)?урон|crit.*rate\s*\/.*(?:dmg|damage)/i.test(
    label,
  )
    ? [resolveStatIcon('Критический шанс'), resolveStatIcon('Критический урон')]
    : [resolveStatIcon(label)];
}
