export type Role = 'owner' | 'admin' | 'moderator' | 'editor' | 'user';

export type PublishStatus =
  | 'draft'
  | 'published'
  | 'archived'
  | 'pending_review';

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

export type LeakStatus = 'слух' | 'слив' | 'подтверждено' | 'опровергнуто';

export type TrustLevel = 'низкий' | 'средний' | 'высокий';

export type EditorGrade = 'junior' | 'editor' | 'senior' | 'lead';
export type ContentScope =
  | 'characters'
  | 'guides'
  | 'tierlists'
  | 'news'
  | 'leaks';
export type ContentAction = 'create' | 'edit' | 'publish' | 'delete';

export interface EditorPermissions {
  grade: EditorGrade;
  scopes: ContentScope[];
  canCreate: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
}

export interface CharacterVoiceActor {
  language: 'Русский' | 'Английский' | 'Японский' | 'Корейский' | 'Китайский';
  name: string;
}

export interface CharacterMaterial {
  id: string;
  name: string;
  iconUrl: string;
  amount: string;
  source: string;
}

export interface CharacterAbility {
  id: string;
  name: string;
  type: string;
  iconUrl: string;
  description: string;
}

export interface CharacterStat {
  id: string;
  label: string;
  value: string;
}

export interface CharacterSkin {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
}

export interface CharacterFriendshipLevel {
  level: number;
  rewardName: string;
  rewardIconUrl: string;
  description: string;
  rewards?: CharacterFriendshipReward[];
}

export interface CharacterFriendshipReward {
  id: string;
  name: string;
  quantity: string;
  iconUrl: string;
}

export interface CharacterGift {
  id: string;
  name: string;
  iconUrl: string;
  effect: string;
}

export interface CharacterVoiceLine {
  id: string;
  title: string;
  language: 'Английский' | 'Японский' | 'Корейский' | 'Китайский';
  audioUrl: string;
  sourceUrl?: string;
  description?: string;
}

export interface CharacterRoleIcon {
  name: string;
  iconUrl: string;
}

export interface CharacterAwakening {
  level: number;
  name: string;
  iconUrl: string;
  description: string;
}

export interface CharacterProfile {
  faction: string;
  arcType: string;
  birthday: string;
  releaseDate: string;
  biographyShort: string;
  biography: string;
  trivia: string;
  roleTags: string[];
  roleIcons?: CharacterRoleIcon[];
  voiceActors: CharacterVoiceActor[];
  materials: CharacterMaterial[];
  baseStats: CharacterStat[];
  abilities: CharacterAbility[];
  skins: CharacterSkin[];
  friendship: CharacterFriendshipLevel[];
  gifts: CharacterGift[];
  voiceLines: CharacterVoiceLine[];
  awakenings: CharacterAwakening[];
}

export interface Character {
  id: string;
  slug: string;
  name: string;
  originalName: string;
  rarity: 'S' | 'A';
  role: string;
  type: string;
  attribute: string;
  imageUrl: string;
  splashUrl: string;
  shortDescription: string;
  summary: string;
  tags: string[];
  profile?: CharacterProfile;
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
  rotationSteps?: string[];
  guideId?: string;
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
  kind: 'base';
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

export type LeakCandidateReviewStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'duplicate';

export interface LeakCandidateEvidence {
  sourceName: string;
  sourceUrl: string;
  sourceType: LeakCandidate['sourceType'];
  language: LeakCandidate['language'];
  trustLevel: TrustLevel;
  publishedAt?: string;
}

export interface LeakCandidate {
  id: string;
  origin: 'discovery' | 'user';
  sourceName: string;
  sourceUrl: string;
  sourceType:
    | 'telegram'
    | 'reddit'
    | 'website'
    | 'bilibili'
    | 'weibo'
    | 'twitter/x'
    | 'manual';
  language: 'ru' | 'en' | 'zh' | 'unknown';
  title: string;
  excerpt: string;
  authorName?: string;
  submitterName?: string;
  publishedAt?: string;
  trustLevel: TrustLevel;
  suggestedStatus: LeakStatus;
  confidenceScore: number;
  reviewStatus: LeakCandidateReviewStatus;
  translationStatus: 'не требуется' | 'нужен перевод' | 'переведено' | 'проверено';
  editorNote?: string;
  evidence?: LeakCandidateEvidence[];
  createdLeakId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LeakDiscoverySource {
  id: string;
  name: string;
  url: string;
  type: LeakCandidate['sourceType'];
  language: LeakCandidate['language'];
  trustLevel: TrustLevel;
  status: 'ok' | 'partial' | 'blocked' | 'failed' | 'timeout' | 'manual';
  message: string;
  foundCount: number;
}

export interface LeakDiscoveryResult {
  discoveredCount: number;
  candidates: LeakCandidate[];
  sources: LeakDiscoverySource[];
}

export interface CommunityThread {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  author: string;
  authorId?: string;
  status: 'open' | 'closed' | 'hidden';
  tags: string[];
  createdAt: string;
  updatedAt?: string;
  commentsCount?: number;
  score?: number;
}

export interface CharacterImportSource {
  id: string;
  name: string;
  url: string;
  trust: 'official' | 'high' | 'medium' | 'low';
  status: 'ok' | 'partial' | 'blocked' | 'failed';
  message?: string;
}

export interface CharacterImportSuggestion {
  id: string;
  field: string;
  label: string;
  value: string;
  sourceName: string;
  sourceUrl: string;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
  agreementCount?: number;
  variantCount?: number;
  qualityFlags?: Array<
    'consensus' | 'conflict' | 'media' | 'translated' | 'incomplete'
  >;
}

export interface CharacterImportLookupResult {
  found: boolean;
  message: string;
  sources: CharacterImportSource[];
  suggestions: CharacterImportSuggestion[];
  fields: Record<string, string>;
  coverage?: {
    readyFields: string[];
    reviewFields: string[];
    missingFields: string[];
  };
}

export interface Comment {
  id: string;
  userId?: string;
  targetType:
    | 'guide'
    | 'character'
    | 'news'
    | 'leak'
    | 'comment'
    | 'site'
    | 'thread';
  targetId: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  score: number;
  reactions?: {
    likes: number;
    dislikes: number;
    useful: number;
  };
  activeReactions?: Array<'like' | 'dislike' | 'useful'>;
  status?: 'visible' | 'moderated' | 'deleted';
  parentId?: string;
  isPinned?: boolean;
  isAnswer?: boolean;
}

export type CommentReportReason =
  | 'spam'
  | 'abuse'
  | 'misinformation'
  | 'off_topic'
  | 'other';

export interface CommentReport {
  id: string;
  commentId: string;
  reporterId: string;
  reporterName: string;
  commentAuthor: string;
  commentBody: string;
  targetType: Comment['targetType'];
  targetId: string;
  reason: CommentReportReason;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  reviewedAt?: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  editorPermissions?: EditorPermissions;
}

export interface AdminUser extends User {
  status: 'active' | 'disabled' | 'deleted';
  createdAt: string;
  lastLoginAt?: string;
}

export interface UserWarning {
  id: string;
  userId?: string;
  userName?: string;
  reason: string;
  note?: string;
  moderatorName: string;
  createdAt: string;
  status?: 'active' | 'dismissed';
}

export interface SystemStatus {
  api: 'ok';
  d1: 'ok';
  generatedAt: string;
  counts: {
    users: number;
    characters: number;
    guides: number;
    news: number;
    leaks: number;
    threads: number;
  };
  migrations: {
    latestKnown: string;
  };
  migrationState?: string;
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
  comments: Comment[];
  sources: Source[];
  threads: CommunityThread[];
}
