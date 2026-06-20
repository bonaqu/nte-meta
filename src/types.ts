export type Role = 'owner' | 'admin' | 'moderator' | 'editor' | 'user';

export type PublishStatus =
  | 'draft'
  | 'published'
  | 'archived'
  | 'pending_review';

export type Tier = 'S+' | 'S' | 'A' | 'B' | 'C';

export type LeakStatus = 'слух' | 'слив' | 'подтверждено' | 'опровергнуто';

export type TrustLevel = 'низкий' | 'средний' | 'высокий';

export interface Character {
  id: string;
  slug: string;
  name: string;
  originalName: string;
  rarity: 'S' | 'A' | 'Нулевой';
  role: string;
  type: string;
  attribute: string;
  tier: Tier;
  premiumTier: Tier;
  imageUrl: string;
  splashUrl: string;
  shortDescription: string;
  summary: string;
  tags: string[];
  status?: Exclude<PublishStatus, 'pending_review'>;
  patch?: string;
  updatedAt: string;
}

export interface GuideSection {
  id: string;
  title: string;
  type: string;
  content: string;
  position: number;
}

export interface Rotation {
  id: string;
  guideId?: string;
  characterId: string;
  title: string;
  type: string;
  purpose: string;
  steps: string[];
  logic: string;
  mediaUrl?: string;
  status?: Exclude<PublishStatus, 'pending_review'>;
  updatedAt?: string;
}

export interface TeamMember {
  characterId: string;
  role: string;
}

export interface Team {
  id: string;
  slug?: string;
  title: string;
  type: string;
  budget: 'F2P' | 'Premium' | 'Mixed';
  difficulty: string;
  power: number;
  goodAt: string;
  weakAt: string;
  synergy: string;
  rotation: string;
  members: TeamMember[];
  status?: Exclude<PublishStatus, 'pending_review'>;
  updatedAt?: string;
}

export interface Guide {
  id: string;
  slug: string;
  characterId: string;
  title: string;
  summary: string;
  status: PublishStatus;
  patch: string;
  author: string;
  updatedAt: string;
  videoUrl?: string;
  transcript?: string;
  sections: GuideSection[];
  rotations: Rotation[];
}

export interface TierListItem {
  characterId: string;
  tier: Tier;
  note: string;
}

export interface TierList {
  id: string;
  slug?: string;
  title: string;
  kind: 'base' | 'premium';
  patch: string;
  updatedAt: string;
  items: TierListItem[];
  changelog: string[];
  status?: Exclude<PublishStatus, 'pending_review'>;
}

export interface NewsItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  date: string;
  author: string;
  category: string;
  sourceName?: string;
  sourceUrl?: string;
  imageUrl: string;
  tags: string[];
  publishStatus?: PublishStatus;
  updatedAt?: string;
}

export interface LeakItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  date: string;
  trustLevel: TrustLevel;
  status: LeakStatus;
  sourceName: string;
  sourceUrl?: string;
  approved: boolean;
  tags: string[];
  approvedAt?: string;
  updatedAt?: string;
}

export interface VideoGuide {
  id: string;
  title: string;
  youtubeUrl: string;
  description: string;
  publishedAt: string;
  characterIds: string[];
  teamIds: string[];
  timestamps: { label: string; time: string }[];
}

export interface Comment {
  id: string;
  userId?: string;
  targetType: 'guide' | 'news' | 'leak' | 'comment' | 'site';
  targetId: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  score: number;
  status?: 'visible' | 'moderated' | 'deleted';
  parentId?: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface AdminUser extends User {
  status: 'active' | 'disabled' | 'deleted';
  createdAt: string;
  lastLoginAt?: string;
}

export interface UserWarning {
  id: string;
  reason: string;
  moderatorName: string;
  createdAt: string;
}

export interface AppSettings {
  site: {
    title: string;
    language: 'ru';
    registrationEnabled: boolean;
    leaksRequireApproval: boolean;
  };
  seo: {
    canonical: string;
    description: string;
  };
}

export interface Source {
  id: string;
  sourceType: 'telegram' | 'website' | 'youtube' | 'twitter/x' | 'manual';
  sourceName: string;
  sourceUrl: string;
  trustLevel: TrustLevel;
  autoImportEnabled: boolean;
  lastCheckedAt?: string;
  updatedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  user_id?: string;
  action: string;
  target_id?: string;
  details_json: string;
  created_at: string;
}

export interface SiteData {
  characters: Character[];
  guides: Guide[];
  rotations: Rotation[];
  tierlists: TierList[];
  teams: Team[];
  news: NewsItem[];
  leaks: LeakItem[];
  videos: VideoGuide[];
  comments: Comment[];
  sources: Source[];
}
