import React, {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  ClipboardList,
  Gamepad2,
  GripVertical,
  Home,
  ListFilter,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Newspaper,
  PanelLeft,
  Pencil,
  Plus,
  Reply,
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
} from 'lucide-react';
import {
  EmptyState,
  SectionHeader,
  SkeletonGrid,
  StatusBanner,
} from './components/ui-state';
import { seedData } from './data/seed';
import {
  changePassword,
  createComment,
  createUserWarning,
  deleteComment,
  deleteEntity,
  deleteUser,
  hasApiBase,
  loadAuthConfig,
  loadComments,
  loadAuditLog,
  loadModerationComments,
  loadMyWarnings,
  loadReactionSummary,
  loadSettings,
  loadSiteData,
  loadSystemStatus,
  loadUsers,
  loadWarnings,
  login,
  logout,
  me,
  register,
  saveEntity,
  sendReaction,
  updateComment,
  updateProfile,
  updateSettings,
  updateEditorPermissions,
  updateUserStatus,
  updateUserRole,
  updateWarningStatus,
} from './lib/api';
import { applyMarkdownAction, MarkdownPreview } from './lib/markdown';
import { resolveAssetUrl } from './lib/assets';
import {
  formatDate,
  getCharacter,
  getCharacterSearchText,
  getGuideCharacter,
  groupTierItems,
  normalizeSearchText,
  tierOrder,
} from './lib/site-data';
import { getYoutubeEmbedUrl } from './lib/youtube';
import { setPageMetadata } from './lib/seo';
import { canManageContent, editorGradeLabel } from './lib/permissions';
import { EditorShell } from './features/inline-editors/editor-shell';
import type {
  AdminUser,
  AuditLogEntry,
  AppSettings,
  Character,
  Comment,
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
const roleOptions = [
  'Все роли',
  'DD',
  'Sub DD',
  'Damage Booster',
  'Burst DPS',
  'Sustain DPS',
  'AoE DPS',
  'Sub DPS',
  'Support',
  'Buffer',
  'Debuffer',
  'Healer',
  'Tank',
  'Control',
  'Flex',
];
const typeOptions = [
  'Все типы',
  'DPS',
  'Sub DPS',
  'Damage Booster',
  'Support',
  'Buffer',
  'Debuffer',
  'Healer',
  'Tank',
  'Control',
  'Flex',
];
const rarityOptions = ['Любая редкость', 'S', 'A', 'Нулевой'];
const tierOptions = ['Любой тир', ...tierOrder];

function makeSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'e')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9а-я]+/gi, '-')
      .replace(/^-+|-+$/g, '') || `thread-${Date.now()}`
  );
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
    return '';
  }

  const [route, setRoute] = useState(() => getRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function App() {
  const route = useHashRoute();
  const [data, setData] = useState<SiteData>(seedData);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);
      const currentUser = await me();
      const viewer = currentUser.ok ? currentUser.data : null;
      const siteData = await loadSiteData({
        includePrivate: Boolean(
          viewer && roleWeight[viewer.role] >= roleWeight.editor,
        ),
      });

      if (!mounted) {
        return;
      }

      setData(siteData);
      setUser(viewer);
      setLoading(false);
    }

    init().catch((loadError: unknown) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить данные',
      );
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user || roleWeight[user.role] < roleWeight.editor) return;
    loadSiteData({ includePrivate: true }).then(setData);
  }, [user]);

  useEffect(() => {
    setMobileOpen(false);
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
        'Персонажи Neverness to Everness: роли, атрибуты, тиры и подробные гайды.',
        '/characters/',
      ],
      guides: [
        'Гайды',
        'Практические гайды NTE Meta: ротации, билды, команды и ошибки.',
        '/guides/',
      ],
      tierlists: [
        'Тир-листы',
        'Base C0 и Premium C6 тир-листы NTE Meta.',
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
  let page = (
    <HomePage data={data} loading={loading} user={user} setData={setData} />
  );

  if (section === 'characters') {
    page = slug ? (
      <CharacterDetailPage data={data} slug={slug} user={user} setData={setData} />
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
      <HomePage data={data} loading={loading} user={user} setData={setData} />
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
        {error ? <StatusBanner tone="danger" text={error} /> : null}
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
    </>
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
      <a className="profile-chip" href="#/profile">
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
  const latestGuides = data.guides.slice(0, 3);
  const latestNews = data.news.slice(0, 2);
  const latestLeaks = data.leaks.filter((leak) => leak.approved).slice(0, 2);
  const { grouped } = groupTierItems(data, 'base');
  const popularCharacters = data.characters.slice(0, 6);
  const [homeEditor, setHomeEditor] = useState<
    'guide' | 'news' | 'leak' | 'thread' | null
  >(null);
  const [homeEditorItemId, setHomeEditorItemId] = useState('new');
  const canCreateGuide = canManageContent(user, 'guides', 'create');
  const canCreateNews = canManageContent(user, 'news', 'create');
  const canCreateLeak = canManageContent(user, 'leaks', 'create');
  const canCreateThread = Boolean(user);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(user && roleWeight[user.role] >= roleWeight.editor),
      }),
    );
  }

  function openHomeEditor(kind: 'guide' | 'news' | 'leak', itemId = 'new') {
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
          <p>
            Не вики обо всем, а рабочий центр меты: тир-листы, глубокие ротации,
            команды, ошибки новичков, новости, сливы с пометкой доверия и
            комьюнити-разборы.
          </p>
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
                src={resolveAssetUrl(character.imageUrl)}
                alt={character.name}
                width="280"
                height="360"
                loading={index === 0 ? 'eager' : 'lazy'}
              />
              <span>{character.name}</span>
            </a>
          ))}
        </div>
      </section>

      <MetricsStrip data={data} />

      {loading && latestGuides.length === 0 ? <SkeletonGrid /> : null}

      <section className="content-band">
        <SectionHeader
          eyebrow="Обновляется редакцией"
          title="Последние гайды"
          text="Карточки показывают персонажа, патч, автора и краткий практический вывод."
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
        <div className="guide-grid">
          {latestGuides.map((guide) => (
            <GuideCard key={guide.id} guide={guide} data={data} />
          ))}
        </div>
      </section>

      <section className="split-band">
        <div>
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
        <div>
          <SectionHeader
            eyebrow="Отдельно от фактов"
            title="Сливы / слухи"
            action={
              canCreateLeak ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => openHomeEditor('leak')}
                >
                  <Plus aria-hidden="true" /> Добавить слив
                </button>
              ) : null
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
          text="Preview base C0. Premium C6 находится на отдельной странице."
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
            <CharacterCard key={character.id} character={character} />
          ))}
        </div>
      </section>

      <section className="community-band">
        <div>
          <p className="eyebrow">Комьюнити</p>
          <h2>Треды и обсуждения игроков</h2>
          <p>
            Создавайте треды с вопросами по отрядам, ротациям, ресурсам и
            патчам. Комментарии под материалами остаются там же, где контекст.
          </p>
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
        </div>
        <div className="comment-preview">
          {data.threads.length ? (
            data.threads.slice(0, 3).map((thread) => (
              <article key={thread.id}>
                <strong>{thread.title}</strong>
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
        title={homeEditorItemId === 'new' ? 'Добавить гайд' : 'Редактировать гайд'}
        eyebrow="Inline CMS"
        description="Персонажный гайд создаётся прямо из главной и сразу попадёт в раздел гайдов после публикации."
        onClose={() => setHomeEditor(null)}
      >
        {user ? (
          <Suspense fallback={<SkeletonGrid label="Загрузка редактора гайда" />}>
            <AdminGuides
              data={data}
              setData={setData}
              user={user}
              initialGuideId={homeEditorItemId}
            />
          </Suspense>
        ) : null}
      </EditorShell>

      <EditorShell
        open={homeEditor === 'news'}
        title={homeEditorItemId === 'new' ? 'Добавить новость' : 'Редактировать новость'}
        eyebrow="Редакция"
        onClose={() => setHomeEditor(null)}
      >
        <Suspense fallback={<SkeletonGrid label="Загрузка редактора новости" />}>
          <AdminNewsManager
            items={data.news}
            initialSelectedId={homeEditorItemId}
            access={user ? contentAccess(user, 'news') : undefined}
            onRefresh={refreshContent}
          />
        </Suspense>
      </EditorShell>

      <EditorShell
        open={homeEditor === 'leak'}
        title={homeEditorItemId === 'new' ? 'Добавить слив' : 'Редактировать слив'}
        eyebrow="Слухи отдельно от фактов"
        onClose={() => setHomeEditor(null)}
      >
        <Suspense fallback={<SkeletonGrid label="Загрузка редактора слива" />}>
          <AdminLeaksManager
            items={data.leaks}
            initialSelectedId={homeEditorItemId}
            access={user ? contentAccess(user, 'leaks') : undefined}
            onRefresh={refreshContent}
          />
        </Suspense>
      </EditorShell>

      <EditorShell
        open={homeEditor === 'thread'}
        title="Создать тред"
        eyebrow="Комьюнити"
        onClose={() => setHomeEditor(null)}
      >
        {user ? (
          <ThreadEditor
            user={user}
            onSaved={async () => {
              await refreshContent();
              setHomeEditor(null);
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
}: {
  user: User;
  thread?: CommunityThread;
  onSaved: () => Promise<void> | void;
}) {
  const draftKey = `nte-thread-draft-${thread?.id || 'new'}`;
  const storedDraft = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(draftKey) || '{}') as Partial<CommunityThread>;
    } catch {
      return {};
    }
  }, [draftKey]);
  const [title, setTitle] = useState(storedDraft.title || thread?.title || '');
  const [slug, setSlug] = useState(storedDraft.slug || thread?.slug || '');
  const [summary, setSummary] = useState(storedDraft.summary || thread?.summary || '');
  const [body, setBody] = useState(storedDraft.body || thread?.body || '');
  const [tags, setTags] = useState((storedDraft.tags || thread?.tags || []).join(', '));
  const [status, setStatus] = useState<CommunityThread['status']>(thread?.status || 'open');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const draft = { title, slug, summary, body, tags: parseTags(tags), status };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [body, draftKey, slug, status, summary, tags, title]);

  function updateTitle(value: string) {
    setTitle(value);
    if (!thread && !slug.trim()) setSlug(makeSlug(value));
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
      slug: makeSlug(slug || title),
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
      await onSaved();
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <form className="editor-form thread-editor" onSubmit={saveThread}>
      <div className="editor-form__tabs" role="tablist" aria-label="Разделы редактора треда">
        <span className="active">Материал</span>
        <span>Предпросмотр</span>
      </div>
      <div className="editor-form__grid">
        <section className="admin-panel entity-form">
          <label htmlFor="thread-title">Заголовок</label>
          <input
            id="thread-title"
            value={title}
            minLength={4}
            maxLength={120}
            onChange={(event) => updateTitle(event.target.value)}
            required
          />
          <label htmlFor="thread-slug">Slug</label>
          <input
            id="thread-slug"
            value={slug}
            maxLength={140}
            onChange={(event) => setSlug(makeSlug(event.target.value))}
            required
          />
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
          <MarkdownToolbar
            textareaRef={textareaRef}
            value={body}
            onChange={setBody}
          />
          <textarea
            id="thread-body"
            ref={textareaRef}
            value={body}
            rows={14}
            maxLength={12000}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <label htmlFor="thread-tags">Теги</label>
          <input
            id="thread-tags"
            value={tags}
            placeholder="вопрос, ротация, патч"
            onChange={(event) => setTags(event.target.value)}
          />
          <label htmlFor="thread-status">Статус</label>
          <select
            id="thread-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as CommunityThread['status'])}
          >
            <option value="open">Открыт</option>
            <option value="closed">Закрыт</option>
            {roleWeight[user.role] >= roleWeight.moderator ? (
              <option value="hidden">Скрыт</option>
            ) : null}
          </select>
        </section>
        <section className="admin-panel preview-panel">
          <p className="eyebrow">Предпросмотр</p>
          <h2>{title || 'Новый тред'}</h2>
          <p>{summary || 'Краткое описание появится здесь.'}</p>
          <Tags tags={parseTags(tags)} />
          <MarkdownPreview value={body || '_Текст треда пока пуст._'} />
        </section>
      </div>
      <div className="editor-shell__footer">
        <button className="primary-button" type="submit" disabled={pending}>
          <CheckCircle2 aria-hidden="true" />
          {pending ? 'Сохраняем...' : thread ? 'Сохранить тред' : 'Опубликовать тред'}
        </button>
        <span className="form-message" aria-live="polite">
          {message || 'Черновик автоматически хранится в этом браузере.'}
        </span>
      </div>
    </form>
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
  const thread = data.threads.find((item) => item.slug === slug || item.id === slug);
  const [editorOpen, setEditorOpen] = useState(false);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(user && roleWeight[user.role] >= roleWeight.editor),
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
    Boolean(user && roleWeight[user.role] >= roleWeight.moderator);

  return (
    <div className="page-stack">
      <article className="editorial-article thread-article">
        <header className="editorial-copy-hero">
          <p className="eyebrow">
            Комьюнити · {thread.author} · {formatDate(thread.createdAt)}
          </p>
          <h1>{thread.title}</h1>
          <p>{thread.summary}</p>
          <Tags tags={thread.tags} />
          {canEditThread ? (
            <button className="ghost-button" type="button" onClick={() => setEditorOpen(true)}>
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
      <CommentsBlock targetType="thread" targetId={thread.id} data={data} user={user} />
      <EditorShell
        open={editorOpen}
        title="Редактировать тред"
        eyebrow="Комьюнити"
        onClose={() => setEditorOpen(false)}
      >
        {user ? (
          <ThreadEditor
            user={user}
            thread={thread}
            onSaved={async () => {
              await refreshContent();
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

function CharacterCard({ character }: { character: Character }) {
  return (
    <article className="character-card">
      <a
        href={`#/characters/${character.slug}`}
        aria-label={`Открыть страницу персонажа ${character.name}`}
      >
        <img
          src={resolveAssetUrl(character.imageUrl)}
          alt={character.name}
          width="360"
          height="460"
          loading="lazy"
        />
        <span className="tier-badge">{character.tier}</span>
        <div>
          <h3>{character.name}</h3>
          <p>
            {character.role} · {character.attribute} · {character.rarity}
          </p>
          <span>{character.shortDescription}</span>
          <Tags tags={character.tags} />
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
        src={resolveAssetUrl(character?.imageUrl || 'assets/logo.svg')}
        alt={character?.name || guide.title}
        width="460"
        height="280"
        loading="lazy"
      />
      <div>
        <p className="eyebrow">
          {character?.name || 'Гайд'} · патч {guide.patch}
        </p>
        <h3>{guide.title}</h3>
        <p>{guide.summary}</p>
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
        <a className="text-button" href={`#/guides/${guide.slug}`}>
          Читать гайд <ChevronRight aria-hidden="true" />
        </a>
        {onEdit ? (
          <button className="text-button" type="button" onClick={onEdit}>
            <Pencil aria-hidden="true" /> Редактировать
          </button>
        ) : null}
      </div>
    </article>
  );
}

function NewsCompactCard({ item, onEdit }: { item: NewsItem; onEdit?: () => void }) {
  return (
    <article className="compact-card">
      <img
        src={resolveAssetUrl(item.imageUrl)}
        alt=""
        width="96"
        height="96"
        loading="lazy"
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

function LeakCompactCard({ item, onEdit }: { item: LeakItem; onEdit?: () => void }) {
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
                key={character.id}
                href={`#/characters/${character.slug}`}
                title={character.name}
              >
                <img
                  src={resolveAssetUrl(character.imageUrl)}
                  alt={character.name}
                  width="58"
                  height="58"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="tag-row">
      {tags.slice(0, 4).map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}

function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}) {
  const actions = [
    ['bold', 'B'],
    ['italic', 'I'],
    ['h2', 'H2'],
    ['list', '•'],
    ['quote', 'Цитата'],
    ['link', 'Ссылка'],
    ['youtube', 'YouTube'],
  ];

  function apply(action: string) {
    const textarea = textareaRef.current;
    const next = applyMarkdownAction(
      value,
      textarea?.selectionStart || 0,
      textarea?.selectionEnd || 0,
      action,
    );
    onChange(next);
    window.requestAnimationFrame(() => textarea?.focus());
  }

  return (
    <div className="toolbar" aria-label="Markdown toolbar">
      {actions.map(([action, label]) => (
        <button key={action} type="button" onClick={() => apply(action)}>
          {label}
        </button>
      ))}
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
  const [role, setRole] = useState('Все роли');
  const [type, setType] = useState('Все типы');
  const [rarity, setRarity] = useState('Любая редкость');
  const [tier, setTier] = useState('Любой тир');
  const [attribute, setAttribute] = useState('Любой атрибут');
  const [editorOpen, setEditorOpen] = useState(false);
  const indexedCharacters = useMemo(
    () =>
      data.characters.map((character) => ({
        character,
        searchText: getCharacterSearchText(character),
      })),
    [data.characters],
  );

  const attributes = useMemo(
    () => [
      'Любой атрибут',
      ...Array.from(
        new Set(data.characters.map((character) => character.attribute)),
      ),
    ],
    [data.characters],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredQuery);

    return indexedCharacters
      .filter(({ character, searchText }) => {
        const queryMatch =
          !normalizedQuery || searchText.includes(normalizedQuery);
        return (
          queryMatch &&
          (role === 'Все роли' ||
            character.role === role ||
            character.profile?.roleTags.includes(role)) &&
          (type === 'Все типы' || character.type === type) &&
          (rarity === 'Любая редкость' || character.rarity === rarity) &&
          (tier === 'Любой тир' || character.tier === tier) &&
          (attribute === 'Любой атрибут' || character.attribute === attribute)
        );
      })
      .map(({ character }) => character);
  }, [attribute, deferredQuery, indexedCharacters, rarity, role, tier, type]);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(user && roleWeight[user.role] >= roleWeight.editor),
      }),
    );
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
          <button className="primary-button" type="button" onClick={() => setEditorOpen(true)}>
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
            placeholder="Имя, роль, тег..."
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
          label="Роль"
          value={role}
          setValue={setRole}
          options={roleOptions}
        />
        <SelectFilter
          label="Тип"
          value={type}
          setValue={setType}
          options={typeOptions}
        />
        <SelectFilter
          label="Атрибут"
          value={attribute}
          setValue={setAttribute}
          options={attributes}
        />
        <SelectFilter
          label="Редкость"
          value={rarity}
          setValue={setRarity}
          options={rarityOptions}
        />
      </section>
      <p
        id="character-results-count"
        className="filter-summary"
        aria-live="polite"
      >
        Найдено: {filtered.length} из {data.characters.length}
      </p>
      {filtered.length ? (
        <section className="character-grid">
          {filtered.map((character) => (
            <CharacterCard key={character.id} character={character} />
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
        onClose={() => setEditorOpen(false)}
      >
        {user ? (
          <Suspense fallback={<SkeletonGrid label="Загрузка редактора персонажа" />}>
            <AdminCharacterEditor
              items={data.characters}
              initialSelectedId="new"
              access={contentAccess(user, 'characters')}
              onRefresh={refreshContent}
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

  if (!character) {
    return (
      <EmptyState
        title="Персонаж не найден"
        text="Проверьте slug или создайте карточку в админке."
      />
    );
  }
  const profile = character.profile || {
    faction: '',
    birthday: '',
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
    consoles: [],
  };
  const guide = data.guides.find((item) => item.characterId === character.id);

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(user && roleWeight[user.role] >= roleWeight.editor),
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
        />
        <div>
          <p className="eyebrow">
            {character.originalName} · {profile.faction || 'Фракция уточняется'}
          </p>
          <h1>{character.name}</h1>
          <p>{profile.biographyShort || character.shortDescription}</p>
          <dl className="guide-facts">
            <div>
              <dt>День рождения</dt>
              <dd>{profile.birthday || 'Не указан'}</dd>
            </div>
            <div>
              <dt>Атрибут</dt>
              <dd>{character.attribute}</dd>
            </div>
            <div>
              <dt>Редкость</dt>
              <dd>{character.rarity}</dd>
            </div>
            <div>
              <dt>Фракция</dt>
              <dd>{profile.faction || 'Не указана'}</dd>
            </div>
          </dl>
          <Tags
            tags={profile.roleTags.length ? profile.roleTags : character.tags}
          />
          <div className="button-row">
            {guide ? (
              <a className="primary-button" href={`#/guides/${guide.slug}`}>
                <BookOpen aria-hidden="true" /> Гайд на персонажа
              </a>
            ) : canManageContent(user, 'guides', 'create') ? (
              <button className="primary-button" type="button" onClick={() => setGuideEditorOpen(true)}>
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
        <a href="#character-biography">Биография</a>
        <a href="#character-abilities">Способности</a>
        <a href="#character-awakenings">Пробуждения</a>
        <a href="#character-consoles">Консоль</a>
        <a href="#character-progression">Прокачка</a>
        <a href="#character-voice">Озвучка</a>
      </nav>

      <section className="character-detail-section" id="character-biography">
        <SectionHeader
          title="Биография"
          text="История персонажа без мета-билдов и боевых ротаций."
        />
        <MarkdownPreview value={profile.biography || character.summary} />
        {profile.voiceActors.length ? (
          <dl className="voice-actor-grid">
            {profile.voiceActors.map((actor) => (
              <div key={`${actor.language}-${actor.name}`}>
                <dt>{actor.language}</dt>
                <dd>{actor.name}</dd>
              </div>
            ))}
          </dl>
        ) : null}
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
          <div className="ability-list">
            {profile.abilities.map((ability) => (
              <article key={ability.id}>
                {ability.iconUrl ? (
                  <img
                    src={resolveAssetUrl(ability.iconUrl)}
                    alt=""
                    width="64"
                    height="64"
                    loading="lazy"
                  />
                ) : null}
                <div>
                  <p className="eyebrow">{ability.type}</p>
                  <h3>{ability.name}</h3>
                  <MarkdownPreview value={ability.description} />
                </div>
              </article>
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
          title="Пробуждения C0-C6"
          text="Каждый уровень показан отдельно, чтобы сравнение было прозрачным."
        />
        {profile.awakenings.length ? (
          <div className="awakening-grid">
            {[...profile.awakenings]
              .sort((a, b) => a.level - b.level)
              .map((awakening) => (
                <article key={`${awakening.level}-${awakening.name}`}>
                  {awakening.iconUrl ? (
                    <img
                      src={resolveAssetUrl(awakening.iconUrl)}
                      alt=""
                      width="58"
                      height="58"
                      loading="lazy"
                    />
                  ) : null}
                  <div>
                    <p className="eyebrow">C{awakening.level}</p>
                    <h3>
                      {awakening.name || `Пробуждение C${awakening.level}`}
                    </h3>
                    <MarkdownPreview value={awakening.description} />
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <EmptyState
            title="Пробуждения не добавлены"
            text="Для C0 персонаж используется без дополнительных пробуждений."
          />
        )}
      </section>

      <section className="character-detail-section" id="character-consoles">
        <SectionHeader
          title="Консоль и модули"
          text="Рекомендуемые консоли, их особенности и подходящие модули."
        />
        {profile.consoles.length ? (
          <div className="console-list">
            {profile.consoles.map((consoleItem) => (
              <article key={consoleItem.id}>
                <div className="console-gallery">
                  {consoleItem.imageUrls.map((imageUrl) => (
                    <img
                      key={imageUrl}
                      src={resolveAssetUrl(imageUrl)}
                      alt={consoleItem.name}
                      width="260"
                      height="180"
                      loading="lazy"
                    />
                  ))}
                </div>
                <h3>{consoleItem.name}</h3>
                <MarkdownPreview value={consoleItem.description} />
                <ul>
                  {consoleItem.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                {consoleItem.recommendedModules ? (
                  <>
                    <h4>Рекомендуемые модули</h4>
                    <MarkdownPreview value={consoleItem.recommendedModules} />
                  </>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Консоль пока не выбрана"
            text="Раздел появится после редакционной проверки модулей и эффектов."
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
                  />
                ) : null}
                <div>
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
              .map((level) => (
                <article key={level.level}>
                  <strong>{level.level}</strong>
                  {level.rewardIconUrl ? (
                    <img
                      src={resolveAssetUrl(level.rewardIconUrl)}
                      alt=""
                      width="48"
                      height="48"
                      loading="lazy"
                    />
                  ) : null}
                  <div>
                    <h3>
                      {level.rewardName || `Уровень симпатии ${level.level}`}
                    </h3>
                    <p>{level.description}</p>
                  </div>
                </article>
              ))}
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
                  />
                ) : null}
                <div>
                  <h3>{gift.name}</h3>
                  <p>{gift.effect}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {profile.skins.length ? (
        <section className="character-detail-section">
          <SectionHeader title="Гардероб" />
          <div className="skin-grid">
            {profile.skins.map((skin) => (
              <article key={skin.id}>
                {skin.imageUrl ? (
                  <img
                    src={resolveAssetUrl(skin.imageUrl)}
                    alt={skin.name}
                    width="320"
                    height="420"
                    loading="lazy"
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
          text="Реплики на английском, японском, корейском и китайском языках."
        />
        {profile.voiceLines.length ? (
          <div className="voice-line-list">
            {profile.voiceLines.map((line) => (
              <article key={line.id}>
                <div>
                  <strong>{line.title}</strong>
                  <span>{line.language}</span>
                </div>
                <audio controls preload="none" src={line.audioUrl}>
                  Ваш браузер не поддерживает аудио.
                </audio>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Аудио пока не загружено"
            text="Редакторы смогут добавить реплики для каждого языка отдельно."
          />
        )}
      </section>

      {profile.trivia ? (
        <section className="character-detail-section">
          <SectionHeader title="Пасхалки и интересные факты" />
          <MarkdownPreview value={profile.trivia} />
        </section>
      ) : null}
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
        onClose={() => setCharacterEditorOpen(false)}
      >
        {user ? (
          <Suspense fallback={<SkeletonGrid label="Загрузка редактора персонажа" />}>
            <AdminCharacterEditor
              items={data.characters}
              initialSelectedId={character.id}
              access={contentAccess(user, 'characters')}
              onRefresh={refreshContent}
            />
          </Suspense>
        ) : null}
      </EditorShell>
      <EditorShell
        open={guideEditorOpen}
        title={`Создать гайд: ${character.name}`}
        eyebrow="Гайд персонажа"
        description="Создайте персонажный meta-гайд. Отряды, ротации, видео и билды будут редактироваться внутри гайда."
        onClose={() => setGuideEditorOpen(false)}
      >
        {user ? (
          <Suspense fallback={<SkeletonGrid label="Загрузка редактора гайда" />}>
            <AdminGuides data={data} setData={setData} user={user} initialGuideId="new" />
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

function CharacterHero({ character }: { character: Character }) {
  return (
    <section className="guide-hero">
      <img
        src={resolveAssetUrl(character.splashUrl)}
        alt={character.name}
        width="520"
        height="620"
        loading="eager"
      />
      <div>
        <p className="eyebrow">
          {character.originalName} · {character.attribute}
        </p>
        <h1>{character.name}</h1>
        <p>{character.summary}</p>
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
            <dt>Тир</dt>
            <dd>{character.tier}</dd>
          </div>
        </dl>
        <Tags tags={character.tags} />
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
  const relatedTeams = data.teams.filter(
    (team) =>
      team.guideId === guide.id ||
      team.members.some((member) => member.characterId === character.id),
  );
  const orderedSections = [...guide.sections].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <div className="page-stack">
      <CharacterHero character={character} />
      <section className="guide-toolbar">
        <div>
          <p>Гайд · патч {guide.patch}</p>
          <strong>{guide.title}</strong>
        </div>
        <div className="guide-toolbar-actions">
          <a className="ghost-button" href={`#/characters/${character.slug}`}>
            <UserCircle aria-hidden="true" /> О персонаже
          </a>
          <RatingBar targetType="guide" targetId={guide.id} user={user} />
          {canManageContent(user, 'guides', 'edit') ? (
            <button className="ghost-button" type="button" onClick={() => setEditorOpen(true)}>
              <Pencil aria-hidden="true" /> Редактировать гайд
            </button>
          ) : null}
        </div>
      </section>
      <section className="guide-layout">
        <aside className="toc" aria-label="Навигация по гайду">
          <strong>Разделы</strong>
          {orderedSections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </aside>
        <div className="guide-section-list">
          {orderedSections.map((section) => (
            <article
              className="guide-section-card"
              id={section.id}
              key={section.id}
            >
              <p className="eyebrow">{section.type}</p>
              <h2>{section.title}</h2>
              <MarkdownPreview value={section.content} />
            </article>
          ))}
        </div>
      </section>
      <section className="content-band">
        <SectionHeader
          eyebrow="Внутри гайда"
          title={`Лучшие отряды и ротации для ${character.name}`}
          text="У каждого состава своя последовательность переключений персонажей и навыков."
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
        onClose={() => setEditorOpen(false)}
      >
        {user ? (
          <Suspense fallback={<SkeletonGrid label="Загрузка редактора гайда" />}>
            <AdminGuides
              data={data}
              setData={setData}
              user={user}
              initialGuideId={guide.id}
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
  const [score, setScore] = useState({ likes: 0, dislikes: 0, useful: 0 });
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
    const result = await sendReaction(targetType, targetId, reactionType);
    if (result.ok) {
      setScore(result.data);
      setMessage('Оценка сохранена.');
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <div>
      <div className="rating-bar" aria-label="Оценка гайда">
        <button
          type="button"
          disabled={pending}
          onClick={() => react('like')}
          aria-label={`Нравится: ${score.likes}`}
        >
          <ThumbsUp aria-hidden="true" /> {score.likes}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => react('dislike')}
          aria-label={`Не нравится: ${score.dislikes}`}
        >
          <ThumbsDown aria-hidden="true" /> {score.dislikes}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => react('useful')}
        >
          <CheckCircle2 aria-hidden="true" /> Полезно {score.useful}
        </button>
      </div>
      <p className="inline-status" aria-live="polite">
        {message}
      </p>
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
  return (
    <article className="team-card">
      <p className="eyebrow">
        {team.type} · {team.budget} · сила {team.power}
      </p>
      <h3>{team.title}</h3>
      <p>{team.synergy}</p>
      <div className="team-members">
        {team.members.map((member) => {
          const character = getCharacter(data, member.characterId);
          return character ? (
            <a
              key={`${team.id}-${member.characterId}`}
              href={`#/characters/${character.slug}`}
            >
              <img
                src={resolveAssetUrl(character.imageUrl)}
                alt={character.name}
                width="54"
                height="54"
                loading="lazy"
              />
              <span>{member.role}</span>
            </a>
          ) : null;
        })}
      </div>
      {team.rotationSteps?.length || team.rotation ? (
        <div className="team-rotation-sequence">
          <strong>Командная ротация</strong>
          <ol>
            {(team.rotationSteps?.length
              ? team.rotationSteps
              : team.rotation.split('\n').filter(Boolean)
            ).map((step, index) => (
              <li key={`${team.id}-step-${index}`}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <dl className="team-details">
        <div>
          <dt>Где хороша</dt>
          <dd>{team.goodAt}</dd>
        </div>
        <div>
          <dt>Где слаба</dt>
          <dd>{team.weakAt}</dd>
        </div>
      </dl>
      <span className="team-difficulty">Сложность: {team.difficulty}</span>
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
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
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

function CommentsBlock({
  targetType,
  targetId,
  data,
  user,
}: {
  targetType: Comment['targetType'];
  targetId: string;
  data: SiteData;
  user: User | null;
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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
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

    const result: Comment[] = [];
    const append = (comment: Comment) => {
      result.push(comment);
      (byParent.get(comment.id) || [])
        .sort(
          (left, right) =>
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime(),
        )
        .forEach(append);
    };
    roots.forEach(append);
    comments
      .filter(
        (comment) =>
          comment.parentId &&
          !comments.some((item) => item.id === comment.parentId),
      )
      .forEach((comment) => result.push(comment));
    return result;
  }, [comments]);

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
      setComments((current) =>
        current.filter(
          (item) => item.id !== comment.id && item.parentId !== comment.id,
        ),
      );
      setMessage('Комментарий удален.');
    } else {
      setMessage(result.error);
    }
    setActionId('');
    setDeleteTarget(null);
  }

  async function markUseful(comment: Comment) {
    if (!user) {
      setMessage('Войдите, чтобы оценивать комментарии.');
      return;
    }
    setActionId(comment.id);
    const result = await sendReaction('comment', comment.id, 'useful');
    if (result.ok) {
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? { ...item, score: result.data.useful }
            : item,
        ),
      );
    } else {
      setMessage(result.error);
    }
    setActionId('');
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
      <form className="comment-form" onSubmit={submitComment}>
        <label htmlFor="comment-body">Комментарий</label>
        {replyTo ? (
          <div className="reply-context">
            <span>Ответ для {replyTo.author}</span>
            <button
              className="text-button"
              type="button"
              onClick={() => setReplyTo(null)}
            >
              Отменить
            </button>
          </div>
        ) : null}
        <textarea
          id="comment-body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={
            user
              ? 'Поделитесь опытом, ротацией или уточнением...'
              : 'Войдите, чтобы оставить комментарий...'
          }
          rows={4}
          maxLength={4000}
          disabled={!user || pending}
          aria-describedby="comment-status"
        />
        <button
          className="primary-button"
          type="submit"
          disabled={!user || pending}
        >
          <MessageCircle aria-hidden="true" />
          {pending ? 'Отправляем...' : 'Отправить'}
        </button>
        <p id="comment-status" className="inline-status" aria-live="polite">
          {message}
        </p>
      </form>
      <div className="comment-list">
        {threadedComments.length ? (
          threadedComments.map((comment) => (
            <article
              className={`comment-card ${comment.parentId ? 'is-reply' : ''}`}
              key={comment.id}
            >
              <div className="comment-heading">
                <strong>{comment.author}</strong>
                <span>
                  {formatDate(comment.createdAt)}
                  {comment.updatedAt && comment.updatedAt !== comment.createdAt
                    ? ' · изменено'
                    : ''}
                </span>
              </div>
              {editingId === comment.id ? (
                <div className="comment-edit">
                  <label htmlFor={`edit-${comment.id}`}>
                    Изменить комментарий
                  </label>
                  <textarea
                    id={`edit-${comment.id}`}
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                    rows={3}
                    maxLength={4000}
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
                <p>{comment.body}</p>
              )}
              <div className="comment-actions">
                <button
                  className="text-button"
                  type="button"
                  disabled={actionId === comment.id}
                  onClick={() => markUseful(comment)}
                >
                  <ThumbsUp aria-hidden="true" />
                  Полезно {comment.score}
                </button>
                {user ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setReplyTo(comment);
                      setBody('');
                    }}
                  >
                    <Reply aria-hidden="true" />
                    Ответить
                  </button>
                ) : null}
                {user?.id === comment.userId ? (
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
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title="Комментариев пока нет"
            text="Будьте первым после подключения API и авторизации."
          />
        )}
      </div>
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
  const [role, setRole] = useState('Все роли');
  const [type, setType] = useState('Все типы');
  const [rarity, setRarity] = useState('Любая редкость');
  const [tier, setTier] = useState('Любой тир');
  const [attribute, setAttribute] = useState('Любой атрибут');
  const [editorGuideId, setEditorGuideId] = useState<string | null>(null);
  const attributes = useMemo(
    () => [
      'Любой атрибут',
      ...new Set(data.characters.map((character) => character.attribute)),
    ],
    [data.characters],
  );
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
        (role === 'Все роли' ||
          character.role === role ||
          character.profile?.roleTags.includes(role)) &&
        (type === 'Все типы' || character.type === type) &&
        (rarity === 'Любая редкость' || character.rarity === rarity) &&
        (tier === 'Любой тир' || character.tier === tier) &&
        (attribute === 'Любой атрибут' || character.attribute === attribute)
      );
    });
  }, [attribute, data, deferredQuery, rarity, role, tier, type]);

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
        <button className="primary-button" type="button" onClick={() => setEditorGuideId('new')}>
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
            placeholder="Имя, роль, тег..."
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
          label="Роль"
          value={role}
          setValue={setRole}
          options={roleOptions}
        />
        <SelectFilter
          label="Тип"
          value={type}
          setValue={setType}
          options={typeOptions}
        />
        <SelectFilter
          label="Атрибут"
          value={attribute}
          setValue={setAttribute}
          options={attributes}
        />
        <SelectFilter
          label="Редкость"
          value={rarity}
          setValue={setRarity}
          options={rarityOptions}
        />
      </search>
      <p id="guide-results-count" className="filter-summary" aria-live="polite">
        Найдено: {filtered.length} из {data.guides.length}
      </p>
      {filtered.length ? (
        <section className="guide-grid">
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
        onClose={() => setEditorGuideId(null)}
      >
        {user ? (
          <Suspense fallback={<SkeletonGrid label="Загрузка редактора гайда" />}>
            <AdminGuides
              data={data}
              setData={setData}
              user={user}
              initialGuideId={editorGuideId || undefined}
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
  const [kind, setKind] = useState<'base' | 'premium'>('base');
  const [editorOpen, setEditorOpen] = useState(false);
  const { tierlist, grouped } = groupTierItems(data, kind);

  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">S+ · S · A · B · C · D</p>
        <h1>Тир-листы</h1>
        <p>
          Отдельно для base C0 и premium C6, чтобы F2P-игроки не сравнивали себя
          с whale-условиями.
        </p>
        {canManageContent(user, 'tierlists', 'edit') ? (
          <button className="primary-button" type="button" onClick={() => setEditorOpen(true)}>
            <Pencil aria-hidden="true" /> Редактировать тир-листы
          </button>
        ) : null}
      </section>
      <section className="segmented-control" aria-label="Тип тир-листа">
        <button
          className={kind === 'base' ? 'active' : ''}
          type="button"
          onClick={() => setKind('base')}
        >
          Base C0
        </button>
        <button
          className={kind === 'premium' ? 'active' : ''}
          type="button"
          onClick={() => setKind('premium')}
        >
          Premium C6
        </button>
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
        eyebrow="Base C0 / Premium C6"
        description="Перемещайте персонажей между тирами, меняйте позицию и заметки без отдельной CMS-страницы."
        onClose={() => setEditorOpen(false)}
      >
        {user ? (
          <Suspense fallback={<SkeletonGrid label="Загрузка редактора тир-листа" />}>
            <AdminTierlists
              data={data}
              setData={setData}
              canPublish={canManageContent(user, 'tierlists', 'publish')}
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

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(user && roleWeight[user.role] >= roleWeight.editor),
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
              <button className="ghost-button" type="button" onClick={() => setEditorOpen(true)}>
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
        onClose={() => setEditorOpen(false)}
      >
        <Suspense fallback={<SkeletonGrid label="Загрузка редактора новости" />}>
          <AdminNewsManager
            items={data.news}
            initialSelectedId={item.id}
            access={user ? contentAccess(user, 'news') : undefined}
            onRefresh={refreshContent}
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

  async function refreshContent() {
    setData(
      await loadSiteData({
        includePrivate: Boolean(user && roleWeight[user.role] >= roleWeight.editor),
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
            <button className="ghost-button" type="button" onClick={() => setEditorOpen(true)}>
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
        onClose={() => setEditorOpen(false)}
      >
        <Suspense fallback={<SkeletonGrid label="Загрузка редактора слива" />}>
          <AdminLeaksManager
            items={data.leaks}
            initialSelectedId={item.id}
            access={user ? contentAccess(user, 'leaks') : undefined}
            onRefresh={refreshContent}
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
  dashboard: 'Dashboard',
  comments: 'Комментарии',
  warnings: 'Предупреждения',
  users: 'Пользователи',
  settings: 'Настройки',
  sources: 'Источники',
  system: 'Статус API/D1',
  audit: 'Audit log',
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
          <p>
            Системная админка доступна только moderator, admin и owner.
          </p>
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
      </form>
      {message ? <StatusBanner tone={messageTone} text={message} /> : null}
    </section>
  );
}

function AdminDashboard({ data }: { data: SiteData }) {
  return (
    <div className="admin-grid">
      <MetricsStrip data={data} />
      <div className="admin-panel">
        <h2>Быстрые переходы к контенту</h2>
        <div className="button-row">
          <a className="ghost-button" href="#/guides">
            <BookOpen aria-hidden="true" /> Гайды
          </a>
          <a className="ghost-button" href="#/characters">
            <Gamepad2 aria-hidden="true" /> Персонажи
          </a>
          <a className="ghost-button" href="#/tierlists">
            <Star aria-hidden="true" /> Тир-лист
          </a>
          <a className="ghost-button" href="#/">
            <Newspaper aria-hidden="true" /> Новости и сливы
          </a>
        </div>
        <p>
          Создание и редактирование контента теперь находится в самих публичных
          разделах. Эта панель оставлена для модерации, пользователей, источников
          и системных настроек.
        </p>
      </div>
      <div className="admin-panel">
        <h2>Что видят роли</h2>
        <ul>
          <li>user: профиль, комментарии, оценки.</li>
          <li>
            editor: inline-кнопки создания и редактирования разрешённого контента.
          </li>
          <li>
            moderator: скрытие комментариев, предупреждения, базовая модерация.
          </li>
          <li>
            admin: пользователи, роли, источники, настройки и системный статус.
          </li>
          <li>
            owner: полный доступ, роли admin/owner, настройки и удаление
            пользователей.
          </li>
        </ul>
      </div>
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

function GuideCreateFields({ characters }: { characters: Character[] }) {
  return (
    <>
      <label>
        Персонаж
        <select name="characterId" required>
          <option value="">Выберите персонажа</option>
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Заголовок
        <input name="title" required />
      </label>
      <label>
        Slug
        <input name="slug" required />
      </label>
      <label>
        Краткое описание
        <textarea name="summary" rows={4} required />
      </label>
      <label>
        Патч
        <input name="patch" defaultValue="1.0" required />
      </label>
    </>
  );
}

function AdminGuides({
  data,
  setData,
  user,
  initialGuideId,
}: {
  data: SiteData;
  setData: React.Dispatch<React.SetStateAction<SiteData>>;
  user: User;
  initialGuideId?: string;
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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [guideMeta, setGuideMeta] = useState({
    title: guide?.title || '',
    summary: guide?.summary || '',
    patch: guide?.patch || '1.0',
    videoUrl: guide?.videoUrl || '',
    status: guide?.status || 'draft',
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedSectionIdRef = useRef(selectedSectionId);
  const createGuideDialogRef = useRef<HTMLDialogElement>(null);
  const deleteGuideDialogRef = useRef<HTMLDialogElement>(null);
  const deleteSectionDialogRef = useRef<HTMLDialogElement>(null);
  const skipNextGuideDraftSaveRef = useRef(false);
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
    if (!guide) {
      return;
    }

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

  const activeGuide = guide;
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
      sections: [...activeGuide.sections].sort((a, b) => a.position - b.position),
    };
  }, [activeGuide]);
  const isGuideDirty = Boolean(
    baselineGuideState &&
      JSON.stringify({ guideMeta, sections }) !== JSON.stringify(baselineGuideState),
  );

  useEffect(() => {
    if (!activeGuide) return;
    if (skipNextGuideDraftSaveRef.current) {
      skipNextGuideDraftSaveRef.current = false;
      return;
    }
    if (isGuideDirty) {
      localStorage.setItem(
        guideDraftKey,
        JSON.stringify({ guideMeta, sections, selectedSectionId, markdown }),
      );
    } else {
      localStorage.removeItem(guideDraftKey);
    }
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

  function reorder(index: number) {
    if (dragIndex === null || dragIndex === index) {
      return;
    }
    const next = [...sections];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setSections(
      next.map((section, position) => ({ ...section, position: position + 1 })),
    );
    setDragIndex(null);
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

  function applyAction(action: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const next = applyMarkdownAction(
      markdown,
      textarea.selectionStart,
      textarea.selectionEnd,
      action,
    );
    updateSelectedMarkdown(next);
  }

  async function createGuide(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasApiBase()) {
      setMessage('Создание гайда требует подключенного Worker API.');
      createGuideDialogRef.current?.close();
      return;
    }
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await saveEntity<{ id: string }>(
      '/api/guides',
      {
        characterId: String(form.get('characterId') || ''),
        title: String(form.get('title') || ''),
        slug: String(form.get('slug') || ''),
        summary: String(form.get('summary') || ''),
        patchVersion: String(form.get('patch') || '1.0'),
        status: 'draft',
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
      setSelectedGuideId(result.data.id);
      setData(await loadSiteData({ includePrivate: true }));
      setMessage('Новый гайд создан как черновик.');
      event.currentTarget.reset();
      createGuideDialogRef.current?.close();
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
      setData(await loadSiteData({ includePrivate: true }));
      localStorage.removeItem(guideDraftKey);
      setMessage('Метаданные гайда сохранены.');
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
          видео и предпросмотр.
        </p>
        <GuideCreateFields characters={availableGuideCharacters} />
        <button
          className="primary-button"
          type="submit"
          disabled={
            pending || !canCreate || availableGuideCharacters.length === 0
          }
        >
          <Plus aria-hidden="true" /> Создать черновик
        </button>
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
            YouTube URL
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
          <label className="wide-field">
            Краткое описание
            <textarea
              rows={4}
              value={guideMeta.summary}
              onChange={(event) =>
                setGuideMeta((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
            />
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
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorder(index)}
                onClick={() => selectSection(section)}
                aria-pressed={section.id === selectedSectionId}
                className={section.id === selectedSectionId ? 'active' : ''}
              >
                <GripVertical aria-hidden="true" />
                <span>{section.title}</span>
                <small>{section.type}</small>
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
          <h2>Markdown editor</h2>
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
              Тип секции
              <input
                value={
                  sections.find((section) => section.id === selectedSectionId)
                    ?.type || ''
                }
                onChange={(event) =>
                  updateSelectedSection({ type: event.target.value })
                }
              />
            </label>
          </div>
          <div className="toolbar" aria-label="Markdown toolbar">
            {[
              ['h2', 'H2'],
              ['h3', 'H3'],
              ['bold', 'B'],
              ['italic', 'I'],
              ['list', 'List'],
              ['quote', 'Quote'],
              ['spoiler', 'Spoiler'],
              ['table', 'Table'],
              ['link', 'Link'],
              ['image', 'Image URL'],
              ['youtube', 'YouTube'],
            ].map(([action, label]) => (
              <button
                key={action}
                type="button"
                onClick={() => applyAction(action)}
              >
                {label}
              </button>
            ))}
          </div>
          <label htmlFor="markdown-editor">Текст раздела</label>
          <textarea
            id="markdown-editor"
            ref={textareaRef}
            value={markdown}
            onChange={(event) => updateSelectedMarkdown(event.target.value)}
            rows={12}
          />
          <h3>Live preview</h3>
          <MarkdownPreview value={markdown} />
        </div>
      </div>

      <dialog className="confirm-dialog" ref={createGuideDialogRef}>
        <form method="dialog" onSubmit={createGuide}>
          <h2>Создать гайд</h2>
          <GuideCreateFields characters={availableGuideCharacters} />
          <div className="button-row">
            <button className="ghost-button" value="cancel">
              Отменить
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={availableGuideCharacters.length === 0}
            >
              <Plus aria-hidden="true" /> Создать черновик
            </button>
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
    () => relatedTeams[0] || createGuideTeamDraft(guide),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const selected = relatedTeams.find((team) => team.id === selectedId);

  useEffect(() => {
    const next = relatedTeams.find((team) => team.id === selectedId);
    setDraft(next || createGuideTeamDraft(guide));
  }, [guide, relatedTeams, selectedId]);

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
                <small>
                  {team.budget} · {team.type}
                </small>
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
              Название отряда
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
              Тип
              <input
                required
                value={draft.type}
                placeholder="Burst, Bossing, AoE..."
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Бюджет
              <select
                value={draft.budget}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    budget: event.target.value as Team['budget'],
                  }))
                }
              >
                <option>F2P</option>
                <option>Mixed</option>
                <option>Premium</option>
              </select>
            </label>
            <label>
              Сложность
              <input
                required
                value={draft.difficulty}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    difficulty: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Сила, 0-100
              <input
                type="number"
                min="0"
                max="100"
                value={draft.power}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    power: Number(event.target.value),
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
              Почему состав работает
              <textarea
                rows={4}
                required
                value={draft.synergy}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    synergy: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Где хорош
              <input
                required
                value={draft.goodAt}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    goodAt: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Где слаб
              <input
                required
                value={draft.weakAt}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    weakAt: event.target.value,
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
              disabled={draft.members.length >= 8}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  members: [
                    ...current.members,
                    { characterId: '', role: 'Support' },
                  ],
                }))
              }
            >
              <Plus aria-hidden="true" /> Добавить персонажа
            </button>
          </fieldset>

          <fieldset className="rotation-step-editor">
            <legend>Пошаговая ротация всей команды</legend>
            <p>
              Одна строка — одно переключение персонажа или применение навыка.
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

function createGuideTeamDraft(guide: Guide): Team {
  return {
    id: 'new',
    slug: '',
    guideId: guide.id,
    title: '',
    type: 'Burst',
    budget: 'Mixed',
    difficulty: 'Средняя',
    power: 70,
    goodAt: '',
    weakAt: '',
    synergy: '',
    rotation: '',
    rotationSteps: [''],
    members: [{ characterId: guide.characterId, role: 'Main DPS' }],
    status: 'draft',
  };
}

function AdminTierlists({
  data,
  setData,
  canPublish,
}: {
  data: SiteData;
  setData: React.Dispatch<React.SetStateAction<SiteData>>;
  canPublish: boolean;
}) {
  const [kind, setKind] = useState<'base' | 'premium'>('base');
  const tierlist =
    data.tierlists.find((item) => item.kind === kind) || data.tierlists[0];
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
  const [characterToAdd, setCharacterToAdd] = useState('');

  useEffect(() => {
    setItems(tierlist?.items || []);
    setTitle(tierlist?.title || '');
    setPatch(tierlist?.patch || '1.0');
    setStatus(tierlist?.status || 'published');
    setChangelog((tierlist?.changelog || []).join('\n'));
    setMessage('');
  }, [tierlist]);

  const grouped = useMemo(() => {
    const result = Object.fromEntries(
      tierOrder.map((tier) => [tier, [] as Character[]]),
    ) as Record<Tier, Character[]>;
    items.forEach((item) => {
      const character = getCharacter(data, item.characterId);
      if (character) result[item.tier].push(character);
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

  function moveCharacter(characterId: string, nextTier: Tier) {
    setItems((current) => {
      const existing = current.find((item) => item.characterId === characterId);
      if (existing) {
        return current.map((item) =>
          item.characterId === characterId ? { ...item, tier: nextTier } : item,
        );
      }
      return [...current, { characterId, tier: nextTier, note: '' }];
    });
    setDraggedCharacterId('');
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
      tierlistType: kind,
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
    setPending(false);
  }

  if (!tierlist) {
    return (
      <EmptyState
        title="Тир-листов пока нет"
        text="Создайте base и premium записи через API, затем наполните их персонажами."
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="admin-panel tierlist-editor-header">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Base C0 и Premium C6</p>
            <h2>Редактор тир-листов</h2>
          </div>
          <div className="segmented-control" aria-label="Тип тир-листа">
            <button
              className={kind === 'base' ? 'active' : ''}
              type="button"
              onClick={() => setKind('base')}
            >
              Base C0
            </button>
            <button
              className={kind === 'premium' ? 'active' : ''}
              type="button"
              onClick={() => setKind('premium')}
            >
              Premium C6
            </button>
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
              className={`tier-drop-row tier-${tier.replace('+', 'plus')}`}
              key={tier}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedCharacterId) moveCharacter(draggedCharacterId, tier);
              }}
            >
              <strong>{tier}</strong>
              <div>
                {grouped[tier].map((character) => (
                  <button
                    type="button"
                    draggable
                    key={character.id}
                    title={`${character.name}: перетащить в другой тир`}
                    onDragStart={() => setDraggedCharacterId(character.id)}
                    onDragEnd={() => setDraggedCharacterId('')}
                  >
                    <img
                      src={resolveAssetUrl(character.imageUrl)}
                      alt=""
                      width="62"
                      height="62"
                      loading="lazy"
                    />
                    <span>{character.name}</span>
                  </button>
                ))}
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
                />
                <strong>{character.name}</strong>
                <label>
                  Тир
                  <select
                    value={item.tier}
                    onChange={(event) =>
                      updateItem(item.characterId, {
                        tier: event.target.value as Tier,
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

function AdminComments({ data, user }: { data: SiteData; user: User }) {
  const [comments, setComments] = useState<Comment[]>(
    data.comments.map((comment) => ({
      ...comment,
      status: comment.status || 'visible',
    })),
  );
  const [loading, setLoading] = useState(hasApiBase());
  const [message, setMessage] = useState('');
  const [actionId, setActionId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);
  const [warningTarget, setWarningTarget] = useState<Comment | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const warningDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!hasApiBase()) return;
    let mounted = true;
    loadModerationComments().then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setComments(result.data);
      } else {
        setMessage(result.error);
      }
      setLoading(false);
    });
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

  function requestDelete(comment: Comment) {
    setDeleteTarget(comment);
    deleteDialogRef.current?.showModal();
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
          <h2>Модерация комментариев</h2>
        </div>
        <span>{comments.length} записей</span>
      </div>
      <p className="form-message" aria-live="polite">
        {loading ? 'Загружаем очередь...' : message}
      </p>
      <div className="comment-list">
        {comments.map((comment) => (
          <article
            className={`comment-card status-${comment.status || 'visible'}`}
            key={comment.id}
          >
            <div className="comment-heading">
              <strong>{comment.author}</strong>
              <span>
                {comment.targetType} · {comment.status || 'visible'}
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
        onClose={() => setWarningTarget(null)}
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
            <button className="ghost-button" value="cancel" formMethod="dialog">
              Отменить
            </button>
            <button className="primary-button" type="submit">
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
  videos: 'Видео-гайды',
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

  async function updateStatus(warning: UserWarning, status: 'active' | 'resolved') {
    setActionId(warning.id);
    const result = await updateWarningStatus(warning.id, status);
    if (result.ok) {
      setWarnings((current) =>
        current.map((item) => (item.id === warning.id ? { ...item, status } : item)),
      );
      setMessage(status === 'resolved' ? 'Предупреждение закрыто.' : 'Предупреждение снова активно.');
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
            <article className={`comment-card status-${warning.status || 'active'}`} key={warning.id}>
              <div className="comment-heading">
                <strong>{warning.reason}</strong>
                <span>
                  {warning.userName || warning.userId || 'Пользователь'} · {formatDate(warning.createdAt)}
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
                      (warning.status || 'active') === 'active' ? 'resolved' : 'active',
                    )
                  }
                >
                  {(warning.status || 'active') === 'active' ? 'Закрыть' : 'Вернуть'}
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
          Русскоязычный meta-hub по Neverness to Everness. Новости и сливы
          разделены, гайды редактируются через D1 CMS.
        </p>
      </div>
      <div>
        <a href="#/characters">Персонажи</a>
        <a href="#/guides">Гайды</a>
        <a href="#/tierlists">Тир-листы</a>
        <a href="#/">Новости и сливы</a>
        <a href="#/">Комьюнити</a>
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
