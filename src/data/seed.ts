import type {
  Character,
  Guide,
  LeakItem,
  NewsItem,
  SiteData,
  Source,
  Team,
  TierList,
  VideoGuide,
} from '../types';

const characterBase: Character[] = [
  {
    id: 'hotori',
    slug: 'hotori',
    name: 'Хотори',
    originalName: 'Hotori',
    rarity: 'S',
    role: 'Burst DPS',
    type: 'DPS',
    attribute: 'Хаос',
    tier: 'S+',
    premiumTier: 'S+',
    imageUrl: 'assets/characters/Hotori.webp',
    splashUrl: 'assets/characters/Hotori.webp',
    shortDescription: 'Взрывной керри для быстрого окна урона и босс-файтов.',
    summary:
      'Хотори играет вокруг заранее подготовленного окна урона: сначала команда собирает баффы и контроль, затем она быстро прожимает ключевую цепочку навыков.',
    tags: ['meta', 'burst', 'bossing', 'сложная ротация'],
    updatedAt: '2026-06-02',
  },
  {
    id: 'lacrimosa',
    slug: 'lacrimosa',
    name: 'Лакримоза',
    originalName: 'Lacrimosa',
    rarity: 'S',
    role: 'Debuffer',
    type: 'Debuffer',
    attribute: 'Лакшана',
    tier: 'S',
    premiumTier: 'S+',
    imageUrl: 'assets/characters/Lacrimosa.webp',
    splashUrl: 'assets/characters/Lacrimosa.webp',
    shortDescription:
      'Ослабляет цель, раскрывает команды с высоким burst-потолком.',
    summary:
      'Лакримоза ценна не личным уроном, а тем, насколько ровно она открывает окно для основного DPS и снижает цену ошибки в ротации.',
    tags: ['debuff', 'premium', 'bossing'],
    updatedAt: '2026-06-02',
  },
  {
    id: 'baicang',
    slug: 'baicang',
    name: 'Байканг',
    originalName: 'Baicang',
    rarity: 'S',
    role: 'Support',
    type: 'Buffer',
    attribute: 'Космос',
    tier: 'S',
    premiumTier: 'S',
    imageUrl: 'assets/characters/Baicang.webp',
    splashUrl: 'assets/characters/Baicang.webp',
    shortDescription:
      'Универсальный саппорт для стабильных команд и комфортного старта.',
    summary:
      'Байканг хорошо закрывает слоты баффера и страховки, поэтому подходит как для F2P-пачек, так и для премиум-команд.',
    tags: ['support', 'f2p-friendly', 'универсальный'],
    updatedAt: '2026-06-01',
  },
  {
    id: 'fadia',
    slug: 'fadia',
    name: 'Фадия',
    originalName: 'Fadia',
    rarity: 'S',
    role: 'Control',
    type: 'Control',
    attribute: 'Психика',
    tier: 'S',
    premiumTier: 'S',
    imageUrl: 'assets/characters/Fadia.webp',
    splashUrl: 'assets/characters/Fadia.webp',
    shortDescription:
      'Контроль темпа боя, прерывания и безопасные окна для команды.',
    summary:
      'Фадия усиливает команды, которым важно удерживать врагов внутри зоны урона и не терять позиционное преимущество.',
    tags: ['control', 'utility', 'aoe'],
    updatedAt: '2026-06-01',
  },
  {
    id: 'sakiri',
    slug: 'sakiri',
    name: 'Сакири',
    originalName: 'Sakiri',
    rarity: 'S',
    role: 'Sustain DPS',
    type: 'DPS',
    attribute: 'Анима',
    tier: 'S',
    premiumTier: 'S+',
    imageUrl: 'assets/characters/Sakiri.webp',
    splashUrl: 'assets/characters/Sakiri.webp',
    shortDescription:
      'Стабильный DPS, который меньше зависит от идеального бурст-окна.',
    summary:
      'Сакири прощает часть ошибок в таймингах и поэтому хороша в длинных боях, где важна не только пиковая цифра, но и uptime.',
    tags: ['sustain', 'endgame', 'beginner-safe'],
    updatedAt: '2026-06-01',
  },
  {
    id: 'nanally',
    slug: 'nanally',
    name: 'Наналли',
    originalName: 'Nanally',
    rarity: 'S',
    role: 'Healer',
    type: 'Healer',
    attribute: 'Чары',
    tier: 'A',
    premiumTier: 'S',
    imageUrl: 'assets/characters/Nanally.webp',
    splashUrl: 'assets/characters/Nanally.webp',
    shortDescription:
      'Комфортный хилер для прогресса, ошибок новичков и долгих активностей.',
    summary:
      'Наналли снижает требования к исполнению и помогает пройти контент, где команда пока не закрывает бой чистым уроном.',
    tags: ['healer', 'comfort', 'start'],
    updatedAt: '2026-05-31',
  },
  {
    id: 'daffodill',
    slug: 'daffodill',
    name: 'Даффодил',
    originalName: 'Daffodill',
    rarity: 'S',
    role: 'AoE DPS',
    type: 'DPS',
    attribute: 'Чары',
    tier: 'A',
    premiumTier: 'S',
    imageUrl: 'assets/characters/Daffodill.webp',
    splashUrl: 'assets/characters/Daffodill.webp',
    shortDescription:
      'Сильна на волнах врагов и фарме, требовательна к позиционированию.',
    summary:
      'Даффодил раскрывается, когда враги собраны в зоне навыков, а саппорты помогают не терять темп между волнами.',
    tags: ['aoe', 'farm', 'positioning'],
    updatedAt: '2026-05-31',
  },
  {
    id: 'hathor',
    slug: 'hathor',
    name: 'Хатор',
    originalName: 'Hathor',
    rarity: 'S',
    role: 'Tank',
    type: 'Tank',
    attribute: 'Космос',
    tier: 'A',
    premiumTier: 'A',
    imageUrl: 'assets/characters/Hathor.png',
    splashUrl: 'assets/characters/Hathor.png',
    shortDescription:
      'Защита, перехват давления и комфорт для неопытной команды.',
    summary:
      'Хатор полезна, когда команда часто теряет здоровье и нуждается в более спокойном темпе боя.',
    tags: ['tank', 'survival', 'beginner'],
    updatedAt: '2026-05-30',
  },
  {
    id: 'jiuyuan',
    slug: 'jiuyuan',
    name: 'Цзююань',
    originalName: 'Jiuyuan',
    rarity: 'S',
    role: 'Buffer',
    type: 'Buffer',
    attribute: 'Психика',
    tier: 'A',
    premiumTier: 'S',
    imageUrl: 'assets/characters/Jiuyuan.webp',
    splashUrl: 'assets/characters/Jiuyuan.webp',
    shortDescription:
      'Баффер для команд, где важно усилить одно короткое окно.',
    summary:
      'Цзююань требует аккуратного тайминга, зато хорошо масштабирует команды с одним главным керри.',
    tags: ['buffer', 'burst-window', 'premium'],
    updatedAt: '2026-05-30',
  },
  {
    id: 'chiz',
    slug: 'chiz',
    name: 'Чиз',
    originalName: 'Chiz',
    rarity: 'S',
    role: 'Sub DPS',
    type: 'DPS',
    attribute: 'Хаос',
    tier: 'A',
    premiumTier: 'A',
    imageUrl: 'assets/characters/Chiz.webp',
    splashUrl: 'assets/characters/Chiz.webp',
    shortDescription:
      'Дополнительный урон и добивание, когда основному DPS нужен перерыв.',
    summary:
      'Чиз удобен как гибкий слот, если команде не хватает промежуточного урона между основными ротациями.',
    tags: ['sub-dps', 'flex', 'rotation-fill'],
    updatedAt: '2026-05-30',
  },
  {
    id: 'mint',
    slug: 'mint',
    name: 'Минт',
    originalName: 'Mint',
    rarity: 'A',
    role: 'Support',
    type: 'Support',
    attribute: 'Анима',
    tier: 'A',
    premiumTier: 'A',
    imageUrl: 'assets/characters/Mint.webp',
    splashUrl: 'assets/characters/Mint.webp',
    shortDescription: 'Доступный саппорт для ранней игры и F2P-команд.',
    summary:
      'Минт хороша как бюджетный стабилизатор команды, пока аккаунт не собрал премиум-слоты.',
    tags: ['f2p', 'support', 'start'],
    updatedAt: '2026-05-29',
  },
  {
    id: 'aurelia',
    slug: 'aurelia',
    name: 'Аурелия',
    originalName: 'Aurelia',
    rarity: 'A',
    role: 'Debuffer',
    type: 'Debuffer',
    attribute: 'Космос',
    tier: 'B',
    premiumTier: 'A',
    imageUrl: 'assets/characters/Aurelia.png',
    splashUrl: 'assets/characters/Aurelia.png',
    shortDescription:
      'Бюджетные ослабления и полезность, если нет S-саппортов.',
    summary:
      'Аурелия закрывает временную дыру в ростере и помогает новым аккаунтам собрать рабочую пачку без дорогих вложений.',
    tags: ['budget', 'debuff', 'starter'],
    updatedAt: '2026-05-29',
  },
  {
    id: 'adler',
    slug: 'adler',
    name: 'Адлер',
    originalName: 'Adler',
    rarity: 'A',
    role: 'DPS',
    type: 'DPS',
    attribute: 'Психика',
    tier: 'B',
    premiumTier: 'A',
    imageUrl: 'assets/characters/Adler.webp',
    splashUrl: 'assets/characters/Adler.webp',
    shortDescription: 'Простой стартовый DPS с понятной ротацией.',
    summary:
      'Адлер не ломает тир-листы, зато помогает разобраться с базовой логикой навыков и смены персонажей.',
    tags: ['starter', 'simple', 'f2p'],
    updatedAt: '2026-05-29',
  },
  {
    id: 'skia',
    slug: 'skia',
    name: 'Ския',
    originalName: 'Skia',
    rarity: 'A',
    role: 'Control',
    type: 'Control',
    attribute: 'Чары',
    tier: 'B',
    premiumTier: 'A',
    imageUrl: 'assets/characters/Skia.webp',
    splashUrl: 'assets/characters/Skia.webp',
    shortDescription: 'Контроль толпы и комфорт в фарм-комнатах.',
    summary:
      'Ския полезна в AoE-сценариях, где контроль дает больше результата, чем одиночный урон.',
    tags: ['control', 'farm', 'aoe'],
    updatedAt: '2026-05-28',
  },
  {
    id: 'haniel',
    slug: 'haniel',
    name: 'Ханиэль',
    originalName: 'Haniel',
    rarity: 'A',
    role: 'Healer',
    type: 'Healer',
    attribute: 'Лакшана',
    tier: 'B',
    premiumTier: 'A',
    imageUrl: 'assets/characters/Haniel.webp',
    splashUrl: 'assets/characters/Haniel.webp',
    shortDescription: 'Бюджетное восстановление и страховка в долгих боях.',
    summary:
      'Ханиэль не заменяет сильных саппортов, но отлично закрывает потребность в выживаемости на старте.',
    tags: ['healer', 'budget', 'safe'],
    updatedAt: '2026-05-28',
  },
  {
    id: 'edgar',
    slug: 'edgar',
    name: 'Эдгар',
    originalName: 'Edgar',
    rarity: 'A',
    role: 'Tank',
    type: 'Tank',
    attribute: 'Анима',
    tier: 'C',
    premiumTier: 'B',
    imageUrl: 'assets/characters/Edgar.webp',
    splashUrl: 'assets/characters/Edgar.webp',
    shortDescription: 'Ситуативная защита, когда нужен простой фронтлайн.',
    summary:
      'Эдгар полезен как временный танк, но чаще проигрывает слотам, которые одновременно дают защиту и урон.',
    tags: ['tank', 'situational', 'starter'],
    updatedAt: '2026-05-28',
  },
  {
    id: 'esper-zero',
    slug: 'esper-zero',
    name: 'Нулевой эспер',
    originalName: 'Esper Zero',
    rarity: 'Нулевой',
    role: 'Flex',
    type: 'Flex',
    attribute: 'Космос',
    tier: 'A',
    premiumTier: 'A',
    imageUrl: 'assets/characters/Esper-Zero-Male.png',
    splashUrl: 'assets/characters/Esper-Zero-Female.png',
    shortDescription:
      'Гибкий главный герой для закрытия недостающей роли в пачке.',
    summary:
      'Нулевой эспер ценен гибкостью и ранней доступностью, особенно пока ростер еще не собран.',
    tags: ['free', 'flex', 'story'],
    updatedAt: '2026-05-28',
  },
  {
    id: 'chaos',
    slug: 'chaos',
    name: 'Хаос',
    originalName: 'Chaos',
    rarity: 'S',
    role: 'Unknown',
    type: 'Flex',
    attribute: 'Хаос',
    tier: 'C',
    premiumTier: 'C',
    imageUrl: 'assets/characters/Chaos.png',
    splashUrl: 'assets/characters/Chaos.png',
    shortDescription:
      'Анонсированный персонаж. Мета-позиция будет обновлена после тестов.',
    summary:
      'По Хаосу пока нельзя честно фиксировать мету: карточка оставлена как заготовка для будущего гайда.',
    tags: ['анонс', 'нужны тесты', 'не подтверждено'],
    updatedAt: '2026-05-28',
  },
];

const guideSectionsHotori = [
  {
    id: 'hotori-overview',
    title: 'Обзор персонажа',
    type: 'overview',
    position: 1,
    content:
      'Хотори - основной burst DPS. Ее сила не в бесконечном нахождении на поле, а в коротком, заранее подготовленном окне урона. Команда должна подвести баффы, ослабления и контроль до момента, когда Хотори начинает основную цепочку.',
  },
  {
    id: 'hotori-summary',
    title: 'Краткий вывод',
    type: 'verdict',
    position: 2,
    content:
      'Качать стоит, если аккаунт уже имеет саппортов для окна урона. Для новичка она сильна, но требует дисциплины: случайное прожатие навыков сильно режет итоговый DPS.',
  },
  {
    id: 'hotori-pros',
    title: 'Плюсы',
    type: 'pros',
    position: 3,
    content:
      '- Очень высокий burst-потолок\n- Отлично масштабируется от премиум-саппортов\n- Сильна против боссов и плотных целей\n- Хорошо выглядит в контенте с короткими окнами уязвимости',
  },
  {
    id: 'hotori-cons',
    title: 'Минусы',
    type: 'cons',
    position: 4,
    content:
      '- Ошибки в порядке навыков заметно снижают урон\n- Нуждается в энергии и подготовке\n- В фарме волн может проигрывать AoE-специалистам\n- Требует знания таймингов босса',
  },
  {
    id: 'hotori-skills',
    title: 'Навыки и тонкости',
    type: 'skills',
    position: 5,
    content:
      'Главная ошибка - прожимать усиленный навык до того, как команда повесила все баффы и ослабления. Следи за длительностью окна и не бойся отменять лишние анимации сменой персонажа, если это не сбивает ключевой удар.',
  },
  {
    id: 'hotori-rotations',
    title: 'Базовая, оптимальная и продвинутая ротации',
    type: 'rotations',
    position: 6,
    content:
      '**База:** саппорт -> дебаффер -> Хотори skill -> burst -> добивание.\n\n**Оптимально:** контроль -> бафф -> дебафф -> быстрый swap -> полный burst Хотори.\n\n**Advanced:** задержи burst до окна уязвимости босса, заранее набрав ресурс на предыдущей фазе.',
  },
  {
    id: 'hotori-mistakes',
    title: 'Ошибки новичков',
    type: 'mistakes',
    position: 7,
    content:
      '- Начинать с Хотори без подготовки\n- Тратить burst в фазу иммунитета\n- Игнорировать саб-статы на восстановление ресурса\n- Ставить слишком много защитных слотов и терять окно урона',
  },
  {
    id: 'hotori-build',
    title: 'Дуга, модули и статы',
    type: 'build',
    position: 8,
    content:
      'Лучшая дуга - burst-ориентированная с усилением ключевого окна. Альтернатива - дуга на стабильный uptime, если команда пока не держит тайминги. Основные статы: крит, бонус урона, восстановление ресурса. Саб-статы: крит, атака, скорость набора ресурса.',
  },
  {
    id: 'hotori-teams',
    title: 'Лучшие команды',
    type: 'teams',
    position: 9,
    content:
      '**F2P:** Хотори / Минт / Ханиэль / Нулевой эспер.\n\n**Premium:** Хотори / Лакримоза / Байканг / Цзююань.\n\n**Endgame:** Хотори / Лакримоза / Фадия / Байканг для контроля окна и максимального burst.',
  },
  {
    id: 'hotori-video',
    title: 'Видео-гайд и расшифровка',
    type: 'video',
    position: 10,
    content:
      'Добавь YouTube URL в админке, а ниже храни текстовую расшифровку: тайминги ротации, ошибки, сравнение билдов и ответы на вопросы.',
  },
  {
    id: 'hotori-faq',
    title: 'FAQ и интересные факты',
    type: 'faq',
    position: 11,
    content:
      '**Стоит ли качать без сигнатурки?** Да, если есть саппорты для окна урона.\n\n**Можно ли играть на фарме?** Можно, но для волн удобнее AoE DPS.\n\n**Что проверять после патча?** Длительность баффов, стоимость burst и взаимодействия с новыми Дугами.',
  },
];

const guides: Guide[] = [
  {
    id: 'guide-hotori',
    slug: 'hotori-burst-guide',
    characterId: 'hotori',
    title: 'Хотори: burst-гайд, ротации и команды',
    summary:
      'Практический разбор Хотори: окно урона, ошибки, F2P и premium команды.',
    status: 'published',
    patch: '1.0',
    author: 'NTE Meta',
    updatedAt: '2026-06-02',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    sections: guideSectionsHotori,
    rotations: [
      {
        id: 'rot-hotori-basic',
        characterId: 'hotori',
        title: 'Простая ротация Хотори',
        type: 'Простая',
        purpose: 'Быстрое окно урона для старта аккаунта',
        steps: [
          'Минт: бафф',
          'Лакримоза или Аурелия: ослабление',
          'Хотори: skill',
          'Хотори: burst',
          'Swap на саппорта',
        ],
        logic:
          'Главная цель - не держать Хотори на поле до подготовки команды.',
      },
      {
        id: 'rot-hotori-boss',
        characterId: 'hotori',
        title: 'Boss rotation',
        type: 'Boss rotation',
        purpose: 'Попасть burst-цепочкой в окно уязвимости босса',
        steps: [
          'Накопить ресурс до фазы',
          'Фадия: контроль',
          'Байканг: бафф',
          'Лакримоза: дебафф',
          'Хотори: полный burst',
        ],
        logic: 'Ротация сильнее простой, но требует знания таймингов босса.',
      },
    ],
  },
  {
    id: 'guide-baicang',
    slug: 'baicang-support-guide',
    characterId: 'baicang',
    title: 'Байканг: универсальный саппорт и лучшие пары',
    summary:
      'Когда брать Байканга, кому он дает максимум и как не потерять бафф-окно.',
    status: 'published',
    patch: '1.0',
    author: 'NTE Meta',
    updatedAt: '2026-06-01',
    sections: [
      {
        id: 'baicang-overview',
        title: 'Обзор персонажа',
        type: 'overview',
        position: 1,
        content:
          'Байканг - надежный саппорт, который делает команды стабильнее. Особенно хорош, когда основной DPS зависит от короткого усиленного окна.',
      },
      {
        id: 'baicang-teams',
        title: 'Команды',
        type: 'teams',
        position: 2,
        content:
          'Лучшие пары: Хотори для burst-окна, Сакири для стабильного DPS, Даффодил для фарма волн.',
      },
    ],
    rotations: [],
  },
  {
    id: 'guide-sakiri',
    slug: 'sakiri-sustain-guide',
    characterId: 'sakiri',
    title: 'Сакири: стабильный DPS без идеального окна',
    summary:
      'Гайд для игроков, которым нужен ровный урон и меньше наказания за ошибки.',
    status: 'published',
    patch: '1.0',
    author: 'NTE Meta',
    updatedAt: '2026-06-01',
    sections: [
      {
        id: 'sakiri-overview',
        title: 'Обзор персонажа',
        type: 'overview',
        position: 1,
        content:
          'Сакири выигрывает длинные бои за счет стабильности. Она особенно хороша, если игрок еще учится ловить окна босса.',
      },
    ],
    rotations: [],
  },
];

const teams: Team[] = [
  {
    id: 'team-chaos-eclipse',
    title: 'Chaos Eclipse',
    type: 'Bossing',
    budget: 'Premium',
    difficulty: 'Высокая',
    power: 94,
    goodAt: 'Боссы, короткие окна уязвимости, эндгейм-челленджи',
    weakAt: 'Длинный фарм волн без плотных целей',
    synergy:
      'Лакримоза и Байканг готовят окно, Фадия удерживает цель, Хотори закрывает фазу burst-цепочкой.',
    rotation: 'Фадия -> Байканг -> Лакримоза -> Хотори -> повтор подготовки.',
    members: [
      { characterId: 'hotori', role: 'Main DPS' },
      { characterId: 'lacrimosa', role: 'Debuffer' },
      { characterId: 'baicang', role: 'Buffer' },
      { characterId: 'fadia', role: 'Control' },
    ],
  },
  {
    id: 'team-starter-core',
    title: 'Starter Core',
    type: 'Beginner',
    budget: 'F2P',
    difficulty: 'Низкая',
    power: 72,
    goodAt: 'Сюжет, ранний фарм, освоение смены персонажей',
    weakAt: 'Таймерный эндгейм и жесткие burst-checks',
    synergy:
      'Минт и Ханиэль страхуют, Нулевой эспер закрывает гибкий слот, Адлер дает простой урон.',
    rotation: 'Минт -> Адлер -> Нулевой эспер -> Ханиэль по необходимости.',
    members: [
      { characterId: 'adler', role: 'Main DPS' },
      { characterId: 'mint', role: 'Support' },
      { characterId: 'haniel', role: 'Healer' },
      { characterId: 'esper-zero', role: 'Flex' },
    ],
  },
  {
    id: 'team-farm-loop',
    title: 'Neon Farm Loop',
    type: 'Farming',
    budget: 'Mixed',
    difficulty: 'Средняя',
    power: 81,
    goodAt: 'AoE, комнаты с волнами, быстрый фарм материалов',
    weakAt: 'Одиночные боссы с коротким окном уязвимости',
    synergy:
      'Даффодил наносит AoE-урон, Ския собирает и контролирует, Байканг поддерживает темп.',
    rotation: 'Ския -> Байканг -> Даффодил -> Чиз для добивания.',
    members: [
      { characterId: 'daffodill', role: 'AoE DPS' },
      { characterId: 'skia', role: 'Control' },
      { characterId: 'baicang', role: 'Support' },
      { characterId: 'chiz', role: 'Sub DPS' },
    ],
  },
];

const tierlists: TierList[] = [
  {
    id: 'tier-base-10',
    title: 'Base C0 тир-лист',
    kind: 'base',
    patch: '1.0',
    updatedAt: '2026-06-02',
    changelog: [
      'Первый публичный редакционный список',
      'Хаос оставлен в C до подтвержденных тестов',
    ],
    items: characterBase.map((character) => ({
      characterId: character.id,
      tier: character.tier,
      note:
        character.id === 'chaos'
          ? 'Нет подтвержденной меты'
          : 'Редакционная оценка NTE Meta',
    })),
  },
  {
    id: 'tier-premium-10',
    title: 'Premium C6 тир-лист',
    kind: 'premium',
    patch: '1.0',
    updatedAt: '2026-06-02',
    changelog: [
      'Добавлен отдельный premium view',
      'Персонажи с сильным scaling подняты отдельно от base',
    ],
    items: characterBase.map((character) => ({
      characterId: character.id,
      tier: character.premiumTier,
      note: 'Оценка предполагает высокий уровень вложений и оптимальные команды',
    })),
  },
];

const news: NewsItem[] = [
  {
    id: 'news-patch-10',
    slug: 'patch-10-first-meta-notes',
    title: 'Патч 1.0: первые заметки по мете',
    summary:
      'Команда NTE Meta готовит первые глубокие гайды: ротации, команды и ошибки новичков.',
    body: 'Мы не гонимся за количеством страниц. В приоритете практичные материалы: кого качать, как играть, какие команды собирать и как не терять урон в ротации.',
    date: '2026-06-02',
    author: 'NTE Meta',
    category: 'Обновления',
    sourceName: 'Редакция',
    imageUrl: 'assets/characters/Baicang.webp',
    tags: ['патч 1.0', 'мета', 'гайд'],
  },
  {
    id: 'news-guides-roadmap',
    slug: 'guides-roadmap-june',
    title: 'План гайдов на июнь',
    summary:
      'В работе страницы Хотори, Байканга, Сакири и стартовых F2P-команд.',
    body: 'Каждый гайд будет включать базовую, оптимальную и advanced-ротацию, сравнение билдов, команды и раздел ошибок.',
    date: '2026-06-01',
    author: 'NTE Meta',
    category: 'Официальные новости',
    imageUrl: 'assets/characters/Hotori.webp',
    tags: ['roadmap', 'guides'],
  },
];

const leaks: LeakItem[] = [
  {
    id: 'leak-arc-rumor',
    slug: 'new-arc-rumor',
    title: 'Слух: новая Дуга для burst-команд',
    summary:
      'Источник утверждает, что тестируется Дуга с усилением короткого окна урона.',
    body: 'Информация не подтверждена. Не стоит заранее тратить ресурсы или менять план прокачки до официальных данных.',
    date: '2026-06-02',
    trustLevel: 'средний',
    status: 'слух',
    sourceName: 'Telegram source placeholder',
    sourceUrl: 'https://t.me/example',
    approved: true,
    tags: ['дуга', 'слух', 'burst'],
  },
  {
    id: 'leak-chaos-kit',
    slug: 'chaos-kit-unconfirmed',
    title: 'Неподтверждено: набор навыков Хаоса',
    summary:
      'В очереди на проверку - пост с описанием возможной механики Хаоса.',
    body: 'Публикация показывает будущий workflow: импорт из источника попадает в очередь, редактор правит заголовок и только потом публикует.',
    date: '2026-06-01',
    trustLevel: 'низкий',
    status: 'слив',
    sourceName: 'Source queue demo',
    approved: true,
    tags: ['хаос', 'очередь', 'не подтверждено'],
  },
];

const videos: VideoGuide[] = [
  {
    id: 'video-hotori',
    title: 'Хотори: как не сломать burst-окно',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description:
      'Видео-шаблон с таймкодами и текстовой расшифровкой для будущего редакционного гайда.',
    publishedAt: '2026-06-02',
    characterIds: ['hotori'],
    teamIds: ['team-chaos-eclipse'],
    timestamps: [
      { time: '00:00', label: 'Краткий вывод' },
      { time: '01:12', label: 'Базовая ротация' },
      { time: '03:44', label: 'Ошибки новичков' },
    ],
  },
];

const sources: Source[] = [
  {
    id: 'source-manual',
    sourceType: 'manual',
    sourceName: 'Ручная публикация редакции',
    sourceUrl: 'https://nte-meta.local/manual',
    trustLevel: 'высокий',
    autoImportEnabled: false,
  },
  {
    id: 'source-telegram-demo',
    sourceType: 'telegram',
    sourceName: 'Telegram leaks source placeholder',
    sourceUrl: 'https://t.me/example',
    trustLevel: 'средний',
    autoImportEnabled: false,
  },
];

export const seedData: SiteData = {
  characters: characterBase,
  guides,
  tierlists,
  teams,
  news,
  leaks,
  videos,
  comments: [
    {
      id: 'comment-1',
      targetType: 'guide',
      targetId: 'guide-hotori',
      author: 'MetaReader',
      body: 'Нужен отдельный раздел про ротацию без сигнатурной Дуги.',
      createdAt: '2026-06-02',
      score: 14,
    },
    {
      id: 'comment-2',
      targetType: 'leak',
      targetId: 'leak-arc-rumor',
      author: 'PatchWatcher',
      body: 'Хорошо, что слух помечен отдельно. Ждем подтверждения.',
      createdAt: '2026-06-01',
      score: 8,
    },
  ],
  sources,
};

export function findCharacter(idOrSlug: string): Character | undefined {
  return seedData.characters.find(
    (character) => character.id === idOrSlug || character.slug === idOrSlug,
  );
}

export function findGuide(idOrSlug: string): Guide | undefined {
  return seedData.guides.find(
    (guide) => guide.id === idOrSlug || guide.slug === idOrSlug,
  );
}
