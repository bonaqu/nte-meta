import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
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
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserCircle,
  Users,
  Video,
  X,
} from 'lucide-react';
import { seedData } from './data/seed';
import {
  changePassword,
  createComment,
  deleteComment,
  deleteUser,
  hasApiBase,
  loadComments,
  loadModerationComments,
  loadReactionSummary,
  loadSettings,
  loadSiteData,
  loadUsers,
  login,
  logout,
  me,
  register,
  saveEntity,
  sendReaction,
  updateComment,
  updateProfile,
  updateSettings,
  updateUserRole,
} from './lib/api';
import { applyMarkdownAction, MarkdownPreview } from './lib/markdown';
import { getYoutubeEmbedUrl } from './lib/youtube';
import type {
  AdminUser,
  AppSettings,
  Character,
  Comment,
  Guide,
  GuideSection,
  LeakItem,
  NewsItem,
  Role,
  SiteData,
  Tier,
  User,
} from './types';

const navItems = [
  { label: 'Главная', href: '#/', icon: Home },
  { label: 'Гайды', href: '#/guides', icon: BookOpen },
  { label: 'Персонажи', href: '#/characters', icon: Gamepad2 },
  { label: 'Тир-листы', href: '#/tierlists', icon: Star },
  { label: 'Новости', href: '#/news', icon: Newspaper },
  { label: 'Видео-гайды', href: '#/videos', icon: Video },
  { label: 'Комьюнити-хаб', href: '#/community', icon: MessageCircle },
  { label: 'Админка / Профиль', href: '#/admin', icon: ShieldCheck },
];

const tierOrder: Tier[] = ['S+', 'S', 'A', 'B', 'C'];
const roleWeight: Record<User['role'], number> = {
  user: 1,
  moderator: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};
const roleOptions = [
  'Все роли',
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

function useHashRoute() {
  const [route, setRoute] = useState(
    () => window.location.hash.replace(/^#\/?/, '') || '',
  );

  useEffect(() => {
    const onHashChange = () =>
      setRoute(window.location.hash.replace(/^#\/?/, '') || '');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function navigate(path: string) {
  window.location.hash = path === '/' ? '#/' : `#/${path.replace(/^\//, '')}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

function getCharacter(data: SiteData, id: string) {
  return data.characters.find(
    (character) => character.id === id || character.slug === id,
  );
}

function getGuideCharacter(data: SiteData, guide: Guide) {
  return getCharacter(data, guide.characterId);
}

function groupTierItems(data: SiteData, kind: 'base' | 'premium') {
  const tierlist =
    data.tierlists.find((item) => item.kind === kind) || data.tierlists[0];
  const grouped = Object.fromEntries(
    tierOrder.map((tier) => [tier, [] as Character[]]),
  ) as Record<Tier, Character[]>;

  tierlist?.items.forEach((item) => {
    const character = getCharacter(data, item.characterId);
    if (character) {
      grouped[item.tier].push(character);
    }
  });

  return { tierlist, grouped };
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
      const siteData = await loadSiteData();
      const currentUser = await me();

      if (!mounted) {
        return;
      }

      setData(siteData);
      if (currentUser.ok) {
        setUser(currentUser.data);
      }
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

  const [section, slug] = route.split('/');
  let page = <HomePage data={data} loading={loading} />;

  if (section === 'characters') {
    page = slug ? (
      <CharacterGuidePage data={data} slug={slug} user={user} />
    ) : (
      <CharactersPage data={data} />
    );
  } else if (section === 'guides') {
    page = slug ? (
      <GuidePage data={data} slug={slug} user={user} />
    ) : (
      <GuidesPage data={data} />
    );
  } else if (section === 'tierlists') {
    page = <TierListsPage data={data} />;
  } else if (section === 'news') {
    page = <NewsPage data={data} />;
  } else if (section === 'videos') {
    page = <VideosPage data={data} />;
  } else if (section === 'community') {
    page = <CommunityPage data={data} user={user} />;
  } else if (section === 'admin') {
    page = (
      <AdminPage data={data} user={user} setUser={setUser} setData={setData} />
    );
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <Header
        user={user}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main id="main-content" className="site-main">
        {error ? <StatusBanner tone="danger" text={error} /> : null}
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
  mobileOpen,
  setMobileOpen,
}: {
  user: User | null;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
}) {
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
          <img src="assets/logo.svg" alt="" width="40" height="40" />
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
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              className="nav-pill"
              href={item.href}
              onClick={() => setMobileOpen(false)}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <a className="profile-chip" href="#/admin">
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

function StatusBanner({
  tone,
  text,
}: {
  tone: 'info' | 'danger' | 'success';
  text: string;
}) {
  const Icon =
    tone === 'danger'
      ? CircleAlert
      : tone === 'success'
        ? CheckCircle2
        : Sparkles;
  return (
    <div
      className={`status-banner ${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {text ? <p>{text}</p> : null}
      </div>
      {action}
    </div>
  );
}

function HomePage({ data, loading }: { data: SiteData; loading: boolean }) {
  const latestGuides = data.guides.slice(0, 3);
  const latestNews = data.news.slice(0, 2);
  const latestLeaks = data.leaks.filter((leak) => leak.approved).slice(0, 2);
  const { grouped } = groupTierItems(data, 'base');
  const popularCharacters = data.characters.slice(0, 6);

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
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate('tierlists')}
            >
              <Star aria-hidden="true" />
              Смотреть тир-лист
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => navigate('characters')}
            >
              <Gamepad2 aria-hidden="true" />
              Персонажи
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => navigate('guides')}
            >
              <BookOpen aria-hidden="true" />
              Последние гайды
            </button>
          </div>
        </div>
        <div className="hero-media" aria-label="Избранные персонажи NTE Meta">
          {data.characters.slice(0, 3).map((character, index) => (
            <button
              className={`hero-character hero-character-${index + 1}`}
              key={character.id}
              type="button"
              onClick={() => navigate(`characters/${character.slug}`)}
            >
              <img
                src={character.imageUrl}
                alt={character.name}
                width="280"
                height="360"
                loading={index === 0 ? 'eager' : 'lazy'}
              />
              <span>{character.name}</span>
            </button>
          ))}
        </div>
      </section>

      <MetricsStrip data={data} />

      {loading ? <SkeletonGrid /> : null}

      <section className="content-band">
        <SectionHeader
          eyebrow="Обновляется редакцией"
          title="Последние гайды"
          text="Карточки показывают персонажа, патч, автора и краткий практический вывод."
          action={
            <button
              className="text-button"
              type="button"
              onClick={() => navigate('guides')}
            >
              Все гайды <ChevronRight aria-hidden="true" />
            </button>
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
          <SectionHeader eyebrow="Редакция" title="Свежие новости" />
          <div className="compact-list">
            {latestNews.map((item) => (
              <NewsCompactCard key={item.id} item={item} />
            ))}
          </div>
        </div>
        <div>
          <SectionHeader eyebrow="Отдельно от фактов" title="Сливы / слухи" />
          <div className="compact-list">
            {latestLeaks.map((item) => (
              <LeakCompactCard key={item.id} item={item} />
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
          <h2>Обсуждения скоро станут полноценным хабом</h2>
          <p>
            Фундамент комментариев, реакций и ролей уже заложен в D1/Worker.
            Пока база пустая, пользователь видит аккуратную заглушку и последние
            демо-обсуждения.
          </p>
        </div>
        <div className="comment-preview">
          {data.comments.slice(0, 2).map((comment) => (
            <article key={comment.id}>
              <strong>{comment.author}</strong>
              <p>{comment.body}</p>
              <span>{comment.score} полезно</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricsStrip({ data }: { data: SiteData }) {
  const metrics = [
    { label: 'Персонажей', value: data.characters.length, icon: Gamepad2 },
    { label: 'Гайдов', value: data.guides.length, icon: BookOpen },
    { label: 'Команд', value: data.teams.length, icon: Users },
    { label: 'Источников', value: data.sources.length, icon: ShieldCheck },
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

function SkeletonGrid() {
  return (
    <section className="content-band" aria-label="Загрузка данных">
      <div className="skeleton-row">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function CharacterCard({ character }: { character: Character }) {
  return (
    <article className="character-card">
      <button
        type="button"
        onClick={() => navigate(`characters/${character.slug}`)}
        aria-label={`Открыть гайд ${character.name}`}
      >
        <img
          src={character.imageUrl}
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
      </button>
    </article>
  );
}

function GuideCard({ guide, data }: { guide: Guide; data: SiteData }) {
  const character = getGuideCharacter(data, guide);

  return (
    <article className="guide-card">
      <img
        src={character?.imageUrl || 'assets/logo.svg'}
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
        <button
          className="text-button"
          type="button"
          onClick={() => navigate(`guides/${guide.slug}`)}
        >
          Читать гайд <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function NewsCompactCard({ item }: { item: NewsItem }) {
  return (
    <article className="compact-card">
      <img src={item.imageUrl} alt="" width="96" height="96" loading="lazy" />
      <div>
        <span>
          {item.category} · {formatDate(item.date)}
        </span>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
      </div>
    </article>
  );
}

function LeakCompactCard({ item }: { item: LeakItem }) {
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
              <button
                key={character.id}
                type="button"
                onClick={() => navigate(`characters/${character.slug}`)}
                title={character.name}
              >
                <img
                  src={character.imageUrl}
                  alt={character.name}
                  width="58"
                  height="58"
                  loading="lazy"
                />
              </button>
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

function CharactersPage({ data }: { data: SiteData }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('Все роли');
  const [type, setType] = useState('Все типы');
  const [rarity, setRarity] = useState('Любая редкость');
  const [tier, setTier] = useState('Любой тир');
  const [attribute, setAttribute] = useState('Любой атрибут');

  const attributes = useMemo(
    () => [
      'Любой атрибут',
      ...Array.from(
        new Set(data.characters.map((character) => character.attribute)),
      ),
    ],
    [data.characters],
  );

  const filtered = data.characters.filter((character) => {
    const queryMatch =
      !query ||
      `${character.name} ${character.originalName} ${character.role} ${character.attribute} ${character.tags.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase());
    return (
      queryMatch &&
      (role === 'Все роли' || character.role === role) &&
      (type === 'Все типы' || character.type === type) &&
      (rarity === 'Любая редкость' || character.rarity === rarity) &&
      (tier === 'Любой тир' || character.tier === tier) &&
      (attribute === 'Любой атрибут' || character.attribute === attribute)
    );
  });

  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">База персонажей</p>
        <h1>Персонажи Neverness to Everness</h1>
        <p>
          Поиск, роли, атрибуты, редкость, тип и текущая редакционная позиция в
          тир-листе.
        </p>
      </section>
      <section className="filter-panel" aria-label="Фильтры персонажей">
        <label>
          <span>Поиск</span>
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Имя, роль, тег..."
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
      {filtered.length ? (
        <section className="character-grid">
          {filtered.map((character) => (
            <CharacterCard key={character.id} character={character} />
          ))}
        </section>
      ) : (
        <EmptyState
          title="Персонажи не найдены"
          text="Сбросьте фильтры или добавьте нового персонажа через админку."
        />
      )}
    </div>
  );
}

function SelectFilter({
  label,
  value,
  setValue,
  options,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: string[];
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
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section className="empty-state">
      <Sparkles aria-hidden="true" />
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

function CharacterGuidePage({
  data,
  slug,
  user,
}: {
  data: SiteData;
  slug: string;
  user: User | null;
}) {
  const character = getCharacter(data, slug);
  const guide = data.guides.find((item) => item.characterId === character?.id);

  if (!character) {
    return (
      <EmptyState
        title="Персонаж не найден"
        text="Проверьте slug или создайте карточку в админке."
      />
    );
  }

  if (!guide) {
    return (
      <div className="page-stack">
        <CharacterHero character={character} />
        <EmptyState
          title="Гайд скоро"
          text="Карточка персонажа готова, а редакционный гайд можно создать в админке."
        />
      </div>
    );
  }

  return (
    <GuideDetail data={data} guide={guide} character={character} user={user} />
  );
}

function GuidePage({
  data,
  slug,
  user,
}: {
  data: SiteData;
  slug: string;
  user: User | null;
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
    <GuideDetail data={data} guide={guide} character={character} user={user} />
  );
}

function CharacterHero({ character }: { character: Character }) {
  return (
    <section className="guide-hero">
      <img
        src={character.splashUrl}
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
}: {
  data: SiteData;
  guide: Guide;
  character: Character;
  user: User | null;
}) {
  const relatedTeams = data.teams.filter((team) =>
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
        <RatingBar targetType="guide" targetId={guide.id} user={user} />
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
        <SectionHeader eyebrow="Ротации" title="Отдельная сущность ротаций" />
        <div className="rotation-grid">
          {guide.rotations.length ? (
            guide.rotations.map((rotation) => (
              <article className="rotation-card" key={rotation.id}>
                <p className="eyebrow">{rotation.type}</p>
                <h3>{rotation.title}</h3>
                <p>{rotation.purpose}</p>
                <ol>
                  {rotation.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <strong>{rotation.logic}</strong>
              </article>
            ))
          ) : (
            <EmptyState
              title="Ротации не добавлены"
              text="Редактор может создать простую, advanced или boss-ротацию в админке."
            />
          )}
        </div>
      </section>
      <section className="content-band">
        <SectionHeader
          eyebrow="Команды"
          title={`Команды для ${character.name}`}
        />
        <div className="team-grid">
          {relatedTeams.map((team) => (
            <TeamCard key={team.id} team={team} data={data} />
          ))}
        </div>
      </section>
      {guide.videoUrl ? (
        <VideoEmbed url={guide.videoUrl} title={guide.title} />
      ) : null}
      <CommentsBlock
        targetType="guide"
        targetId={guide.id}
        data={data}
        user={user}
      />
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
            <button
              key={`${team.id}-${member.characterId}`}
              type="button"
              onClick={() => navigate(`characters/${character.slug}`)}
            >
              <img
                src={character.imageUrl}
                alt={character.name}
                width="54"
                height="54"
                loading="lazy"
              />
              <span>{member.role}</span>
            </button>
          ) : null;
        })}
      </div>
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
    </article>
  );
}

function VideoEmbed({ url, title }: { url: string; title: string }) {
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

function GuidesPage({ data }: { data: SiteData }) {
  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">Практические материалы</p>
        <h1>Гайды NTE Meta</h1>
        <p>
          Глубина вместо количества: ротации, билды, команды, ошибки и скрытые
          механики.
        </p>
      </section>
      <section className="guide-grid">
        {data.guides.map((guide) => (
          <GuideCard key={guide.id} guide={guide} data={data} />
        ))}
      </section>
    </div>
  );
}

function TierListsPage({ data }: { data: SiteData }) {
  const [kind, setKind] = useState<'base' | 'premium'>('base');
  const { tierlist, grouped } = groupTierItems(data, kind);

  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">S+ · S · A · B · C</p>
        <h1>Тир-листы</h1>
        <p>
          Отдельно для base C0 и premium C6, чтобы F2P-игроки не сравнивали себя
          с whale-условиями.
        </p>
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
    </div>
  );
}

function NewsPage({ data }: { data: SiteData }) {
  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">Новости отдельно, слухи отдельно</p>
        <h1>Новости и сливы</h1>
        <p>
          Официальные материалы не смешиваются со сливами. У каждого слуха есть
          статус, источник и уровень доверия.
        </p>
      </section>
      <section className="split-band">
        <div>
          <SectionHeader title="Новости" />
          <div className="news-grid">
            {data.news.map((item) => (
              <article className="news-card" key={item.id}>
                <img
                  src={item.imageUrl}
                  alt=""
                  width="460"
                  height="260"
                  loading="lazy"
                />
                <div>
                  <p className="eyebrow">
                    {item.category} · {formatDate(item.date)}
                  </p>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <Tags tags={item.tags} />
                </div>
              </article>
            ))}
          </div>
        </div>
        <div>
          <SectionHeader
            title="Сливы из источников"
            text="Автоимпорт подготовлен архитектурно, публикация только после одобрения."
          />
          <div className="compact-list">
            {data.leaks.map((item) => (
              <LeakCompactCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function VideosPage({ data }: { data: SiteData }) {
  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">YouTube + текст</p>
        <h1>Видео-гайды</h1>
        <p>
          Каждый ролик можно связать с персонажами, командами и текстовой
          расшифровкой.
        </p>
      </section>
      <section className="video-grid">
        {data.videos.map((video) => {
          const embedUrl = getYoutubeEmbedUrl(video.youtubeUrl);
          return (
            <article className="video-card" key={video.id}>
              {embedUrl ? (
                <iframe
                  className="video-frame"
                  src={embedUrl}
                  title={video.title}
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : null}
              <div>
                <p className="eyebrow">{formatDate(video.publishedAt)}</p>
                <h3>{video.title}</h3>
                <p>{video.description}</p>
                <div className="timestamp-list">
                  {video.timestamps.map((time) => (
                    <span key={time.time}>
                      {time.time} · {time.label}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function CommunityPage({ data, user }: { data: SiteData; user: User | null }) {
  return (
    <div className="page-stack">
      <section className="page-hero compact">
        <p className="eyebrow">Комментарии, реакции, роли</p>
        <h1>Комьюнити-хаб</h1>
        <p>
          Фундамент уже готов: регистрация, роли, комментарии, лайки/дизлайки и
          модерация на backend.
        </p>
      </section>
      <section className="split-band">
        <div className="content-band flat">
          <h2>
            {user
              ? `Профиль: ${user.displayName}`
              : 'Что видно без авторизации'}
          </h2>
          <p>
            Гости читают гайды, новости, тир-листы и сливы. Комментирование,
            оценки и профиль требуют регистрации.
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => navigate('admin')}
          >
            <LockKeyhole aria-hidden="true" />
            Войти или зарегистрироваться
          </button>
        </div>
        <div className="content-band flat">
          <h2>Последние обсуждения</h2>
          <div className="comment-list">
            {data.comments.map((comment) => (
              <article className="comment-card" key={comment.id}>
                <strong>{comment.author}</strong>
                <p>{comment.body}</p>
                <span>{comment.score} полезно</span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const adminTabs = [
  'profile',
  'dashboard',
  'characters',
  'guides',
  'tierlists',
  'news',
  'leaks',
  'comments',
  'users',
  'settings',
  'sources',
] as const;

const adminLabels: Record<(typeof adminTabs)[number], string> = {
  profile: 'Профиль',
  dashboard: 'Dashboard',
  characters: 'Персонажи',
  guides: 'Гайды',
  tierlists: 'Тир-листы',
  news: 'Новости',
  leaks: 'Сливы',
  comments: 'Комментарии',
  users: 'Пользователи',
  settings: 'Настройки',
  sources: 'Источники',
};

const adminTabRole: Record<(typeof adminTabs)[number], User['role']> = {
  profile: 'user',
  dashboard: 'moderator',
  characters: 'editor',
  guides: 'editor',
  tierlists: 'editor',
  news: 'admin',
  leaks: 'admin',
  comments: 'moderator',
  users: 'admin',
  settings: 'admin',
  sources: 'admin',
};

function AdminPage({
  data,
  user,
  setUser,
  setData,
}: {
  data: SiteData;
  user: User | null;
  setUser: (user: User | null) => void;
  setData: React.Dispatch<React.SetStateAction<SiteData>>;
}) {
  const [tab, setTab] = useState<(typeof adminTabs)[number]>('profile');
  const visibleTabs = useMemo(
    () =>
      user
        ? adminTabs.filter(
            (item) => roleWeight[user.role] >= roleWeight[adminTabRole[item]],
          )
        : [],
    [user],
  );

  useEffect(() => {
    if (user && !visibleTabs.includes(tab)) {
      setTab('profile');
    }
  }, [tab, user, visibleTabs]);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Разделы админки">
        <strong>NTE Meta CMS</strong>
        {visibleTabs.map((item) => (
          <button
            key={item}
            className={tab === item ? 'active' : ''}
            type="button"
            onClick={() => setTab(item)}
          >
            <PanelLeft aria-hidden="true" />
            {adminLabels[item]}
          </button>
        ))}
      </aside>
      <section className="admin-content">
        {!user ? (
          <AuthPanel setUser={setUser} />
        ) : (
          <>
            <div className="admin-topline">
              <div>
                <p className="eyebrow">Роль: {user.role}</p>
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
            {tab === 'profile' ? (
              <ProfilePanel user={user} setUser={setUser} />
            ) : null}
            {tab === 'dashboard' ? <AdminDashboard data={data} /> : null}
            {tab === 'characters' ? <AdminCharacters data={data} /> : null}
            {tab === 'guides' ? (
              <AdminGuides data={data} setData={setData} />
            ) : null}
            {tab === 'tierlists' ? <AdminTierlists data={data} /> : null}
            {tab === 'news' ? <AdminNews data={data} /> : null}
            {tab === 'leaks' ? <AdminLeaks data={data} /> : null}
            {tab === 'comments' ? (
              <AdminComments data={data} user={user} />
            ) : null}
            {tab === 'users' ? <AdminUsers actor={user} /> : null}
            {tab === 'settings' ? <AdminSettings /> : null}
            {tab === 'sources' ? <AdminSources data={data} /> : null}
          </>
        )}
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
          minLength={8}
          maxLength={128}
          required
        />
        <label htmlFor="next-confirm">Повторите новый пароль</label>
        <input
          id="next-confirm"
          name="nextConfirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
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
    </div>
  );
}

function AuthPanel({ setUser }: { setUser: (user: User | null) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

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
      setMessage(
        mode === 'login'
          ? 'Вы вошли.'
          : 'Аккаунт создан. Первый пользователь станет owner.',
      );
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <section className="auth-panel">
      <div>
        <p className="eyebrow">Авторизация</p>
        <h1>{mode === 'login' ? 'Вход в админку' : 'Регистрация'}</h1>
        <p>
          Первый зарегистрированный пользователь в D1 автоматически получает
          роль owner. Пароли хешируются на Worker, права проверяются на backend.
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
          minLength={8}
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
              minLength={8}
            />
            <label htmlFor="auth-bootstrap">
              Код первого owner <span>(если настроен)</span>
            </label>
            <input
              id="auth-bootstrap"
              name="bootstrapToken"
              type="password"
              autoComplete="off"
              aria-describedby="bootstrap-help"
            />
            <small id="bootstrap-help">
              Нужен только при создании самого первого owner-аккаунта.
            </small>
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
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Нужна регистрация' : 'Уже есть аккаунт'}
        </button>
      </form>
      {message ? (
        <StatusBanner
          tone={
            message.includes('ошиб') || message.includes('API')
              ? 'info'
              : 'success'
          }
          text={message}
        />
      ) : null}
    </section>
  );
}

function AdminDashboard({ data }: { data: SiteData }) {
  return (
    <div className="admin-grid">
      <MetricsStrip data={data} />
      <div className="admin-panel">
        <h2>Что видят роли</h2>
        <ul>
          <li>user: профиль, комментарии, оценки.</li>
          <li>
            editor: создание и редактирование гайдов, черновиков и секций.
          </li>
          <li>
            moderator: скрытие комментариев, предупреждения, базовая модерация.
          </li>
          <li>
            admin: контент, новости, сливы, пользователи editor/moderator.
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

function AdminCharacters({ data }: { data: SiteData }) {
  return (
    <div className="admin-grid">
      <div className="admin-panel">
        <div className="panel-title-row">
          <h2>Персонажи</h2>
          <button className="primary-button" type="button">
            <Plus aria-hidden="true" />
            Создать
          </button>
        </div>
        <div className="admin-table">
          {data.characters.slice(0, 10).map((character) => (
            <div key={character.id}>
              <img
                src={character.imageUrl}
                alt=""
                width="44"
                height="44"
                loading="lazy"
              />
              <span>{character.name}</span>
              <span>{character.role}</span>
              <span>{character.tier}</span>
              <button className="text-button" type="button">
                Редактировать
              </button>
            </div>
          ))}
        </div>
      </div>
      <EntityForm
        endpoint="/api/characters"
        title="Быстрое создание персонажа"
        fields={['name', 'slug', 'role', 'attribute', 'rarity']}
      />
    </div>
  );
}

function AdminGuides({
  data,
  setData,
}: {
  data: SiteData;
  setData: React.Dispatch<React.SetStateAction<SiteData>>;
}) {
  const guide = data.guides[0];
  const [sections, setSections] = useState<GuideSection[]>(() =>
    [...guide.sections].sort((a, b) => a.position - b.position),
  );
  const [markdown, setMarkdown] = useState(sections[0]?.content || '');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    setMarkdown(next);
  }

  async function saveSections() {
    const updatedGuide = { ...guide, sections };
    setData((current) => ({
      ...current,
      guides: current.guides.map((item) =>
        item.id === guide.id ? updatedGuide : item,
      ),
    }));
    await saveEntity(
      `/api/guides/${guide.id}/sections/reorder`,
      { sectionIds: sections.map((section) => section.id) },
      'PATCH',
    );
  }

  return (
    <div className="admin-grid two-columns">
      <div className="admin-panel">
        <div className="panel-title-row">
          <h2>Секции гайда</h2>
          <button className="primary-button" type="button" onClick={addSection}>
            <Plus aria-hidden="true" />
            Добавить раздел
          </button>
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
              onClick={() => setMarkdown(section.content)}
            >
              <GripVertical aria-hidden="true" />
              <span>{section.title}</span>
              <small>{section.type}</small>
            </button>
          ))}
        </div>
        <button className="primary-button" type="button" onClick={saveSections}>
          <CheckCircle2 aria-hidden="true" />
          Сохранить порядок
        </button>
      </div>
      <div className="admin-panel editor-panel">
        <h2>Markdown editor</h2>
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
          onChange={(event) => setMarkdown(event.target.value)}
          rows={12}
        />
        <h3>Live preview</h3>
        <MarkdownPreview value={markdown} />
      </div>
    </div>
  );
}

function AdminTierlists({ data }: { data: SiteData }) {
  return (
    <div className="admin-panel">
      <h2>Редактор тир-листов</h2>
      <p>
        Base и premium хранятся отдельно. Персонажей можно переносить между S+,
        S, A, B, C после подключения drag/drop API.
      </p>
      <TierPreview grouped={groupTierItems(data, 'base').grouped} />
    </div>
  );
}

function AdminNews({ data }: { data: SiteData }) {
  return (
    <div className="admin-grid">
      <EntityForm
        endpoint="/api/news"
        title="Создать новость"
        fields={['title', 'slug', 'category', 'summary', 'sourceUrl']}
      />
      <div className="admin-panel">
        <h2>Новости</h2>
        {data.news.map((item) => (
          <NewsCompactCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function AdminLeaks({ data }: { data: SiteData }) {
  return (
    <div className="admin-grid">
      <EntityForm
        endpoint="/api/leaks"
        title="Подготовить слив к публикации"
        fields={['title', 'slug', 'status', 'trustLevel', 'sourceUrl']}
      />
      <div className="admin-panel">
        <h2>Очередь одобрения</h2>
        <p>
          Автоимпорт из Telegram/сайтов запланирован: запись попадает сюда и не
          публикуется без решения редактора.
        </p>
        {data.leaks.map((item) => (
          <LeakCompactCard key={item.id} item={item} />
        ))}
      </div>
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
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

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
    </div>
  );
}

const userRoles: Role[] = ['user', 'moderator', 'editor', 'admin', 'owner'];

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
          user.id === target.id ? { ...user, role } : user,
        ),
      );
      setMessage(`Роль ${target.displayName} изменена на ${role}.`);
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
            {actor.role === 'owner' && target.id !== actor.id ? (
              <button
                className="ghost-button danger"
                type="button"
                disabled={target.status !== 'active' || actionId === target.id}
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

function AdminSources({ data }: { data: SiteData }) {
  return (
    <div className="admin-grid">
      <EntityForm
        endpoint="/api/sources"
        title="Добавить источник"
        fields={['sourceName', 'sourceType', 'sourceUrl', 'trustLevel']}
      />
      <div className="admin-panel">
        <h2>Источники новостей и сливов</h2>
        {data.sources.map((source) => (
          <article className="source-card" key={source.id}>
            <strong>{source.sourceName}</strong>
            <span>
              {source.sourceType} · доверие: {source.trustLevel}
            </span>
            <p>{source.sourceUrl}</p>
            <small>
              {source.autoImportEnabled
                ? 'Автоимпорт включен'
                : 'Автоимпорт выключен'}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
}

function EntityForm({
  title,
  fields,
  endpoint,
  method = 'POST',
}: {
  title: string;
  fields: string[];
  endpoint: string;
  method?: 'POST' | 'PATCH';
}) {
  const [message, setMessage] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));

    if (!hasApiBase()) {
      setMessage(
        'Демо-режим: форма готова, сохранение включится после подключения Worker API.',
      );
      return;
    }

    const result = await saveEntity(endpoint, payload, method);
    setMessage(result.ok ? 'Сохранено.' : result.error);
  }

  return (
    <form className="entity-form admin-panel" onSubmit={onSubmit}>
      <h2>{title}</h2>
      {fields.map((field) => (
        <React.Fragment key={field}>
          <label htmlFor={`field-${field}`}>{field}</label>
          <input id={`field-${field}`} name={field} />
        </React.Fragment>
      ))}
      <label htmlFor={`${title}-body`}>Полный текст / markdown</label>
      <textarea id={`${title}-body`} name="body" rows={5} />
      <div className="button-row">
        <button className="ghost-button" type="button">
          Сохранить черновик
        </button>
        <button className="primary-button" type="submit">
          Опубликовать
        </button>
        <button className="ghost-button" type="button">
          Предпросмотр
        </button>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
    </form>
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
        <a href="#/tierlists">Тир-листы</a>
        <a href="#/admin">Админка</a>
      </div>
    </footer>
  );
}

export default App;
