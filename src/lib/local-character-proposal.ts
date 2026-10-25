import type { CharacterProfile } from '../types';

export type Proposal = {
  ownerId: string;
  name: string;
  originalName: string;
  slug: string;
  imageUrl: string;
  splashUrl: string;
  profile: CharacterProfile;
};
export function validProposal(value: unknown): value is Proposal {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (
    !['ownerId', 'name', 'originalName', 'slug', 'imageUrl', 'splashUrl'].every(
      (k) => typeof r[k] === 'string' && r[k].length <= 4000,
    )
  )
    return false;
  if (!r.profile || typeof r.profile !== 'object' || Array.isArray(r.profile))
    return false;
  const p = r.profile as Record<string, unknown>;
  if (
    !['biographyShort', 'biography', 'arcType'].every(
      (k) => p[k] === undefined || typeof p[k] === 'string',
    )
  )
    return false;
  if (
    p.roleTags !== undefined &&
    (!Array.isArray(p.roleTags) ||
      p.roleTags.length > 30 ||
      !p.roleTags.every((s) => typeof s === 'string'))
  )
    return false;
  return ['abilities', 'awakenings', 'skins', 'voiceLines'].every(
    (k) =>
      p[k] === undefined ||
      (Array.isArray(p[k]) &&
        p[k].length <= 500 &&
        p[k].every(
          (item) => item && typeof item === 'object' && !Array.isArray(item),
        )),
  );
}
