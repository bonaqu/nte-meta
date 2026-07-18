import { seedData } from '../data/seed';
import type {
  AdminUser,
  AuditLogEntry,
  AppSettings,
  CharacterImportLookupResult,
  Comment,
  CommentReport,
  CommentReportReason,
  CommunityThread,
  EditorPermissions,
  LeakCandidate,
  LeakCandidateReviewStatus,
  LeakDiscoveryResult,
  LeakStatus,
  Role,
  SiteData,
  SystemStatus,
  User,
  UserWarning,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
let sessionToken = '';

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };
export type ReactionSummary = {
  likes: number;
  dislikes: number;
  useful: number;
  active: Array<'like' | 'dislike' | 'useful'>;
};
export type AuthConfig = {
  registrationEnabled: boolean;
  needsBootstrap: boolean;
};

export function hasApiBase() {
  return API_BASE.length > 0;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  if (!API_BASE) {
    return {
      ok: false,
      error: 'API не настроен. Укажите VITE_API_BASE_URL.',
      status: 0,
    };
  }

  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (sessionToken) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: T;
      error?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: payload.error || `Ошибка API ${response.status}`,
        status: response.status,
      };
    }

    return {
      ok: true,
      data: (Object.hasOwn(payload, 'data') ? payload.data : payload) as T,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Не удалось выполнить запрос',
      status: 0,
    };
  }
}

async function loadCollection<T>(
  path: string,
  fallback: T,
  options: { optional?: boolean } = {},
): Promise<T> {
  const result = await request<T>(path);
  if (result.ok) return result.data;
  if (API_BASE && !options.optional) {
    throw new Error(`${path}: ${result.error}`);
  }
  return fallback;
}

export async function loadSiteData(
  options: { includePrivate?: boolean } = {},
): Promise<SiteData> {
  if (!API_BASE) {
    return seedData;
  }

  const [
    characters,
    guides,
    rotations,
    tierlists,
    teams,
    news,
    leaks,
    threads,
    comments,
    sources,
  ] = await Promise.all([
    loadCollection('/api/characters', seedData.characters),
    loadCollection('/api/guides', seedData.guides),
    loadCollection('/api/rotations', seedData.rotations),
    loadCollection('/api/tierlists', seedData.tierlists),
    loadCollection('/api/teams', seedData.teams),
    loadCollection('/api/news', seedData.news),
    loadCollection('/api/leaks', seedData.leaks),
    loadCollection('/api/threads', seedData.threads),
    loadCollection(
      '/api/comments?targetType=site&targetId=home',
      seedData.comments,
    ),
    options.includePrivate
      ? loadCollection('/api/sources', seedData.sources, { optional: true })
      : Promise.resolve([]),
  ]);

  return {
    ...seedData,
    characters,
    guides,
    rotations,
    tierlists,
    teams,
    news,
    leaks,
    threads,
    comments,
    sources,
  };
}

export async function loadEntityCollection<T>(path: string) {
  return request<T[]>(path);
}

export async function login(username: string, password: string) {
  const result = await request<{ token: string; user: User }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
  );

  if (result.ok) {
    sessionToken = result.data.token;
  }

  return result;
}

export async function register(
  username: string,
  password: string,
  confirmPassword: string,
  bootstrapToken?: string,
) {
  const result = await request<{ token: string; user: User }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        confirmPassword,
        bootstrapToken,
      }),
    },
  );

  if (result.ok) {
    sessionToken = result.data.token;
  }

  return result;
}

export async function logout() {
  const result = await request<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
  sessionToken = '';
  return result;
}

export async function me() {
  return request<User | null>('/api/auth/me');
}

export async function loadAuthConfig() {
  return request<AuthConfig>('/api/auth/config');
}

export async function updateProfile(displayName: string) {
  return request<User>('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

export async function changePassword(
  currentPassword: string,
  nextPassword: string,
  nextConfirm: string,
) {
  const result = await request<{ success: boolean }>(
    '/api/auth/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, nextPassword, nextConfirm }),
    },
  );
  if (result.ok) {
    sessionToken = '';
  }
  return result;
}

export async function loadComments(
  targetType: Comment['targetType'],
  targetId: string,
  sort: 'new' | 'popular' = 'new',
) {
  return request<Comment[]>(
    `/api/comments?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}&sort=${sort}`,
  );
}

export async function createComment(
  targetType: Comment['targetType'],
  targetId: string,
  body: string,
  parentId?: string,
) {
  return request<Comment>('/api/comments', {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, body, parentId }),
  });
}

export async function updateComment(
  id: string,
  payload: {
    body?: string;
    status?: Comment['status'];
    isPinned?: boolean;
    isAnswer?: boolean;
  },
) {
  return request<{ success: boolean }>(`/api/comments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteComment(id: string) {
  return request<{ success: boolean }>(`/api/comments/${id}`, {
    method: 'DELETE',
  });
}

export async function loadModerationComments() {
  return request<Comment[]>('/api/comments');
}

export async function createCommentReport(
  commentId: string,
  reason: CommentReportReason,
  details = '',
) {
  return request<CommentReport>('/api/comment-reports', {
    method: 'POST',
    body: JSON.stringify({ commentId, reason, details }),
  });
}

export async function loadCommentReports() {
  return request<CommentReport[]>('/api/comment-reports');
}

export async function updateCommentReport(
  id: string,
  status: CommentReport['status'],
) {
  return request<{ success: boolean }>(`/api/comment-reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function loadUsers() {
  return request<AdminUser[]>('/api/users');
}

export async function loadAuditLog() {
  return request<AuditLogEntry[]>('/api/audit-log');
}

export async function updateUserRole(id: string, role: Role) {
  return request<{ success: boolean }>(`/api/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function updateEditorPermissions(
  id: string,
  permissions: EditorPermissions,
) {
  return request<EditorPermissions>(`/api/users/${id}/editor-permissions`, {
    method: 'PATCH',
    body: JSON.stringify(permissions),
  });
}

export async function updateUserStatus(
  id: string,
  status: 'active' | 'disabled',
) {
  return request<{ success: boolean }>(`/api/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function createUserWarning(userId: string, reason: string) {
  return request<{ id: string }>(`/api/users/${userId}/warnings`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function loadMyWarnings() {
  return request<UserWarning[]>('/api/auth/warnings');
}

export async function loadWarnings() {
  return request<UserWarning[]>('/api/warnings');
}

export async function updateWarningStatus(
  id: string,
  status: 'active' | 'dismissed',
) {
  return request<{ success: boolean }>(`/api/warnings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function loadSystemStatus() {
  return request<SystemStatus>('/api/system/status');
}

export async function lookupCharacterInfo(query: string) {
  return request<CharacterImportLookupResult>('/api/character-import/lookup', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function lookupGuideInfo(payload: {
  guideId?: string;
  query?: string;
}) {
  return request<CharacterImportLookupResult>('/api/guide-import/lookup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loadLeakCandidates() {
  return request<LeakCandidate[]>('/api/leak-candidates');
}

export async function discoverLeakCandidates(query = '') {
  return request<LeakDiscoveryResult>('/api/leak-candidates/discover', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function submitLeakCandidate(payload: {
  title: string;
  sourceUrl: string;
  sourceName?: string;
  note?: string;
  status: LeakStatus;
}) {
  return request<LeakCandidate>('/api/leak-candidates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function reviewLeakCandidate(
  id: string,
  reviewStatus: Exclude<LeakCandidateReviewStatus, 'accepted'>,
) {
  return updateLeakCandidateEditorial(id, { reviewStatus });
}

export async function updateLeakCandidateEditorial(
  id: string,
  payload: {
    reviewStatus?: Exclude<LeakCandidateReviewStatus, 'accepted'>;
    suggestedStatus?: LeakStatus;
    trustLevel?: 'низкий' | 'средний' | 'высокий';
    translationStatus?: LeakCandidate['translationStatus'];
    editorNote?: string;
  },
) {
  return request<{ success: boolean }>(
    `/api/leak-candidates/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function promoteLeakCandidate(id: string) {
  return request<{ leakId: string; slug: string }>(
    `/api/leak-candidates/${encodeURIComponent(id)}/promote`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function loadThreads() {
  return request<CommunityThread[]>('/api/threads');
}

export async function deleteUser(id: string) {
  return request<{ success: boolean }>(`/api/users/${id}`, {
    method: 'DELETE',
  });
}

export async function loadSettings() {
  return request<AppSettings>('/api/settings');
}

export async function updateSettings(settings: AppSettings) {
  return request<{ success: boolean }>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function loadReactionSummary(
  targetType: string,
  targetId: string,
) {
  return request<ReactionSummary>(
    `/api/reactions?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
  );
}

export async function sendReaction(
  targetType: string,
  targetId: string,
  reactionType: 'like' | 'dislike' | 'useful',
) {
  return request<ReactionSummary>('/api/reactions', {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, reactionType }),
  });
}

export async function removeReaction(
  targetType: string,
  targetId: string,
  reactionType: 'like' | 'dislike' | 'useful',
) {
  return request<ReactionSummary>(
    `/api/reactions?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}&reactionType=${encodeURIComponent(reactionType)}`,
    { method: 'DELETE' },
  );
}

export async function saveEntity<T>(
  path: string,
  payload: unknown,
  method: 'POST' | 'PATCH' = 'POST',
) {
  return request<T>(path, {
    method,
    body: JSON.stringify(payload),
  });
}

export async function deleteEntity(path: string) {
  return request<{ success: boolean }>(path, { method: 'DELETE' });
}
