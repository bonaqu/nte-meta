import React, {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Archive,
  BadgeCheck,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  ClipboardList,
  Gamepad2,
  Flag,
  GripVertical,
  Headphones,
  Home,
  ImageIcon,
  ListFilter,
  Link2,
  LockKeyhole,
  LogOut,
  Menu,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Newspaper,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  Play,
  Reply,
  RotateCw,
  Search,
  Settings,
  ShieldCheck,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserCircle,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  EmptyState,
  SectionHeader,
  SkeletonGrid,
  StatusBanner,
} from './components/ui-state';
import { emptySiteData, seedData } from './data/seed';
import {
  changePassword,
  createComment,
  createCommentReport,
  createUserWarning,
  deleteComment,
  deleteEntity,
  deleteUser,
  hasApiBase,
  loadAuthConfig,
  loadComments,
  loadCommentReports,
  loadAuditLog,
  loadModerationComments,
  loadMyWarnings,
  loadReactionSummary,
  loadSettings,
  loadSiteData,
  loadSources,
  loadSystemStatus,
  loadUsers,
  loadWarnings,
  login,
  lookupGuideInfo,
  logout,
  me,
  register,
  removeReaction,
  saveEntity,
  sendReaction,
  updateComment,
  updateCommentReport,
  updateProfile,
  updateSettings,
  updateEditorPermissions,
  updateUserStatus,
  updateUserRole,
  updateWarningStatus,
} from './lib/api';
import type { ReactionSummary } from './lib/api';
import { MarkdownPreview } from './lib/markdown';
import type { RichTextEditorProps } from './components/rich-text-editor';
import { ImportSourceLinks } from './components/import-source-links';
import { normalizeExternalAssetUrl, resolveAssetUrl } from './lib/assets';
import {
  formatDate,
  getCharacter,
  getCharacterSearchText,
  getCharacterTierPlacement,
  getGuideCharacter,
  getGuideForCharacter,
  getUnifiedTierList,
  groupTierItems,
  normalizeTier,
  normalizeSearchText,
  tierOrder,
} from './lib/site-data';
import { getYoutubeEmbedUrl } from './lib/youtube';
import { setPageMetadata } from './lib/seo';
import { canManageContent, editorGradeLabel } from './lib/permissions';
import { EditorShell } from './features/inline-editors/editor-shell';
import {
  LeakDiscoveryPanel,
  LeakSubmissionButton,
} from './features/leaks/leak-workflow';
import type {
  AdminUser,
  AuditLogEntry,
  AppSettings,
  Character,
  CharacterAbility,
  CharacterAbilityAttribute,
  CharacterImportLookupResult,
  CharacterImportSuggestion,
  CharacterProfile,
  CharacterRoleIcon,
  CharacterVoiceLine,
  Comment,
  CommentReport,
  CommentReportReason,
  CommunityThread,
  ContentScope,
  EditorGrade,
  EditorPermissions,
  Guide,
  GuideSection,
  LeakItem,
  NewsItem,
  Role,
  SiteData,
  SystemStatus,
  Team,
  TeamMember,
  Tier,
  User,
  UserWarning,
} from './types';

const directAudioPattern =
  /\.(mp3|m4a|ogg|oga|wav|flac|webm)(?:\/revision\/latest)?(?:[?#].*)?$/i;

function canPlayDirectAudio(url: string) {
  const value = url.trim();
  return /^https?:\/\//i.test(value) && directAudioPattern.test(value);
}

function formatProfileDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return formatDate(value);
}

function formatPortalLoadError(error: unknown) {
  const rawMessage =
    error instanceof Error ? error.message : 'Сервис временно недоступен';
  const reason = rawMessage.replace(/^\/api\/[^:]+:\s*/u, '').trim();
  const normalizedReason = reason.replace(/[.!?]+$/u, '');
  return `Не удалось загрузить данные портала. ${normalizedReason}. Повторите загрузку.`;
}

const AdminCharacterEditor = lazy(() =>
  import('./features/admin/character-editor').then((module) => ({
    default: module.AdminCharacterEditor,
  })),
);
const AdminNewsManager = lazy(() =>
  import('./features/admin/content-manager').then((module) => ({
    default: module.AdminNewsManager,
  })),
);
const AdminLeaksManager = lazy(() =>
  import('./features/admin/content-manager').then((module) => ({
    default: module.AdminLeaksManager,
  })),
);
const AdminSourcesManager = lazy(() =>
  import('./features/admin/content-manager').then((module) => ({
    default: module.AdminSourcesManager,
  })),
);
const LazyRichTextEditor = lazy(() => import('./components/rich-text-editor'));

function RichTextEditorField(props: RichTextEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          className="rich-text-editor rich-text-editor__loading"
          aria-busy="true"
        >
          Загружаем визуальный редактор...
        </div>
      }
    >
      <LazyRichTextEditor {...props} />
    </Suspense>
  );
}
const navItems = [
  { label: 'Главная', href: '#/', icon: Home },
  { label: 'Гайды', href: '#/guides', icon: BookOpen },
  { label: 'Персонажи', href: '#/characters', icon: Gamepad2 },
  { label: 'Тир-листы', href: '#/tierlists', icon: Star },
];

const roleWeight: Record<User['role'], number> = {
  user: 1,
  moderator: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

function canAccessAdmin(user: User | null) {
  return Boolean(user && ['moderator', 'admin', 'owner'].includes(user.role));
}

type SiteDataSetter = React.Dispatch<React.SetStateAction<SiteData>>;
const rarityOptions = ['Любая редкость', 'S', 'A'];
const tierOptions = ['Любой тир', ...tierOrder];
const anyAttributeOption = 'Любой атрибут';

function getAttributeOptions(characters: Character[]) {
  return [
    anyAttributeOption,
    ...Array.from(
      new Set(
        characters
          .map((character) => character.attribute.trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, 'ru-RU')),
  ];
}
const guideSectionTypeOptions = [
  ['overview', 'Обзор'],
  ['verdict', 'Краткий вывод'],
  ['pull-advice', 'Стоит ли качать'],
  ['pros', 'Плюсы'],
  ['strengths', 'Плюсы'],
  ['cons', 'Минусы'],
  ['weaknesses', 'Минусы'],
  ['skills', 'Навыки'],
  ['skill-priority', 'Приоритет навыков'],
  ['build', 'Билд'],
  ['best-arcs', 'Лучшие дуги'],
  ['alternative-arcs', 'Альтернативные дуги'],
  ['modules', 'Модули и картриджи'],
  ['main-stats', 'Основные статы'],
  ['sub-stats', 'Саб-статы'],
  ['teams', 'Команды'],
  ['rotations', 'Ротации'],
  ['rotation', 'Ротации'],
  ['tips', 'Советы и механики'],
  ['mistakes', 'Частые ошибки'],
  ['video', 'Видео-гайд'],
  ['faq', 'Вопросы и ответы'],
] as const;

function guideSectionTypeLabel(value: string) {
  return (
    guideSectionTypeOptions.find(([type]) => type === value)?.[1] ||
    'Другой раздел'
  );
}

const russianSlugMap: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function makeSlug(value: string, fallback = 'material') {
  const transliterated = value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .split('')
    .map((character) => russianSlugMap[character] ?? character)
    .join('');

  return (
    transliterated
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

const abilityAttributeLabels = [
  'Коэфф. 1-го экземпляра',
  'Коэфф. 2-го экземпляра',
  'Коэфф. 3-го экземпляра',
  'Коэфф. 4-го экземпляра',
  'Коэфф. 5-го экземпляра',
  'Коэффициент урона пике',
  'Коэфф. атаки ответвления',
  'Показатель критического контрудара',
  'Коэфф. призрачного шага',
  'Энергия циклов',
];

function abilityAttributeId(label: string, index: number) {
  return `${label.toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/gi, '-')}-${index}`;
}

function splitAbilityPresentation(ability: CharacterAbility) {
  const explicitAttributes = (ability.attributes || [])
    .map((attribute, index) => ({
      id: attribute.id || abilityAttributeId(attribute.label, index),
      label: attribute.label.trim(),
      value: attribute.value.trim(),
    }))
    .filter((attribute) => attribute.label && attribute.value);

  if (explicitAttributes.length) {
    return {
      description: ability.description.trim(),
      attributes: explicitAttributes,
    };
  }

  const normalized = ability.description.replace(/\r\n?/g, '\n').trim();
  const marker = /\n*\s*(?:Базовые значения|Атрибуты)\s*:?\s*\n?/i;
  const markerMatch = marker.exec(normalized);
  const description = markerMatch
    ? normalized.slice(0, markerMatch.index).trim()
    : normalized;
  const source = markerMatch
    ? normalized.slice(markerMatch.index + markerMatch[0].length).trim()
    : '';
  const attributes: CharacterAbilityAttribute[] = [];

  source
    .split('\n')
    .map((line) => line.replace(/^[•*\-\s]+/, '').trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const match = line.match(/^([^:]{2,90}):\s*(.+)$/);
      if (!match) return;
      attributes.push({
        id: abilityAttributeId(match[1], index),
        label: match[1].trim(),
        value: match[2].trim(),
      });
    });

  if (!attributes.length && source) {
    const labelPattern = abilityAttributeLabels
      .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const inlinePattern = new RegExp(
      `(${labelPattern})\\s*:\\s*(.+?)(?=(?:${labelPattern})\\s*:|$)`,
      'gi',
    );
    let match = inlinePattern.exec(source);
    while (match) {
      attributes.push({
        id: abilityAttributeId(match[1], attributes.length),
        label: match[1].trim(),
        value: match[2].trim(),
      });
      match = inlinePattern.exec(source);
    }
  }

  return {
    description: description || normalized,
    attributes,
  };
}

function useHashRoute() {
  function getRoute() {
    // Важно отличать «хэша нет» от корневого `#/`. Иначе переход на Главную
    // с prerender-страницы /profile/ ошибочно оставляет пользователя в профиле.
    if (window.location.hash.startsWith('#/')) {
      return window.location.hash.replace(/^#\/?/, '');
    }

    const basePath = import.meta.env.BASE_URL.replace(/^\.?\//, '/');
    const pathname = window.location.pathname;
    if (basePath !== '/' && pathname.startsWith(basePath)) {
      return pathname.slice(basePath.length).replace(/^\/|\/$/g, '');
    }
    return pathname.replace(/^\/|\/$/g, '');
  }

  const [route, setRoute] = useState(() => getRoute());

  useEffect(() => {
    const onHashChange = () =>
      setRoute((currentRoute) =>
        window.location.hash.startsWith('#/') ? getRoute() : currentRoute,
      );
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function App() {
  const route = useHashRoute();
  const hasRemoteApi = hasApiBase();
  const [data, setData] = useState<SiteData>(() =>
    hasRemoteApi ? emptySiteData : seedData,
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loadedPrivateSourcesForRef = useRef('');

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);
      setError('');
      const [currentUser, siteData] = await Promise.all([me(), loadSiteData()]);
      const viewer = currentUser.ok ? currentUser.data : null;

      if (!mounted) {
        return;
      }

      setData(siteData);
      setUser(viewer);
      setLoading(false);
    }

    init().catch((loadError: unknown) => {
      setError(formatPortalLoadError(loadError));
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    const staffId =
      user && roleWeight[user.role] >= roleWeight.editor ? user.id : '';
    if (!staffId) {
      loadedPrivateSourcesForRef.current = '';
      return;
    }
    if (loadedPrivateSourcesForRef.current === staffId) return;

    let mounted = true;
    loadedPrivateSourcesForRef.current = staffId;
    loadSources().then((result) => {
      if (!mounted || !result.ok) {
        if (!result.ok) loadedPrivateSourcesForRef.current = '';
        return;
      }
      setData((current) => ({ ...current, sources: result.data }));
    });
    return () => {
      mounted = false;
    };
  }, [user]);

  useLayoutEffect(() => {
    setMobileOpen(false);
    const resetScroll = () => window.scrollTo({ top: 0, behavior: 'auto' });
    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);
    return () => window.cancelAnimationFrame(frame);
  }, [route]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    const [activeSection, activeSlug] = route.split('/');
    const character = data.characters.find(
      (item) => item.id === activeSlug || item.slug === activeSlug,
    );
    const guide = data.guides.find(
      (item) => item.id === activeSlug || item.slug === activeSlug,
    );
    const newsItem = data.news.find(
      (item) => item.id === activeSlug || item.slug === activeSlug,
    );
    const leak = data.leaks.find(
      (item) => item.id === activeSlug || item.slug === activeSlug,
    );
    const thread = data.threads.find(
      (item) => item.id === activeSlug || item.slug === activeSlug,
    );

    if (activeSection === 'news' && newsItem) {
      setPageMetadata({
        title: newsItem.title,
        description: newsItem.summary,
        path: `/news/${newsItem.slug}/`,
        image: newsItem.imageUrl,
        type: 'article',
        structuredData: {
          '@type': 'NewsArticle',
          headline: newsItem.title,
          description: newsItem.summary,
          datePublished: newsItem.date,
          dateModified: newsItem.updatedAt || newsItem.date,
          author: { '@type': 'Organization', name: newsItem.author },
        },
      });
      return;
    }
    if (activeSection === 'leaks' && leak) {
      setPageMetadata({
        title: leak.title,
        description: leak.summary,
        path: `/leaks/${leak.slug}/`,
        type: 'article',
        structuredData: {
          '@type': 'Article',
          headline: leak.title,
          description: leak.summary,
          datePublished: leak.date,
        },
      });
      return;
    }
    if (activeSection === 'threads' && thread) {
      setPageMetadata({
        title: thread.title,
        description: thread.summary,
        path: `/threads/${thread.slug}/`,
        type: 'article',
        structuredData: {
          '@type': 'DiscussionForumPosting',
          headline: thread.title,
          text: thread.summary,
          datePublished: thread.createdAt,
          dateModified: thread.updatedAt || thread.createdAt,
          author: { '@type': 'Person', name: thread.author },
        },
      });
      return;
    }
    if (activeSection === 'guides' && guide) {
      setPageMetadata({
        title: guide.title,
        description: guide.summary,
        path: `/guides/${guide.slug}/`,
        type: 'article',
        structuredData: {
          '@type': 'TechArticle',
          headline: guide.title,
          description: guide.summary,
          dateModified: guide.updatedAt,
          author: { '@type': 'Organization', name: guide.author },
        },
      });
      return;
    }
    if (activeSection === 'characters' && character) {
      setPageMetadata({
        title: `${character.name} — биография, способности и озвучка`,
        description:
          character.profile?.biographyShort || character.shortDescription,
        path: `/characters/${character.slug}/`,
        image: character.splashUrl,
        type: 'article',
      });
      return;
    }
    const sectionTitles: Record<string, [string, string, string]> = {
      characters: [
        'Персонажи',
        'Персонажи Neverness to Everness: роли, типы эспера, тиры и подробные гайды.',
        '/characters/',
      ],
      guides: [
        'Гайды',
        'Практические гайды NTE Meta: ротации, билды, команды и ошибки.',
        '/guides/',
      ],
      tierlists: [
        'Тир-листы',
        'Единый тир-лист NTE Meta с ручной редакционной оценкой.',
        '/tierlists/',
      ],
      admin: ['Админка', 'Защищённая редакционная CMS NTE Meta.', '/admin/'],
      profile: [
        'Профиль',
        'Настройки аккаунта и безопасность пользователя NTE Meta.',
        '/profile/',
      ],
    };
    const fallback = sectionTitles[activeSection] || [
      'Русская мета Neverness to Everness',
      'Гайды, тир-листы, команды, ротации, новости и комьюнити Neverness to Everness.',
      '/',
    ];
    setPageMetadata({
      title: fallback[0],
      description: fallback[1],
      path: fallback[2],
    });
  }, [data, route]);

  const [section, slug] = route.split('/');
  let page =
    hasRemoteApi && loading ? (
      <RouteLoadingState route={route} />
    ) : (
      <HomePage data={data} loading={loading} user={user} setData={setData} />
    );

  if (hasRemoteApi && loading) {
    page = <RouteLoadingState route={route} />;
  } else if (section === 'characters') {
    page = slug ? (
      <CharacterDetailPage
        data={data}
        slug={slug}
        user={user}
        setData={setData}
      />
    ) : (
      <CharactersPage data={data} user={user} setData={setData} />
    );
  } else if (section === 'guides') {
    page = slug ? (
      <GuidePage data={data} slug={slug} user={user} setData={setData} />
    ) : (
      <GuidesPage data={data} user={user} setData={setData} />
    );
  } else if (section === 'tierlists') {
    page = <TierListsPage data={data} user={user} setData={setData} />;
  } else if (section === 'news') {
    page = slug ? (
      <NewsDetailPage data={data} slug={slug} user={user} setData={setData} />
    ) : (
      <HomePage data={data} loading={loading} user={user} setData={setData} />
    );
  } else if (section === 'leaks') {
    page = slug ? (
      <LeakDetailPage data={data} slug={slug} user={user} setData={setData} />
    ) : (
      <HomePage data={data} loading={loading} user={user} setData={setData} />
    );
  } else if (section === 'teams' || section === 'rotations') {
    page = <GuidesPage data={data} user={user} setData={setData} />;
  } else if (section === 'videos') {
    page = <GuidesPage data={data} user={user} setData={setData} />;
  } else if (section === 'threads') {
    page = slug ? (
      <ThreadPage data={data} slug={slug} user={user} setData={setData} />
    ) : (
      <ThreadsPage data={data} user={user} setData={setData} />
    );
  } else if (section === 'profile') {
    page = <ProfilePage user={user} setUser={setUser} />;
  } else if (section === 'admin') {
    page = (
      <AdminPage
        data={data}
        user={user}
        setUser={setUser}
        setData={setData}
        requestedTab={slug}
      />
    );
  } else if (section) {
    page = <NotFoundPage />;
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <Header
        user={user}
        route={route}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      {mobileOpen ? (
        <button
          className="menu-backdrop mobile-only"
          type="button"
          aria-label="Закрыть меню вне панели"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <main id="main-content" className="site-main">
        {error ? (
          <div className="portal-load-error">
            <StatusBanner tone="danger" text={error} />
            <button
              className="ghost-button"
              type="button"
              onClick={() => setLoadAttempt((current) => current + 1)}
            >
              <RotateCw aria-hidden="true" /> Повторить загрузку
            </button>
          </div>
        ) : null}
        {loading ? (
          <StatusBanner
            tone="info"
            text={
              hasApiBase()
                ? 'Синхронизируем свежие данные с NTE Meta API...'
                : 'Готовим локальные демо-данные...'
            }
          />
        ) : null}
        {!hasApiBase() ? (
          <StatusBanner
            tone="info"
            text="Сейчас фронтенд работает на локальных демо-данных. Подключите VITE_API_BASE_URL к Cloudflare Worker, чтобы сохранять контент в D1."
          />
        ) : null}
        {page}
      </main>
      <Footer />
      <BackToTopButton />
    </>
  );
}

function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        setVisible(window.scrollY > 720),
      );
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <button
      className={`back-to-top${visible ? ' is-visible' : ''}`}
      type="button"
      aria-label="Вернуться в начало страницы"
      title="Наверх"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
        })
      }
    >
      <ArrowUp aria-hidden="true" />
    </button>
  );
}

function RouteLoadingState({ route }: { route: string }) {
  const [section] = route.split('/');
  const sectionLabels: Record<string, string> = {
    characters: 'персонажей',
    guides: 'гайдов',
    tierlists: 'тир-листа',
    news: 'новостей',
    leaks: 'сливов',
    threads: 'тредов',
    admin: 'админки',
    profile: 'профиля',
  };
  const label = sectionLabels[section || 'home'] || 'портала';

  return (
    <section className="route-loading-panel" aria-busy="true">
      <p className="eyebrow">NTE Meta API</p>
      <h1>Синхронизируем данные {label}</h1>
      <p>
        Показываем страницу только после ответа Worker/D1, чтобы не мигали
        устаревшие демо-карточки.
      </p>
      <SkeletonGrid label={`Загрузка ${label}`} />
    </section>
  );
}

function Header({
  user,
  route,
  mobileOpen,
  setMobileOpen,
}: {
  user: User | null;
  route: string;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
}) {
  const headerNavItems = canAccessAdmin(user)
    ? [...navItems, { label: 'Админка', href: '#/admin', icon: ShieldCheck }]
    : navItems;

  return (
    <header className="site-header">
      <div className="brand" role="banner">
        <button
          className="icon-button mobile-only"
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
        >
          {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <a className="brand-link" href="#/" aria-label="NTE Meta - на главную">
          <img
            src={resolveAssetUrl('assets/logo.svg')}
            alt=""
            width="40"
            height="40"
          />
          <span>
            <strong>NTE Meta</strong>
            <small>русская мета, гайды и комьюнити</small>
          </span>
        </a>
      </div>
      <nav
        id="primary-navigation"
        className={`top-nav ${mobileOpen ? 'is-open' : ''}`}
        aria-label="Основная навигация"
      >
        {headerNavItems.map((item) => {
          const Icon = item.icon;
          const itemRoute = item.href.replace(/^#\/?/, '');
          const isActive =
            itemRoute === ''
              ? route === ''
              : route === itemRoute || route.startsWith(`${itemRoute}/`);
          return (
            <a
              key={item.href}
              className={`nav-pill ${isActive ? 'active' : ''}`}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <a
        className="profile-chip"
        href="#/profile"
        aria-label={
          user
            ? `Профиль: ${user.displayName || user.username}`
            : 'Войти в профиль'
        }
      >
        <UserCircle aria-hidden="true" />
        <span>
          {user
            ? `${user.displayName || user.username} · ${user.role}`
            : 'Войти'}
        </span>
      </a>
    </header>
  );
}

function HomePage({
  data,
  loading,
  user,
  setData,
}: {
  data: SiteData;
  loading: boolean;
  user: User | null;
  setData: React.Dispatch<React.SetStateAction<SiteData>>;
}) {
  const latestGuides = data.guides.slice(0, 5);
  const latestNews = data.news.slice(0, 2);
  const latestLeaks = data.leaks.filter((leak) => leak.approved).slice(0, 2);
  const { grouped } = groupTierItems(data);
  const popularCharacters = data.characters.slice(0, 6);
  const [homeEditor, setHomeEditor] = useState<
    'guide' | 'news' | 'leak' | 'thread' | null
  >(null);
  const [homeEditorItemId, setHomeEditorItemId] = useState('new');
  const [homeEditorDirty, setHomeEditorDirty] = useState(false);
  const [latestGuideIndex, setLatestGuideIndex] = useState(0);
  const canCreateGuide = canManageContent(user, 'guides', 'create');
  const canCreateNews = canManageContent(user, 'news', 'create');
  const canCreateLeak = canManageContent(user, 'leaks', 'create');
  const canCreateThread = Boolean(user);

  useEffect(() => {
    setLatestGuideIndex((current) =>
      Math.min(current, Math.max(0, latestGuides.length - 1)),
    );
  }, [latestGuides.length]);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(
          user && roleWeight[user.role] >= roleWeight.editor,
        ),
      }),
    );
  }

  function openHomeEditor(kind: 'guide' | 'news' | 'leak', itemId = 'new') {
    setHomeEditorDirty(false);
    setHomeEditorItemId(itemId);
    setHomeEditor(kind);
  }

  return (
    <div className="page-stack">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">
            Neverness to Everness · русскоязычный meta-hub
          </p>
          <h1>NTE Meta</h1>
          <div className="button-row">
            <a className="primary-button" href="#/tierlists">
              <Star aria-hidden="true" />
              Смотреть тир-лист
            </a>
            <a className="ghost-button" href="#/characters">
              <Gamepad2 aria-hidden="true" />
              Персонажи
            </a>
            <a className="ghost-button" href="#/guides">
              <BookOpen aria-hidden="true" />
              Последние гайды
            </a>
          </div>
        </div>
        <div className="hero-media" aria-label="Избранные персонажи NTE Meta">
          {data.characters.slice(0, 3).map((character, index) => (
            <a
              className={`hero-character hero-character-${index + 1}`}
              key={character.id}
              href={`#/characters/${character.slug}`}
            >
              <img
                src={resolveAssetUrl(character.splashUrl || character.imageUrl)}
                alt=""
                width="280"
                height="360"
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : 'auto'}
                decoding="async"
                referrerPolicy="no-referrer"
              />
              <span>{character.name}</span>
            </a>
          ))}
        </div>
      </section>

      <MetricsStrip data={data} />
      <HomeFocusPanel data={data} user={user} />

      {loading && latestGuides.length === 0 ? <SkeletonGrid /> : null}

      <section className="content-band">
        <SectionHeader
          eyebrow="Обновляется редакцией"
          title="Последние гайды"
          action={
            <div className="section-actions">
              {canCreateGuide ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => openHomeEditor('guide')}
                >
                  <Plus aria-hidden="true" /> Добавить гайд
                </button>
              ) : null}
              <a className="text-button" href="#/guides">
                Все гайды <ChevronRight aria-hidden="true" />
              </a>
            </div>
          }
        />
        <div
          className="home-guide-carousel"
          aria-roledescription="карусель"
          aria-label="Последние гайды"
        >
          <button
            className="icon-button home-guide-carousel__arrow"
            type="button"
            aria-label="Предыдущий гайд"
            disabled={latestGuides.length < 2}
            onClick={() =>
              setLatestGuideIndex((current) =>
                latestGuides.length
                  ? (current - 1 + latestGuides.length) % latestGuides.length
                  : 0,
              )
            }
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <div className="guide-grid home-guide-carousel__track">
            {latestGuides[latestGuideIndex] ? (
              <GuideCard
                key={latestGuides[latestGuideIndex].id}
                guide={latestGuides[latestGuideIndex]}
                data={data}
              />
            ) : (
              <EmptyState
                title="Гайдов пока нет"
                text="Первый опубликованный гайд появится здесь."
              />
            )}
          </div>
          <button
            className="icon-button home-guide-carousel__arrow"
            type="button"
            aria-label="Следующий гайд"
            disabled={latestGuides.length < 2}
            onClick={() =>
              setLatestGuideIndex((current) =>
                latestGuides.length ? (current + 1) % latestGuides.length : 0,
              )
            }
          >
            <ChevronRight aria-hidden="true" />
          </button>
          {latestGuides.length > 1 ? (
            <span className="home-guide-carousel__status" aria-live="polite">
              {latestGuideIndex + 1} / {latestGuides.length}
            </span>
          ) : null}
        </div>
      </section>

      <section className="split-band">
        <div className="home-news-column">
          <SectionHeader
            eyebrow="Редакция"
            title="Свежие новости"
            action={
              canCreateNews ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => openHomeEditor('news')}
                >
                  <Plus aria-hidden="true" /> Добавить новость
                </button>
              ) : null
            }
          />
          <div className="compact-list">
            {latestNews.map((item) => (
              <NewsCompactCard
                key={item.id}
                item={item}
                onEdit={
                  canManageContent(user, 'news', 'edit')
                    ? () => openHomeEditor('news', item.id)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
        <div className="home-leaks-column">
          <SectionHeader
            eyebrow="Отдельно от фактов"
            title="Сливы / слухи"
            action={
              <div className="section-actions">
                {user ? (
                  <LeakSubmissionButton />
                ) : (
                  <a className="ghost-button" href="#/profile">
                    <MessageSquare aria-hidden="true" /> Предложить слух
                  </a>
                )}
                {canCreateLeak ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => openHomeEditor('leak')}
                  >
                    <Plus aria-hidden="true" /> Добавить слив
                  </button>
                ) : null}
              </div>
            }
          />
          <div className="compact-list">
            {latestLeaks.map((item) => (
              <LeakCompactCard
                key={item.id}
                item={item}
                onEdit={
                  canManageContent(user, 'leaks', 'edit')
                    ? () => openHomeEditor('leak', item.id)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      </section>

      <section className="content-band">
        <SectionHeader
          eyebrow="Патч 1.0"
          title="Текущий тир-лист"
          text="Единый обзор актуального редакционного тир-листа."
        />
        <TierPreview grouped={grouped} />
      </section>

      <section className="content-band">
        <SectionHeader
          eyebrow="Что смотрят чаще"
          title="Популярные персонажи"
        />
        <div className="character-grid">
          {popularCharacters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              data={data}
            />
          ))}
        </div>
      </section>

      <section className="community-band">
        <div className="community-band__intro">
          <h2>Треды и обсуждения игроков</h2>
          <p>
            Создавайте треды с вопросами по отрядам, ротациям, ресурсам и
            патчам. Комментарии под материалами остаются там же, где контекст.
          </p>
          <div className="button-row">
            {canCreateThread ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => setHomeEditor('thread')}
              >
                <MessageCircle aria-hidden="true" /> Создать тред
              </button>
            ) : (
              <a className="ghost-button" href="#/profile">
                <UserCircle aria-hidden="true" /> Войти для треда
              </a>
            )}
            <a className="ghost-button" href="#/threads">
              <MessageSquare aria-hidden="true" /> Все треды
            </a>
          </div>
        </div>
        <div className="comment-preview">
          {data.threads.length ? (
            data.threads.slice(0, 3).map((thread) => (
              <article key={thread.id}>
                <strong>{thread.title}</strong>
                {thread.status === 'closed' ? (
                  <span className="thread-status is-archived">
                    <Archive aria-hidden="true" /> Архив
                  </span>
                ) : null}
                <p>{thread.summary}</p>
                <span>
                  {thread.commentsCount || 0} комментариев ·{' '}
                  {formatDate(thread.updatedAt || thread.createdAt)}
                </span>
                <a className="text-button" href={`#/threads/${thread.slug}`}>
                  Открыть тред <ChevronRight aria-hidden="true" />
                </a>
              </article>
            ))
          ) : (
            <EmptyState
              title="Пока тихо"
              text="Первый тред появится после публикации игроком или редакцией."
            />
          )}
        </div>
      </section>

      <EditorShell
        open={homeEditor === 'guide'}
        title={
          homeEditorItemId === 'new' ? 'Добавить гайд' : 'Редактировать гайд'
        }
        eyebrow="Редактор"
        description="Персонажный гайд создаётся прямо из главной и сразу попадёт в раздел гайдов после публикации."
        dirty={homeEditorDirty}
        onClose={() => {
          setHomeEditorDirty(false);
          setHomeEditor(null);
        }}
      >
        {homeEditor === 'guide' && user ? (
          <Suspense
            fallback={<SkeletonGrid label="Загрузка редактора гайда" />}
          >
            <AdminGuides
              data={data}
              setData={setData}
              user={user}
              initialGuideId={homeEditorItemId}
              onDirtyChange={setHomeEditorDirty}
              onSaved={({ slug, status }) => {
                if (status !== 'published' || !slug) return;
                setHomeEditorDirty(false);
                setHomeEditor(null);
                window.location.hash = `#/guides/${slug}`;
              }}
            />
          </Suspense>
        ) : null}
      </EditorShell>

      <EditorShell
        open={homeEditor === 'news'}
        title={
          homeEditorItemId === 'new'
            ? 'Добавить новость'
            : 'Редактировать новость'
        }
        eyebrow="Редакция"
        dirty={homeEditorDirty}
        onClose={() => {
          setHomeEditorDirty(false);
          setHomeEditor(null);
        }}
      >
        {homeEditor === 'news' && canCreateNews ? (
          <Suspense
            fallback={<SkeletonGrid label="Загрузка редактора новости" />}
          >
            <AdminNewsManager
              items={data.news}
              initialSelectedId={homeEditorItemId}
              access={user ? contentAccess(user, 'news') : undefined}
              onRefresh={refreshContent}
              onDirtyChange={setHomeEditorDirty}
              onSaved={({ saved, values, publishStatus }) => {
                if (publishStatus === 'draft') return;
                const slug = String(saved?.slug || values.slug || '').trim();
                if (!slug) return;
                setHomeEditorDirty(false);
                setHomeEditor(null);
                window.location.hash = `#/news/${slug}`;
              }}
            />
          </Suspense>
        ) : null}
      </EditorShell>

      <EditorShell
        open={homeEditor === 'leak'}
        title={
          homeEditorItemId === 'new' ? 'Добавить слив' : 'Редактировать слив'
        }
        eyebrow="Слухи отдельно от фактов"
        dirty={homeEditorDirty}
        onClose={() => {
          setHomeEditorDirty(false);
          setHomeEditor(null);
        }}
      >
        {homeEditor === 'leak' && canCreateLeak ? (
          <Suspense
            fallback={<SkeletonGrid label="Загрузка редактора слива" />}
          >
            <LeakDiscoveryPanel
              onPromoted={async (leakId) => {
                await refreshContent();
                setHomeEditorItemId(leakId);
              }}
            />
            <AdminLeaksManager
              items={data.leaks}
              initialSelectedId={homeEditorItemId}
              access={user ? contentAccess(user, 'leaks') : undefined}
              onRefresh={refreshContent}
              onDirtyChange={setHomeEditorDirty}
              onSaved={({ saved, values }) => {
                const slug = String(saved?.slug || values.slug || '').trim();
                if (!slug) return;
                setHomeEditorDirty(false);
                setHomeEditor(null);
                window.location.hash = `#/leaks/${slug}`;
              }}
            />
          </Suspense>
        ) : null}
      </EditorShell>

      <EditorShell
        open={homeEditor === 'thread'}
        title="Создать тред"
        eyebrow="Обсуждения"
        dirty={homeEditorDirty}
        onClose={() => {
          setHomeEditorDirty(false);
          setHomeEditor(null);
        }}
      >
        {homeEditor === 'thread' && user ? (
          <ThreadEditor
            user={user}
            onDirtyChange={setHomeEditorDirty}
            onSaved={async (savedThread) => {
              await refreshContent();
              setHomeEditorDirty(false);
              setHomeEditor(null);
              window.location.hash = `#/threads/${savedThread.slug}`;
            }}
          />
        ) : null}
      </EditorShell>
    </div>
  );
}

function ThreadEditor({
  user,
  thread,
  onSaved,
  onDirtyChange,
}: {
  user: User;
  thread?: CommunityThread;
  onSaved: (savedThread: CommunityThread) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const draftKey = `nte-thread-draft-${thread?.id || 'new'}`;
  const storedDraft = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem(draftKey) || '{}',
      ) as Partial<CommunityThread>;
    } catch {
      return {};
    }
  }, [draftKey]);
  const [title, setTitle] = useState(storedDraft.title || thread?.title || '');
  const [slug, setSlug] = useState(storedDraft.slug || thread?.slug || '');
  const [summary, setSummary] = useState(
    storedDraft.summary || thread?.summary || '',
  );
  const [body, setBody] = useState(storedDraft.body || thread?.body || '');
  const [tags, setTags] = useState(
    (storedDraft.tags || thread?.tags || []).join(', '),
  );
  const [status, setStatus] = useState<CommunityThread['status']>(
    thread?.status || 'open',
  );
  const [slugTouched, setSlugTouched] = useState(
    Boolean(thread?.slug || storedDraft.slug),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const threadBaseline = useMemo(
    () => ({
      title: thread?.title || '',
      slug: thread?.slug || '',
      summary: thread?.summary || '',
      body: thread?.body || '',
      tags: (thread?.tags || []).join(', '),
      status: thread?.status || 'open',
    }),
    [thread],
  );
  const isThreadDirty =
    title !== threadBaseline.title ||
    slug !== threadBaseline.slug ||
    summary !== threadBaseline.summary ||
    body !== threadBaseline.body ||
    tags !== threadBaseline.tags ||
    status !== threadBaseline.status;

  useEffect(() => {
    const draft = { title, slug, summary, body, tags: parseTags(tags), status };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [body, draftKey, slug, status, summary, tags, title]);

  useEffect(() => {
    onDirtyChange?.(isThreadDirty);
  }, [isThreadDirty, onDirtyChange]);

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(makeSlug(value, 'thread'));
  }

  function updateSlug(value: string) {
    setSlugTouched(true);
    setSlug(makeSlug(value, 'thread'));
  }

  async function saveThread(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !summary.trim() || !body.trim()) {
      setMessage('Заполните заголовок, краткое описание и текст треда.');
      return;
    }

    setPending(true);
    setMessage('');
    const payload = {
      title: title.trim(),
      slug: makeSlug(slug || title, 'thread'),
      summary: summary.trim(),
      body: body.trim(),
      tags: parseTags(tags),
      status,
    };
    const result = await saveEntity<CommunityThread>(
      thread ? `/api/threads/${thread.id}` : '/api/threads',
      payload,
      thread ? 'PATCH' : 'POST',
    );
    if (result.ok) {
      localStorage.removeItem(draftKey);
      setMessage(thread ? 'Тред обновлен.' : 'Тред опубликован.');
      await onSaved(result.data);
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <form className="editor-form thread-editor" onSubmit={saveThread}>
      <p className="editor-form__wysiwyg-note">
        Текст в редакторе сразу выглядит так же, как после публикации.
      </p>
      <section className="admin-panel entity-form thread-editor__form">
        <label htmlFor="thread-title">Заголовок</label>
        <input
          id="thread-title"
          value={title}
          minLength={4}
          maxLength={120}
          onChange={(event) => updateTitle(event.target.value)}
          required
        />
        <label htmlFor="thread-slug">
          Адрес страницы
          <input
            id="thread-slug"
            value={slug}
            maxLength={140}
            onChange={(event) => updateSlug(event.target.value)}
            required
            aria-describedby="thread-slug-help"
          />
          <small id="thread-slug-help">
            Создаётся из заголовка автоматически. Его можно изменить для
            короткой ссылки.
          </small>
        </label>
        <label htmlFor="thread-summary">Краткое описание</label>
        <textarea
          id="thread-summary"
          value={summary}
          rows={3}
          maxLength={240}
          onChange={(event) => setSummary(event.target.value)}
          required
        />
        <label htmlFor="thread-body">Текст треда</label>
        <RichTextEditorField
          id="thread-body"
          value={body}
          onChange={setBody}
          maxLength={12000}
          minHeight={340}
          placeholder="Сформулируйте тему, добавьте детали и вопросы для обсуждения..."
          ariaLabel="Текст треда"
        />
        <label htmlFor="thread-tags">Теги</label>
        <input
          id="thread-tags"
          value={tags}
          placeholder="вопрос, ротация, патч"
          onChange={(event) => setTags(event.target.value)}
        />
        {roleWeight[user.role] >= roleWeight.editor ? (
          <>
            <label htmlFor="thread-status">Статус обсуждения</label>
            <select
              id="thread-status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as CommunityThread['status'])
              }
            >
              <option value="open">Открыт для обсуждения</option>
              <option value="closed">В архиве · только чтение</option>
              {roleWeight[user.role] >= roleWeight.moderator ? (
                <option value="hidden">Скрыт модерацией</option>
              ) : null}
            </select>
          </>
        ) : null}
      </section>
      <div className="editor-shell__footer">
        <button className="primary-button" type="submit" disabled={pending}>
          <CheckCircle2 aria-hidden="true" />
          {pending
            ? 'Сохраняем...'
            : thread
              ? 'Сохранить тред'
              : 'Опубликовать тред'}
        </button>
        <span className="form-message" aria-live="polite">
          {message || 'Черновик автоматически хранится в этом браузере.'}
        </span>
      </div>
    </form>
  );
}

function ThreadsPage({
  data,
  user,
  setData,
}: {
  data: SiteData;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const [view, setView] = useState<'open' | 'archived' | 'all'>('open');
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const normalizedQuery = normalizeSearchText(query);
  const visibleThreads = data.threads
    .filter((thread) => thread.status !== 'hidden')
    .filter((thread) => {
      if (view === 'open') return thread.status === 'open';
      if (view === 'archived') return thread.status === 'closed';
      return true;
    })
    .filter((thread) =>
      normalizedQuery
        ? normalizeSearchText(
            `${thread.title} ${thread.summary} ${thread.tags.join(' ')}`,
          ).includes(normalizedQuery)
        : true,
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt || right.createdAt).getTime() -
        new Date(left.updatedAt || left.createdAt).getTime(),
    );

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(
          user && roleWeight[user.role] >= roleWeight.editor,
        ),
      }),
    );
  }

  return (
    <div className="page-stack threads-page">
      <section className="page-hero">
        <p className="eyebrow">Комьюнити NTE Meta</p>
        <h1>Треды и обсуждения</h1>
        <p>
          Вопросы по персонажам, ресурсам, отрядам и механикам собраны в
          отдельных обсуждениях.
        </p>
        {user ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => setEditorOpen(true)}
          >
            <MessageCircle aria-hidden="true" /> Создать тред
          </button>
        ) : (
          <a className="ghost-button" href="#/profile">
            <UserCircle aria-hidden="true" /> Войти для публикации
          </a>
        )}
      </section>

      <section className="content-band">
        <div className="threads-page__toolbar">
          <label className="search-field">
            <Search aria-hidden="true" />
            <span className="sr-only">Поиск по тредам</span>
            <input
              type="search"
              value={query}
              placeholder="Тема, описание или тег..."
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="segmented-control" aria-label="Статус тредов">
            <button
              type="button"
              aria-pressed={view === 'open'}
              onClick={() => setView('open')}
            >
              Активные
            </button>
            <button
              type="button"
              aria-pressed={view === 'archived'}
              onClick={() => setView('archived')}
            >
              Архив
            </button>
            <button
              type="button"
              aria-pressed={view === 'all'}
              onClick={() => setView('all')}
            >
              Все
            </button>
          </div>
        </div>

        <div className="thread-list">
          {visibleThreads.length ? (
            visibleThreads.map((thread) => (
              <article className="thread-list-card" key={thread.id}>
                <div className="thread-list-card__heading">
                  <div>
                    <p className="eyebrow">
                      {thread.author} ·{' '}
                      {formatDate(thread.updatedAt || thread.createdAt)}
                    </p>
                    <h2>{thread.title}</h2>
                  </div>
                  <span
                    className={`thread-status${
                      thread.status === 'closed' ? ' is-archived' : ''
                    }`}
                  >
                    {thread.status === 'closed' ? (
                      <Archive aria-hidden="true" />
                    ) : (
                      <MessageCircle aria-hidden="true" />
                    )}
                    {thread.status === 'closed' ? 'Архив' : 'Обсуждается'}
                  </span>
                </div>
                <p>{thread.summary}</p>
                <div className="thread-list-card__footer">
                  <Tags tags={thread.tags} />
                  <span>{thread.commentsCount || 0} комментариев</span>
                  <a className="text-button" href={`#/threads/${thread.slug}`}>
                    Открыть <ChevronRight aria-hidden="true" />
                  </a>
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              title={query ? 'Треды не найдены' : 'Здесь пока нет тредов'}
              text={
                query
                  ? 'Измените запрос или переключите статус обсуждений.'
                  : view === 'archived'
                    ? 'Архивные обсуждения появятся после закрытия тредов редакцией.'
                    : 'Создайте первое обсуждение по игре.'
              }
            />
          )}
        </div>
      </section>

      <EditorShell
        open={editorOpen}
        title="Создать тред"
        eyebrow="Обсуждения"
        dirty={editorDirty}
        onClose={() => {
          setEditorDirty(false);
          setEditorOpen(false);
        }}
      >
        {user ? (
          <ThreadEditor
            user={user}
            onDirtyChange={setEditorDirty}
            onSaved={async (savedThread) => {
              await refreshContent();
              setEditorDirty(false);
              setEditorOpen(false);
              window.location.hash = `#/threads/${savedThread.slug}`;
            }}
          />
        ) : null}
      </EditorShell>
    </div>
  );
}

function ThreadPage({
  data,
  slug,
  user,
  setData,
}: {
  data: SiteData;
  slug: string;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const thread = data.threads.find(
    (item) => item.slug === slug || item.id === slug,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(
          user && roleWeight[user.role] >= roleWeight.editor,
        ),
      }),
    );
  }

  if (!thread || thread.status === 'hidden') {
    return (
      <EmptyState
        title="Тред не найден"
        text="Он мог быть скрыт модерацией или ссылка устарела."
      />
    );
  }

  const canEditThread =
    Boolean(user && thread.authorId === user.id) ||
    Boolean(user && roleWeight[user.role] >= roleWeight.editor);

  return (
    <div className="page-stack">
      <article className="editorial-article thread-article">
        <header className="editorial-copy-hero">
          <p className="eyebrow">
            Комьюнити · {thread.author} · {formatDate(thread.createdAt)}
          </p>
          <h1>{thread.title}</h1>
          <p>{thread.summary}</p>
          {thread.status === 'closed' ? (
            <span className="thread-status is-archived">
              <Archive aria-hidden="true" /> Архив · только чтение
            </span>
          ) : null}
          <Tags tags={thread.tags} />
          {canEditThread ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => setEditorOpen(true)}
            >
              <Pencil aria-hidden="true" /> Редактировать тред
            </button>
          ) : null}
        </header>
        <div className="editorial-body">
          <MarkdownPreview value={thread.body} />
        </div>
      </article>
      <section className="guide-toolbar">
        <div>
          <p>Обсуждение</p>
          <strong>{thread.commentsCount || 0} комментариев</strong>
        </div>
        <RatingBar targetType="thread" targetId={thread.id} user={user} />
      </section>
      {thread.status === 'closed' ? (
        <StatusBanner
          tone="info"
          text="Обсуждение находится в архиве. Тред доступен для чтения, но новые ответы и реакции на комментарии отключены."
        />
      ) : null}
      <CommentsBlock
        targetType="thread"
        targetId={thread.id}
        data={data}
        user={user}
        readOnly={thread.status === 'closed'}
      />
      <EditorShell
        open={editorOpen}
        title="Редактировать тред"
        eyebrow="Комьюнити"
        dirty={editorDirty}
        onClose={() => {
          setEditorDirty(false);
          setEditorOpen(false);
        }}
      >
        {user ? (
          <ThreadEditor
            user={user}
            thread={thread}
            onDirtyChange={setEditorDirty}
            onSaved={async () => {
              await refreshContent();
              setEditorDirty(false);
              setEditorOpen(false);
            }}
          />
        ) : null}
      </EditorShell>
    </div>
  );
}

function parseTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function MetricsStrip({ data }: { data: SiteData }) {
  const metrics = [
    { label: 'Персонажей', value: data.characters.length, icon: Gamepad2 },
    { label: 'Гайдов', value: data.guides.length, icon: BookOpen },
    { label: 'Отрядов в гайдах', value: data.teams.length, icon: Users },
    { label: 'Новостей', value: data.news.length, icon: Newspaper },
  ];

  return (
    <section className="metrics-strip" aria-label="Статистика сайта">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div className="metric-item" key={metric.label}>
            <Icon aria-hidden="true" />
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        );
      })}
    </section>
  );
}

function HomeFocusPanel({ data, user }: { data: SiteData; user: User | null }) {
  const updatedGuide = data.guides[0];
  const focusCharacter = updatedGuide
    ? getGuideCharacter(data, updatedGuide)
    : undefined;
  const pendingLeaks = data.leaks.filter((leak) => !leak.approved).length;
  const sourceCount = data.sources.length;
  const sourceMetric = sourceCount
    ? `${sourceCount} источников`
    : canAccessAdmin(user)
      ? 'Нет активных'
      : 'Ручная проверка';
  const recentThread = data.threads[0];
  const leadHref = updatedGuide ? `#/guides/${updatedGuide.slug}` : '#/guides';
  const leadTitle = updatedGuide
    ? updatedGuide.title
    : 'Нужен первый глубокий гайд';
  const leadText = updatedGuide
    ? `${updatedGuide.patch} · обновлено ${formatDate(updatedGuide.updatedAt)}`
    : 'Создайте персонажный гайд и добавьте команды, ротации, видео и проверенные источники.';

  const focusItems = [
    {
      title: 'Проверка источников',
      value: sourceMetric,
      href: canAccessAdmin(user) ? '#/admin/sources' : '#/guides',
      icon: Search,
    },
    {
      title: 'Сливы на модерации',
      value: `${pendingLeaks}`,
      href: '#/',
      icon: CircleAlert,
    },
    {
      title: 'Свежий тред',
      value: recentThread ? recentThread.title : 'Создайте первый тред',
      href: recentThread ? `#/threads/${recentThread.slug}` : '#/threads',
      icon: MessageSquare,
    },
  ];

  function updateSpotlight(event: React.PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      '--spot-x',
      `${event.clientX - rect.left}px`,
    );
    event.currentTarget.style.setProperty(
      '--spot-y',
      `${event.clientY - rect.top}px`,
    );
  }

  return (
    <section className="home-focus-panel" aria-label="Редакционный пульс">
      <a
        className="home-focus-lead spotlight-surface"
        href={leadHref}
        onPointerMove={updateSpotlight}
      >
        {focusCharacter ? (
          <img
            className="home-focus-lead__art"
            src={resolveAssetUrl(
              focusCharacter.splashUrl || focusCharacter.imageUrl,
            )}
            alt=""
            width="720"
            height="560"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <span className="home-focus-lead__content">
          <span className="home-focus-lead__icon">
            <BookOpen aria-hidden="true" />
          </span>
          <small>Приоритет редакции</small>
          <strong>{leadTitle}</strong>
          <em>{leadText}</em>
        </span>
        <ChevronRight aria-hidden="true" />
      </a>
      <div className="home-focus-stack">
        {focusItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              className="home-focus-card spotlight-surface"
              href={item.href}
              key={item.title}
              onPointerMove={updateSpotlight}
            >
              <span className="home-focus-card__heading">
                <Icon aria-hidden="true" />
                <span>{item.title}</span>
              </span>
              <strong>{item.value}</strong>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function CharacterCard({
  character,
  data,
}: {
  character: Character;
  data: SiteData;
}) {
  const cardTags = character.profile?.arcType
    ? [`Дуга: ${character.profile.arcType}`, ...character.tags]
    : character.tags;
  const tierPlacement = getCharacterTierPlacement(data, character.id);
  const tierLabel = tierPlacement ? tierPlacement.tier : '—';

  return (
    <article className="character-card">
      <a
        href={`#/characters/${character.slug}`}
        aria-label={`Открыть страницу персонажа ${character.name}`}
      >
        <span className="character-card__media">
          <img
            src={resolveAssetUrl(character.imageUrl)}
            alt={character.name}
            width="320"
            height="320"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </span>
        <span
          className="tier-badge"
          title={
            tierPlacement
              ? `Ранг единого тир-листа, патч ${tierPlacement.patch}`
              : 'Персонаж ещё не добавлен в единый тир-лист'
          }
        >
          {tierLabel}
        </span>
        <div>
          <h3>{character.name}</h3>
          <p className="character-card__meta">
            {character.role} · {character.attribute} · {character.rarity}
          </p>
          {character.shortDescription ? (
            <p className="character-card__summary">
              {character.shortDescription}
            </p>
          ) : null}
          <Tags tags={cardTags} />
        </div>
      </a>
    </article>
  );
}

function GuideCard({
  guide,
  data,
  onEdit,
}: {
  guide: Guide;
  data: SiteData;
  onEdit?: () => void;
}) {
  const character = getGuideCharacter(data, guide);

  return (
    <article className="guide-card">
      <img
        src={resolveAssetUrl(
          character?.splashUrl || character?.imageUrl || 'assets/logo.svg',
        )}
        alt={character?.name || guide.title}
        width="460"
        height="280"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
      <div className="guide-card__body">
        <p className="eyebrow">
          {character?.name || 'Гайд'} · патч {guide.patch}
        </p>
        <h3>{guide.title}</h3>
        <p className="guide-card__summary">{guide.summary}</p>
        <dl className="meta-row">
          <div>
            <dt>Автор</dt>
            <dd>{guide.author}</dd>
          </div>
          <div>
            <dt>Обновлено</dt>
            <dd>{formatDate(guide.updatedAt)}</dd>
          </div>
        </dl>
        <div className="guide-card__actions">
          <a className="text-button" href={`#/guides/${guide.slug}`}>
            Читать гайд <ChevronRight aria-hidden="true" />
          </a>
          {onEdit ? (
            <button className="text-button" type="button" onClick={onEdit}>
              <Pencil aria-hidden="true" /> Редактировать
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function NewsCompactCard({
  item,
  onEdit,
}: {
  item: NewsItem;
  onEdit?: () => void;
}) {
  return (
    <article className="compact-card">
      <img
        src={resolveAssetUrl(item.imageUrl)}
        alt=""
        width="96"
        height="96"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <div>
        <span>
          {item.category} · {formatDate(item.date)}
        </span>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <div className="button-row">
          <a className="text-button" href={`#/news/${item.slug}`}>
            Перейти в новость <ChevronRight aria-hidden="true" />
          </a>
          {onEdit ? (
            <button className="text-button" type="button" onClick={onEdit}>
              <Pencil aria-hidden="true" /> Редактировать
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LeakCompactCard({
  item,
  onEdit,
}: {
  item: LeakItem;
  onEdit?: () => void;
}) {
  return (
    <article className="compact-card leak">
      <CircleAlert aria-hidden="true" />
      <div>
        <span>
          {item.status} · доверие: {item.trustLevel}
        </span>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <small>
          Не подтверждено: информация может измениться. Источник:{' '}
          {item.sourceName}
        </small>
        <div className="button-row">
          <a className="text-button" href={`#/leaks/${item.slug}`}>
            Перейти в слив <ChevronRight aria-hidden="true" />
          </a>
          {onEdit ? (
            <button className="text-button" type="button" onClick={onEdit}>
              <Pencil aria-hidden="true" /> Редактировать
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function TierPreview({ grouped }: { grouped: Record<Tier, Character[]> }) {
  return (
    <div className="tier-preview">
      {tierOrder.map((tier) => (
        <div className="tier-row" key={tier}>
          <strong>{tier}</strong>
          <div>
            {grouped[tier].slice(0, 8).map((character) => (
              <a
                className="tier-person"
                key={character.id}
                href={`#/characters/${character.slug}`}
                title={character.name}
              >
                <span className="tier-person__portrait" aria-hidden="true">
                  <img
                    src={resolveAssetUrl(character.imageUrl)}
                    alt=""
                    width="58"
                    height="58"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </span>
                <span className="tier-person__name">{character.name}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tags({
  tags,
  icons = [],
}: {
  tags: string[];
  icons?: CharacterRoleIcon[];
}) {
  return (
    <div className="tag-row">
      {tags.slice(0, 4).map((tag) => {
        const icon = icons.find(
          (item) => normalizeSearchText(item.name) === normalizeSearchText(tag),
        );
        return (
          <span key={tag}>
            {icon?.iconUrl ? (
              <img
                src={resolveAssetUrl(icon.iconUrl)}
                alt=""
                width="18"
                height="18"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : null}
            {tag}
          </span>
        );
      })}
    </div>
  );
}

function CharactersPage({
  data,
  user,
  setData,
}: {
  data: SiteData;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [rarity, setRarity] = useState('Любая редкость');
  const [tier, setTier] = useState('Любой тир');
  const [attribute, setAttribute] = useState(anyAttributeOption);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const indexedCharacters = useMemo(
    () =>
      data.characters.map((character) => ({
        character,
        searchText: getCharacterSearchText(character),
      })),
    [data.characters],
  );
  const attributeOptions = useMemo(
    () => getAttributeOptions(data.characters),
    [data.characters],
  );
  const hasActiveFilters =
    Boolean(query.trim()) ||
    rarity !== 'Любая редкость' ||
    tier !== 'Любой тир' ||
    attribute !== anyAttributeOption;

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredQuery);

    return indexedCharacters
      .filter(({ character, searchText }) => {
        const queryMatch =
          !normalizedQuery || searchText.includes(normalizedQuery);
        const tierPlacement = getCharacterTierPlacement(data, character.id);
        return (
          queryMatch &&
          (rarity === 'Любая редкость' || character.rarity === rarity) &&
          (tier === 'Любой тир' || tierPlacement?.tier === tier) &&
          (attribute === anyAttributeOption ||
            character.attribute === attribute)
        );
      })
      .map(({ character }) => character);
  }, [attribute, data, deferredQuery, indexedCharacters, rarity, tier]);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(
          user && roleWeight[user.role] >= roleWeight.editor,
        ),
      }),
    );
  }

  function resetFilters() {
    setQuery('');
    setRarity('Любая редкость');
    setTier('Любой тир');
    setAttribute(anyAttributeOption);
  }

  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">База персонажей</p>
        <h1>Персонажи Neverness to Everness</h1>
        <p>
          Биографии, фракции, способности, ресурсы прокачки, симпатия, озвучка и
          пробуждения. Практическая мета находится в разделе гайдов.
        </p>
        {canManageContent(user, 'characters', 'create') ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => setEditorOpen(true)}
          >
            <Plus aria-hidden="true" /> Добавить персонажа
          </button>
        ) : null}
      </section>
      <section className="filter-panel" aria-label="Фильтры персонажей">
        <label>
          <span>Поиск</span>
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Имя, атрибут, тег..."
            aria-describedby="character-results-count"
          />
        </label>
        <SelectFilter
          label="Тир"
          value={tier}
          setValue={setTier}
          options={tierOptions}
        />
        <SelectFilter
          label="Атрибут"
          value={attribute}
          setValue={setAttribute}
          options={attributeOptions}
        />
        <SelectFilter
          label="Редкость"
          value={rarity}
          setValue={setRarity}
          options={rarityOptions}
        />
      </section>
      <div className="filter-results-row">
        <p
          id="character-results-count"
          className="filter-summary"
          aria-live="polite"
        >
          Найдено: {filtered.length} из {data.characters.length}
        </p>
        {hasActiveFilters ? (
          <button
            className="ghost-button filter-reset-button"
            type="button"
            onClick={resetFilters}
          >
            <RotateCw aria-hidden="true" /> Сбросить фильтры
          </button>
        ) : null}
      </div>
      {filtered.length ? (
        <section
          className="character-grid"
          aria-labelledby="character-results-heading"
        >
          <h2 id="character-results-heading" className="sr-only">
            Список персонажей
          </h2>
          {filtered.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              data={data}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          title="Персонажи не найдены"
          text="Сбросьте фильтры или добавьте нового персонажа прямо из этого раздела."
        />
      )}
      <EditorShell
        open={editorOpen}
        title="Добавить персонажа"
        eyebrow="База персонажей"
        description="Карточка персонажа хранит лор, профиль, способности, материалы, озвучку и косметику. Билды остаются в гайдах."
        dirty={editorDirty}
        onClose={() => {
          setEditorDirty(false);
          setEditorOpen(false);
        }}
      >
        {user ? (
          <Suspense
            fallback={<SkeletonGrid label="Загрузка редактора персонажа" />}
          >
            <AdminCharacterEditor
              items={data.characters}
              initialSelectedId="new"
              access={contentAccess(user, 'characters')}
              onRefresh={refreshContent}
              onDirtyChange={setEditorDirty}
              onSaved={({ slug, status }) => {
                if (status !== 'published' || !slug) return;
                setEditorDirty(false);
                setEditorOpen(false);
                window.location.hash = `#/characters/${slug}`;
              }}
            />
          </Suspense>
        ) : null}
      </EditorShell>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  setValue,
  options,
  optionLabels,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: string[];
  optionLabels?: Record<string, string>;
}) {
  const id = `filter-${label}`;
  return (
    <label>
      <span>{label}</span>
      <ListFilter aria-hidden="true" />
      <select
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] || option}
          </option>
        ))}
      </select>
    </label>
  );
}

const voiceLanguageOrder: CharacterVoiceLine['language'][] = [
  'Японский',
  'Английский',
  'Корейский',
  'Китайский',
];

function VoiceLinePlayer({ line }: { line: CharacterVoiceLine }) {
  const [audioFailed, setAudioFailed] = useState(false);
  const audioUrl = resolveAssetUrl(line.audioUrl);

  if (canPlayDirectAudio(line.audioUrl) && !audioFailed) {
    return (
      <audio
        controls
        preload="none"
        src={audioUrl}
        onError={() => setAudioFailed(true)}
      >
        Ваш браузер не поддерживает аудио.
      </audio>
    );
  }

  if (line.sourceUrl) {
    return (
      <a
        className="ghost-button"
        href={line.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        <Headphones aria-hidden="true" /> Открыть источник записи
      </a>
    );
  }

  return (
    <span className="audio-placeholder">
      <Headphones aria-hidden="true" />
      {audioFailed ? 'Запись недоступна' : 'Прямой аудиофайл не добавлен'}
    </span>
  );
}

function CharacterVoiceLibrary({ lines }: { lines: CharacterVoiceLine[] }) {
  const languages = useMemo(
    () =>
      voiceLanguageOrder.filter((language) =>
        lines.some((line) => line.language === language),
      ),
    [lines],
  );
  const [activeLanguage, setActiveLanguage] = useState<
    CharacterVoiceLine['language']
  >(languages[0] || 'Японский');
  const [visibleCount, setVisibleCount] = useState(8);
  const panelId = `${useId().replace(/:/g, '')}-voice-lines`;

  useEffect(() => {
    if (!languages.includes(activeLanguage) && languages[0]) {
      setActiveLanguage(languages[0]);
    }
  }, [activeLanguage, languages]);

  useEffect(() => setVisibleCount(8), [activeLanguage]);

  const languageLines = lines.filter(
    (line) => line.language === activeLanguage,
  );
  const visibleLines = languageLines.slice(0, visibleCount);

  return (
    <div className="voice-library">
      <div
        className="voice-language-tabs"
        role="tablist"
        aria-label="Язык озвучки"
      >
        {languages.map((language) => {
          const count = lines.filter(
            (line) => line.language === language,
          ).length;
          const selected = language === activeLanguage;
          return (
            <button
              type="button"
              role="tab"
              aria-controls={panelId}
              aria-selected={selected}
              className={selected ? 'active' : ''}
              key={language}
              onClick={() => setActiveLanguage(language)}
            >
              {language}
              <span>{count}</span>
            </button>
          );
        })}
      </div>
      <div
        className="voice-line-list"
        id={panelId}
        role="tabpanel"
        aria-label={`Реплики: ${activeLanguage}`}
      >
        {visibleLines.map((line) => (
          <article key={`${line.language}:${line.id}`}>
            <div>
              <strong>{line.title}</strong>
              <span>{line.language}</span>
            </div>
            <div className="voice-line-media">
              {line.description ? <p>{line.description}</p> : null}
              <VoiceLinePlayer line={line} />
            </div>
          </article>
        ))}
        {visibleLines.length < languageLines.length ? (
          <button
            className="ghost-button voice-library__more"
            type="button"
            onClick={() => setVisibleCount((count) => count + 8)}
          >
            Показать ещё
            <span>
              {Math.min(8, languageLines.length - visibleLines.length)} из{' '}
              {languageLines.length - visibleLines.length}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CharacterAbilityCard({
  ability,
  defaultOpen,
}: {
  ability: CharacterAbility;
  defaultOpen: boolean;
}) {
  const { description, attributes } = useMemo(
    () => splitAbilityPresentation(ability),
    [ability],
  );
  const [activePane, setActivePane] = useState<'description' | 'attributes'>(
    'description',
  );

  return (
    <details className="ability-card" open={defaultOpen || undefined}>
      <summary>
        <span className="ability-card__icon" aria-hidden="true">
          {ability.iconUrl ? (
            <img
              src={resolveAssetUrl(ability.iconUrl)}
              alt=""
              width="64"
              height="64"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <BookOpen aria-hidden="true" />
          )}
        </span>
        <span className="ability-card__meta">
          <span className="eyebrow">{ability.type || 'Навык'}</span>
          <strong>{ability.name || 'Без названия'}</strong>
        </span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="ability-card__body">
        {attributes.length ? (
          <div
            className="ability-card__tabs"
            role="tablist"
            aria-label={`Данные навыка «${ability.name}»`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activePane === 'description'}
              className={activePane === 'description' ? 'active' : ''}
              onClick={() => setActivePane('description')}
            >
              Описание
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activePane === 'attributes'}
              className={activePane === 'attributes' ? 'active' : ''}
              onClick={() => setActivePane('attributes')}
            >
              Атрибуты
              <span>{attributes.length}</span>
            </button>
          </div>
        ) : null}
        {activePane === 'attributes' && attributes.length ? (
          <dl className="ability-attribute-grid">
            {attributes.map((attribute) => (
              <div key={attribute.id}>
                <dt>{attribute.label}</dt>
                <dd>{attribute.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="ability-card__description">
            <MarkdownPreview
              value={description || 'Описание навыка требует проверки.'}
            />
          </div>
        )}
      </div>
    </details>
  );
}

function CharacterSkinMedia({
  skin,
  onOpen,
}: {
  skin: CharacterProfile['skins'][number];
  onOpen: () => void;
}) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );

  useEffect(() => {
    setLoadState('loading');
    const timeout = globalThis.setTimeout(() => {
      setLoadState((current) => (current === 'loading' ? 'failed' : current));
    }, 3_500);
    return () => globalThis.clearTimeout(timeout);
  }, [skin.id, skin.imageUrl]);

  if (loadState === 'failed') {
    return (
      <div className="skin-media-fallback" role="status">
        <ImageIcon aria-hidden="true" />
        <span>
          Изображение пока недоступно. Обновите страницу, чтобы повторить
          загрузку.
        </span>
      </div>
    );
  }

  return (
    <button
      className="skin-media"
      type="button"
      aria-label={`Открыть изображение «${skin.name}» целиком`}
      aria-busy={loadState === 'loading'}
      disabled={loadState === 'loading'}
      onClick={onOpen}
    >
      <img
        src={resolveAssetUrl(skin.imageUrl)}
        alt={skin.name}
        width="640"
        height="720"
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoadState('ready')}
        onError={() => setLoadState('failed')}
      />
      <span className="skin-media-action">
        {loadState === 'loading' ? (
          'Загружаем изображение…'
        ) : (
          <>
            <Maximize2 aria-hidden="true" /> Посмотреть целиком
          </>
        )}
      </span>
    </button>
  );
}

function CharacterDetailPage({
  data,
  slug,
  user,
  setData,
}: {
  data: SiteData;
  slug: string;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const character = getCharacter(data, slug);
  const [characterEditorOpen, setCharacterEditorOpen] = useState(false);
  const [guideEditorOpen, setGuideEditorOpen] = useState(false);
  const [characterEditorDirty, setCharacterEditorDirty] = useState(false);
  const [guideEditorDirty, setGuideEditorDirty] = useState(false);
  const [activeCharacterSection, setActiveCharacterSection] = useState(
    'character-biography',
  );
  const [activeSkin, setActiveSkin] = useState<{
    name: string;
    imageUrl: string;
    description: string;
  } | null>(null);
  const skinDialogRef = useRef<HTMLDialogElement>(null);

  const scrollToCharacterSection = useCallback(
    (id: string, behavior: ScrollBehavior = 'smooth') => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ behavior, block: 'start' });
    },
    [],
  );

  useEffect(() => {
    const sectionIds = [
      'character-biography',
      'character-abilities',
      'character-awakenings',
      'character-progression',
      'character-wardrobe',
      'character-voice',
    ];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          );
        if (visible[0]?.target.id)
          setActiveCharacterSection(visible[0].target.id);
      },
      { rootMargin: '-150px 0px -58% 0px', threshold: [0, 0.12, 0.4] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [slug]);

  useEffect(() => {
    const dialog = skinDialogRef.current;
    if (!dialog) return;
    if (activeSkin && !dialog.open) dialog.showModal();
    if (!activeSkin && dialog.open) dialog.close();
  }, [activeSkin]);

  if (!character) {
    return (
      <EmptyState
        title="Персонаж не найден"
        text="Проверьте slug или создайте карточку прямо в разделе персонажей."
      />
    );
  }
  const profile = character.profile || {
    faction: '',
    arcType: '',
    birthday: '',
    releaseDate: '',
    biographyShort: character.shortDescription,
    biography: character.summary,
    trivia: '',
    roleTags: [character.role],
    voiceActors: [],
    materials: [],
    baseStats: [],
    abilities: [],
    skins: [],
    friendship: [],
    gifts: [],
    voiceLines: [],
    awakenings: [],
  };
  const guide = getGuideForCharacter(data, character);
  const tierPlacement = getCharacterTierPlacement(data, character.id);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(
          user && roleWeight[user.role] >= roleWeight.editor,
        ),
      }),
    );
  }

  return (
    <div className="page-stack character-profile-page">
      <section className="character-lore-hero">
        <img
          src={resolveAssetUrl(character.splashUrl)}
          alt={character.name}
          width="520"
          height="620"
          loading="eager"
          referrerPolicy="no-referrer"
        />
        <div>
          <p className="eyebrow">
            {character.originalName} · {profile.faction || 'Фракция уточняется'}
          </p>
          <h1>{character.name}</h1>
          {character.shortDescription ? (
            <p>{character.shortDescription}</p>
          ) : null}
          <dl className="guide-facts character-profile-facts">
            <div>
              <dt>День рождения</dt>
              <dd>{profile.birthday || 'Не указан'}</dd>
            </div>
            <div>
              <dt>Дата релиза</dt>
              <dd>
                {profile.releaseDate
                  ? formatProfileDate(profile.releaseDate)
                  : 'Не указана'}
              </dd>
            </div>
            <div>
              <dt>Версия появления</dt>
              <dd>{profile.releaseVersion || 'Не указана'}</dd>
            </div>
            <div>
              <dt>Атрибут</dt>
              <dd>{character.attribute}</dd>
            </div>
            <div>
              <dt>Тип дуги</dt>
              <dd>{profile.arcType || 'Не указан'}</dd>
            </div>
            <div>
              <dt>Редкость</dt>
              <dd>{character.rarity}</dd>
            </div>
            <div>
              <dt>Тир-лист</dt>
              <dd>{tierPlacement ? tierPlacement.tier : 'Не задан'}</dd>
            </div>
            <div>
              <dt>Фракция</dt>
              <dd>{profile.faction || 'Не указана'}</dd>
            </div>
          </dl>
          <Tags
            tags={profile.roleTags.length ? profile.roleTags : character.tags}
            icons={profile.roleIcons}
          />
          <div className="button-row">
            {guide ? (
              <a className="primary-button" href={`#/guides/${guide.slug}`}>
                <BookOpen aria-hidden="true" /> Гайд на персонажа
              </a>
            ) : canManageContent(user, 'guides', 'create') ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => setGuideEditorOpen(true)}
              >
                <Plus aria-hidden="true" /> Создать гайд
              </button>
            ) : (
              <span className="status-label status-draft">Гайд скоро</span>
            )}
            {canManageContent(user, 'characters', 'edit') ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => setCharacterEditorOpen(true)}
              >
                <Pencil aria-hidden="true" /> Редактировать персонажа
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <nav className="character-section-nav" aria-label="Разделы персонажа">
        {[
          ['character-biography', 'Биография'],
          ['character-abilities', 'Способности'],
          ['character-awakenings', 'Пробуждения'],
          ['character-progression', 'Прокачка'],
          ...(profile.skins.length ? [['character-wardrobe', 'Гардероб']] : []),
          ['character-voice', 'Озвучка'],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={activeCharacterSection === id ? 'active' : ''}
            aria-current={
              activeCharacterSection === id ? 'location' : undefined
            }
            onClick={() => {
              setActiveCharacterSection(id);
              scrollToCharacterSection(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="character-detail-section" id="character-biography">
        <SectionHeader
          title="Биография"
          text="История персонажа без мета-билдов и боевых ротаций."
        />
        <MarkdownPreview value={profile.biography || character.summary} />
      </section>

      <section className="character-detail-section" id="character-abilities">
        <SectionHeader
          title="Способности"
          text="Точные игровые навыки и начальные показатели."
        />
        {profile.baseStats.length ? (
          <dl className="character-stat-grid">
            {profile.baseStats.map((stat) => (
              <div key={stat.id}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {profile.abilities.length ? (
          <div className="ability-list ability-list--profile">
            {profile.abilities.map((ability, index) => (
              <CharacterAbilityCard
                key={ability.id}
                ability={ability}
                defaultOpen={index === 0}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Способности уточняются"
            text="Редакция добавит описания после проверки игровых данных."
          />
        )}
      </section>

      <section className="character-detail-section" id="character-awakenings">
        <SectionHeader
          title="Пробуждения 0-6"
          text="Каждый уровень показан отдельно, чтобы сравнение было прозрачным."
        />
        {profile.awakenings.length ? (
          <div className="awakening-grid awakening-path">
            {[...profile.awakenings]
              .sort((a, b) => a.level - b.level)
              .map((awakening) => (
                <article
                  className="awakening-card"
                  key={`${awakening.level}-${awakening.name}`}
                >
                  <span
                    className="awakening-card__level"
                    aria-label={`Уровень ${awakening.level}`}
                  >
                    {awakening.level}
                  </span>
                  <span className="awakening-card__icon" aria-hidden="true">
                    {awakening.iconUrl ? (
                      <img
                        src={resolveAssetUrl(awakening.iconUrl)}
                        alt=""
                        width="58"
                        height="58"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Star />
                    )}
                  </span>
                  <div className="character-detail-card-copy">
                    <p className="eyebrow">
                      {awakening.level > 0
                        ? `Пробуждение ${awakening.level}`
                        : 'Без пробуждений'}
                    </p>
                    <h3>
                      {awakening.name || `Пробуждение ${awakening.level}`}
                    </h3>
                    <MarkdownPreview value={awakening.description} />
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <EmptyState
            title="Пробуждения не добавлены"
            text="Без пробуждений персонаж используется без дополнительных эффектов."
          />
        )}
      </section>

      <section className="character-detail-section" id="character-progression">
        <SectionHeader
          title="Прокачка и симпатия"
          text="Материалы, источники, награды дружбы и любимые подарки."
        />
        {profile.materials.length ? (
          <div className="material-grid">
            {profile.materials.map((material) => (
              <article key={material.id}>
                {material.iconUrl ? (
                  <img
                    src={resolveAssetUrl(material.iconUrl)}
                    alt=""
                    width="54"
                    height="54"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span
                    className="character-detail-fallback-icon"
                    aria-hidden="true"
                  >
                    <ImageIcon />
                  </span>
                )}
                <div className="character-detail-card-copy">
                  <h3>{material.name}</h3>
                  <strong>{material.amount}</strong>
                  <p>{material.source}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {profile.friendship.length ? (
          <div className="friendship-track">
            {[...profile.friendship]
              .sort((a, b) => a.level - b.level)
              .map((level) => {
                const rewards = level.rewards?.length
                  ? level.rewards
                  : level.rewardName || level.rewardIconUrl
                    ? [
                        {
                          id: `legacy-reward-${level.level}`,
                          name: level.rewardName,
                          quantity: '',
                          iconUrl: level.rewardIconUrl,
                        },
                      ]
                    : [];
                return (
                  <article key={level.level}>
                    <strong>{level.level}</strong>
                    <div className="friendship-level-content">
                      <h3>{`Уровень симпатии ${level.level}`}</h3>
                      <p>{level.description}</p>
                      {rewards.length ? (
                        <ul
                          className="friendship-reward-list"
                          aria-label={`Награды уровня ${level.level}`}
                        >
                          {rewards.map((reward) => (
                            <li key={reward.id}>
                              {reward.iconUrl ? (
                                <img
                                  src={resolveAssetUrl(reward.iconUrl)}
                                  alt=""
                                  width="44"
                                  height="44"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                              <span>{reward.name || 'Награда'}</span>
                              {reward.quantity ? (
                                <strong>×{reward.quantity}</strong>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </article>
                );
              })}
          </div>
        ) : null}
        {profile.gifts.length ? (
          <div className="gift-grid">
            {profile.gifts.map((gift) => (
              <article key={gift.id}>
                {gift.iconUrl ? (
                  <img
                    src={resolveAssetUrl(gift.iconUrl)}
                    alt=""
                    width="54"
                    height="54"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span
                    className="character-detail-fallback-icon"
                    aria-hidden="true"
                  >
                    <Star />
                  </span>
                )}
                <div className="character-detail-card-copy">
                  <h3>{gift.name}</h3>
                  <p>{gift.effect}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {profile.skins.length ? (
        <section className="character-detail-section" id="character-wardrobe">
          <SectionHeader title="Гардероб" />
          <div className="skin-grid">
            {profile.skins.map((skin) => (
              <article key={skin.id}>
                {skin.imageUrl ? (
                  <CharacterSkinMedia
                    skin={skin}
                    onOpen={() =>
                      setActiveSkin({
                        name: skin.name,
                        imageUrl: skin.imageUrl,
                        description: skin.description,
                      })
                    }
                  />
                ) : null}
                <h3>{skin.name}</h3>
                <p>{skin.description}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="character-detail-section" id="character-voice">
        <SectionHeader
          title="Озвучка"
          text="Актёры дубляжа и доступные реплики на разных языках."
        />
        <div className="character-voice-layout">
          <section
            className="voice-cast-panel"
            aria-labelledby="voice-cast-title"
          >
            <div>
              <p className="eyebrow">Дубляж</p>
              <h3 id="voice-cast-title">Актёры озвучки</h3>
            </div>
            {profile.voiceActors.length ? (
              <dl className="voice-actor-grid">
                {profile.voiceActors.map((actor) => (
                  <div key={`${actor.language}-${actor.name}`}>
                    <dt>{actor.language}</dt>
                    <dd>{actor.name}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="empty-inline-copy">
                Актёры пока не указаны: редакция добавит их после проверки
                источников.
              </p>
            )}
          </section>
          <section
            className="voice-records-panel"
            aria-labelledby="voice-records-title"
          >
            <div>
              <p className="eyebrow">Фонотека</p>
              <h3 id="voice-records-title">Реплики персонажа</h3>
            </div>
            {profile.voiceLines.length ? (
              <CharacterVoiceLibrary lines={profile.voiceLines} />
            ) : (
              <p className="empty-inline-copy">
                Аудио пока не добавлено. Редакторы смогут разместить реплики для
                каждого языка отдельно.
              </p>
            )}
          </section>
        </div>
      </section>

      {profile.trivia ? (
        <section className="character-detail-section">
          <SectionHeader title="Пасхалки и интересные факты" />
          <MarkdownPreview value={profile.trivia} />
        </section>
      ) : null}
      <dialog
        className="skin-lightbox"
        ref={skinDialogRef}
        onClose={() => setActiveSkin(null)}
        aria-label={activeSkin ? `Гардероб: ${activeSkin.name}` : 'Гардероб'}
      >
        {activeSkin ? (
          <div className="skin-lightbox-layout">
            <button
              className="icon-button skin-lightbox-close"
              type="button"
              aria-label="Закрыть полноразмерное изображение"
              onClick={() => setActiveSkin(null)}
            >
              <X aria-hidden="true" />
            </button>
            <img
              src={resolveAssetUrl(activeSkin.imageUrl)}
              alt={activeSkin.name}
              loading="eager"
              referrerPolicy="no-referrer"
            />
            <div>
              <p className="eyebrow">Гардероб</p>
              <h2>{activeSkin.name}</h2>
              {activeSkin.description ? <p>{activeSkin.description}</p> : null}
            </div>
          </div>
        ) : null}
      </dialog>
      <CommentsBlock
        targetType="character"
        targetId={character.id}
        data={data}
        user={user}
      />
      <EditorShell
        open={characterEditorOpen}
        title={`Редактировать: ${character.name}`}
        eyebrow="Карточка персонажа"
        description="Лор, профиль, способности, материалы, озвучка, симпатия и косметика. Команды и ротации редактируются в гайде."
        dirty={characterEditorDirty}
        onClose={() => {
          setCharacterEditorDirty(false);
          setCharacterEditorOpen(false);
        }}
      >
        {user ? (
          <Suspense
            fallback={<SkeletonGrid label="Загрузка редактора персонажа" />}
          >
            <AdminCharacterEditor
              items={data.characters}
              initialSelectedId={character.id}
              access={contentAccess(user, 'characters')}
              onRefresh={refreshContent}
              onDirtyChange={setCharacterEditorDirty}
              onSaved={({ slug, status }) => {
                if (status !== 'published') return;
                setCharacterEditorDirty(false);
                setCharacterEditorOpen(false);
                if (slug) {
                  window.location.hash = `#/characters/${slug}`;
                }
              }}
            />
          </Suspense>
        ) : null}
      </EditorShell>
      <EditorShell
        open={guideEditorOpen}
        title={`Создать гайд: ${character.name}`}
        eyebrow="Гайд персонажа"
        description="Создайте персонажный meta-гайд. Отряды, ротации, видео и билды будут редактироваться внутри гайда."
        dirty={guideEditorDirty}
        onClose={() => {
          setGuideEditorDirty(false);
          setGuideEditorOpen(false);
        }}
      >
        {user ? (
          <Suspense
            fallback={<SkeletonGrid label="Загрузка редактора гайда" />}
          >
            <AdminGuides
              data={data}
              setData={setData}
              user={user}
              initialGuideId="new"
              initialCharacterId={character.id}
              onDirtyChange={setGuideEditorDirty}
              onSaved={({ slug, status }) => {
                if (status !== 'published' || !slug) return;
                setGuideEditorDirty(false);
                setGuideEditorOpen(false);
                window.location.hash = `#/guides/${slug}`;
              }}
            />
          </Suspense>
        ) : null}
      </EditorShell>
    </div>
  );
}

function GuidePage({
  data,
  slug,
  user,
  setData,
}: {
  data: SiteData;
  slug: string;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const guide = data.guides.find(
    (item) => item.slug === slug || item.id === slug,
  );
  const character = guide ? getGuideCharacter(data, guide) : undefined;

  if (!guide || !character) {
    return (
      <EmptyState
        title="Гайд не найден"
        text="Возможно, он еще черновик или был перемещен."
      />
    );
  }

  return (
    <GuideDetail
      data={data}
      guide={guide}
      character={character}
      user={user}
      setData={setData}
    />
  );
}

function GuideHero({
  guide,
  character,
  tierPlacement,
}: {
  guide: Guide;
  character: Character;
  tierPlacement: ReturnType<typeof getCharacterTierPlacement>;
}) {
  return (
    <section className="guide-hero">
      <img
        src={resolveAssetUrl(character.splashUrl)}
        alt={character.name}
        width="520"
        height="620"
        loading="eager"
        referrerPolicy="no-referrer"
      />
      <div>
        <p className="eyebrow">
          Гайд на {character.name} · патч {guide.patch}
        </p>
        <h1>{guide.title}</h1>
        <p className="guide-hero-summary">{guide.summary}</p>
        <dl className="guide-facts">
          <div>
            <dt>Роль</dt>
            <dd>{character.role}</dd>
          </div>
          <div>
            <dt>Тип</dt>
            <dd>{character.type}</dd>
          </div>
          <div>
            <dt>Редкость</dt>
            <dd>{character.rarity}</dd>
          </div>
          <div>
            <dt>Тир-лист</dt>
            <dd>{tierPlacement?.tier || 'Не задан'}</dd>
          </div>
        </dl>
        <Tags tags={character.tags} />
        <div className="guide-hero-byline">
          <span>Автор: {guide.author}</span>
          <span>Обновлено {formatDate(guide.updatedAt)}</span>
        </div>
      </div>
    </section>
  );
}

function GuideDetail({
  data,
  guide,
  character,
  user,
  setData,
}: {
  data: SiteData;
  guide: Guide;
  character: Character;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [activeGuideSection, setActiveGuideSection] = useState('');
  const relatedTeams = data.teams.filter(
    (team) =>
      team.guideId === guide.id ||
      (!team.guideId &&
        team.members.some((member) => member.characterId === character.id)),
  );
  const hasStructuredTeams = relatedTeams.length > 0;
  const tierPlacement = getCharacterTierPlacement(data, character.id);
  const orderedSections = useMemo(
    () =>
      [...guide.sections]
        .filter((section) => {
          const type = section.type.trim().toLocaleLowerCase('ru-RU');
          const title = section.title.trim();
          return (
            !['source', 'sources', 'references', 'actuality'].includes(type) &&
            (!hasStructuredTeams ||
              !['team', 'teams', 'rotation', 'rotations'].includes(type)) &&
            (!hasStructuredTeams ||
              !/(?:лучш(?:ие|ая)\s+команд|отряд|ротаци)/i.test(title)) &&
            !/^источники(?:\s+и\s+актуальность)?$/i.test(title)
          );
        })
        .sort((a, b) => a.position - b.position),
    [guide.sections, hasStructuredTeams],
  );
  const guideNavigation = useMemo(
    () => [
      ...orderedSections.map((section) => ({
        id: section.id,
        title: section.title,
      })),
      { id: 'guide-teams', title: 'Отряды и ротации' },
    ],
    [orderedSections],
  );

  useEffect(() => {
    const sections = guideNavigation
      .map((section) => document.getElementById(section.id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length || !('IntersectionObserver' in window)) return;
    setActiveGuideSection((current) => current || sections[0].id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          );
        if (visible[0]?.target.id) setActiveGuideSection(visible[0].target.id);
      },
      { rootMargin: '-120px 0px -62% 0px', threshold: [0, 0.15, 0.5] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [guideNavigation]);

  return (
    <div className="page-stack">
      <GuideHero
        guide={guide}
        character={character}
        tierPlacement={tierPlacement}
      />
      <section className="guide-toolbar">
        <div>
          <p>Проверенный материал редакции</p>
          <strong>
            {character.name} · {character.attribute} · {character.role}
          </strong>
        </div>
        <div className="guide-toolbar-actions">
          <a className="ghost-button" href={`#/characters/${character.slug}`}>
            <UserCircle aria-hidden="true" /> О персонаже
          </a>
          <RatingBar targetType="guide" targetId={guide.id} user={user} />
          {canManageContent(user, 'guides', 'edit') ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => setEditorOpen(true)}
            >
              <Pencil aria-hidden="true" /> Редактировать гайд
            </button>
          ) : null}
        </div>
      </section>
      <section className="guide-layout">
        <aside className="toc" aria-label="Навигация по гайду">
          <strong>Разделы</strong>
          {guideNavigation.map((section) => (
            <button
              type="button"
              key={section.id}
              className={activeGuideSection === section.id ? 'active' : ''}
              aria-current={
                activeGuideSection === section.id ? 'location' : undefined
              }
              onClick={() => {
                setActiveGuideSection(section.id);
                document
                  .getElementById(section.id)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {section.title}
            </button>
          ))}
        </aside>
        <div className="guide-section-list">
          {orderedSections.map((section) => (
            <article
              className="guide-section-card"
              id={section.id}
              key={section.id}
            >
              <h2>{section.title}</h2>
              <MarkdownPreview value={section.content} />
            </article>
          ))}
          <article
            className="guide-section-card guide-teams-section"
            id="guide-teams"
          >
            <SectionHeader
              eyebrow="Внутри гайда"
              title={`Лучшие отряды и ротации для ${character.name}`}
              text="Состав, роли и последовательность действий собраны в одном месте."
            />
            <div className="team-grid">
              {relatedTeams.length ? (
                relatedTeams.map((team) => (
                  <TeamCard key={team.id} team={team} data={data} />
                ))
              ) : (
                <EmptyState
                  title="Отряды пока не добавлены"
                  text="Редактор сможет собрать состав и расписать его ротацию прямо в этом гайде."
                />
              )}
            </div>
          </article>
        </div>
      </section>
      {guide.videoUrl ? (
        <VideoEmbed
          url={guide.videoUrl}
          title={guide.title}
          transcript={guide.transcript}
        />
      ) : null}
      <CommentsBlock
        targetType="guide"
        targetId={guide.id}
        data={data}
        user={user}
      />
      <EditorShell
        open={editorOpen}
        title={`Редактировать гайд: ${character.name}`}
        eyebrow="Meta-гайд"
        description="Секции гайда, команды, ротации и видео редактируются здесь, без отдельного публичного раздела команд."
        dirty={editorDirty}
        onClose={() => {
          setEditorDirty(false);
          setEditorOpen(false);
        }}
      >
        {user ? (
          <Suspense
            fallback={<SkeletonGrid label="Загрузка редактора гайда" />}
          >
            <AdminGuides
              data={data}
              setData={setData}
              user={user}
              initialGuideId={guide.id}
              onDirtyChange={setEditorDirty}
              onSaved={({ slug, status }) => {
                if (status !== 'published') return;
                setEditorDirty(false);
                setEditorOpen(false);
                if (slug) {
                  window.location.hash = `#/guides/${slug}`;
                }
              }}
            />
          </Suspense>
        ) : null}
      </EditorShell>
    </div>
  );
}

function RatingBar({
  targetType,
  targetId,
  user,
}: {
  targetType: string;
  targetId: string;
  user: User | null;
}) {
  const [score, setScore] = useState<ReactionSummary>({
    likes: 0,
    dislikes: 0,
    useful: 0,
    active: [],
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!hasApiBase()) return;
    let mounted = true;
    loadReactionSummary(targetType, targetId).then((result) => {
      if (mounted && result.ok) setScore(result.data);
    });
    return () => {
      mounted = false;
    };
  }, [targetId, targetType]);

  async function react(reactionType: 'like' | 'dislike' | 'useful') {
    if (!user) {
      setMessage('Войдите в профиль, чтобы оценить материал.');
      return;
    }
    setPending(true);
    setMessage('');
    const isActive = score.active.includes(reactionType);
    const result = isActive
      ? await removeReaction(targetType, targetId, reactionType)
      : await sendReaction(targetType, targetId, reactionType);
    if (result.ok) {
      setScore(result.data);
      setMessage('');
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <div className="rating-control">
      <div className="rating-bar" aria-label="Оценка материала">
        <button
          className={score.active.includes('like') ? 'is-active' : ''}
          type="button"
          disabled={pending}
          onClick={() => react('like')}
          aria-label={`Нравится: ${score.likes}`}
          aria-pressed={score.active.includes('like')}
        >
          <ThumbsUp aria-hidden="true" /> {score.likes}
        </button>
        <button
          className={score.active.includes('dislike') ? 'is-active' : ''}
          type="button"
          disabled={pending}
          onClick={() => react('dislike')}
          aria-label={`Не нравится: ${score.dislikes}`}
          aria-pressed={score.active.includes('dislike')}
        >
          <ThumbsDown aria-hidden="true" /> {score.dislikes}
        </button>
        <button
          className={score.active.includes('useful') ? 'is-active' : ''}
          type="button"
          disabled={pending}
          onClick={() => react('useful')}
          aria-label={`Полезно: ${score.useful}`}
          aria-pressed={score.active.includes('useful')}
        >
          <CheckCircle2 aria-hidden="true" /> Полезно {score.useful}
        </button>
      </div>
      {message ? (
        <p className="inline-status rating-status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function TeamCard({
  team,
  data,
}: {
  team: import('./types').Team;
  data: SiteData;
}) {
  const rotationSteps = team.rotationSteps?.length
    ? team.rotationSteps
    : team.rotation.split('\n').filter(Boolean);
  const hasRotation = rotationSteps.length > 0;

  return (
    <article
      className={`team-card ${hasRotation ? 'has-rotation' : 'without-rotation'}`}
    >
      <div className="team-card-heading">
        <span className="team-card-kicker">
          <Users aria-hidden="true" /> Состав
        </span>
        <h3>{team.title}</h3>
        {team.synergy ? <p>{team.synergy}</p> : null}
      </div>
      <div className="team-members">
        {team.members.map((member) => {
          const character = getCharacter(data, member.characterId);
          return character ? (
            <a
              key={`${team.id}-${member.characterId}`}
              href={`#/characters/${character.slug}`}
            >
              <span className="team-member-avatar" aria-hidden="true">
                <UserCircle />
                {character.imageUrl ? (
                  <img
                    src={resolveAssetUrl(character.imageUrl)}
                    alt=""
                    width="54"
                    height="54"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                ) : null}
              </span>
              <span className="team-member-copy">
                <strong>{character.name}</strong>
                <small>{member.role || character.role}</small>
              </span>
            </a>
          ) : null;
        })}
      </div>
      {hasRotation ? (
        <div className="team-rotation-sequence">
          <div className="rotation-sequence-heading">
            <span>
              <Play aria-hidden="true" /> Старт
            </span>
            <strong>Командная ротация</strong>
          </div>
          <ol>
            {rotationSteps.map((step, index) => (
              <li key={`${team.id}-step-${index}`}>
                <span className="rotation-step-index">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="rotation-cycle-end">
            <RotateCw aria-hidden="true" />
            <span>Конец цепочки · повторить цикл с первого шага</span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function VideoEmbed({
  url,
  title,
  transcript,
}: {
  url: string;
  title: string;
  transcript?: string;
}) {
  const embedUrl = getYoutubeEmbedUrl(url);
  if (!embedUrl) {
    return null;
  }
  return (
    <section className="content-band">
      <SectionHeader
        eyebrow="Видео-гайд"
        title="Видео и текстовая расшифровка"
      />
      <iframe
        className="video-frame"
        src={embedUrl}
        title={title}
        width="1280"
        height="720"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      {transcript ? (
        <div className="video-transcript">
          <h3>Текстовая расшифровка</h3>
          <MarkdownPreview value={transcript} />
        </div>
      ) : null}
    </section>
  );
}

const commentReportReasonLabels: Record<CommentReportReason, string> = {
  spam: 'Спам или реклама',
  abuse: 'Оскорбления или травля',
  misinformation: 'Недостоверная информация',
  off_topic: 'Не относится к обсуждению',
  other: 'Другая причина',
};

function CommentsBlock({
  targetType,
  targetId,
  data,
  user,
  readOnly = false,
}: {
  targetType: Comment['targetType'];
  targetId: string;
  data: SiteData;
  user: User | null;
  readOnly?: boolean;
}) {
  const fallbackComments = data.comments.filter(
    (comment) =>
      comment.targetType === targetType && comment.targetId === targetId,
  );
  const [comments, setComments] = useState(fallbackComments);
  const [body, setBody] = useState('');
  const [sort, setSort] = useState<'new' | 'popular'>('new');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editingId, setEditingId] = useState('');
  const [editBody, setEditBody] = useState('');
  const [actionId, setActionId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);
  const [reportTarget, setReportTarget] = useState<Comment | null>(null);
  const [reportReason, setReportReason] = useState<CommentReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(
    new Set(),
  );
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const reportDialogRef = useRef<HTMLDialogElement>(null);
  const handledLinkedCommentRef = useRef('');
  const draftKey = `nte-comment-draft:${targetType}:${targetId}`;
  const canModerateComments = Boolean(
    user && ['moderator', 'admin', 'owner'].includes(user.role),
  );
  const canChooseAnswer = Boolean(
    targetType === 'thread' &&
    user &&
    (canModerateComments ||
      data.threads.find((thread) => thread.id === targetId)?.authorId ===
        user.id),
  );
  const threadedComments = useMemo(() => {
    const byParent = new Map<string, Comment[]>();
    const roots: Comment[] = [];

    comments.forEach((comment) => {
      if (comment.parentId) {
        const children = byParent.get(comment.parentId) || [];
        children.push(comment);
        byParent.set(comment.parentId, children);
      } else {
        roots.push(comment);
      }
    });

    const result: Array<{
      comment: Comment;
      depth: number;
      parentAuthor?: string;
      rootId: string;
    }> = [];
    const append = (
      comment: Comment,
      depth = 0,
      parentAuthor?: string,
      rootId = comment.id,
    ) => {
      result.push({ comment, depth, parentAuthor, rootId });
      (byParent.get(comment.id) || [])
        .sort(
          (left, right) =>
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime(),
        )
        .forEach((child) => append(child, depth + 1, comment.author, rootId));
    };
    roots.forEach((comment) => append(comment));
    comments
      .filter(
        (comment) =>
          comment.parentId &&
          !comments.some((item) => item.id === comment.parentId),
      )
      .forEach((comment) =>
        result.push({ comment, depth: 0, rootId: comment.id }),
      );
    return result;
  }, [comments]);
  const branchReplyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    threadedComments.forEach(({ depth, rootId }) => {
      if (depth > 0) counts.set(rootId, (counts.get(rootId) || 0) + 1);
    });
    return counts;
  }, [threadedComments]);

  useEffect(() => {
    setComments(fallbackComments);
    if (!hasApiBase()) return;
    let mounted = true;
    loadComments(targetType, targetId, sort).then((result) => {
      if (mounted && result.ok) setComments(result.data);
    });
    return () => {
      mounted = false;
    };
  }, [sort, targetId, targetType]);

  useEffect(() => {
    if (!replyTo) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`comment-reply-${replyTo.id}`)?.focus();
    });
  }, [replyTo]);

  useEffect(() => {
    try {
      setBody(localStorage.getItem(draftKey) || '');
    } catch {
      setBody('');
    }
  }, [draftKey]);

  useEffect(() => {
    try {
      if (body.trim()) localStorage.setItem(draftKey, body);
      else localStorage.removeItem(draftKey);
    } catch {
      // Comments still work when storage is unavailable.
    }
  }, [body, draftKey]);

  useEffect(() => {
    const commentId = new URL(window.location.href).searchParams.get('comment');
    if (!commentId || !comments.some((comment) => comment.id === commentId))
      return;
    const linkedCommentKey = `${targetType}:${targetId}:${commentId}`;
    if (handledLinkedCommentRef.current === linkedCommentKey) return;
    handledLinkedCommentRef.current = linkedCommentKey;
    window.requestAnimationFrame(() => {
      document
        .getElementById(`comment-${commentId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [comments, targetId, targetType]);

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setMessage('Войдите в профиль, чтобы участвовать в обсуждении.');
      return;
    }
    if (!body.trim()) {
      setMessage('Напишите комментарий перед отправкой.');
      return;
    }

    setPending(true);
    setMessage('');
    const result = await createComment(targetType, targetId, body, replyTo?.id);
    if (result.ok) {
      setComments((current) => [result.data, ...current]);
      setBody('');
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Nothing to clean up when storage is unavailable.
      }
      setReplyTo(null);
      setMessage('Комментарий опубликован.');
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  async function saveEdit(comment: Comment) {
    if (!editBody.trim()) {
      setMessage('Комментарий не может быть пустым.');
      return;
    }
    setActionId(comment.id);
    const result = await updateComment(comment.id, { body: editBody });
    if (result.ok) {
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                body: editBody.trim(),
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      setEditingId('');
      setMessage('Комментарий обновлен.');
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  function requestDelete(comment: Comment) {
    setDeleteTarget(comment);
    deleteDialogRef.current?.showModal();
  }

  async function confirmDelete() {
    const comment = deleteTarget;
    if (!comment) return;
    deleteDialogRef.current?.close();
    setActionId(comment.id);
    const result = await deleteComment(comment.id);
    if (result.ok) {
      setComments((current) => {
        const removedIds = new Set([comment.id]);
        let foundChild = true;
        while (foundChild) {
          foundChild = false;
          current.forEach((item) => {
            if (
              item.parentId &&
              removedIds.has(item.parentId) &&
              !removedIds.has(item.id)
            ) {
              removedIds.add(item.id);
              foundChild = true;
            }
          });
        }
        return current.filter((item) => !removedIds.has(item.id));
      });
      setMessage('Комментарий удален.');
    } else {
      setMessage(result.error);
    }
    setActionId('');
    setDeleteTarget(null);
  }

  async function reactToComment(
    comment: Comment,
    reactionType: 'like' | 'dislike' | 'useful',
  ) {
    if (!user) {
      setMessage('Войдите, чтобы оценивать комментарии.');
      return;
    }
    setActionId(comment.id);
    const isActive = comment.activeReactions?.includes(reactionType) || false;
    const result = isActive
      ? await removeReaction('comment', comment.id, reactionType)
      : await sendReaction('comment', comment.id, reactionType);
    if (result.ok) {
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                score: result.data.useful,
                reactions: {
                  likes: result.data.likes,
                  dislikes: result.data.dislikes,
                  useful: result.data.useful,
                },
                activeReactions: result.data.active,
              }
            : item,
        ),
      );
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  async function copyCommentLink(comment: Comment) {
    const url = new URL(window.location.href);
    url.searchParams.set('comment', comment.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setMessage('Ссылка на комментарий скопирована.');
    } catch {
      setMessage(
        'Не удалось скопировать ссылку. Скопируйте адрес страницы вручную.',
      );
    }
  }

  async function toggleCommentMarker(
    comment: Comment,
    marker: 'isPinned' | 'isAnswer',
  ) {
    setActionId(comment.id);
    const nextValue = !comment[marker];
    const result = await updateComment(
      comment.id,
      marker === 'isPinned' ? { isPinned: nextValue } : { isAnswer: nextValue },
    );
    if (result.ok) {
      setComments((current) =>
        current.map((item) => ({
          ...item,
          ...(marker === 'isAnswer' && nextValue ? { isAnswer: false } : {}),
          ...(item.id === comment.id ? { [marker]: nextValue } : {}),
        })),
      );
      setMessage(
        marker === 'isPinned'
          ? nextValue
            ? 'Комментарий закреплён.'
            : 'Комментарий откреплён.'
          : nextValue
            ? 'Ответ отмечен как принятый.'
            : 'Отметка принятого ответа снята.',
      );
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  function requestReport(comment: Comment) {
    setReportTarget(comment);
    setReportReason('spam');
    setReportDetails('');
    reportDialogRef.current?.showModal();
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportTarget) return;
    setActionId(reportTarget.id);
    const result = await createCommentReport(
      reportTarget.id,
      reportReason,
      reportDetails,
    );
    if (result.ok) {
      setMessage(
        'Жалоба отправлена модераторам. Спасибо за помощь сообществу.',
      );
      reportDialogRef.current?.close('submitted');
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  function renderCommentComposer(context?: Comment) {
    if (readOnly) return null;
    const editorId = context ? `comment-reply-${context.id}` : 'comment-body';
    return (
      <form
        className={`comment-form${context ? ' inline-reply-composer' : ''}`}
        onSubmit={submitComment}
      >
        <div className="reply-context">
          <label htmlFor={editorId}>
            {context ? `Ответ для ${context.author}` : 'Комментарий'}
          </label>
          {context ? (
            <button
              className="text-button"
              type="button"
              onClick={() => setReplyTo(null)}
            >
              <X aria-hidden="true" /> Отменить ответ
            </button>
          ) : null}
        </div>
        <RichTextEditorField
          id={editorId}
          value={body}
          onChange={setBody}
          actions={[
            'bold',
            'italic',
            'underline',
            'strike',
            'list',
            'ordered-list',
            'quote',
            'link',
          ]}
          placeholder={
            user
              ? context
                ? `Ответьте ${context.author}...`
                : 'Поделитесь опытом, ротацией или уточнением...'
              : 'Войдите, чтобы оставить комментарий...'
          }
          ariaLabel={context ? `Ответ для ${context.author}` : 'Комментарий'}
          maxLength={4000}
          minHeight={context ? 108 : 132}
          compact
          disabled={!user || pending}
        />
        <div className="comment-composer-footer">
          <p id="comment-status" className="inline-status" aria-live="polite">
            {message}
          </p>
          <button
            className="primary-button"
            type="submit"
            disabled={!user || pending}
          >
            <MessageCircle aria-hidden="true" />
            {pending ? 'Отправляем...' : context ? 'Ответить' : 'Отправить'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <section className="content-band">
      <div className="panel-title-row">
        <SectionHeader eyebrow="Комьюнити" title="Комментарии и обсуждения" />
        <label className="compact-select">
          Сортировка
          <select
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as 'new' | 'popular')
            }
          >
            <option value="new">Новые</option>
            <option value="popular">Популярные</option>
          </select>
        </label>
      </div>
      {!replyTo ? renderCommentComposer() : null}
      <div className="comment-list">
        {threadedComments.length ? (
          threadedComments.map(({ comment, depth, parentAuthor, rootId }) =>
            depth > 0 && collapsedBranches.has(rootId) ? null : (
              <article
                className={`comment-card ${
                  comment.parentId
                    ? `is-reply reply-depth-${Math.min(depth, 3)}`
                    : ''
                }`}
                id={`comment-${comment.id}`}
                key={comment.id}
              >
                <div className="comment-heading">
                  <div className="comment-author-line">
                    <strong>{comment.author}</strong>
                    {comment.isPinned ? (
                      <span className="comment-marker is-pinned">
                        <Pin aria-hidden="true" /> Закреплено
                      </span>
                    ) : null}
                    {comment.isAnswer ? (
                      <span className="comment-marker is-answer">
                        <BadgeCheck aria-hidden="true" /> Принятый ответ
                      </span>
                    ) : null}
                  </div>
                  <span>
                    {formatDate(comment.createdAt)}
                    {comment.updatedAt &&
                    comment.updatedAt !== comment.createdAt
                      ? ' · изменено'
                      : ''}
                  </span>
                </div>
                {parentAuthor ? (
                  <p className="comment-parent-context">
                    <Reply aria-hidden="true" /> Ответ для {parentAuthor}
                  </p>
                ) : null}
                {editingId === comment.id ? (
                  <div className="comment-edit">
                    <label htmlFor={`edit-${comment.id}`}>
                      Изменить комментарий
                    </label>
                    <RichTextEditorField
                      id={`edit-${comment.id}`}
                      value={editBody}
                      onChange={setEditBody}
                      actions={[
                        'bold',
                        'italic',
                        'underline',
                        'strike',
                        'list',
                        'ordered-list',
                        'quote',
                        'link',
                      ]}
                      ariaLabel="Изменить комментарий"
                      maxLength={4000}
                      minHeight={108}
                      compact
                    />
                    <div className="button-row">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={actionId === comment.id}
                        onClick={() => saveEdit(comment)}
                      >
                        Сохранить
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setEditingId('')}
                      >
                        Отменить
                      </button>
                    </div>
                  </div>
                ) : (
                  <MarkdownPreview value={comment.body} allowMedia={false} />
                )}
                {!readOnly && replyTo?.id === comment.id
                  ? renderCommentComposer(comment)
                  : null}
                {depth === 0 && (branchReplyCounts.get(comment.id) || 0) > 0 ? (
                  <button
                    className="comment-branch-toggle"
                    type="button"
                    aria-expanded={!collapsedBranches.has(comment.id)}
                    onClick={() =>
                      setCollapsedBranches((current) => {
                        const next = new Set(current);
                        if (next.has(comment.id)) next.delete(comment.id);
                        else next.add(comment.id);
                        return next;
                      })
                    }
                  >
                    <ChevronDown aria-hidden="true" />
                    {collapsedBranches.has(comment.id)
                      ? 'Показать'
                      : 'Скрыть'}{' '}
                    ответы ({branchReplyCounts.get(comment.id)})
                  </button>
                ) : null}
                <div className="comment-actions">
                  {!readOnly ? (
                    <>
                      <button
                        className={`text-button ${comment.activeReactions?.includes('like') ? 'is-active' : ''}`}
                        type="button"
                        aria-pressed={
                          comment.activeReactions?.includes('like') || false
                        }
                        disabled={actionId === comment.id}
                        onClick={() => void reactToComment(comment, 'like')}
                      >
                        <ThumbsUp aria-hidden="true" />
                        Поддержать {comment.reactions?.likes || 0}
                      </button>
                      <button
                        className={`text-button ${comment.activeReactions?.includes('dislike') ? 'is-active' : ''}`}
                        type="button"
                        aria-pressed={
                          comment.activeReactions?.includes('dislike') || false
                        }
                        disabled={actionId === comment.id}
                        onClick={() => void reactToComment(comment, 'dislike')}
                      >
                        <ThumbsDown aria-hidden="true" />
                        Не согласен {comment.reactions?.dislikes || 0}
                      </button>
                      <button
                        className={`text-button ${comment.activeReactions?.includes('useful') ? 'is-active' : ''}`}
                        type="button"
                        aria-pressed={
                          comment.activeReactions?.includes('useful') || false
                        }
                        disabled={actionId === comment.id}
                        onClick={() => void reactToComment(comment, 'useful')}
                      >
                        <CheckCircle2 aria-hidden="true" />
                        Полезно {comment.reactions?.useful ?? comment.score}
                      </button>
                    </>
                  ) : null}
                  {user && !readOnly ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setReplyTo(comment);
                      }}
                    >
                      <Reply aria-hidden="true" />
                      Ответить
                    </button>
                  ) : null}
                  {user && user.id !== comment.userId ? (
                    <button
                      className="text-button comment-report-button"
                      type="button"
                      disabled={actionId === comment.id}
                      onClick={() => requestReport(comment)}
                    >
                      <Flag aria-hidden="true" />
                      Пожаловаться
                    </button>
                  ) : null}
                  <button
                    className="icon-button comment-link-button"
                    type="button"
                    title="Скопировать ссылку на комментарий"
                    aria-label="Скопировать ссылку на комментарий"
                    onClick={() => void copyCommentLink(comment)}
                  >
                    <Link2 aria-hidden="true" />
                  </button>
                  {user?.id === comment.userId && !readOnly ? (
                    <>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditBody(comment.body);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                        Изменить
                      </button>
                      <button
                        className="text-button danger"
                        type="button"
                        disabled={actionId === comment.id}
                        onClick={() => requestDelete(comment)}
                      >
                        <Trash2 aria-hidden="true" />
                        Удалить
                      </button>
                    </>
                  ) : null}
                  {canModerateComments ? (
                    <button
                      className={`text-button ${comment.isPinned ? 'is-active' : ''}`}
                      type="button"
                      aria-pressed={comment.isPinned || false}
                      disabled={actionId === comment.id}
                      onClick={() =>
                        void toggleCommentMarker(comment, 'isPinned')
                      }
                    >
                      <Pin aria-hidden="true" />
                      {comment.isPinned ? 'Открепить' : 'Закрепить'}
                    </button>
                  ) : null}
                  {canChooseAnswer ? (
                    <button
                      className={`text-button ${comment.isAnswer ? 'is-active' : ''}`}
                      type="button"
                      aria-pressed={comment.isAnswer || false}
                      disabled={actionId === comment.id}
                      onClick={() =>
                        void toggleCommentMarker(comment, 'isAnswer')
                      }
                    >
                      <BadgeCheck aria-hidden="true" />
                      {comment.isAnswer ? 'Снять ответ' : 'Принять ответ'}
                    </button>
                  ) : null}
                </div>
              </article>
            ),
          )
        ) : (
          <EmptyState
            title="Комментариев пока нет"
            text="Будьте первым после подключения API и авторизации."
          />
        )}
      </div>
      <dialog
        className="confirm-dialog comment-report-dialog"
        ref={reportDialogRef}
        onClose={() => {
          setReportTarget(null);
          setReportDetails('');
        }}
      >
        <form onSubmit={submitReport}>
          <h2>Пожаловаться на комментарий</h2>
          <p>
            Жалоба не скрывает запись автоматически. Модератор увидит контекст и
            примет решение.
          </p>
          <fieldset className="report-reason-list">
            <legend>Причина</legend>
            {(
              Object.entries(commentReportReasonLabels) as Array<
                [CommentReportReason, string]
              >
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="reportReason"
                  value={value}
                  checked={reportReason === value}
                  onChange={() => setReportReason(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <label htmlFor={`report-details-${targetType}-${targetId}`}>
            Пояснение <span className="optional-label">необязательно</span>
          </label>
          <textarea
            id={`report-details-${targetType}-${targetId}`}
            value={reportDetails}
            onChange={(event) => setReportDetails(event.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Что именно стоит проверить модератору"
          />
          <div className="button-row">
            <button
              className="ghost-button"
              type="button"
              onClick={() => reportDialogRef.current?.close('cancel')}
            >
              Отменить
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={!reportTarget || actionId === reportTarget.id}
            >
              <Flag aria-hidden="true" /> Отправить жалобу
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        className="confirm-dialog"
        ref={deleteDialogRef}
        onClose={() => setDeleteTarget(null)}
      >
        <form method="dialog">
          <h2>Удалить комментарий?</h2>
          <p>Комментарий и его ответы перестанут отображаться в обсуждении.</p>
          <div className="button-row">
            <button className="ghost-button" value="cancel">
              Отменить
            </button>
            <button
              className="primary-button danger-action"
              type="button"
              onClick={confirmDelete}
            >
              <Trash2 aria-hidden="true" />
              Удалить
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}

function GuidesPage({
  data,
  user,
  setData,
}: {
  data: SiteData;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [rarity, setRarity] = useState('Любая редкость');
  const [tier, setTier] = useState('Любой тир');
  const [attribute, setAttribute] = useState(anyAttributeOption);
  const [editorGuideId, setEditorGuideId] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const attributeOptions = useMemo(
    () => getAttributeOptions(data.characters),
    [data.characters],
  );
  const hasActiveFilters =
    Boolean(query.trim()) ||
    rarity !== 'Любая редкость' ||
    tier !== 'Любой тир' ||
    attribute !== anyAttributeOption;
  const filtered = useMemo(() => {
    const needle = normalizeSearchText(deferredQuery);
    return data.guides.filter((guide) => {
      const character = getGuideCharacter(data, guide);
      if (!character) return false;
      const searchText = normalizeSearchText(
        `${guide.title} ${guide.summary} ${getCharacterSearchText(character)}`,
      );
      return (
        (!needle || searchText.includes(needle)) &&
        (rarity === 'Любая редкость' || character.rarity === rarity) &&
        (tier === 'Любой тир' ||
          getCharacterTierPlacement(data, character.id)?.tier === tier) &&
        (attribute === anyAttributeOption || character.attribute === attribute)
      );
    });
  }, [attribute, data, deferredQuery, rarity, tier]);

  function resetFilters() {
    setQuery('');
    setRarity('Любая редкость');
    setTier('Любой тир');
    setAttribute(anyAttributeOption);
  }

  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">Практические материалы</p>
        <h1>Гайды NTE Meta</h1>
        <p>
          Только персонажные гайды. Билды, лучшие отряды и пошаговые командные
          ротации собраны внутри каждого материала.
        </p>
        {canManageContent(user, 'guides', 'create') ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => setEditorGuideId('new')}
          >
            <Plus aria-hidden="true" /> Создать гайд
          </button>
        ) : null}
      </section>
      <search className="filter-panel" aria-label="Фильтры гайдов">
        <label>
          <span>Поиск</span>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Имя, атрибут, тег..."
            aria-describedby="guide-results-count"
          />
        </label>
        <SelectFilter
          label="Тир"
          value={tier}
          setValue={setTier}
          options={tierOptions}
        />
        <SelectFilter
          label="Атрибут"
          value={attribute}
          setValue={setAttribute}
          options={attributeOptions}
        />
        <SelectFilter
          label="Редкость"
          value={rarity}
          setValue={setRarity}
          options={rarityOptions}
        />
      </search>
      <div className="filter-results-row">
        <p
          id="guide-results-count"
          className="filter-summary"
          aria-live="polite"
        >
          Найдено: {filtered.length} из {data.guides.length}
        </p>
        {hasActiveFilters ? (
          <button
            className="ghost-button filter-reset-button"
            type="button"
            onClick={resetFilters}
          >
            <RotateCw aria-hidden="true" /> Сбросить фильтры
          </button>
        ) : null}
      </div>
      {filtered.length ? (
        <section className="guide-grid" aria-labelledby="guide-results-heading">
          <h2 id="guide-results-heading" className="sr-only">
            Список гайдов
          </h2>
          {filtered.map((guide) => (
            <GuideCard
              key={guide.id}
              guide={guide}
              data={data}
              onEdit={
                canManageContent(user, 'guides', 'edit')
                  ? () => setEditorGuideId(guide.id)
                  : undefined
              }
            />
          ))}
        </section>
      ) : (
        <EmptyState
          title="Гайды не найдены"
          text="Измените фильтры или создайте новый персонажный гайд."
        />
      )}
      <EditorShell
        open={Boolean(editorGuideId)}
        title={editorGuideId === 'new' ? 'Добавить гайд' : 'Редактировать гайд'}
        eyebrow="Meta-гайды"
        description="Секции, команды, ротации и видео редактируются внутри одного персонажного гайда."
        dirty={editorDirty}
        onClose={() => {
          setEditorDirty(false);
          setEditorGuideId(null);
        }}
      >
        {user ? (
          <Suspense
            fallback={<SkeletonGrid label="Загрузка редактора гайда" />}
          >
            <AdminGuides
              data={data}
              setData={setData}
              user={user}
              initialGuideId={editorGuideId || undefined}
              onDirtyChange={setEditorDirty}
              onSaved={({ slug, status }) => {
                if (status !== 'published' || !slug) return;
                setEditorDirty(false);
                setEditorGuideId(null);
                window.location.hash = `#/guides/${slug}`;
              }}
            />
          </Suspense>
        ) : null}
      </EditorShell>
    </div>
  );
}

function TierListsPage({
  data,
  user,
  setData,
}: {
  data: SiteData;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const { tierlist, grouped } = groupTierItems(data);

  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">S · A · B · C · D</p>
        <h1>Тир-листы</h1>
        <p>
          Единый редакционный список S, A, B, C и D. Тиры отражают практическую
          ценность персонажей для большинства игроков, а внутри одного тира все
          персонажи считаются равноценными.
        </p>
        {canManageContent(user, 'tierlists', 'edit') ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditorDirty(false);
              setEditorOpen(true);
            }}
          >
            <Pencil aria-hidden="true" /> Редактировать тир-лист
          </button>
        ) : null}
      </section>
      <section className="content-band">
        <SectionHeader
          eyebrow={`Патч ${tierlist?.patch || '1.0'} · обновлено ${tierlist ? formatDate(tierlist.updatedAt) : ''}`}
          title={tierlist?.title || 'Тир-лист'}
          text="Комментарии и история обновлений хранятся отдельно, чтобы редакция могла объяснять каждое изменение."
        />
        <TierPreview grouped={grouped} />
        <div className="change-log">
          {(tierlist?.changelog || []).map((item) => (
            <p key={item}>
              <ClipboardList aria-hidden="true" /> {item}
            </p>
          ))}
        </div>
      </section>
      <EditorShell
        open={editorOpen}
        title="Редактировать тир-лист"
        eyebrow="Единый S · A · B · C · D"
        description="Перемещайте персонажей между тирами, меняйте порядок карточек и заметки без отдельной CMS-страницы."
        dirty={editorDirty}
        onClose={() => {
          setEditorDirty(false);
          setEditorOpen(false);
        }}
      >
        {user ? (
          <Suspense
            fallback={<SkeletonGrid label="Загрузка редактора тир-листа" />}
          >
            <AdminTierlists
              data={data}
              setData={setData}
              canPublish={canManageContent(user, 'tierlists', 'publish')}
              onDirtyChange={setEditorDirty}
            />
          </Suspense>
        ) : null}
      </EditorShell>
    </div>
  );
}

function EditorialMeta({
  date,
  author,
  sourceName,
  sourceUrl,
}: {
  date: string;
  author?: string;
  sourceName?: string;
  sourceUrl?: string;
}) {
  return (
    <dl className="editorial-meta">
      <div>
        <dt>Опубликовано</dt>
        <dd>{formatDate(date)}</dd>
      </div>
      {author ? (
        <div>
          <dt>Автор</dt>
          <dd>{author}</dd>
        </div>
      ) : null}
      {sourceName ? (
        <div>
          <dt>Источник</dt>
          <dd>
            {sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                {sourceName}
              </a>
            ) : (
              sourceName
            )}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function NewsDetailPage({
  data,
  slug,
  user,
  setData,
}: {
  data: SiteData;
  slug: string;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const item = data.news.find(
    (newsItem) => newsItem.slug === slug || newsItem.id === slug,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(
          user && roleWeight[user.role] >= roleWeight.editor,
        ),
      }),
    );
  }

  if (!item) {
    return (
      <EmptyState
        title="Новость не найдена"
        text="Материал мог быть перемещен, снят с публикации или еще не опубликован."
      />
    );
  }

  return (
    <div className="page-stack">
      <article className="editorial-article">
        <header className="editorial-hero">
          <img
            src={resolveAssetUrl(item.imageUrl)}
            alt=""
            width="1280"
            height="720"
            fetchPriority="high"
            referrerPolicy="no-referrer"
          />
          <div>
            <p className="eyebrow">{item.category}</p>
            <h1>{item.title}</h1>
            <p>{item.summary}</p>
            <EditorialMeta
              date={item.date}
              author={item.author}
              sourceName={item.sourceName}
              sourceUrl={item.sourceUrl}
            />
            <Tags tags={item.tags} />
            {canManageContent(user, 'news', 'edit') ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => setEditorOpen(true)}
              >
                <Pencil aria-hidden="true" /> Редактировать новость
              </button>
            ) : null}
          </div>
        </header>
        <div className="editorial-body">
          <MarkdownPreview value={item.body} />
        </div>
      </article>
      <section className="guide-toolbar">
        <div>
          <p>Оценка материала</p>
          <strong>Полезна ли эта новость?</strong>
        </div>
        <RatingBar targetType="news" targetId={item.id} user={user} />
      </section>
      <CommentsBlock
        targetType="news"
        targetId={item.id}
        data={data}
        user={user}
      />
      <EditorShell
        open={editorOpen}
        title="Редактировать новость"
        eyebrow="Редакция"
        dirty={editorDirty}
        onClose={() => {
          setEditorDirty(false);
          setEditorOpen(false);
        }}
      >
        <Suspense
          fallback={<SkeletonGrid label="Загрузка редактора новости" />}
        >
          <AdminNewsManager
            items={data.news}
            initialSelectedId={item.id}
            access={user ? contentAccess(user, 'news') : undefined}
            onRefresh={refreshContent}
            onDirtyChange={setEditorDirty}
            onSaved={({ saved, values, publishStatus }) => {
              if (publishStatus === 'draft') return;
              const nextSlug = String(saved?.slug || values.slug || '').trim();
              setEditorDirty(false);
              setEditorOpen(false);
              if (nextSlug && nextSlug !== slug) {
                window.location.hash = `#/news/${nextSlug}`;
              }
            }}
          />
        </Suspense>
      </EditorShell>
    </div>
  );
}

function LeakDetailPage({
  data,
  slug,
  user,
  setData,
}: {
  data: SiteData;
  slug: string;
  user: User | null;
  setData: SiteDataSetter;
}) {
  const item = data.leaks.find(
    (leakItem) => leakItem.slug === slug || leakItem.id === slug,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(
          user && roleWeight[user.role] >= roleWeight.editor,
        ),
      }),
    );
  }

  if (!item || !item.approved) {
    return (
      <EmptyState
        title="Слив недоступен"
        text="Материал еще не одобрен, отклонен редакцией или был удален."
      />
    );
  }

  return (
    <div className="page-stack">
      <article className="editorial-article leak-article">
        <header className="editorial-copy-hero">
          <div className="leak-warning" role="note">
            <CircleAlert aria-hidden="true" />
            <strong>Информация не подтверждена и может измениться</strong>
          </div>
          <p className="eyebrow">
            {item.status} · доверие: {item.trustLevel}
          </p>
          <h1>{item.title}</h1>
          <p>{item.summary}</p>
          <EditorialMeta
            date={item.date}
            sourceName={item.sourceName}
            sourceUrl={item.sourceUrl}
          />
          {canManageContent(user, 'leaks', 'edit') ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => setEditorOpen(true)}
            >
              <Pencil aria-hidden="true" /> Редактировать слив
            </button>
          ) : null}
          <Tags tags={item.tags} />
        </header>
        <div className="editorial-body">
          <MarkdownPreview value={item.body} />
        </div>
      </article>
      <section className="guide-toolbar">
        <div>
          <p>Оценка материала</p>
          <strong>Полезна ли пометка источника?</strong>
        </div>
        <RatingBar targetType="leak" targetId={item.id} user={user} />
      </section>
      <CommentsBlock
        targetType="leak"
        targetId={item.id}
        data={data}
        user={user}
      />
      <EditorShell
        open={editorOpen}
        title="Редактировать слив"
        eyebrow="Слухи и источники"
        dirty={editorDirty}
        onClose={() => {
          setEditorDirty(false);
          setEditorOpen(false);
        }}
      >
        <Suspense fallback={<SkeletonGrid label="Загрузка редактора слива" />}>
          <AdminLeaksManager
            items={data.leaks}
            initialSelectedId={item.id}
            access={user ? contentAccess(user, 'leaks') : undefined}
            onRefresh={refreshContent}
            onDirtyChange={setEditorDirty}
            onSaved={({ saved, values }) => {
              const nextSlug = String(saved?.slug || values.slug || '').trim();
              setEditorDirty(false);
              setEditorOpen(false);
              if (nextSlug && nextSlug !== slug) {
                window.location.hash = `#/leaks/${nextSlug}`;
              }
            }}
          />
        </Suspense>
      </EditorShell>
    </div>
  );
}

function ProfilePage({
  user,
  setUser,
}: {
  user: User | null;
  setUser: (user: User | null) => void;
}) {
  if (!user) {
    return (
      <div className="profile-page">
        <AuthPanel setUser={setUser} />
      </div>
    );
  }

  return (
    <div className="page-stack profile-page">
      <section className="page-hero compact">
        <h1>Профиль</h1>
        <p>
          Аккаунт, безопасность и предупреждения находятся отдельно от
          редакционной CMS.
        </p>
        <div className="button-row">
          {canAccessAdmin(user) ? (
            <a className="primary-button" href="#/admin">
              <ShieldCheck aria-hidden="true" /> Открыть админку
            </a>
          ) : null}
          <button
            className="ghost-button"
            type="button"
            onClick={async () => {
              await logout();
              setUser(null);
            }}
          >
            <LogOut aria-hidden="true" /> Выйти
          </button>
        </div>
      </section>
      <ProfilePanel user={user} setUser={setUser} />
    </div>
  );
}

const adminTabs = [
  'dashboard',
  'comments',
  'warnings',
  'users',
  'settings',
  'sources',
  'system',
  'audit',
] as const;

const adminLabels: Record<(typeof adminTabs)[number], string> = {
  dashboard: 'Обзор',
  comments: 'Комментарии',
  warnings: 'Предупреждения',
  users: 'Пользователи',
  settings: 'Настройки',
  sources: 'Источники',
  system: 'Статус API/D1',
  audit: 'Журнал действий',
};

const adminTabRole: Record<(typeof adminTabs)[number], User['role']> = {
  dashboard: 'moderator',
  comments: 'moderator',
  warnings: 'moderator',
  users: 'admin',
  settings: 'admin',
  sources: 'admin',
  system: 'admin',
  audit: 'admin',
};

const adminTabScope: Partial<Record<(typeof adminTabs)[number], ContentScope>> =
  {};

function canOpenAdminTab(user: User, tab: (typeof adminTabs)[number]) {
  const scope = adminTabScope[tab];
  if (scope) {
    return (
      canManageContent(user, scope, 'edit') ||
      canManageContent(user, scope, 'create')
    );
  }
  return roleWeight[user.role] >= roleWeight[adminTabRole[tab]];
}

function contentAccess(user: User, scope: ContentScope) {
  return {
    canCreate: canManageContent(user, scope, 'create'),
    canPublish: canManageContent(user, scope, 'publish'),
    canDelete: canManageContent(user, scope, 'delete'),
  };
}

function AdminPage({
  data,
  user,
  setUser,
  setData,
  requestedTab,
}: {
  data: SiteData;
  user: User | null;
  setUser: (user: User | null) => void;
  setData: React.Dispatch<React.SetStateAction<SiteData>>;
  requestedTab?: string;
}) {
  const requested = adminTabs.includes(
    requestedTab as (typeof adminTabs)[number],
  )
    ? (requestedTab as (typeof adminTabs)[number])
    : 'dashboard';
  const [tab, setTab] = useState<(typeof adminTabs)[number]>(requested);
  const visibleTabs = useMemo(
    () => (user ? adminTabs.filter((item) => canOpenAdminTab(user, item)) : []),
    [user],
  );

  useEffect(() => {
    if (user && !visibleTabs.includes(tab)) {
      setTab('dashboard');
    }
  }, [tab, user, visibleTabs]);

  useEffect(() => {
    if (
      requestedTab &&
      adminTabs.includes(requestedTab as (typeof adminTabs)[number])
    ) {
      setTab(requestedTab as (typeof adminTabs)[number]);
    }
  }, [requestedTab]);

  async function refreshContent() {
    setData(await loadSiteData({ includePrivate: true }));
  }

  if (!user) {
    return (
      <div className="profile-page">
        <AuthPanel setUser={setUser} />
      </div>
    );
  }

  if (!canAccessAdmin(user)) {
    return (
      <div className="page-stack profile-page">
        <section className="page-hero compact">
          <h1>Админка недоступна</h1>
          <p>Системная админка доступна только moderator, admin и owner.</p>
          <a className="primary-button" href="#/profile">
            <UserCircle aria-hidden="true" /> Вернуться в профиль
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Разделы админки">
        <strong>NTE Meta CMS</strong>
        {visibleTabs.map((item) => (
          <a
            key={item}
            className={tab === item ? 'active' : ''}
            href={`#/admin/${item}`}
            onClick={() => setTab(item)}
          >
            <PanelLeft aria-hidden="true" />
            {adminLabels[item]}
          </a>
        ))}
      </aside>
      <section className="admin-content">
        <div className="admin-topline">
          <div>
            <p className="eyebrow">Доступ: {editorGradeLabel(user)}</p>
            <h1>{adminLabels[tab]}</h1>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={async () => {
              await logout();
              setUser(null);
            }}
          >
            <LogOut aria-hidden="true" />
            Выйти
          </button>
        </div>
        <Suspense fallback={<SkeletonGrid label="Загрузка редактора" />}>
          {tab === 'dashboard' ? <AdminDashboard data={data} /> : null}
          {tab === 'comments' ? (
            <AdminComments data={data} user={user} />
          ) : null}
          {tab === 'warnings' ? <AdminWarnings /> : null}
          {tab === 'users' ? <AdminUsers actor={user} /> : null}
          {tab === 'settings' ? <AdminSettings /> : null}
          {tab === 'sources' ? (
            <AdminSourcesManager
              items={data.sources}
              onRefresh={refreshContent}
            />
          ) : null}
          {tab === 'system' ? <AdminSystemStatus /> : null}
          {tab === 'audit' ? <AdminAuditLog /> : null}
        </Suspense>
      </section>
    </div>
  );
}

function ProfilePanel({
  user,
  setUser,
}: {
  user: User;
  setUser: (user: User | null) => void;
}) {
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [pending, setPending] = useState('');
  const [warnings, setWarnings] = useState<UserWarning[]>([]);

  useEffect(() => {
    if (!hasApiBase()) return;
    loadMyWarnings().then((result) => {
      if (result.ok) setWarnings(result.data);
    });
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('displayName') || '').trim();
    if (!hasApiBase()) {
      setUser({ ...user, displayName });
      setProfileMessage('Профиль обновлен в демо-режиме.');
      return;
    }
    setPending('profile');
    const result = await updateProfile(displayName);
    if (result.ok) {
      setUser(result.data);
      setProfileMessage('Имя профиля обновлено.');
    } else {
      setProfileMessage(result.error);
    }
    setPending('');
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasApiBase()) {
      setPasswordMessage('Смена пароля доступна после подключения Worker API.');
      return;
    }
    const form = new FormData(event.currentTarget);
    setPending('password');
    const result = await changePassword(
      String(form.get('currentPassword') || ''),
      String(form.get('nextPassword') || ''),
      String(form.get('nextConfirm') || ''),
    );
    if (result.ok) {
      setPasswordMessage(
        'Пароль изменен. Все сессии завершены, войдите снова.',
      );
      event.currentTarget.reset();
      setUser(null);
    } else {
      setPasswordMessage(result.error);
    }
    setPending('');
  }

  return (
    <div className="admin-grid two-columns">
      <form className="admin-panel entity-form" onSubmit={saveProfile}>
        <p className="eyebrow">Аккаунт {user.username}</p>
        <h2>Профиль</h2>
        <label htmlFor="profile-display-name">Отображаемое имя</label>
        <input
          id="profile-display-name"
          name="displayName"
          defaultValue={user.displayName}
          minLength={2}
          maxLength={40}
          autoComplete="nickname"
          required
        />
        <label htmlFor="profile-role">Роль</label>
        <input id="profile-role" value={user.role} readOnly disabled />
        <button
          className="primary-button"
          type="submit"
          disabled={pending === 'profile'}
        >
          <CheckCircle2 aria-hidden="true" />
          {pending === 'profile' ? 'Сохраняем...' : 'Сохранить профиль'}
        </button>
        <p className="form-message" aria-live="polite">
          {profileMessage}
        </p>
      </form>

      <form className="admin-panel entity-form" onSubmit={savePassword}>
        <h2>Смена пароля</h2>
        <label htmlFor="current-password">Текущий пароль</label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <label htmlFor="next-password">Новый пароль</label>
        <input
          id="next-password"
          name="nextPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
        />
        <label htmlFor="next-confirm">Повторите новый пароль</label>
        <input
          id="next-confirm"
          name="nextConfirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
        />
        <button
          className="primary-button"
          type="submit"
          disabled={pending === 'password'}
        >
          <LockKeyhole aria-hidden="true" />
          {pending === 'password' ? 'Обновляем...' : 'Изменить пароль'}
        </button>
        <p className="form-message" aria-live="polite">
          {passwordMessage}
        </p>
      </form>
      {warnings.length ? (
        <section
          className="admin-panel profile-warnings"
          aria-label="Предупреждения модерации"
        >
          <p className="eyebrow">Модерация</p>
          <h2>Активные предупреждения</h2>
          {warnings.map((warning) => (
            <article key={warning.id}>
              <strong>{warning.reason}</strong>
              <span>
                {warning.moderatorName} · {formatDate(warning.createdAt)}
              </span>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function AuthPanel({ setUser }: { setUser: (user: User | null) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'danger' | 'success'>(
    'info',
  );
  const [pending, setPending] = useState(false);
  const [authConfig, setAuthConfig] = useState({
    registrationEnabled: true,
    needsBootstrap: false,
  });

  useEffect(() => {
    if (!hasApiBase()) return;
    loadAuthConfig().then((result) => {
      if (result.ok) setAuthConfig(result.data);
    });
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get('username') || '');
    const password = String(form.get('password') || '');

    if (!hasApiBase()) {
      setUser({
        id: 'demo-owner',
        username: 'demo-owner',
        displayName: 'Demo Owner',
        role: 'owner',
      });
      setMessage(
        'Демо-вход включен. Для настоящей авторизации подключите Worker API.',
      );
      setMessageTone('info');
      return;
    }

    setPending(true);
    const result =
      mode === 'login'
        ? await login(username, password)
        : await register(
            username,
            password,
            String(form.get('confirmPassword') || ''),
            String(form.get('bootstrapToken') || '') || undefined,
          );

    if (result.ok) {
      setUser(result.data.user);
      setMessageTone('success');
      setMessage(
        mode === 'login'
          ? 'Вы вошли.'
          : 'Аккаунт создан. Добро пожаловать в NTE Meta.',
      );
      if (mode === 'register') {
        setAuthConfig((current) => ({ ...current, needsBootstrap: false }));
      }
    } else {
      setMessageTone('danger');
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <section className="auth-panel">
      <div>
        <p className="eyebrow">Авторизация</p>
        <h1>{mode === 'login' ? 'Вход в NTE Meta' : 'Регистрация'}</h1>
        <p>
          {authConfig.needsBootstrap
            ? 'Создайте первый owner-аккаунт с одноразовым кодом Cloudflare.'
            : 'Аккаунт открывает комментарии, оценки и профиль. Права всегда проверяет Worker API.'}
        </p>
      </div>
      <form onSubmit={onSubmit}>
        <label htmlFor="auth-username">Логин</label>
        <input
          id="auth-username"
          name="username"
          autoComplete="username"
          required
          minLength={3}
        />
        <label htmlFor="auth-password">Пароль</label>
        <input
          id="auth-password"
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={10}
        />
        {mode === 'register' ? (
          <>
            <label htmlFor="auth-confirm">Подтверждение пароля</label>
            <input
              id="auth-confirm"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
            />
            {authConfig.needsBootstrap ? (
              <>
                <label htmlFor="auth-bootstrap">Код первого owner</label>
                <input
                  id="auth-bootstrap"
                  name="bootstrapToken"
                  type="password"
                  autoComplete="off"
                  aria-describedby="bootstrap-help"
                  required
                />
                <small id="bootstrap-help">
                  Одноразовый код хранится только в Cloudflare Worker secrets.
                </small>
              </>
            ) : null}
          </>
        ) : null}
        <div className="auth-actions">
          <button className="primary-button" type="submit" disabled={pending}>
            <LockKeyhole aria-hidden="true" />
            {pending
              ? 'Проверяем...'
              : mode === 'login'
                ? 'Войти'
                : 'Создать аккаунт'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={mode === 'login' && !authConfig.registrationEnabled}
            onClick={() => {
              setMessage('');
              setMode(mode === 'login' ? 'register' : 'login');
            }}
          >
            {mode === 'login'
              ? authConfig.registrationEnabled
                ? 'Нужна регистрация'
                : 'Регистрация временно закрыта'
              : 'Уже есть аккаунт'}
          </button>
        </div>
      </form>
      {message ? <StatusBanner tone={messageTone} text={message} /> : null}
    </section>
  );
}

function AdminDashboard({ data }: { data: SiteData }) {
  const publishedNews = data.news.filter(
    (item) => item.publishStatus !== 'draft',
  );
  const approvedLeaks = data.leaks.filter((item) => item.approved);
  const pendingLeaks = data.leaks.filter((item) => !item.approved);
  const dashboardMetrics = [
    {
      label: 'Гайды',
      value: data.guides.length,
      detail: 'редактируются прямо в разделах',
    },
    {
      label: 'Персонажи',
      value: data.characters.length,
      detail: 'база лора и профилей',
    },
    {
      label: 'Публикации',
      value: publishedNews.length + approvedLeaks.length,
      detail: 'новости и сливы',
    },
    {
      label: 'Очередь сливов',
      value: pendingLeaks.length,
      detail: 'требуют проверки',
    },
  ];
  const quickActions = [
    {
      href: '#/guides',
      icon: <BookOpen aria-hidden="true" />,
      title: 'Гайды',
      text: 'Добавление, секции, команды и ротации внутри гайдов.',
    },
    {
      href: '#/characters',
      icon: <Gamepad2 aria-hidden="true" />,
      title: 'Персонажи',
      text: 'Лор, профиль, озвучка, материалы и способности.',
    },
    {
      href: '#/tierlists',
      icon: <Star aria-hidden="true" />,
      title: 'Тир-лист',
      text: 'Единый список S-D с перетаскиванием карточек.',
    },
    {
      href: '#/',
      icon: <Newspaper aria-hidden="true" />,
      title: 'Новости и сливы',
      text: 'Публикуются на главной и открываются на отдельных страницах.',
    },
  ];

  return (
    <div className="admin-dashboard">
      <section
        className="admin-command-hero"
        aria-labelledby="admin-dashboard-title"
      >
        <div>
          <p className="eyebrow">Системная панель</p>
          <h2 id="admin-dashboard-title">
            Админка для контроля, не для контентной рутины
          </h2>
          <p>
            Контент создаётся прямо в публичных разделах, а здесь остаются
            пользователи, роли, модерация, источники, аудит и состояние API/D1.
          </p>
        </div>
        <div
          className="admin-command-status"
          aria-label="Ключевые зоны ответственности"
        >
          <span>
            <ShieldCheck aria-hidden="true" /> Модерация
          </span>
          <span>
            <Users aria-hidden="true" /> Роли
          </span>
          <span>
            <Settings aria-hidden="true" /> Система
          </span>
        </div>
      </section>
      <MetricsStrip data={data} />
      <section className="admin-metric-grid" aria-label="Сводка контента">
        {dashboardMetrics.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>
      <section className="admin-panel admin-action-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Работа с контентом</p>
            <h2>Быстрые переходы к контенту</h2>
          </div>
        </div>
        <div className="admin-action-grid">
          {quickActions.map((action) => (
            <a
              className="admin-action-card"
              href={action.href}
              key={action.href}
            >
              {action.icon}
              <strong>{action.title}</strong>
              <span>{action.text}</span>
            </a>
          ))}
        </div>
      </section>
      <section className="admin-panel admin-role-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Права доступа</p>
            <h2>Что видят роли</h2>
          </div>
        </div>
        <ul className="admin-role-list">
          <li>
            <strong>Пользователь</strong>
            <span>профиль, комментарии и оценки.</span>
          </li>
          <li>
            <strong>Редактор</strong>
            <span>кнопки управления разрешённым контентом.</span>
          </li>
          <li>
            <strong>Модератор</strong>
            <span>модерация комментариев и предупреждения.</span>
          </li>
          <li>
            <strong>Администратор</strong>
            <span>пользователи, роли, источники и настройки.</span>
          </li>
          <li>
            <strong>Владелец</strong>
            <span>полный доступ и удаление пользователей.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

const BUILD_SECTION_TEMPLATE = `## Рекомендуемый билд

### Лучшая дуга
Укажите сигнатурную или оптимальную дугу и объясните, почему она работает.

### Альтернативная дуга
Добавьте F2P-вариант и условия, при которых он не уступает.

### Модули и основные статы
- Основной стат: ...
- Комплект модулей: ...

### Саб-статы
1. Приоритет №1
2. Приоритет №2

### Что менять без сигнатурки
Опишите практическую замену и поправку ротации.`;

type GuideEditorDraft = {
  guideMeta: {
    title: string;
    summary: string;
    patch: string;
    videoUrl: string;
    status: Guide['status'];
  };
  sections: GuideSection[];
  selectedSectionId: string;
  markdown: string;
};

function readGuideEditorDraft(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as GuideEditorDraft) : null;
  } catch {
    return null;
  }
}

function formatGuideImportValue(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    const formatRecord = (record: Record<string, unknown>, index: number) => {
      const title =
        record.name ||
        record.title ||
        record.label ||
        record.character ||
        `Пункт ${index + 1}`;
      const details = [
        record.description,
        record.value,
        record.effect,
        record.note,
      ]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join(' ');
      const steps = Array.isArray(record.steps)
        ? `\n  ${record.steps
            .map((step, stepIndex) => `${stepIndex + 1}. ${String(step)}`)
            .join('\n  ')}`
        : '';
      const imageUrl = [record.imageUrl, record.iconUrl, record.thumbnailUrl]
        .map((item) => String(item || '').trim())
        .find(Boolean);
      const image = imageUrl
        ? `\n  ![${String(title)}](${normalizeExternalAssetUrl(imageUrl)})`
        : '';

      return `- **${String(title)}**${details ? ` — ${details}` : ''}${steps}${image}`;
    };

    if (Array.isArray(parsed)) {
      return parsed
        .map((item, index) => {
          if (typeof item === 'string') return `- ${item}`;
          if (item && typeof item === 'object') {
            return formatRecord(item as Record<string, unknown>, index);
          }
          return `- ${String(item)}`;
        })
        .join('\n');
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([key, item]) => `- **${key}**: ${String(item)}`)
        .join('\n');
    }
    return String(parsed);
  } catch {
    return value;
  }
}

const GUIDE_SUMMARY_MAX_LENGTH = 2000;

function limitEditorialText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\n{3,}/g, '\n\n');
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, maxLength - 1);
  const lastWordBoundary = Math.max(
    candidate.lastIndexOf(' '),
    candidate.lastIndexOf('\n'),
  );
  const safeEnd =
    lastWordBoundary >= Math.floor(maxLength * 0.72)
      ? lastWordBoundary
      : candidate.length;
  return `${candidate.slice(0, safeEnd).trimEnd()}…`;
}

function prepareGuideImportSummary(imported: string) {
  const next = imported.trim();
  return next ? limitEditorialText(next, GUIDE_SUMMARY_MAX_LENGTH) : '';
}

function getGuideImportFieldLabel(field: string) {
  const labels: Record<string, string> = {
    'guide.summary': 'Поле: краткий вывод',
    'guide.pullAdvice': 'Секция: стоит ли качать',
    'guide.strengths': 'Секция: плюсы',
    'guide.weaknesses': 'Секция: минусы',
    'guide.skillPriority': 'Секция: приоритет навыков',
    'guide.bestArcs': 'Секция: лучшие дуги',
    'guide.alternativeArcs': 'Секция: альтернативные дуги',
    'guide.modules': 'Секция: модули и картриджи',
    'guide.mainStats': 'Секция: основные статы',
    'guide.subStats': 'Секция: саб-статы',
    'guide.rotations': 'Секция: ротации',
    'guide.tips': 'Секция: советы и механики',
    'guide.mistakes': 'Секция: частые ошибки',
    'guide.teams': 'Секция: команды',
    'guide.f2pTeams': 'Секция: F2P-команды',
    'guide.premiumTeams': 'Секция: Premium-команды',
    'guide.starterTeams': 'Секция: команды для старта',
    'guide.endgameTeams': 'Секция: команды для эндгейма',
    'guide.videoUrl': 'Поле: видео-гайд',
  };
  return labels[field] || 'Секция гайда';
}

function getGuideImportContextLabel(
  suggestion: CharacterImportSuggestion,
  fieldLabel: string,
) {
  const escapedField = suggestion.field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleaned = suggestion.label
    .replace(new RegExp(escapedField, 'gi'), '')
    .replace(/\bguide\.[a-zA-Z.]+\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();

  if (
    !cleaned ||
    cleaned.toLocaleLowerCase('ru-RU') === fieldLabel.toLocaleLowerCase('ru-RU')
  ) {
    return '';
  }

  return cleaned;
}

function getGuideImportRows(
  suggestion: CharacterImportSuggestion,
): CharacterImportSuggestion[] {
  try {
    const parsed = JSON.parse(suggestion.value) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 2) return [];
    return parsed.map((item, index) => ({
      ...suggestion,
      id: `${suggestion.id}:row:${index}`,
      label: getGuideImportRowLabel(item, index),
      value: JSON.stringify([item]),
      note: suggestion.note
        ? `Строка ${index + 1}. ${suggestion.note}`
        : `Строка ${index + 1}`,
    }));
  } catch {
    return [];
  }
}

function getGuideImportRowLabel(item: unknown, index: number) {
  if (typeof item === 'string' && item.trim()) return item.trim();
  if (!item || typeof item !== 'object') return `Пункт ${index + 1}`;
  const record = item as Record<string, unknown>;
  const prefix =
    typeof record.type === 'string'
      ? `${record.type}: `
      : typeof record.role === 'string'
        ? `${record.role}: `
        : '';
  const value =
    record.name ||
    record.title ||
    record.label ||
    record.character ||
    record.note ||
    record.value ||
    `Пункт ${index + 1}`;
  return `${prefix}${String(value)}`;
}

function getYoutubeThumbnailUrl(url: string) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  );
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : '';
}

function getImportConfidenceLabel(
  confidence: CharacterImportSuggestion['confidence'],
) {
  if (confidence === 'high') return 'Высокая уверенность';
  if (confidence === 'medium') return 'Средняя уверенность';
  return 'Требует ручной проверки';
}

function getGuideImportPreviewUrls(suggestion: CharacterImportSuggestion) {
  const urls: string[] = [];
  const addUrl = (value: unknown) => {
    if (typeof value !== 'string') return;
    const normalized =
      getYoutubeThumbnailUrl(value) ||
      (/^(?:https?:|data:|blob:|\/?assets\/)/i.test(value)
        ? normalizeExternalAssetUrl(value)
        : '');
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  };

  try {
    const parsed = JSON.parse(suggestion.value) as unknown;
    if (typeof parsed === 'string') {
      if (
        /(?:image|splash|icon)url/i.test(suggestion.field) ||
        getYoutubeThumbnailUrl(parsed)
      ) {
        addUrl(parsed);
      }
      return urls;
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === 'object') {
          Object.values(item).forEach(addUrl);
        } else {
          addUrl(item);
        }
        if (urls.length >= 4) break;
      }
    }
  } catch {
    if (
      /(?:image|splash|icon)url/i.test(suggestion.field) ||
      getYoutubeThumbnailUrl(suggestion.value)
    ) {
      addUrl(suggestion.value);
    }
  }
  return urls;
}

function GuideCreateFields({
  characters,
  initialCharacterId,
}: {
  characters: Character[];
  initialCharacterId?: string;
}) {
  const fieldId = useId();
  const initialCharacter =
    characters.find((character) => character.id === initialCharacterId) || null;
  const initialTitle = initialCharacter ? `Гайд: ${initialCharacter.name}` : '';
  const [characterId, setCharacterId] = useState(initialCharacter?.id || '');
  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialTitle ? makeSlug(initialTitle) : '');
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!initialCharacter) return;
    const nextTitle = `Гайд: ${initialCharacter.name}`;
    setCharacterId(initialCharacter.id);
    setTitle(nextTitle);
    setSlug(makeSlug(nextTitle));
    setSlugTouched(false);
  }, [initialCharacter]);

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugTouched) {
      setSlug(makeSlug(value));
    }
  }

  function updateSlug(value: string) {
    setSlugTouched(true);
    setSlug(makeSlug(value));
  }

  return (
    <>
      <label htmlFor={`${fieldId}-character`}>
        Персонаж
        <select
          id={`${fieldId}-character`}
          name="characterId"
          value={characterId}
          onChange={(event) => setCharacterId(event.target.value)}
          required
        >
          <option value="">Выберите персонажа</option>
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${fieldId}-title`}>
        Заголовок
        <input
          id={`${fieldId}-title`}
          name="title"
          value={title}
          onChange={(event) => updateTitle(event.target.value)}
          required
        />
      </label>
      <label htmlFor={`${fieldId}-slug`}>
        Адрес страницы
        <input
          id={`${fieldId}-slug`}
          name="slug"
          value={slug}
          onChange={(event) => updateSlug(event.target.value)}
          required
          aria-describedby={`${fieldId}-slug-help`}
        />
        <small id={`${fieldId}-slug-help`}>
          Создаётся из заголовка автоматически. При необходимости задайте
          короткую ссылку вручную.
        </small>
      </label>
      <label htmlFor={`${fieldId}-summary`}>
        Краткое описание
        <textarea
          id={`${fieldId}-summary`}
          name="summary"
          rows={4}
          maxLength={GUIDE_SUMMARY_MAX_LENGTH}
          required
        />
        <small>
          Короткий вывод до {GUIDE_SUMMARY_MAX_LENGTH} знаков. Подробности
          добавляются секциями.
        </small>
      </label>
      <label htmlFor={`${fieldId}-patch`}>
        Патч
        <input
          id={`${fieldId}-patch`}
          name="patch"
          defaultValue="1.0"
          required
        />
      </label>
    </>
  );
}

function AdminGuides({
  data,
  setData,
  user,
  initialGuideId,
  initialCharacterId,
  onSaved,
  onDirtyChange,
}: {
  data: SiteData;
  setData: React.Dispatch<React.SetStateAction<SiteData>>;
  user: User;
  initialGuideId?: string;
  initialCharacterId?: string;
  onSaved?: (context: {
    id: string;
    slug?: string;
    status?: Guide['status'];
    action: 'created' | 'saved';
  }) => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [selectedGuideId, setSelectedGuideId] = useState(
    initialGuideId || data.guides[0]?.id || 'new',
  );
  const guide = data.guides.find((item) => item.id === selectedGuideId);
  const [sections, setSections] = useState<GuideSection[]>(() =>
    guide ? [...guide.sections].sort((a, b) => a.position - b.position) : [],
  );
  const [markdown, setMarkdown] = useState(sections[0]?.content || '');
  const [selectedSectionId, setSelectedSectionId] = useState(
    sections[0]?.id || '',
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverSectionIndex, setDragOverSectionIndex] = useState<
    number | null
  >(null);
  const [dragOverSectionPlacement, setDragOverSectionPlacement] = useState<
    'before' | 'after'
  >('before');
  const [pending, setPending] = useState(false);
  const [guideImportPending, setGuideImportPending] = useState(false);
  const [guideImportStatus, setGuideImportStatus] = useState('');
  const [message, setMessage] = useState('');
  const [sectionImageUrl, setSectionImageUrl] = useState('');
  const [sectionImageAlt, setSectionImageAlt] = useState('');
  const [guideImportSuggestions, setGuideImportSuggestions] = useState<
    CharacterImportSuggestion[]
  >([]);
  const [guideImportDecisions, setGuideImportDecisions] = useState<
    Record<string, 'accepted' | 'rejected'>
  >({});
  const [guideImportCoverage, setGuideImportCoverage] =
    useState<CharacterImportLookupResult['coverage']>();
  const [guideMeta, setGuideMeta] = useState({
    title: guide?.title || '',
    summary: guide?.summary || '',
    patch: guide?.patch || '1.0',
    videoUrl: guide?.videoUrl || '',
    status: guide?.status || 'draft',
  });
  const selectedSectionIdRef = useRef(selectedSectionId);
  const createGuideDialogRef = useRef<HTMLDialogElement>(null);
  const deleteGuideDialogRef = useRef<HTMLDialogElement>(null);
  const deleteSectionDialogRef = useRef<HTMLDialogElement>(null);
  const sectionDragPreviewRef = useRef<HTMLElement | null>(null);
  const skipNextGuideDraftSaveRef = useRef(false);
  const guideImportControllerRef = useRef<AbortController | null>(null);
  const guideImportRequestIdRef = useRef(0);
  const guideImportButtonRef = useRef<HTMLButtonElement>(null);
  const restoreGuideImportFocusRef = useRef(false);
  const canCreate = canManageContent(user, 'guides', 'create');
  const canPublish = canManageContent(user, 'guides', 'publish');
  const canDelete = canManageContent(user, 'guides', 'delete');
  const availableGuideCharacters = data.characters.filter(
    (character) =>
      !data.guides.some((item) => item.characterId === character.id),
  );

  useEffect(() => {
    if (initialGuideId) setSelectedGuideId(initialGuideId);
  }, [initialGuideId]);

  useEffect(() => {
    if (selectedGuideId === 'new') return;
    if (
      selectedGuideId &&
      data.guides.some((item) => item.id === selectedGuideId)
    ) {
      return;
    }
    setSelectedGuideId(data.guides[0]?.id || 'new');
  }, [data.guides, selectedGuideId]);

  useEffect(() => {
    selectedSectionIdRef.current = selectedSectionId;
  }, [selectedSectionId]);

  useEffect(() => {
    if (guideImportControllerRef.current) {
      guideImportRequestIdRef.current += 1;
      guideImportControllerRef.current.abort();
      guideImportControllerRef.current = null;
    }
    setGuideImportPending(false);
    setGuideImportStatus('');
    if (!guide) {
      return;
    }

    setGuideImportSuggestions([]);
    setGuideImportDecisions({});
    setGuideImportCoverage(undefined);

    const nextSections = [...guide.sections].sort(
      (a, b) => a.position - b.position,
    );
    const savedDraft = readGuideEditorDraft(`nte-guide-draft:${guide.id}`);
    skipNextGuideDraftSaveRef.current = true;
    if (savedDraft) {
      const selectedSection =
        savedDraft.sections.find(
          (section) => section.id === savedDraft.selectedSectionId,
        ) || savedDraft.sections[0];

      setSections(savedDraft.sections);
      setSelectedSectionId(selectedSection?.id || '');
      setMarkdown(selectedSection?.content || savedDraft.markdown || '');
      setGuideMeta(savedDraft.guideMeta);
      setMessage('Восстановлен локальный черновик гайда.');
      return;
    }
    const selectedSection =
      nextSections.find(
        (section) => section.id === selectedSectionIdRef.current,
      ) || nextSections[0];

    setSections(nextSections);
    setSelectedSectionId(selectedSection?.id || '');
    setMarkdown(selectedSection?.content || '');
    setGuideMeta({
      title: guide.title,
      summary: guide.summary,
      patch: guide.patch,
      videoUrl: guide.videoUrl || '',
      status: guide.status,
    });
  }, [guide]);

  useEffect(
    () => () => {
      guideImportRequestIdRef.current += 1;
      guideImportControllerRef.current?.abort();
    },
    [],
  );

  const activeGuide = guide;
  const activeGuideCharacter = activeGuide
    ? getGuideCharacter(data, activeGuide)
    : undefined;
  const activeGuideTier = activeGuideCharacter
    ? getCharacterTierPlacement(data, activeGuideCharacter.id)
    : undefined;
  const guideDraftKey = `nte-guide-draft:${activeGuide?.id || selectedGuideId}`;
  const baselineGuideState = useMemo(() => {
    if (!activeGuide) return null;
    return {
      guideMeta: {
        title: activeGuide.title,
        summary: activeGuide.summary,
        patch: activeGuide.patch,
        videoUrl: activeGuide.videoUrl || '',
        status: activeGuide.status,
      },
      sections: [...activeGuide.sections].sort(
        (a, b) => a.position - b.position,
      ),
    };
  }, [activeGuide]);
  const baselineGuideSignature = useMemo(
    () => (baselineGuideState ? JSON.stringify(baselineGuideState) : ''),
    [baselineGuideState],
  );
  const guideDraftSignature = useMemo(
    () => JSON.stringify({ guideMeta, sections }),
    [guideMeta, sections],
  );
  const isGuideDirty = Boolean(
    baselineGuideState && guideDraftSignature !== baselineGuideSignature,
  );

  useEffect(() => {
    if (!activeGuide) return;
    if (skipNextGuideDraftSaveRef.current) {
      skipNextGuideDraftSaveRef.current = false;
      return;
    }
    const saveDraft = () => {
      try {
        if (isGuideDirty) {
          localStorage.setItem(
            guideDraftKey,
            JSON.stringify({
              guideMeta,
              sections,
              selectedSectionId,
              markdown,
            }),
          );
        } else {
          localStorage.removeItem(guideDraftKey);
        }
      } catch {
        // Editing remains available in private browsing without local storage.
      }
    };
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(saveDraft, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = globalThis.setTimeout(saveDraft, 350);
    return () => globalThis.clearTimeout(timeoutId);
  }, [
    activeGuide,
    guideDraftKey,
    guideMeta,
    isGuideDirty,
    markdown,
    sections,
    selectedSectionId,
  ]);

  useEffect(() => {
    if (!isGuideDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isGuideDirty]);

  useEffect(() => {
    onDirtyChange?.(isGuideDirty);
  }, [isGuideDirty, onDirtyChange]);

  useEffect(() => {
    if (guideImportPending || !restoreGuideImportFocusRef.current) return;
    restoreGuideImportFocusRef.current = false;
    guideImportButtonRef.current?.focus();
  }, [guideImportPending]);

  useEffect(
    () => () => {
      sectionDragPreviewRef.current?.remove();
    },
    [],
  );

  function reorder(index: number, placement: 'before' | 'after' = 'before') {
    if (dragIndex === null) {
      return;
    }
    if (dragIndex === index) {
      clearSectionDragState();
      return;
    }
    const next = [...sections];
    const [moved] = next.splice(dragIndex, 1);
    let targetIndex = index;
    if (dragIndex < index) {
      targetIndex -= 1;
    }
    const insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
    next.splice(Math.max(0, Math.min(insertIndex, next.length)), 0, moved);
    setSections(
      next.map((section, position) => ({ ...section, position: position + 1 })),
    );
    clearSectionDragState();
  }

  function clearSectionDragState() {
    setDragIndex(null);
    setDragOverSectionIndex(null);
    setDragOverSectionPlacement('before');
    sectionDragPreviewRef.current?.remove();
    sectionDragPreviewRef.current = null;
  }

  function getSectionDropPlacement(event: React.DragEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
  }

  function setSectionDragImage(
    event: React.DragEvent<HTMLButtonElement>,
    section: GuideSection,
  ) {
    const source = event.currentTarget;
    const rect = source.getBoundingClientRect();
    const clone = source.cloneNode(true) as HTMLElement;
    clone.classList.add('section-sorter__ghost');
    clone.setAttribute('aria-hidden', 'true');
    clone.style.inlineSize = `${rect.width}px`;
    clone.style.blockSize = `${rect.height}px`;

    sectionDragPreviewRef.current?.remove();
    document.body.append(clone);
    sectionDragPreviewRef.current = clone;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', section.title);
    event.dataTransfer.setDragImage(clone, rect.width / 2, rect.height / 2);
  }

  function moveSelectedSection(offset: number) {
    const currentIndex = sections.findIndex(
      (section) => section.id === selectedSectionId,
    );
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sections.length) {
      return;
    }
    const next = [...sections];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(nextIndex, 0, moved);
    setSections(
      next.map((section, position) => ({ ...section, position: position + 1 })),
    );
  }

  function selectSection(section: GuideSection) {
    setSelectedSectionId(section.id);
    setMarkdown(section.content);
  }

  function updateSelectedMarkdown(value: string) {
    setMarkdown(value);
    // Один источник правды: textarea, preview и сохранение смотрят на один массив секций.
    setSections((current) =>
      current.map((section) =>
        section.id === selectedSectionId
          ? { ...section, content: value }
          : section,
      ),
    );
  }

  function updateSelectedSection(patch: Partial<GuideSection>) {
    setSections((current) =>
      current.map((section) =>
        section.id === selectedSectionId ? { ...section, ...patch } : section,
      ),
    );
  }

  function addSection() {
    const nextSection = {
      id: `custom-${Date.now()}`,
      title: 'Кастомный раздел',
      type: 'custom',
      content:
        '## Новый раздел\nДобавьте разбор, комбо, ошибку в ротации или расшифровку видео.',
      position: sections.length + 1,
    };
    setSections((value) => [...value, nextSection]);
    setSelectedSectionId(nextSection.id);
    setMarkdown(nextSection.content);
  }

  function addBuildSection() {
    const existing = sections.find((section) => section.type === 'build');
    if (existing) {
      selectSection(existing);
      setMessage('Раздел билда уже есть — открыли его для редактирования.');
      return;
    }
    const nextSection: GuideSection = {
      id: `custom-${Date.now()}`,
      title: 'Билд: дуги, модули и статы',
      type: 'build',
      content: BUILD_SECTION_TEMPLATE,
      position: sections.length + 1,
    };
    setSections((value) => [...value, nextSection]);
    setSelectedSectionId(nextSection.id);
    setMarkdown(nextSection.content);
  }

  function insertSectionImage() {
    const rawUrl = sectionImageUrl.trim();
    if (!rawUrl) {
      setMessage('Укажите URL изображения для текущей секции.');
      return;
    }
    const isAllowedUrl =
      /^https?:\/\//i.test(rawUrl) ||
      rawUrl.startsWith('/') ||
      rawUrl.startsWith('assets/');
    if (!isAllowedUrl) {
      setMessage('Изображение должно быть http(s)-URL, /путь или assets/путь.');
      return;
    }
    const altText = (sectionImageAlt.trim() || 'Изображение гайда')
      .replaceAll('[', '')
      .replaceAll(']', '');
    const snippet = `![${altText}](${rawUrl})`;
    updateSelectedMarkdown(
      `${markdown.trimEnd()}${markdown.trim() ? '\n\n' : ''}${snippet}`,
    );
    setSectionImageUrl('');
    setSectionImageAlt('');
    setMessage('Изображение добавлено в текущую секцию. Сохраните раздел.');
  }

  async function lookupGuideSources() {
    if (!activeGuide) return;
    const controller = new AbortController();
    const requestId = guideImportRequestIdRef.current + 1;
    guideImportRequestIdRef.current = requestId;
    guideImportControllerRef.current?.abort();
    guideImportControllerRef.current = controller;
    setGuideImportPending(true);
    setMessage('Ищем данные для гайда в подключённых источниках…');
    setGuideImportStatus('Ищем данные для гайда. Поиск можно отменить.');
    const character = getGuideCharacter(data, activeGuide);
    try {
      const result = await lookupGuideInfo(
        {
          guideId: activeGuide.id,
          query: character?.name || activeGuide.title,
        },
        { signal: controller.signal },
      );
      if (
        requestId !== guideImportRequestIdRef.current ||
        controller.signal.aborted
      ) {
        return;
      }
      if (result.ok) {
        const resultMessage =
          result.data.message ||
          'Источники не вернули данных. Измените запрос и повторите поиск.';
        setGuideImportSuggestions(result.data.suggestions || []);
        setGuideImportDecisions({});
        setGuideImportCoverage(result.data.coverage);
        setMessage(resultMessage);
        setGuideImportStatus(resultMessage);
      } else if (!result.aborted) {
        setMessage(result.error);
        setGuideImportStatus(`${result.error} Можно повторить поиск.`);
      }
    } finally {
      if (requestId === guideImportRequestIdRef.current) {
        guideImportControllerRef.current = null;
        restoreGuideImportFocusRef.current = true;
        setGuideImportPending(false);
      }
    }
  }

  function cancelGuideSourceLookup() {
    if (!guideImportControllerRef.current) return;
    guideImportRequestIdRef.current += 1;
    guideImportControllerRef.current.abort();
    guideImportControllerRef.current = null;
    restoreGuideImportFocusRef.current = true;
    setGuideImportPending(false);
    const cancelMessage =
      'Поиск отменён. Черновик и найденные предложения сохранены.';
    setMessage(cancelMessage);
    setGuideImportStatus(cancelMessage);
  }

  function rejectGuideImportSuggestion(suggestion: CharacterImportSuggestion) {
    setGuideImportDecisions((current) => ({
      ...current,
      [suggestion.id]: 'rejected',
    }));
  }

  function acceptGuideImportDecision(suggestion: CharacterImportSuggestion) {
    setGuideImportDecisions((current) => {
      const next = { ...current };
      if (!/:row:\d+$/.test(suggestion.id)) {
        guideImportSuggestions
          .filter((candidate) => candidate.field === suggestion.field)
          .forEach((candidate) => {
            next[candidate.id] =
              candidate.id === suggestion.id ? 'accepted' : 'rejected';
          });
      } else {
        next[suggestion.id] = 'accepted';
      }
      return next;
    });
  }

  function applyGuideImportSuggestion(suggestion: CharacterImportSuggestion) {
    if (suggestion.field === 'guide.summary') {
      setGuideMeta((current) => ({
        ...current,
        summary: prepareGuideImportSummary(suggestion.value),
      }));
      acceptGuideImportDecision(suggestion);
      setMessage(
        'Выбранный краткий вывод добавлен в гайд. Проверьте текст и сохраните.',
      );
      return;
    }
    if (suggestion.field === 'guide.videoUrl') {
      setGuideMeta((current) => ({ ...current, videoUrl: suggestion.value }));
      acceptGuideImportDecision(suggestion);
      setMessage(
        'YouTube-ссылка добавлена в параметры гайда. Проверьте превью и сохраните.',
      );
      return;
    }

    const guideImportSections: Record<string, { title: string; type: string }> =
      {
        'guide.pullAdvice': { title: 'Стоит ли качать', type: 'pull-advice' },
        'guide.strengths': { title: 'Плюсы', type: 'strengths' },
        'guide.weaknesses': { title: 'Минусы', type: 'weaknesses' },
        'guide.skillPriority': {
          title: 'Приоритет навыков',
          type: 'skill-priority',
        },
        'guide.bestArcs': { title: 'Лучшие дуги', type: 'best-arcs' },
        'guide.alternativeArcs': {
          title: 'Альтернативные дуги',
          type: 'alternative-arcs',
        },
        'guide.modules': { title: 'Модули и картриджи', type: 'modules' },
        'guide.mainStats': { title: 'Основные статы', type: 'main-stats' },
        'guide.subStats': { title: 'Саб-статы', type: 'sub-stats' },
        'guide.rotations': { title: 'Ротации', type: 'rotation' },
        'guide.tips': { title: 'Советы и механики', type: 'tips' },
        'guide.mistakes': { title: 'Частые ошибки', type: 'mistakes' },
        'guide.teams': { title: 'Лучшие команды', type: 'teams' },
        'guide.f2pTeams': { title: 'F2P-команды', type: 'f2p-teams' },
        'guide.premiumTeams': {
          title: 'Premium-команды',
          type: 'premium-teams',
        },
        'guide.starterTeams': {
          title: 'Команды для старта',
          type: 'starter-teams',
        },
        'guide.endgameTeams': {
          title: 'Команды для эндгейма',
          type: 'endgame-teams',
        },
        'guide.videoUrl': { title: 'Видео-гайд', type: 'video' },
      };
    const sectionConfig = guideImportSections[suggestion.field] || {
      title: 'Импортированные заметки',
      type: 'import',
    };
    const sectionTitle = sectionConfig.title;
    const sectionType = sectionConfig.type;
    const importMarker = `<!-- import:${suggestion.id} -->`;
    if (sections.some((section) => section.content.includes(importMarker))) {
      acceptGuideImportDecision(suggestion);
      setMessage(`Предложение «${suggestion.label}» уже добавлено в гайд.`);
      return;
    }

    const importMarkdown = [
      importMarker,
      formatGuideImportValue(suggestion.value),
    ]
      .filter(Boolean)
      .join('\n');

    setSections((current) => {
      const existingIndex = current.findIndex(
        (section) =>
          section.type === sectionType || section.title === sectionTitle,
      );
      if (existingIndex >= 0) {
        const next = [...current];
        const existing = next[existingIndex];
        next[existingIndex] = {
          ...existing,
          content: `${existing.content.trim()}\n\n${importMarkdown}`.trim(),
        };
        setSelectedSectionId(existing.id);
        setMarkdown(next[existingIndex].content);
        return next;
      }
      const nextSection: GuideSection = {
        id: `custom-import-${Date.now()}`,
        title: sectionTitle,
        type: sectionType,
        content: importMarkdown,
        position: current.length + 1,
      };
      setSelectedSectionId(nextSection.id);
      setMarkdown(nextSection.content);
      return [...current, nextSection];
    });
    acceptGuideImportDecision(suggestion);
    setMessage(`Предложение «${suggestion.label}» добавлено в секции гайда.`);
  }

  async function createGuide(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasApiBase()) {
      setMessage('Создание гайда требует подключенного Worker API.');
      createGuideDialogRef.current?.close();
      return;
    }
    setPending(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const publishNow =
      canPublish &&
      submitter instanceof HTMLButtonElement &&
      submitter.value === 'published';
    const nextStatus: Guide['status'] = publishNow ? 'published' : 'draft';
    const getFormString = (name: string) => {
      const fromData = String(form.get(name) || '').trim();
      if (fromData) return fromData;
      const field = formElement.elements.namedItem(name);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      ) {
        return field.value.trim();
      }
      return '';
    };
    const slug = getFormString('slug');
    const result = await saveEntity<{
      id: string;
      slug?: string;
      status?: Guide['status'];
    }>(
      '/api/guides',
      {
        characterId: getFormString('characterId'),
        title: getFormString('title'),
        slug,
        summary: getFormString('summary'),
        patchVersion: getFormString('patch') || '1.0',
        status: nextStatus,
        sections: [
          {
            title: 'Обзор персонажа',
            type: 'overview',
            content: '## Обзор\nДобавьте роль, механику и практический вывод.',
          },
        ],
      },
      'POST',
    );
    if (result.ok) {
      const nextData = await loadSiteData({ includePrivate: true });
      const createdGuide =
        nextData.guides.find((item) => item.id === result.data.id) ||
        nextData.guides.find(
          (item) => item.slug === (result.data.slug || slug),
        );
      setData(nextData);
      if (createdGuide) {
        setSelectedGuideId(createdGuide.id);
      }
      setMessage(
        nextStatus === 'published'
          ? 'Гайд опубликован. Открываем новую страницу.'
          : 'Новый гайд создан как черновик.',
      );
      formElement.reset();
      createGuideDialogRef.current?.close();
      await onSaved?.({
        id: createdGuide?.id || result.data.id,
        slug: createdGuide?.slug || result.data.slug || slug,
        status: createdGuide?.status || result.data.status || nextStatus,
        action: 'created',
      });
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  async function saveGuideMeta() {
    if (!activeGuide) return;
    if (!hasApiBase()) {
      setData((current) => ({
        ...current,
        guides: current.guides.map((item) =>
          item.id === activeGuide.id ? { ...item, ...guideMeta } : item,
        ),
      }));
      setMessage('Метаданные обновлены в демо-режиме.');
      return;
    }
    setPending(true);
    const result = await saveEntity<{ success: boolean }>(
      `/api/guides/${activeGuide.id}`,
      {
        title: guideMeta.title,
        summary: guideMeta.summary,
        patchVersion: guideMeta.patch,
        videoUrl: guideMeta.videoUrl,
        ...(canPublish ? { status: guideMeta.status } : {}),
      },
      'PATCH',
    );
    if (result.ok) {
      const nextData = await loadSiteData({ includePrivate: true });
      setData(nextData);
      const savedGuide = nextData.guides.find(
        (item) => item.id === activeGuide.id,
      );
      localStorage.removeItem(guideDraftKey);
      setMessage('Метаданные гайда сохранены.');
      await onSaved?.({
        id: activeGuide.id,
        slug: savedGuide?.slug || activeGuide.slug,
        status: savedGuide?.status || guideMeta.status,
        action: 'saved',
      });
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  async function deleteGuide() {
    if (!activeGuide) return;
    deleteGuideDialogRef.current?.close();
    if (!hasApiBase()) {
      setData((current) => ({
        ...current,
        guides: current.guides.filter((item) => item.id !== activeGuide.id),
      }));
      return;
    }
    setPending(true);
    const result = await deleteEntity(`/api/guides/${activeGuide.id}`);
    if (result.ok) {
      const nextData = await loadSiteData({ includePrivate: true });
      setData(nextData);
      setSelectedGuideId(nextData.guides[0]?.id || '');
      setMessage('Гайд удален.');
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  async function deleteSelectedSection() {
    const selected = sections.find(
      (section) => section.id === selectedSectionId,
    );
    if (!selected) return;
    deleteSectionDialogRef.current?.close();
    if (hasApiBase() && !selected.id.startsWith('custom-')) {
      setPending(true);
      const result = await deleteEntity(`/api/guide-sections/${selected.id}`);
      if (!result.ok) {
        setMessage(result.error);
        setPending(false);
        return;
      }
    }
    const next = sections
      .filter((section) => section.id !== selected.id)
      .map((section, position) => ({ ...section, position: position + 1 }));
    setSections(next);
    setSelectedSectionId(next[0]?.id || '');
    setMarkdown(next[0]?.content || '');
    setMessage('Секция удалена. Сохраните новый порядок.');
    setPending(false);
  }

  async function saveSections() {
    if (!activeGuide) return;
    setPending(true);
    setMessage('');
    const persistedSections: GuideSection[] = [];
    const idMap = new Map<string, string>();

    if (hasApiBase()) {
      for (const section of sections) {
        if (section.id.startsWith('custom-')) {
          const result = await saveEntity<{ id: string }>(
            `/api/guides/${activeGuide.id}/sections`,
            {
              title: section.title,
              type: section.type,
              content: section.content,
            },
            'POST',
          );

          if (!result.ok) {
            setMessage(result.error);
            setPending(false);
            return;
          }

          idMap.set(section.id, result.data.id);
          persistedSections.push({ ...section, id: result.data.id });
        } else {
          const result = await saveEntity<{ success: boolean }>(
            `/api/guide-sections/${section.id}`,
            {
              title: section.title,
              type: section.type,
              content: section.content,
            },
            'PATCH',
          );

          if (!result.ok) {
            setMessage(result.error);
            setPending(false);
            return;
          }

          persistedSections.push(section);
        }
      }

      const reorderResult = await saveEntity<{ success: boolean }>(
        `/api/guides/${activeGuide.id}/sections/reorder`,
        { sectionIds: persistedSections.map((section) => section.id) },
        'PATCH',
      );

      if (!reorderResult.ok) {
        setMessage(reorderResult.error);
        setPending(false);
        return;
      }
    } else {
      persistedSections.push(...sections);
    }

    const updatedGuide = { ...activeGuide, sections: persistedSections };
    setData((current) => ({
      ...current,
      guides: current.guides.map((item) =>
        item.id === activeGuide.id ? updatedGuide : item,
      ),
    }));
    setSections(persistedSections);
    localStorage.removeItem(guideDraftKey);
    const nextSelectedSectionId =
      idMap.get(selectedSectionId) ||
      selectedSectionId ||
      persistedSections[0]?.id ||
      '';
    selectedSectionIdRef.current = nextSelectedSectionId;
    setSelectedSectionId(nextSelectedSectionId);
    setMessage(
      hasApiBase()
        ? 'Секции гайда сохранены в D1.'
        : 'Секции обновлены в демо-режиме.',
    );
    setPending(false);
  }

  if (!activeGuide) {
    return (
      <form className="admin-panel entity-form" onSubmit={createGuide}>
        <p className="eyebrow">Новый персонажный материал</p>
        <h2>Создать гайд</h2>
        <p>
          После создания появятся разделы, билд, отряды, командные ротации,
          видео и полноценный редактор материала.
        </p>
        <GuideCreateFields
          characters={availableGuideCharacters}
          initialCharacterId={initialCharacterId}
        />
        <div className="button-row">
          <button
            className="ghost-button"
            type="submit"
            name="status"
            value="draft"
            disabled={
              pending || !canCreate || availableGuideCharacters.length === 0
            }
          >
            Создать черновик
          </button>
          {canPublish ? (
            <button
              className="primary-button"
              type="submit"
              name="status"
              value="published"
              disabled={
                pending || !canCreate || availableGuideCharacters.length === 0
              }
            >
              <Plus aria-hidden="true" /> Создать и опубликовать
            </button>
          ) : null}
        </div>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
      </form>
    );
  }

  return (
    <div className="page-stack">
      <section className="admin-panel guide-admin-meta">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Редактор персонажного гайда</p>
            <h2>{activeGuide.title}</h2>
          </div>
          <div className="button-row">
            {canCreate ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => createGuideDialogRef.current?.showModal()}
              >
                <Plus aria-hidden="true" /> Создать гайд
              </button>
            ) : null}
            {canDelete ? (
              <button
                className="ghost-button danger"
                type="button"
                onClick={() => deleteGuideDialogRef.current?.showModal()}
              >
                <Trash2 aria-hidden="true" /> Удалить гайд
              </button>
            ) : null}
          </div>
        </div>
        <label htmlFor="guide-picker">Редактируемый гайд</label>
        <select
          id="guide-picker"
          value={activeGuide.id}
          onChange={(event) => setSelectedGuideId(event.target.value)}
        >
          {data.guides.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {item.status}
            </option>
          ))}
        </select>
        {activeGuideCharacter ? (
          <div className="guide-character-source-panel">
            <div>
              <img
                src={resolveAssetUrl(activeGuideCharacter.imageUrl)}
                alt=""
                width="64"
                height="64"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <span>
                <small>Данные персонажа</small>
                <strong>{activeGuideCharacter.name}</strong>
              </span>
            </div>
            <dl>
              <div>
                <dt>Роль</dt>
                <dd>{activeGuideCharacter.role}</dd>
              </div>
              <div>
                <dt>Тип</dt>
                <dd>{activeGuideCharacter.type}</dd>
              </div>
              <div>
                <dt>Редкость</dt>
                <dd>{activeGuideCharacter.rarity}</dd>
              </div>
              <div>
                <dt>Тир-лист</dt>
                <dd>{activeGuideTier?.tier || 'Не задан'}</dd>
              </div>
            </dl>
            <p>
              Эти данные берутся из страницы персонажа и единого тир-листа.
              Здесь они показаны для проверки и не дублируются в форме гайда.
            </p>
          </div>
        ) : null}
        <div className="guide-meta-fields">
          <label>
            Заголовок
            <input
              value={guideMeta.title}
              onChange={(event) =>
                setGuideMeta((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Патч
            <input
              value={guideMeta.patch}
              onChange={(event) =>
                setGuideMeta((current) => ({
                  ...current,
                  patch: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Статус
            <select
              value={guideMeta.status}
              disabled={!canPublish}
              onChange={(event) =>
                setGuideMeta((current) => ({
                  ...current,
                  status: event.target.value as Guide['status'],
                }))
              }
            >
              <option value="draft">Черновик</option>
              <option value="pending_review">На проверке</option>
              {canPublish || guideMeta.status === 'published' ? (
                <option value="published">Опубликован</option>
              ) : null}
              <option value="archived">Архив</option>
            </select>
          </label>
          <label>
            Ссылка на YouTube
            <input
              type="url"
              value={guideMeta.videoUrl}
              onChange={(event) =>
                setGuideMeta((current) => ({
                  ...current,
                  videoUrl: event.target.value,
                }))
              }
            />
          </label>
          {getYoutubeThumbnailUrl(guideMeta.videoUrl) ? (
            <div className="youtube-url-preview">
              <img
                src={getYoutubeThumbnailUrl(guideMeta.videoUrl)}
                alt=""
                width="168"
                height="94"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <a href={guideMeta.videoUrl} target="_blank" rel="noreferrer">
                Открыть видео
              </a>
            </div>
          ) : null}
          <label className="wide-field">
            Краткое описание
            <textarea
              rows={4}
              maxLength={GUIDE_SUMMARY_MAX_LENGTH}
              value={guideMeta.summary}
              onChange={(event) =>
                setGuideMeta((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
            />
            <small>
              {guideMeta.summary.length}/{GUIDE_SUMMARY_MAX_LENGTH}. Подробный
              текст хранится в секциях ниже.
            </small>
          </label>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={pending}
          onClick={saveGuideMeta}
        >
          <CheckCircle2 aria-hidden="true" /> Сохранить параметры гайда
        </button>
      </section>

      <section
        className="import-review-panel guide-import-panel"
        aria-label="Автоимпорт гайда"
      >
        <div>
          <p className="eyebrow">Источники гайда</p>
          <h3>Подсказки именно для гайда</h3>
          <p>
            Поиск проверяет билд-гайды: плюсы и минусы, дуги, модули, статы,
            команды, ротации, советы и видео. Данные профиля персонажа сюда не
            переносятся. Каждая строка добавляется только после подтверждения.
          </p>
        </div>
        <button
          ref={guideImportButtonRef}
          className="ghost-button"
          type="button"
          disabled={guideImportPending}
          aria-describedby="guide-import-status"
          onClick={lookupGuideSources}
        >
          <Search aria-hidden="true" />
          {guideImportPending
            ? 'Ищем источники гайда…'
            : 'Найти источники гайда'}
        </button>
        {guideImportPending ? (
          <button
            className="ghost-button"
            type="button"
            onClick={cancelGuideSourceLookup}
          >
            Отменить поиск
          </button>
        ) : null}
        <p
          id="guide-import-status"
          className="form-message import-status-region"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={guideImportPending}
        >
          {guideImportStatus}
        </p>
        {guideImportCoverage ? (
          <div className="import-coverage">
            <div>
              <strong>Можно сверять</strong>
              <span>{guideImportCoverage.readyFields.join(', ') || 'Нет'}</span>
            </div>
            <div>
              <strong>Нужна ручная проверка</strong>
              <span>
                {guideImportCoverage.reviewFields.join(', ') || 'Нет'}
              </span>
            </div>
            <div>
              <strong>Не найдено</strong>
              <span>
                {guideImportCoverage.missingFields.join(', ') || 'Нет'}
              </span>
            </div>
          </div>
        ) : null}
        {guideImportSuggestions.length ? (
          <div className="import-suggestion-list">
            {guideImportSuggestions.map((suggestion) => {
              const decision = guideImportDecisions[suggestion.id];
              const fieldLabel = getGuideImportFieldLabel(suggestion.field);
              const contextLabel = getGuideImportContextLabel(
                suggestion,
                fieldLabel,
              );
              const previewUrls = getGuideImportPreviewUrls(suggestion);
              const rowSuggestions = getGuideImportRows(suggestion);
              const fieldVariants = guideImportSuggestions.filter(
                (candidate) => candidate.field === suggestion.field,
              );
              const variantIndex = fieldVariants.findIndex(
                (candidate) => candidate.id === suggestion.id,
              );
              const variantCount =
                suggestion.variantCount || fieldVariants.length || 1;
              const agreementCount = suggestion.agreementCount || 1;
              return (
                <article
                  className={`import-suggestion ${decision ? `is-${decision}` : ''}`}
                  key={suggestion.id}
                >
                  <div>
                    <strong>{fieldLabel}</strong>
                    {fieldVariants.length > 1 ? (
                      <span className="import-variant-label">
                        Вариант {variantIndex + 1} из {fieldVariants.length}
                      </span>
                    ) : null}
                    <div
                      className="import-quality-badges"
                      aria-label="Качество предложения"
                    >
                      {agreementCount >= 2 ? (
                        <span className="quality-consensus">
                          Совпало в {agreementCount} источниках
                        </span>
                      ) : null}
                      {variantCount >= 2 ? (
                        <span className="quality-conflict">
                          На выбор: {variantCount} варианта
                        </span>
                      ) : null}
                      {suggestion.qualityFlags?.includes('incomplete') ? (
                        <span className="quality-review">
                          Нужна внимательная проверка
                        </span>
                      ) : null}
                    </div>
                    {contextLabel ? <span>{contextLabel}</span> : null}
                  </div>
                  <div className="import-suggestion-value">
                    {previewUrls.length ? (
                      <div
                        className={`import-image-preview ${
                          previewUrls.length > 1
                            ? 'import-image-preview--grid'
                            : ''
                        }`}
                      >
                        <div>
                          {previewUrls.map((previewUrl) => (
                            <a
                              href={resolveAssetUrl(previewUrl)}
                              key={previewUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Открыть изображение из автоимпорта гайда"
                            >
                              <img
                                src={resolveAssetUrl(previewUrl)}
                                alt=""
                                width="92"
                                height="92"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(event) => {
                                  event.currentTarget.hidden = true;
                                  event.currentTarget
                                    .closest('.import-image-preview')
                                    ?.setAttribute('data-broken', 'true');
                                }}
                              />
                            </a>
                          ))}
                        </div>
                        <span>Нажмите на превью, чтобы открыть оригинал</span>
                      </div>
                    ) : null}
                    <div className="import-suggestion-markdown">
                      <MarkdownPreview
                        value={formatGuideImportValue(suggestion.value)}
                      />
                    </div>
                    {rowSuggestions.length ? (
                      <div
                        className="import-row-review"
                        aria-label={`Строки гайда: ${fieldLabel}`}
                      >
                        <div className="import-row-bulk-actions">
                          <button
                            className="compact-action"
                            type="button"
                            disabled={decision === 'accepted'}
                            onClick={() =>
                              applyGuideImportSuggestion(suggestion)
                            }
                          >
                            <CheckCircle2 aria-hidden="true" />
                            Принять весь блок
                          </button>
                          <button
                            className="compact-action danger"
                            type="button"
                            disabled={decision === 'rejected'}
                            onClick={() =>
                              rejectGuideImportSuggestion(suggestion)
                            }
                          >
                            <XCircle aria-hidden="true" />
                            Отклонить весь блок
                          </button>
                        </div>
                        {rowSuggestions.map((row) => {
                          const rowDecision = guideImportDecisions[row.id];
                          const rowPreviewUrls = getGuideImportPreviewUrls(row);
                          return (
                            <div
                              className={`import-row ${
                                rowDecision ? `is-${rowDecision}` : ''
                              }`}
                              key={row.id}
                            >
                              {rowPreviewUrls[0] ? (
                                <img
                                  src={resolveAssetUrl(rowPreviewUrls[0])}
                                  alt=""
                                  width="44"
                                  height="44"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                              <span>{row.label}</span>
                              <div className="import-row-actions">
                                <button
                                  className="icon-button success"
                                  type="button"
                                  aria-label={`Принять строку гайда: ${row.label}`}
                                  disabled={rowDecision === 'accepted'}
                                  onClick={() =>
                                    applyGuideImportSuggestion(row)
                                  }
                                >
                                  <CheckCircle2 aria-hidden="true" />
                                </button>
                                <button
                                  className="icon-button danger"
                                  type="button"
                                  aria-label={`Отклонить строку гайда: ${row.label}`}
                                  disabled={rowDecision === 'rejected'}
                                  onClick={() =>
                                    rejectGuideImportSuggestion(row)
                                  }
                                >
                                  <XCircle aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <small>
                    {suggestion.sourceName} ·{' '}
                    {getImportConfidenceLabel(suggestion.confidence)}
                    {suggestion.note ? ` · ${suggestion.note}` : ''}
                  </small>
                  <div className="import-suggestion-actions">
                    <ImportSourceLinks suggestion={suggestion} />
                    <button
                      className="icon-button success"
                      type="button"
                      aria-label={`Принять ${fieldLabel}`}
                      onClick={() => applyGuideImportSuggestion(suggestion)}
                    >
                      <CheckCircle2 aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Отклонить ${fieldLabel}`}
                      onClick={() => rejectGuideImportSuggestion(suggestion)}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <GuideTeamsEditor
        data={data}
        guide={activeGuide}
        setData={setData}
        canCreate={canCreate}
        canPublish={canPublish}
        canDelete={canDelete}
      />

      <div className="admin-grid two-columns">
        <div className="admin-panel">
          <div className="panel-title-row">
            <h2>Секции гайда</h2>
            <div className="button-row">
              <button
                className="ghost-button"
                type="button"
                onClick={addBuildSection}
              >
                <ClipboardList aria-hidden="true" /> Добавить билд
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={addSection}
              >
                <Plus aria-hidden="true" /> Добавить раздел
              </button>
            </div>
          </div>
          <div
            className="section-sorter"
            aria-label="Перетаскивание секций гайда"
          >
            {sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                draggable
                onDragStart={(event) => {
                  setSectionDragImage(event, section);
                  setDragIndex(index);
                }}
                onDragEnter={(event) => {
                  if (dragIndex !== null && dragIndex !== index) {
                    setDragOverSectionIndex(index);
                    setDragOverSectionPlacement(getSectionDropPlacement(event));
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragIndex !== null && dragIndex !== index) {
                    setDragOverSectionIndex(index);
                    setDragOverSectionPlacement(getSectionDropPlacement(event));
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  reorder(index, getSectionDropPlacement(event));
                }}
                onDragEnd={clearSectionDragState}
                onClick={() => selectSection(section)}
                aria-pressed={section.id === selectedSectionId}
                className={[
                  section.id === selectedSectionId ? 'active' : '',
                  dragIndex === index ? 'is-dragging' : '',
                  dragOverSectionIndex === index && dragIndex !== index
                    ? 'is-drop-target'
                    : '',
                  dragOverSectionIndex === index && dragIndex !== index
                    ? `is-drop-${dragOverSectionPlacement}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-drop-placement={
                  dragOverSectionIndex === index && dragIndex !== index
                    ? dragOverSectionPlacement
                    : undefined
                }
              >
                <GripVertical aria-hidden="true" />
                <span>{section.title}</span>
                <small>{guideSectionTypeLabel(section.type)}</small>
              </button>
            ))}
          </div>
          <div className="button-row">
            <button
              className="icon-button"
              type="button"
              title="Переместить выбранную секцию выше"
              aria-label="Переместить выбранную секцию выше"
              onClick={() => moveSelectedSection(-1)}
            >
              <ChevronUp aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              title="Переместить выбранную секцию ниже"
              aria-label="Переместить выбранную секцию ниже"
              onClick={() => moveSelectedSection(1)}
            >
              <ChevronDown aria-hidden="true" />
            </button>
            {canDelete ? (
              <button
                className="ghost-button danger"
                type="button"
                disabled={!selectedSectionId}
                onClick={() => deleteSectionDialogRef.current?.showModal()}
              >
                <Trash2 aria-hidden="true" /> Удалить секцию
              </button>
            ) : null}
            <button
              className="primary-button"
              type="button"
              disabled={pending}
              onClick={saveSections}
            >
              <CheckCircle2 aria-hidden="true" />
              {pending ? 'Сохраняем...' : 'Сохранить секции'}
            </button>
          </div>
          <p className="form-message" aria-live="polite">
            {message}
          </p>
        </div>
        <div className="admin-panel editor-panel">
          <h2>Редактор текста</h2>
          <div className="guide-section-fields">
            <label>
              Название секции
              <input
                value={
                  sections.find((section) => section.id === selectedSectionId)
                    ?.title || ''
                }
                onChange={(event) =>
                  updateSelectedSection({ title: event.target.value })
                }
              />
            </label>
            <label>
              Категория раздела
              <select
                value={
                  sections.find((section) => section.id === selectedSectionId)
                    ?.type || ''
                }
                onChange={(event) =>
                  updateSelectedSection({ type: event.target.value })
                }
              >
                {(() => {
                  const selectedType =
                    sections.find((section) => section.id === selectedSectionId)
                      ?.type || '';
                  const known = guideSectionTypeOptions.some(
                    ([type]) => type === selectedType,
                  );
                  return (
                    <>
                      {!known && selectedType ? (
                        <option value={selectedType}>Другой раздел</option>
                      ) : null}
                      {guideSectionTypeOptions.map(([type, label]) => (
                        <option key={type} value={type}>
                          {label}
                        </option>
                      ))}
                    </>
                  );
                })()}
              </select>
            </label>
          </div>
          <div
            className="guide-image-insert"
            aria-label="Вставка изображения в секцию"
          >
            <label htmlFor="guide-section-image-url">
              Ссылка на изображение для секции
              <input
                id="guide-section-image-url"
                type="url"
                inputMode="url"
                value={sectionImageUrl}
                onChange={(event) => setSectionImageUrl(event.target.value)}
                placeholder="https://... или assets/..."
              />
            </label>
            <label htmlFor="guide-section-image-alt">
              Описание изображения
              <input
                id="guide-section-image-alt"
                value={sectionImageAlt}
                onChange={(event) => setSectionImageAlt(event.target.value)}
                placeholder="Например: схема ротации Хотори"
              />
            </label>
            <button
              className="ghost-button"
              type="button"
              onClick={insertSectionImage}
            >
              <ImageIcon aria-hidden="true" /> Вставить изображение
            </button>
          </div>
          <label id="markdown-editor-label" htmlFor="markdown-editor">
            Текст раздела
          </label>
          <RichTextEditorField
            id="markdown-editor"
            value={markdown}
            onChange={updateSelectedMarkdown}
            minHeight={360}
            maxLength={24000}
            placeholder="Добавьте практический разбор, списки, команды и пояснения..."
            ariaLabel="Текст раздела гайда"
          />
        </div>
      </div>

      <dialog className="confirm-dialog" ref={createGuideDialogRef}>
        <form method="dialog" onSubmit={createGuide}>
          <h2>Создать гайд</h2>
          <GuideCreateFields
            characters={availableGuideCharacters}
            initialCharacterId={initialCharacterId}
          />
          <div className="button-row">
            <button
              className="ghost-button"
              type="button"
              onClick={() => createGuideDialogRef.current?.close('cancel')}
            >
              Отменить
            </button>
            <button
              className="ghost-button"
              type="submit"
              name="status"
              value="draft"
              disabled={availableGuideCharacters.length === 0}
            >
              Создать черновик
            </button>
            {canPublish ? (
              <button
                className="primary-button"
                type="submit"
                name="status"
                value="published"
                disabled={availableGuideCharacters.length === 0}
              >
                <Plus aria-hidden="true" /> Создать и опубликовать
              </button>
            ) : null}
          </div>
        </form>
      </dialog>

      <dialog className="confirm-dialog" ref={deleteGuideDialogRef}>
        <form method="dialog">
          <h2>Удалить гайд?</h2>
          <p>
            Секции гайда будут удалены каскадно. Действие попадет в audit log.
          </p>
          <div className="button-row">
            <button className="ghost-button" value="cancel">
              Отменить
            </button>
            <button
              className="primary-button danger-action"
              type="button"
              onClick={deleteGuide}
            >
              <Trash2 aria-hidden="true" /> Удалить гайд
            </button>
          </div>
        </form>
      </dialog>

      <dialog className="confirm-dialog" ref={deleteSectionDialogRef}>
        <form method="dialog">
          <h2>Удалить выбранную секцию?</h2>
          <p>Секция исчезнет из публичного гайда после сохранения.</p>
          <div className="button-row">
            <button className="ghost-button" value="cancel">
              Отменить
            </button>
            <button
              className="primary-button danger-action"
              type="button"
              onClick={deleteSelectedSection}
            >
              <Trash2 aria-hidden="true" /> Удалить секцию
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function GuideTeamsEditor({
  data,
  guide,
  setData,
  canCreate,
  canPublish,
  canDelete,
}: {
  data: SiteData;
  guide: Guide;
  setData: React.Dispatch<React.SetStateAction<SiteData>>;
  canCreate: boolean;
  canPublish: boolean;
  canDelete: boolean;
}) {
  const relatedTeams = useMemo(
    () =>
      data.teams.filter(
        (team) =>
          team.guideId === guide.id ||
          (!team.guideId &&
            team.members.some(
              (member) => member.characterId === guide.characterId,
            )),
      ),
    [data.teams, guide.characterId, guide.id],
  );
  const [selectedId, setSelectedId] = useState(relatedTeams[0]?.id || 'new');
  const [draft, setDraft] = useState<Team>(
    () => relatedTeams[0] || createGuideTeamDraft(guide, data),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const selected = relatedTeams.find((team) => team.id === selectedId);

  useEffect(() => {
    const next = relatedTeams.find((team) => team.id === selectedId);
    setDraft(next || createGuideTeamDraft(guide, data));
  }, [data, guide, relatedTeams, selectedId]);

  useEffect(() => {
    if (selectedId === 'new') return;
    if (!relatedTeams.some((team) => team.id === selectedId)) {
      setSelectedId(relatedTeams[0]?.id || 'new');
    }
  }, [relatedTeams, selectedId]);

  function updateMember(index: number, member: TeamMember) {
    const members = [...draft.members];
    members[index] = member;
    setDraft((current) => ({ ...current, members }));
  }

  function updateStep(index: number, step: string) {
    const rotationSteps = [...(draft.rotationSteps || [])];
    rotationSteps[index] = step;
    setDraft((current) => ({ ...current, rotationSteps }));
  }

  async function saveTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const members = draft.members.filter((member) => member.characterId.trim());
    if (!draft.title.trim()) {
      setMessage('Введите название состава или ротации.');
      return;
    }
    if (!members.length || members.length > 4) {
      setMessage('Выберите от одного до четырёх персонажей состава.');
      return;
    }
    setPending(true);
    setMessage('');
    const rotationSteps = (draft.rotationSteps || []).filter((step) =>
      step.trim(),
    );
    const result = await saveEntity<{ id?: string; success?: boolean }>(
      selected ? `/api/teams/${selected.id}` : '/api/teams',
      {
        ...draft,
        guideId: guide.id,
        members,
        rotation: rotationSteps.join('\n'),
        rotationStepsJson: rotationSteps,
        ...(canPublish || !selected ? { status: draft.status || 'draft' } : {}),
      },
      selected ? 'PATCH' : 'POST',
    );
    if (result.ok) {
      if (result.data.id) setSelectedId(result.data.id);
      setData(await loadSiteData({ includePrivate: true }));
      setMessage('Отряд и его командная ротация сохранены.');
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  async function deleteTeam() {
    if (!selected) return;
    deleteDialogRef.current?.close();
    setPending(true);
    const result = await deleteEntity(`/api/teams/${selected.id}`);
    if (result.ok) {
      setSelectedId('new');
      setData(await loadSiteData({ includePrivate: true }));
      setMessage('Отряд удалён из гайда.');
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <details className="admin-panel embedded-team-editor" open>
      <summary>
        <span>
          <strong>Отряды и командные ротации</strong>
          <small>Часть гайда: {relatedTeams.length} составов</small>
        </span>
      </summary>
      <div className="embedded-team-layout">
        <aside aria-label="Отряды этого гайда">
          {relatedTeams.map((team) => (
            <button
              type="button"
              key={team.id}
              className={team.id === selectedId ? 'active' : ''}
              aria-pressed={team.id === selectedId}
              onClick={() => setSelectedId(team.id)}
            >
              <Users aria-hidden="true" />
              <span>
                <strong>{team.title}</strong>
                <small>{team.members.length} из 4 персонажей</small>
              </span>
            </button>
          ))}
          {canCreate ? (
            <button
              className="add-team-button"
              type="button"
              onClick={() => setSelectedId('new')}
            >
              <Plus aria-hidden="true" /> Новый отряд
            </button>
          ) : null}
        </aside>
        <form className="embedded-team-form" onSubmit={saveTeam}>
          <div className="editor-field-grid">
            <label>
              Название состава или ротации
              <input
                required
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Статус
              <select
                value={draft.status || 'draft'}
                disabled={!canPublish}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as Team['status'],
                  }))
                }
              >
                <option value="draft">Черновик</option>
                <option value="published">Опубликован вместе с гайдом</option>
                <option value="archived">Архив</option>
              </select>
            </label>
            <label className="wide-field">
              Описание <span className="field-optional">необязательно</span>
              <textarea
                rows={4}
                value={draft.synergy}
                placeholder="Коротко объясните идею состава или особенности цикла"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    synergy: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <fieldset className="team-member-editor">
            <legend>Состав и роли</legend>
            {draft.members.map((member, index) => (
              <div key={`${member.characterId}-${index}`}>
                <label>
                  Персонаж {index + 1}
                  <select
                    value={member.characterId}
                    onChange={(event) =>
                      updateMember(index, {
                        ...member,
                        characterId: event.target.value,
                        role:
                          data.characters.find(
                            (character) => character.id === event.target.value,
                          )?.role || '',
                      })
                    }
                  >
                    <option value="">Выберите</option>
                    {data.characters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Роль в составе
                  <input
                    value={member.role}
                    onChange={(event) =>
                      updateMember(index, {
                        ...member,
                        role: event.target.value,
                      })
                    }
                  />
                </label>
                <button
                  className="icon-button danger"
                  type="button"
                  aria-label={`Удалить персонажа ${index + 1}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      members: current.members.filter(
                        (_, memberIndex) => memberIndex !== index,
                      ),
                    }))
                  }
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              className="ghost-button"
              type="button"
              disabled={draft.members.length >= 4}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  members: [...current.members, { characterId: '', role: '' }],
                }))
              }
            >
              <Plus aria-hidden="true" /> Добавить персонажа
            </button>
          </fieldset>

          <fieldset className="rotation-step-editor">
            <legend>Пошаговая ротация всей команды</legend>
            <p>
              Одна строка — одно действие. После последнего шага цикл
              возвращается к первому.
            </p>
            {(draft.rotationSteps || []).map((step, index) => (
              <div key={`${selectedId}-rotation-${index}`}>
                <span>{index + 1}</span>
                <input
                  value={step}
                  placeholder="Хотори: навык → смена на Байканг..."
                  onChange={(event) => updateStep(index, event.target.value)}
                />
                <button
                  className="icon-button danger"
                  type="button"
                  aria-label={`Удалить шаг ${index + 1}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      rotationSteps: (current.rotationSteps || []).filter(
                        (_, stepIndex) => stepIndex !== index,
                      ),
                    }))
                  }
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              className="ghost-button"
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  rotationSteps: [...(current.rotationSteps || []), ''],
                }))
              }
            >
              <Plus aria-hidden="true" /> Добавить шаг
            </button>
          </fieldset>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={pending}>
              <CheckCircle2 aria-hidden="true" />{' '}
              {pending ? 'Сохраняем...' : 'Сохранить отряд'}
            </button>
            {selected && canDelete ? (
              <button
                className="ghost-button danger"
                type="button"
                onClick={() => deleteDialogRef.current?.showModal()}
              >
                <Trash2 aria-hidden="true" /> Удалить отряд
              </button>
            ) : null}
          </div>
          <p className="form-message" aria-live="polite">
            {message}
          </p>
        </form>
      </div>
      <dialog className="confirm-dialog" ref={deleteDialogRef}>
        <form method="dialog">
          <h2>Удалить отряд?</h2>
          <p>Состав и его ротация исчезнут из этого гайда.</p>
          <div className="button-row">
            <button className="ghost-button" value="cancel">
              Отменить
            </button>
            <button
              className="primary-button danger-action"
              type="button"
              onClick={() => void deleteTeam()}
            >
              <Trash2 aria-hidden="true" /> Удалить
            </button>
          </div>
        </form>
      </dialog>
    </details>
  );
}

function createGuideTeamDraft(guide: Guide, data: SiteData): Team {
  return {
    id: 'new',
    slug: '',
    guideId: guide.id,
    title: '',
    type: '',
    budget: 'Mixed',
    difficulty: '',
    power: 0,
    goodAt: '',
    weakAt: '',
    synergy: '',
    rotation: '',
    rotationSteps: [''],
    members: [
      {
        characterId: guide.characterId,
        role: getCharacter(data, guide.characterId)?.role || '',
      },
    ],
    status: 'draft',
  };
}

function AdminTierlists({
  data,
  setData,
  canPublish,
  onDirtyChange,
}: {
  data: SiteData;
  setData: React.Dispatch<React.SetStateAction<SiteData>>;
  canPublish: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const tierlist = getUnifiedTierList(data);
  const [items, setItems] = useState(tierlist?.items || []);
  const [title, setTitle] = useState(tierlist?.title || '');
  const [patch, setPatch] = useState(tierlist?.patch || '1.0');
  const [status, setStatus] = useState(tierlist?.status || 'published');
  const [changelog, setChangelog] = useState(
    (tierlist?.changelog || []).join('\n'),
  );
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [draggedCharacterId, setDraggedCharacterId] = useState('');
  const [dragOver, setDragOver] = useState<{
    tier: Tier;
    characterId?: string;
    placement?: 'before' | 'after';
  } | null>(null);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [characterToAdd, setCharacterToAdd] = useState('');

  useEffect(() => {
    setItems(tierlist?.items || []);
    setTitle(tierlist?.title || '');
    setPatch(tierlist?.patch || '1.0');
    setStatus(tierlist?.status || 'published');
    setChangelog((tierlist?.changelog || []).join('\n'));
    setMessage('');
  }, [tierlist]);

  const tierBaselineSignature = useMemo(
    () =>
      JSON.stringify({
        title: tierlist?.title || '',
        patch: tierlist?.patch || '1.0',
        status: tierlist?.status || 'published',
        changelog: (tierlist?.changelog || []).join('\n'),
        items: (tierlist?.items || []).map((item) => ({
          ...item,
          tier: normalizeTier(item.tier),
        })),
      }),
    [tierlist],
  );
  const tierDraftSignature = useMemo(
    () =>
      JSON.stringify({
        title,
        patch,
        status,
        changelog,
        items: items.map((item) => ({
          ...item,
          tier: normalizeTier(item.tier),
        })),
      }),
    [changelog, items, patch, status, title],
  );

  useEffect(() => {
    onDirtyChange?.(tierDraftSignature !== tierBaselineSignature);
  }, [onDirtyChange, tierBaselineSignature, tierDraftSignature]);

  useEffect(
    () => () => {
      dragPreviewRef.current?.remove();
    },
    [],
  );

  const groupedItems = useMemo(() => {
    const result = Object.fromEntries(
      tierOrder.map((tier) => [tier, [] as typeof items]),
    ) as Record<Tier, typeof items>;
    items.forEach((item) => {
      const character = getCharacter(data, item.characterId);
      if (character) {
        const tier = normalizeTier(item.tier);
        result[tier].push({ ...item, tier });
      }
    });
    return result;
  }, [data, items]);

  function updateItem(
    characterId: string,
    patchValue: Partial<(typeof items)[number]>,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.characterId === characterId ? { ...item, ...patchValue } : item,
      ),
    );
  }

  function moveCharacter(
    characterId: string,
    nextTier: Tier,
    targetCharacterId?: string,
    placement: 'before' | 'after' = 'after',
  ) {
    if (targetCharacterId === characterId) {
      clearTierDragState();
      return;
    }

    setItems((current) => {
      const existing = current.find((item) => item.characterId === characterId);
      const moving = existing
        ? { ...existing, tier: nextTier }
        : { characterId, tier: nextTier, note: '' };
      const withoutMoving = current.filter(
        (item) => item.characterId !== characterId,
      );
      const nextItems: typeof current = [];

      for (const tier of tierOrder) {
        const rowItems = withoutMoving
          .filter((item) => normalizeTier(item.tier) === tier)
          .map((item) => ({ ...item, tier: normalizeTier(item.tier) }));

        if (tier === nextTier) {
          const insertIndex = targetCharacterId
            ? rowItems.findIndex(
                (item) => item.characterId === targetCharacterId,
              )
            : -1;
          if (insertIndex >= 0) {
            rowItems.splice(
              placement === 'after' ? insertIndex + 1 : insertIndex,
              0,
              moving,
            );
          } else {
            rowItems.push(moving);
          }
        }

        nextItems.push(...rowItems);
      }

      return nextItems;
    });
    clearTierDragState();
  }

  function clearTierDragState() {
    setDraggedCharacterId('');
    setDragOver(null);
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
  }

  function getTierDropPlacement(event: React.DragEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const horizontal = rect.width >= rect.height;
    if (horizontal) {
      return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
    }
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
  }

  function setTierDragImage(
    event: React.DragEvent<HTMLButtonElement>,
    character: Character,
  ) {
    const source = event.currentTarget;
    const rect = source.getBoundingClientRect();
    const clone = source.cloneNode(true) as HTMLElement;
    clone.classList.add('tier-drag-card--ghost');
    clone.setAttribute('aria-hidden', 'true');
    clone.style.inlineSize = `${rect.width}px`;
    clone.style.blockSize = `${rect.height}px`;

    dragPreviewRef.current?.remove();
    document.body.append(clone);
    dragPreviewRef.current = clone;
    event.dataTransfer.setDragImage(clone, rect.width / 2, rect.height / 2);
    event.dataTransfer.setData(
      'application/x-nte-character-name',
      character.name,
    );
  }

  const availableCharacters = data.characters.filter(
    (character) => !items.some((item) => item.characterId === character.id),
  );

  async function saveTierlist() {
    if (!tierlist) return;
    setPending(true);
    setMessage('');
    const payload = {
      title,
      tierlistType: tierlist.kind,
      patchVersion: patch,
      ...(canPublish ? { status } : {}),
      changelogJson: changelog
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      items,
    };

    if (hasApiBase()) {
      const result = await saveEntity<{ success: boolean }>(
        `/api/tierlists/${tierlist.id}`,
        payload,
        'PATCH',
      );
      if (!result.ok) {
        setMessage(result.error);
        setPending(false);
        return;
      }
      setData(await loadSiteData({ includePrivate: true }));
      setMessage('Тир-лист сохранен в D1.');
    } else {
      setData((current) => ({
        ...current,
        tierlists: current.tierlists.map((item) =>
          item.id === tierlist.id
            ? {
                ...item,
                title,
                patch,
                status,
                changelog: payload.changelogJson,
                items,
              }
            : item,
        ),
      }));
      setMessage('Тир-лист обновлен в демо-режиме.');
    }
    onDirtyChange?.(false);
    setPending(false);
  }

  if (!tierlist) {
    return (
      <EmptyState
        title="Тир-листов пока нет"
        text="Создайте единый опубликованный тир-лист через API, затем наполните его персонажами."
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="admin-panel tierlist-editor-header">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Единый редакционный список</p>
            <h2>Редактор тир-листа</h2>
          </div>
        </div>
        <div className="tierlist-meta-fields">
          <label>
            Название
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Патч
            <input
              value={patch}
              onChange={(event) => setPatch(event.target.value)}
            />
          </label>
          <label>
            Статус
            <select
              value={status}
              disabled={!canPublish}
              onChange={(event) =>
                setStatus(
                  event.target.value as NonNullable<typeof tierlist.status>,
                )
              }
            >
              <option value="draft">Черновик</option>
              <option value="published">Опубликован</option>
              <option value="archived">Архив</option>
            </select>
          </label>
          <label className="wide-field">
            История изменений — одна запись на строку
            <textarea
              rows={4}
              value={changelog}
              onChange={(event) => setChangelog(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="admin-panel">
        <SectionHeader
          title="Распределение персонажей"
          text="Перетащите иконку в нужную строку. Выпадающие списки ниже остаются доступной клавиатурной альтернативой."
        />
        <div
          className="tier-board-editor"
          aria-label="Редактор распределения по тирам"
        >
          {tierOrder.map((tier) => (
            <section
              className={`tier-drop-row tier-${tier.toLowerCase()} ${
                dragOver?.tier === tier && !dragOver.characterId
                  ? 'is-over'
                  : ''
              }`}
              key={tier}
              onDragEnter={() => setDragOver({ tier })}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragOver?.tier !== tier || dragOver.characterId) {
                  setDragOver({ tier });
                }
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                  setDragOver(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedCharacterId) moveCharacter(draggedCharacterId, tier);
              }}
            >
              <strong>{tier}</strong>
              <div>
                {groupedItems[tier].map((item, index) => {
                  const character = getCharacter(data, item.characterId);
                  if (!character) return null;
                  const isDragging = draggedCharacterId === item.characterId;
                  const isDropTarget =
                    dragOver?.tier === tier &&
                    dragOver.characterId === item.characterId;
                  const dropPlacement = isDropTarget
                    ? dragOver?.placement || 'before'
                    : null;
                  return (
                    <button
                      type="button"
                      draggable
                      key={item.characterId}
                      className={`tier-drag-card ${
                        isDragging ? 'is-dragging' : ''
                      } ${isDropTarget ? 'is-drop-target' : ''} ${
                        dropPlacement ? `is-drop-${dropPlacement}` : ''
                      }`}
                      title={`${character.name}: перетащить или переставить в строке ${tier}`}
                      aria-label={`${character.name}, тир ${tier}`}
                      data-drop-placement={dropPlacement || undefined}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData(
                          'text/plain',
                          item.characterId,
                        );
                        setTierDragImage(event, character);
                        setDraggedCharacterId(item.characterId);
                      }}
                      onDragEnter={(event) => {
                        if (
                          draggedCharacterId &&
                          draggedCharacterId !== item.characterId
                        ) {
                          setDragOver({
                            tier,
                            characterId: item.characterId,
                            placement: getTierDropPlacement(event),
                          });
                        }
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (
                          !draggedCharacterId ||
                          draggedCharacterId === item.characterId
                        ) {
                          return;
                        }
                        const placement = getTierDropPlacement(event);
                        if (
                          dragOver?.tier !== tier ||
                          dragOver.characterId !== item.characterId ||
                          dragOver.placement !== placement
                        ) {
                          setDragOver({
                            tier,
                            characterId: item.characterId,
                            placement,
                          });
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (draggedCharacterId) {
                          moveCharacter(
                            draggedCharacterId,
                            tier,
                            item.characterId,
                            dragOver?.placement || getTierDropPlacement(event),
                          );
                        }
                      }}
                      onDragEnd={clearTierDragState}
                    >
                      <span className="tier-card-rank">{index + 1}</span>
                      <img
                        src={resolveAssetUrl(character.imageUrl)}
                        alt=""
                        width="62"
                        height="62"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                      <span>{character.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="tier-add-character">
          <label htmlFor="tier-character-add">
            Добавить персонажа в тир-лист
          </label>
          <select
            id="tier-character-add"
            value={characterToAdd}
            onChange={(event) => setCharacterToAdd(event.target.value)}
          >
            <option value="">Выберите персонажа</option>
            {availableCharacters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
          <button
            className="ghost-button"
            type="button"
            disabled={!characterToAdd}
            onClick={() => {
              moveCharacter(characterToAdd, 'A');
              setCharacterToAdd('');
            }}
          >
            <Plus aria-hidden="true" /> Добавить в A
          </button>
        </div>
      </section>

      <section className="admin-panel">
        <div className="tierlist-item-editor">
          {items.map((item) => {
            const character = getCharacter(data, item.characterId);
            if (!character) return null;
            return (
              <article key={item.characterId}>
                <img
                  src={resolveAssetUrl(character.imageUrl)}
                  alt=""
                  width="56"
                  height="56"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <strong>{character.name}</strong>
                <label>
                  Тир
                  <select
                    value={item.tier}
                    onChange={(event) =>
                      updateItem(item.characterId, {
                        tier: normalizeTier(event.target.value),
                      })
                    }
                  >
                    {tierOrder.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Комментарий редакции
                  <input
                    value={item.note}
                    onChange={(event) =>
                      updateItem(item.characterId, {
                        note: event.target.value,
                      })
                    }
                  />
                </label>
                <button
                  className="icon-button danger"
                  type="button"
                  title="Убрать персонажа из тир-листа"
                  aria-label={`Убрать ${character.name} из тир-листа`}
                  onClick={() =>
                    setItems((current) =>
                      current.filter(
                        (candidate) =>
                          candidate.characterId !== item.characterId,
                      ),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={pending}
          onClick={saveTierlist}
        >
          <CheckCircle2 aria-hidden="true" />
          {pending ? 'Сохраняем...' : 'Сохранить тир-лист'}
        </button>
        <p className="form-message" aria-live="polite">
          {message}
        </p>
      </section>
    </div>
  );
}

const moderationTargetLabels: Record<string, string> = {
  site: 'Сайт',
  character: 'Персонаж',
  guide: 'Гайд',
  news: 'Новость',
  leak: 'Слив',
  thread: 'Обсуждение',
};

const moderationStatusLabels: Record<string, string> = {
  visible: 'Виден',
  moderated: 'Скрыт',
  deleted: 'Удалён',
};

function AdminComments({ data, user }: { data: SiteData; user: User }) {
  const [comments, setComments] = useState<Comment[]>(
    data.comments.map((comment) => ({
      ...comment,
      status: comment.status || 'visible',
    })),
  );
  const [loading, setLoading] = useState(hasApiBase());
  const [reports, setReports] = useState<CommentReport[]>([]);
  const [message, setMessage] = useState('');
  const [actionId, setActionId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);
  const [warningTarget, setWarningTarget] = useState<Comment | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const warningDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!hasApiBase()) return;
    let mounted = true;
    Promise.all([loadModerationComments(), loadCommentReports()]).then(
      ([commentsResult, reportsResult]) => {
        if (!mounted) return;
        if (commentsResult.ok) {
          setComments(commentsResult.data);
        } else {
          setMessage(commentsResult.error);
        }
        if (reportsResult.ok) setReports(reportsResult.data);
        else if (commentsResult.ok) setMessage(reportsResult.error);
        setLoading(false);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  async function setStatus(
    comment: Comment,
    status: 'visible' | 'moderated' | 'deleted',
  ) {
    setActionId(comment.id);
    const result = await updateComment(comment.id, { status });
    if (result.ok) {
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id ? { ...item, status } : item,
        ),
      );
      setMessage(
        status === 'visible'
          ? 'Комментарий восстановлен.'
          : status === 'deleted'
            ? 'Комментарий удален.'
            : 'Комментарий скрыт.',
      );
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  async function reviewReport(
    report: CommentReport,
    status: CommentReport['status'],
  ) {
    setActionId(report.id);
    const result = await updateCommentReport(report.id, status);
    if (result.ok) {
      setReports((current) =>
        current.map((item) =>
          item.id === report.id ? { ...item, status } : item,
        ),
      );
      setMessage(
        status === 'resolved' ? 'Жалоба обработана.' : 'Жалоба отклонена.',
      );
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  function requestDelete(comment: Comment) {
    setDeleteTarget(comment);
    deleteDialogRef.current?.showModal();
  }

  function closeWarningDialog() {
    const dialog = warningDialogRef.current;
    dialog?.querySelector('form')?.reset();
    if (dialog?.open) dialog.close('cancel');
  }

  async function submitWarning(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!warningTarget?.userId) return;
    const form = new FormData(event.currentTarget);
    setActionId(warningTarget.id);
    const result = await createUserWarning(
      warningTarget.userId,
      String(form.get('reason') || ''),
    );
    if (result.ok) {
      setMessage(`Предупреждение для ${warningTarget.author} сохранено.`);
      event.currentTarget.reset();
      warningDialogRef.current?.close();
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  return (
    <div className="admin-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Модератор: {user.displayName}</p>
          <h2>Модерация обсуждений</h2>
        </div>
        <span>
          {reports.filter((report) => report.status === 'open').length} жалоб ·{' '}
          {comments.length} комментариев
        </span>
      </div>
      <p className="form-message" aria-live="polite">
        {loading ? 'Загружаем очередь...' : message}
      </p>
      {reports.length ? (
        <section
          className="moderation-report-queue"
          aria-labelledby="comment-reports-title"
        >
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Сигналы сообщества</p>
              <h3 id="comment-reports-title">Жалобы на комментарии</h3>
            </div>
            <span>
              {reports.filter((report) => report.status === 'open').length}{' '}
              открыто
            </span>
          </div>
          <div className="moderation-report-list">
            {reports.map((report) => (
              <article
                className={`moderation-report status-${report.status}`}
                key={report.id}
              >
                <div className="moderation-report-heading">
                  <span>{commentReportReasonLabels[report.reason]}</span>
                  <small>{formatDate(report.createdAt)}</small>
                </div>
                <blockquote>{report.commentBody}</blockquote>
                <p>
                  Автор: {report.commentAuthor} · пожаловался:{' '}
                  {report.reporterName}
                </p>
                {report.details ? <p>{report.details}</p> : null}
                {report.status === 'open' ? (
                  <div className="button-row">
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={actionId === report.id}
                      onClick={() => void reviewReport(report, 'resolved')}
                    >
                      <CheckCircle2 aria-hidden="true" /> Обработано
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={actionId === report.id}
                      onClick={() => void reviewReport(report, 'dismissed')}
                    >
                      <XCircle aria-hidden="true" /> Отклонить
                    </button>
                  </div>
                ) : (
                  <span className="moderation-report-status">
                    {report.status === 'resolved' ? 'Обработана' : 'Отклонена'}
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <div className="comment-list moderation-comment-list">
        {comments.map((comment) => (
          <article
            className={`comment-card status-${comment.status || 'visible'}`}
            key={comment.id}
          >
            <div className="comment-heading">
              <strong>{comment.author}</strong>
              <span>
                {moderationTargetLabels[comment.targetType] ||
                  comment.targetType}
                {' · '}
                {moderationStatusLabels[comment.status || 'visible'] ||
                  comment.status ||
                  'Виден'}
              </span>
            </div>
            <p>{comment.body}</p>
            <div className="button-row">
              <button
                className="ghost-button"
                type="button"
                disabled={!comment.userId || actionId === comment.id}
                onClick={() => {
                  setWarningTarget(comment);
                  warningDialogRef.current?.showModal();
                }}
              >
                <CircleAlert aria-hidden="true" />
                Предупредить
              </button>
              {comment.status === 'visible' ? (
                <button
                  className="ghost-button"
                  type="button"
                  disabled={actionId === comment.id}
                  onClick={() => setStatus(comment, 'moderated')}
                >
                  Скрыть
                </button>
              ) : (
                <button
                  className="ghost-button"
                  type="button"
                  disabled={actionId === comment.id}
                  onClick={() => setStatus(comment, 'visible')}
                >
                  Восстановить
                </button>
              )}
              <button
                className="ghost-button danger"
                type="button"
                disabled={
                  actionId === comment.id || comment.status === 'deleted'
                }
                onClick={() => requestDelete(comment)}
              >
                <Trash2 aria-hidden="true" />
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>
      <dialog
        className="confirm-dialog"
        ref={deleteDialogRef}
        onClose={() => setDeleteTarget(null)}
      >
        <form method="dialog">
          <h2>Удалить комментарий из очереди?</h2>
          <p>Запись останется в журнале, но не будет видна пользователям.</p>
          <div className="button-row">
            <button className="ghost-button" value="cancel">
              Отменить
            </button>
            <button
              className="primary-button danger-action"
              type="button"
              onClick={async () => {
                if (!deleteTarget) return;
                deleteDialogRef.current?.close();
                await setStatus(deleteTarget, 'deleted');
              }}
            >
              <Trash2 aria-hidden="true" />
              Удалить
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        className="confirm-dialog"
        ref={warningDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          closeWarningDialog();
        }}
        onClose={(event) => {
          event.currentTarget.querySelector('form')?.reset();
          setActionId('');
          setWarningTarget(null);
        }}
      >
        <form onSubmit={submitWarning}>
          <h2>Предупреждение пользователю</h2>
          <p>
            Пользователь {warningTarget?.author} увидит причину в своём профиле.
            Действие сохранится в audit log.
          </p>
          <label htmlFor="moderation-warning-reason">Причина</label>
          <textarea
            id="moderation-warning-reason"
            name="reason"
            minLength={5}
            maxLength={1000}
            rows={5}
            required
          />
          <div className="button-row">
            <button
              className="ghost-button"
              type="button"
              formNoValidate
              onClick={closeWarningDialog}
            >
              Отменить
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={Boolean(warningTarget && actionId === warningTarget.id)}
            >
              <CircleAlert aria-hidden="true" /> Выдать предупреждение
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

const userRoles: Role[] = ['user', 'moderator', 'editor', 'admin', 'owner'];
const editorGrades: EditorGrade[] = ['junior', 'editor', 'senior', 'lead'];
const editorScopeLabels: Record<ContentScope, string> = {
  characters: 'Персонажи',
  guides: 'Гайды',
  tierlists: 'Тир-листы',
  news: 'Новости',
  leaks: 'Сливы',
};
const defaultEditorPermissions: EditorPermissions = {
  grade: 'junior',
  scopes: ['guides', 'characters'],
  canCreate: true,
  canEdit: true,
  canPublish: true,
  canDelete: false,
};

function AdminWarnings() {
  const [warnings, setWarnings] = useState<UserWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [actionId, setActionId] = useState('');

  useEffect(() => {
    let mounted = true;
    loadWarnings().then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setWarnings(result.data);
      } else {
        setMessage(result.error);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function updateStatus(
    warning: UserWarning,
    status: 'active' | 'dismissed',
  ) {
    setActionId(warning.id);
    const result = await updateWarningStatus(warning.id, status);
    if (result.ok) {
      setWarnings((current) =>
        current.map((item) =>
          item.id === warning.id ? { ...item, status } : item,
        ),
      );
      setMessage(
        status === 'dismissed'
          ? 'Предупреждение закрыто.'
          : 'Предупреждение снова активно.',
      );
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  return (
    <section className="admin-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Модерация</p>
          <h2>Предупреждения пользователей</h2>
        </div>
        <span>{warnings.length} записей</span>
      </div>
      <p className="form-message" aria-live="polite">
        {loading ? 'Загружаем предупреждения...' : message}
      </p>
      <div className="comment-list">
        {warnings.length ? (
          warnings.map((warning) => (
            <article
              className={`comment-card status-${warning.status || 'active'}`}
              key={warning.id}
            >
              <div className="comment-heading">
                <strong>{warning.reason}</strong>
                <span>
                  {warning.userName || warning.userId || 'Пользователь'} ·{' '}
                  {formatDate(warning.createdAt)}
                </span>
              </div>
              {warning.note ? <p>{warning.note}</p> : null}
              <div className="button-row">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={actionId === warning.id}
                  onClick={() =>
                    updateStatus(
                      warning,
                      (warning.status || 'active') === 'active'
                        ? 'dismissed'
                        : 'active',
                    )
                  }
                >
                  {(warning.status || 'active') === 'active'
                    ? 'Закрыть'
                    : 'Вернуть'}
                </button>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title="Предупреждений нет"
            text="Когда модераторы будут выдавать предупреждения, они появятся здесь."
          />
        )}
      </div>
    </section>
  );
}

function AdminSystemStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    loadSystemStatus().then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setStatus(result.data);
      } else {
        setMessage(result.error);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="admin-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Worker + D1</p>
          <h2>Системный статус</h2>
        </div>
        <span>{status?.api || 'checking'}</span>
      </div>
      <p className="form-message" aria-live="polite">
        {message || status?.migrationState || 'Проверяем API и D1...'}
      </p>
      {status ? (
        <dl className="character-stat-grid">
          <div>
            <dt>API</dt>
            <dd>{status.api}</dd>
          </div>
          <div>
            <dt>D1</dt>
            <dd>{status.d1}</dd>
          </div>
          {Object.entries(status.counts || {}).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    loadAuditLog().then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setEntries(result.data);
      } else {
        setMessage(result.error);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="admin-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Последние 200 событий</p>
          <h2>Audit log</h2>
        </div>
        <span>{entries.length} записей</span>
      </div>
      <p className="form-message" aria-live="polite">
        {loading ? 'Загружаем журнал...' : message}
      </p>
      <div className="audit-list">
        {entries.map((entry) => (
          <article key={entry.id}>
            <div>
              <strong>{entry.action}</strong>
              <span>{formatDate(entry.created_at)}</span>
            </div>
            <code>{entry.target_id || 'system'}</code>
            <details>
              <summary>Детали</summary>
              <pre>{entry.details_json}</pre>
            </details>
          </article>
        ))}
        {!loading && entries.length === 0 ? (
          <EmptyState
            title="Журнал пока пуст"
            text="Создание, редактирование и удаление контента появятся здесь."
          />
        ) : null}
      </div>
    </section>
  );
}

function AdminUsers({ actor }: { actor: User }) {
  const [users, setUsers] = useState<AdminUser[]>(
    hasApiBase()
      ? []
      : [{ ...actor, status: 'active', createdAt: new Date().toISOString() }],
  );
  const [loading, setLoading] = useState(hasApiBase());
  const [message, setMessage] = useState('');
  const [actionId, setActionId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!hasApiBase()) return;
    let mounted = true;
    loadUsers().then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setUsers(result.data);
      } else {
        setMessage(result.error);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function changeRole(target: AdminUser, role: Role) {
    setActionId(target.id);
    const result = await updateUserRole(target.id, role);
    if (result.ok) {
      setUsers((current) =>
        current.map((user) =>
          user.id === target.id
            ? {
                ...user,
                role,
                editorPermissions:
                  role === 'editor'
                    ? user.editorPermissions || defaultEditorPermissions
                    : user.editorPermissions,
              }
            : user,
        ),
      );
      setMessage(`Роль ${target.displayName} изменена на ${role}.`);
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  function patchEditorPermissions(
    targetId: string,
    patchValue: Partial<EditorPermissions>,
  ) {
    setUsers((current) =>
      current.map((user) =>
        user.id === targetId
          ? {
              ...user,
              editorPermissions: {
                ...defaultEditorPermissions,
                ...user.editorPermissions,
                ...patchValue,
              },
            }
          : user,
      ),
    );
  }

  async function saveEditorPermissions(target: AdminUser) {
    const permissions = target.editorPermissions || defaultEditorPermissions;
    setActionId(target.id);
    const result = await updateEditorPermissions(target.id, permissions);
    if (result.ok) {
      patchEditorPermissions(target.id, result.data);
      setMessage(`Права редактора ${target.displayName} сохранены.`);
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  async function changeStatus(
    target: AdminUser,
    status: 'active' | 'disabled',
  ) {
    setActionId(target.id);
    const result = await updateUserStatus(target.id, status);
    if (result.ok) {
      setUsers((current) =>
        current.map((user) =>
          user.id === target.id ? { ...user, status } : user,
        ),
      );
      setMessage(
        status === 'active'
          ? `Аккаунт ${target.displayName} восстановлен.`
          : `Аккаунт ${target.displayName} отключен, сессии завершены.`,
      );
    } else {
      setMessage(result.error);
    }
    setActionId('');
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    deleteDialogRef.current?.close();
    setActionId(target.id);
    const result = await deleteUser(target.id);
    if (result.ok) {
      setUsers((current) =>
        current.map((user) =>
          user.id === target.id ? { ...user, status: 'deleted' } : user,
        ),
      );
      setMessage(`Пользователь ${target.displayName} удален.`);
    } else {
      setMessage(result.error);
    }
    setActionId('');
    setDeleteTarget(null);
  }

  return (
    <div className="admin-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">RBAC на Worker</p>
          <h2>Пользователи и роли</h2>
        </div>
        <span>{users.length} аккаунтов</span>
      </div>
      <p className="form-message" aria-live="polite">
        {loading ? 'Загружаем пользователей...' : message}
      </p>
      <div className="user-table">
        {users.map((target) => (
          <article key={target.id}>
            <div>
              <strong>{target.displayName}</strong>
              <span>@{target.username}</span>
            </div>
            <span className={`status-label status-${target.status}`}>
              {target.status}
            </span>
            <label>
              Роль
              <select
                value={target.role}
                disabled={
                  target.id === actor.id ||
                  target.status !== 'active' ||
                  (actor.role !== 'owner' &&
                    roleWeight[target.role] >= roleWeight.admin) ||
                  actionId === target.id
                }
                onChange={(event) =>
                  changeRole(target, event.target.value as Role)
                }
              >
                {userRoles.map((role) => (
                  <option
                    value={role}
                    key={role}
                    disabled={
                      actor.role !== 'owner' &&
                      roleWeight[role] >= roleWeight.admin
                    }
                  >
                    {role}
                  </option>
                ))}
              </select>
            </label>
            {target.role === 'editor' ? (
              <details className="editor-permissions-panel">
                <summary>Грейд и точные права</summary>
                <label>
                  Грейд
                  <select
                    value={
                      target.editorPermissions?.grade ||
                      defaultEditorPermissions.grade
                    }
                    onChange={(event) =>
                      patchEditorPermissions(target.id, {
                        grade: event.target.value as EditorGrade,
                      })
                    }
                  >
                    {editorGrades.map((grade) => (
                      <option key={grade} value={grade}>
                        {
                          {
                            junior: 'Младший редактор',
                            editor: 'Редактор',
                            senior: 'Старший редактор',
                            lead: 'Ведущий редактор',
                          }[grade]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend>Разделы</legend>
                  {(Object.keys(editorScopeLabels) as ContentScope[]).map(
                    (scope) => {
                      const scopes =
                        target.editorPermissions?.scopes ||
                        defaultEditorPermissions.scopes;
                      return (
                        <label key={scope} className="check-row">
                          <input
                            type="checkbox"
                            checked={scopes.includes(scope)}
                            onChange={(event) =>
                              patchEditorPermissions(target.id, {
                                scopes: event.target.checked
                                  ? [...scopes, scope]
                                  : scopes.filter((item) => item !== scope),
                              })
                            }
                          />
                          {editorScopeLabels[scope]}
                        </label>
                      );
                    },
                  )}
                </fieldset>
                <fieldset>
                  <legend>Действия</legend>
                  {(
                    [
                      ['canCreate', 'Создавать'],
                      ['canEdit', 'Редактировать'],
                      ['canPublish', 'Публиковать'],
                      ['canDelete', 'Удалять'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="check-row">
                      <input
                        type="checkbox"
                        checked={
                          target.editorPermissions?.[key] ??
                          defaultEditorPermissions[key]
                        }
                        onChange={(event) =>
                          patchEditorPermissions(target.id, {
                            [key]: event.target.checked,
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <button
                  className="primary-button"
                  type="button"
                  disabled={actionId === target.id}
                  onClick={() => void saveEditorPermissions(target)}
                >
                  <CheckCircle2 aria-hidden="true" /> Сохранить права
                </button>
              </details>
            ) : null}
            {target.id !== actor.id && target.status !== 'deleted' ? (
              <button
                className="ghost-button"
                type="button"
                disabled={actionId === target.id}
                onClick={() =>
                  changeStatus(
                    target,
                    target.status === 'active' ? 'disabled' : 'active',
                  )
                }
              >
                {target.status === 'active' ? (
                  <CircleAlert aria-hidden="true" />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
                {target.status === 'active' ? 'Отключить' : 'Восстановить'}
              </button>
            ) : null}
            {actor.role === 'owner' && target.id !== actor.id ? (
              <button
                className="ghost-button danger"
                type="button"
                disabled={target.status === 'deleted' || actionId === target.id}
                onClick={() => {
                  setDeleteTarget(target);
                  deleteDialogRef.current?.showModal();
                }}
              >
                <Trash2 aria-hidden="true" />
                Удалить
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <dialog
        className="confirm-dialog"
        ref={deleteDialogRef}
        onClose={() => setDeleteTarget(null)}
      >
        <form method="dialog">
          <h2>Удалить пользователя?</h2>
          <p>
            Аккаунт {deleteTarget?.displayName} потеряет доступ, его активные
            сессии перестанут работать.
          </p>
          <div className="button-row">
            <button className="ghost-button" value="cancel">
              Отменить
            </button>
            <button
              className="primary-button danger-action"
              type="button"
              onClick={confirmDelete}
            >
              <Trash2 aria-hidden="true" />
              Удалить аккаунт
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

const defaultSettings: AppSettings = {
  site: {
    title: 'NTE Meta',
    language: 'ru',
    registrationEnabled: true,
    leaksRequireApproval: true,
  },
  seo: {
    canonical: 'https://bonaqu.github.io/nte-meta/',
    description:
      'Русскоязычный meta-hub по Neverness to Everness с глубокими гайдами и тир-листами.',
  },
};

function AdminSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(hasApiBase());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!hasApiBase()) return;
    let mounted = true;
    loadSettings().then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setSettings({
          site: { ...defaultSettings.site, ...result.data.site },
          seo: { ...defaultSettings.seo, ...result.data.seo },
        });
      } else {
        setMessage(result.error);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasApiBase()) {
      setMessage('Настройки сохранены в демо-режиме.');
      return;
    }
    setPending(true);
    const result = await updateSettings(settings);
    setMessage(result.ok ? 'Настройки сайта сохранены.' : result.error);
    setPending(false);
  }

  return (
    <div className="admin-grid two-columns">
      <form className="admin-panel entity-form" onSubmit={saveSettings}>
        <p className="eyebrow">Публичные параметры</p>
        <h2>Настройки сайта</h2>
        <label htmlFor="setting-title">Название сайта</label>
        <input
          id="setting-title"
          name="siteTitle"
          value={settings.site.title}
          minLength={2}
          maxLength={60}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              site: { ...current.site, title: event.target.value },
            }))
          }
          required
        />
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.site.registrationEnabled}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                site: {
                  ...current.site,
                  registrationEnabled: event.target.checked,
                },
              }))
            }
          />
          Регистрация новых пользователей
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked disabled readOnly />
          Обязательное одобрение сливов перед публикацией
        </label>
        <button className="primary-button" type="submit" disabled={pending}>
          <Settings aria-hidden="true" />
          {pending ? 'Сохраняем...' : 'Сохранить'}
        </button>
        <p className="form-message" aria-live="polite">
          {loading ? 'Загружаем настройки...' : message}
        </p>
      </form>
      <form className="admin-panel entity-form" onSubmit={saveSettings}>
        <p className="eyebrow">Поисковые системы</p>
        <h2>SEO</h2>
        <label htmlFor="setting-canonical">Canonical URL</label>
        <input
          id="setting-canonical"
          name="canonical"
          type="url"
          value={settings.seo.canonical}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              seo: { ...current.seo, canonical: event.target.value },
            }))
          }
          required
        />
        <label htmlFor="setting-description">Meta description</label>
        <textarea
          id="setting-description"
          name="description"
          value={settings.seo.description}
          minLength={20}
          maxLength={180}
          rows={5}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              seo: { ...current.seo, description: event.target.value },
            }))
          }
          required
        />
        <button className="primary-button" type="submit" disabled={pending}>
          <Settings aria-hidden="true" />
          {pending ? 'Сохраняем...' : 'Сохранить SEO'}
        </button>
        <small>API: {hasApiBase() ? 'Worker подключен' : 'демо-режим'}</small>
      </form>
    </div>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <strong>NTE Meta</strong>
        <p>
          Русскоязычный meta-hub по Neverness to Everness. Новости, сливы и
          комьюнити живут на главной, а контент редактируется прямо в разделах.
        </p>
      </div>
      <div>
        <a href="#/characters">Персонажи</a>
        <a href="#/guides">Гайды</a>
        <a href="#/tierlists">Тир-листы</a>
      </div>
    </footer>
  );
}

function NotFoundPage() {
  return (
    <section className="page-hero compact">
      <p className="eyebrow">Ошибка 404</p>
      <h1>Страница не найдена</h1>
      <p>
        Возможно, материал переименовали, отправили в архив или ссылка устарела.
      </p>
      <a className="primary-button" href="#/">
        <Home aria-hidden="true" /> Вернуться на главную
      </a>
    </section>
  );
}

export default App;
