const ROLE_WEIGHT = {
  user: 1,
  moderator: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

const PUBLIC_GET = new Set([
  'characters',
  'guides',
  'rotations',
  'teams',
  'tierlists',
  'news',
  'leaks',
  'comments',
  'threads',
]);
const CONTENT_ROLE = 'editor';
const ADMIN_ROLE = 'admin';
const CONTENT_SCOPES = new Set([
  'characters',
  'guides',
  'tierlists',
  'news',
  'leaks',
]);
const DEFAULT_EDITOR_PERMISSIONS = {
  grade: 'junior',
  scopes: ['guides', 'characters'],
  canCreate: true,
  canEdit: true,
  canPublish: true,
  canDelete: false,
};
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
// Cloudflare Workers Web Crypto rejects PBKDF2 values above 100,000.
// Salt + HMAC pepper remain mandatory, while this keeps auth deployable.
const PASSWORD_ITERATIONS = 100000;
const SESSION_COOKIE = 'nte_meta_session';
const MAX_JSON_BYTES = 1800000;
const MAX_PROFILE_JSON_BYTES = 1750000;
const MAX_PROFILE_DATA_URL_CHARS = 1300000;

const tableConfig = {
  characters: {
    table: 'characters',
    slug: true,
    writable: [
      'slug',
      'name',
      'original_name',
      'rarity',
      'role',
      'type',
      'attribute',
      'tier',
      'premium_tier',
      'tier_rank',
      'image_url',
      'splash_url',
      'short_description',
      'summary',
      'tags_json',
      'status',
      'patch_version',
    ],
    role: CONTENT_ROLE,
  },
  guides: {
    table: 'guides',
    slug: true,
    writable: [
      'slug',
      'character_id',
      'title',
      'summary',
      'status',
      'patch_version',
      'author_name',
      'video_url',
      'transcript_markdown',
    ],
    role: CONTENT_ROLE,
  },
  rotations: {
    table: 'rotations',
    writable: [
      'guide_id',
      'character_id',
      'title',
      'rotation_type',
      'purpose',
      'steps_json',
      'logic',
      'media_url',
      'status',
    ],
    role: CONTENT_ROLE,
  },
  teams: {
    table: 'teams',
    writable: [
      'slug',
      'guide_id',
      'title',
      'team_type',
      'budget',
      'difficulty',
      'power',
      'good_at',
      'weak_at',
      'synergy',
      'rotation',
      'rotation_steps_json',
      'status',
    ],
    role: CONTENT_ROLE,
  },
  tierlists: {
    table: 'tierlists',
    slug: true,
    writable: [
      'slug',
      'title',
      'tierlist_type',
      'patch_version',
      'status',
      'changelog_json',
    ],
    role: CONTENT_ROLE,
  },
  news: {
    table: 'news',
    slug: true,
    writable: [
      'slug',
      'title',
      'summary',
      'body_markdown',
      'author_name',
      'category',
      'source_name',
      'source_url',
      'image_url',
      'tags_json',
      'status',
    ],
    role: CONTENT_ROLE,
  },
  leaks: {
    table: 'leaks',
    slug: true,
    writable: [
      'slug',
      'title',
      'summary',
      'body_markdown',
      'source_name',
      'source_url',
      'trust_level',
      'leak_status',
      'approved',
      'tags_json',
    ],
    role: CONTENT_ROLE,
  },
  sources: {
    table: 'sources',
    writable: [
      'source_type',
      'source_url',
      'source_name',
      'trust_level',
      'auto_import_enabled',
      'last_checked_at',
    ],
    role: ADMIN_ROLE,
  },
  threads: {
    table: 'community_threads',
    slug: true,
    writable: [
      'slug',
      'title',
      'summary',
      'body_markdown',
      'author_name',
      'status',
      'tags_json',
    ],
    role: 'user',
  },
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    try {
      const response = await router(request, env, ctx);
      return withCors(request, env, response);
    } catch (error) {
      if (error?.status) {
        return withCors(
          request,
          env,
          json({ error: error.message }, error.status),
        );
      }
      const databaseMessage = String(error?.message || '');
      if (databaseMessage.includes('UNIQUE constraint failed')) {
        return withCors(
          request,
          env,
          json(
            { error: 'Запись с такими уникальными данными уже существует' },
            409,
          ),
        );
      }
      if (
        databaseMessage.includes('FOREIGN KEY constraint failed') ||
        databaseMessage.includes('CHECK constraint failed') ||
        databaseMessage.includes('NOT NULL constraint failed')
      ) {
        return withCors(
          request,
          env,
          json({ error: 'Данные не прошли проверку базы' }, 400),
        );
      }
      console.error(
        JSON.stringify({
          type: 'worker_error',
          message: error?.message || String(error),
        }),
      );
      return withCors(
        request,
        env,
        json({ error: 'Внутренняя ошибка API' }, 500),
      );
    }
  },
};

async function router(request, env, ctx) {
  const url = new URL(request.url);
  const parts = url.pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean);

  if (!url.pathname.startsWith('/api/')) {
    return json({ error: 'Not found' }, 404);
  }

  if (!env.DB) {
    return json({ error: 'D1 binding DB не настроен' }, 500);
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (origin && !isAllowedOrigin(origin, env)) {
      return json({ error: 'Origin не разрешен' }, 403);
    }
    const expectsJson =
      request.method !== 'DELETE' &&
      !(parts[0] === 'auth' && parts[1] === 'logout');
    if (
      expectsJson &&
      !request.headers
        .get('Content-Type')
        ?.toLowerCase()
        .startsWith('application/json')
    ) {
      return json({ error: 'Ожидается Content-Type: application/json' }, 415);
    }
  }

  if (parts[0] === 'auth') {
    return handleAuth(request, env, parts, ctx);
  }

  if (parts[0] === 'media') {
    return handleMediaProxy(request, ctx);
  }

  if (parts[0] === 'users') {
    return handleUsers(request, env, parts, ctx);
  }

  if (
    parts[0] === 'guides' &&
    parts[2] === 'sections' &&
    parts[3] === 'reorder'
  ) {
    return reorderGuideSections(request, env, parts[1], ctx);
  }

  if (parts[0] === 'guides' && parts[2] === 'sections') {
    return createGuideSection(request, env, parts[1], ctx);
  }

  if (parts[0] === 'guide-sections') {
    return handleGuideSection(request, env, parts, ctx);
  }

  if (parts[0] === 'comments') {
    return handleComments(request, env, ctx);
  }

  if (parts[0] === 'reactions') {
    return handleReactions(request, env, parts, ctx);
  }

  if (parts[0] === 'threads') {
    return handleThreads(request, env, parts, ctx);
  }

  if (parts[0] === 'character-import' && parts[1] === 'lookup') {
    return handleCharacterImportLookup(request, env);
  }

  if (parts[0] === 'guide-import' && parts[1] === 'lookup') {
    return handleGuideImportLookup(request, env);
  }

  if (parts[0] === 'system' && parts[1] === 'status') {
    return handleSystemStatus(request, env);
  }

  if (parts[0] === 'warnings') {
    return handleWarnings(request, env, parts, ctx);
  }

  if (parts[0] === 'settings') {
    return handleSettings(request, env, ctx);
  }

  if (parts[0] === 'audit-log') {
    await requireRole(request, env, ADMIN_ROLE);
    const rows = await env.DB.prepare(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200',
    ).all();
    return json({ data: rows.results });
  }

  if (parts[0] in tableConfig) {
    return handleEntity(request, env, parts, ctx);
  }

  return json({ error: 'API endpoint не найден' }, 404);
}

async function handleAuth(request, env, parts, ctx) {
  if (request.method === 'GET' && parts[1] === 'config') {
    const existing = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM users WHERE status = ?',
    )
      .bind('active')
      .first();
    const siteSettings = await getSetting(env, 'site', {
      registrationEnabled: true,
    });
    const hasUsers = Number(existing?.count || 0) > 0;
    return json({
      data: {
        registrationEnabled: hasUsers
          ? siteSettings.registrationEnabled !== false
          : true,
        needsBootstrap: !hasUsers && Boolean(env.OWNER_BOOTSTRAP_TOKEN),
      },
    });
  }

  if (request.method === 'POST' && parts[1] === 'register') {
    await rateLimit(request, env, 'register', 8, 60 * 60);
    const body = await readJson(request);
    const username = cleanString(body.username, 3, 32);
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      return json(
        {
          error:
            'Логин должен быть 3-32 символа: латиница, цифры, точка, дефис или underscore',
        },
        400,
      );
    }

    if (
      password.length < 10 ||
      password.length > 128 ||
      password !== confirmPassword
    ) {
      return json(
        {
          error:
            'Пароль должен быть длиной 10-128 символов, подтверждение должно совпадать',
        },
        400,
      );
    }

    const existing = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM users',
    ).first();
    const siteSettings = await getSetting(env, 'site', {
      registrationEnabled: true,
    });
    if (
      Number(existing.count) > 0 &&
      siteSettings.registrationEnabled === false
    ) {
      return json({ error: 'Регистрация временно отключена' }, 403);
    }
    if (
      Number(existing.count) === 0 &&
      env.OWNER_BOOTSTRAP_TOKEN &&
      !constantTimeEqual(
        String(body.bootstrapToken || ''),
        String(env.OWNER_BOOTSTRAP_TOKEN),
      )
    ) {
      return json(
        { error: 'Для создания первого owner нужен bootstrap token' },
        403,
      );
    }
    const id = crypto.randomUUID();
    const passwordRecord = await hashPassword(password, env);

    let inserted;
    try {
      inserted = await env.DB.prepare(
        `INSERT INTO users (id, username, display_name, password_hash, password_salt, password_iterations, role)
         VALUES (?, ?, ?, ?, ?, ?, CASE WHEN NOT EXISTS (SELECT 1 FROM users) THEN 'owner' ELSE 'user' END)
         RETURNING role`,
      )
        .bind(
          id,
          username,
          username,
          passwordRecord.hash,
          passwordRecord.salt,
          PASSWORD_ITERATIONS,
        )
        .first();
    } catch {
      return json(
        { error: 'Пользователь с таким логином уже существует' },
        409,
      );
    }

    const role = inserted.role;
    const session = await createSession(env, id, request);
    ctx.waitUntil(cleanupAuthData(env));
    return sessionResponse(
      request,
      {
        token: session.token,
        user: { id, username, displayName: username, role },
      },
      session.expiresAt,
      201,
    );
  }

  if (request.method === 'POST' && parts[1] === 'login') {
    await rateLimit(request, env, 'login', 12, 15 * 60);
    const body = await readJson(request);
    const username = cleanString(body.username, 3, 32);
    const password = String(body.password || '');
    const user = await env.DB.prepare(
      `SELECT users.*,
              editor_permissions.grade AS editor_grade,
              editor_permissions.scopes_json AS editor_scopes_json,
              editor_permissions.can_create AS editor_can_create,
              editor_permissions.can_edit AS editor_can_edit,
              editor_permissions.can_publish AS editor_can_publish,
              editor_permissions.can_delete AS editor_can_delete
       FROM users
       LEFT JOIN editor_permissions ON editor_permissions.user_id = users.id
       WHERE lower(users.username) = lower(?) AND users.status = ?`,
    )
      .bind(username, 'active')
      .first();

    const passwordValid = Boolean(
      user &&
      (await verifyPassword(
        password,
        user.password_salt,
        user.password_hash,
        user.password_iterations,
        env,
      )),
    );
    if (password.length > 128 || !passwordValid) {
      return json({ error: 'Неверный логин или пароль' }, 401);
    }

    // Transparently upgrade accounts created with an older work factor.
    if (Number(user.password_iterations || 0) < PASSWORD_ITERATIONS) {
      const upgraded = await hashPassword(password, env);
      await env.DB.prepare(
        'UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = current_timestamp WHERE id = ?',
      )
        .bind(upgraded.hash, upgraded.salt, PASSWORD_ITERATIONS, user.id)
        .run();
    }

    await env.DB.prepare(
      'UPDATE users SET last_login_at = current_timestamp WHERE id = ?',
    )
      .bind(user.id)
      .run();
    const session = await createSession(env, user.id, request);
    ctx.waitUntil(cleanupAuthData(env));
    const responseUser = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    };
    if (user.role === 'editor') {
      responseUser.editorPermissions = serializeEditorPermissions(user);
    }
    return sessionResponse(
      request,
      {
        token: session.token,
        user: responseUser,
      },
      session.expiresAt,
    );
  }

  if (request.method === 'POST' && parts[1] === 'logout') {
    const tokenHash = await getSessionTokenHash(request);
    if (tokenHash) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
        .bind(tokenHash)
        .run();
    }
    const response = json({ data: { success: true } });
    response.headers.append(
      'Set-Cookie',
      serializeSessionCookie(request, '', new Date(0)),
    );
    return response;
  }

  if (request.method === 'POST' && parts[1] === 'change-password') {
    await rateLimit(request, env, 'change-password', 5, 60 * 60);
    const user = await requireRole(request, env, 'user');
    const body = await readJson(request);
    const currentPassword = String(body.currentPassword || '');
    const nextPassword = String(body.nextPassword || '');
    const nextConfirm = String(body.nextConfirm || '');
    const dbUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(user.id)
      .first();

    if (
      !(await verifyPassword(
        currentPassword,
        dbUser.password_salt,
        dbUser.password_hash,
        dbUser.password_iterations,
        env,
      ))
    ) {
      return json({ error: 'Текущий пароль неверный' }, 401);
    }

    if (
      nextPassword.length < 10 ||
      nextPassword.length > 128 ||
      nextPassword !== nextConfirm
    ) {
      return json(
        {
          error:
            'Новый пароль должен быть длиной 10-128 символов, подтверждение должно совпадать',
        },
        400,
      );
    }

    const passwordRecord = await hashPassword(nextPassword, env);
    await env.DB.prepare(
      'UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = current_timestamp WHERE id = ?',
    )
      .bind(
        passwordRecord.hash,
        passwordRecord.salt,
        PASSWORD_ITERATIONS,
        user.id,
      )
      .run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?')
      .bind(user.id)
      .run();
    const response = json({ data: { success: true } });
    response.headers.append(
      'Set-Cookie',
      serializeSessionCookie(request, '', new Date(0)),
    );
    return response;
  }

  if (request.method === 'PATCH' && parts[1] === 'profile') {
    const user = await requireRole(request, env, 'user');
    const body = await readJson(request);
    const displayName = cleanString(body.displayName, 2, 40);
    await env.DB.prepare(
      'UPDATE users SET display_name = ?, updated_at = current_timestamp WHERE id = ?',
    )
      .bind(displayName, user.id)
      .run();
    ctx.waitUntil(
      logAudit(env, user.id, 'auth.profile', user.id, { displayName }),
    );
    return json({ data: { ...user, displayName } });
  }

  if (request.method === 'GET' && parts[1] === 'me') {
    const user = await getAuthUser(request, env);
    return json({ data: user });
  }

  if (request.method === 'GET' && parts[1] === 'warnings') {
    const user = await requireRole(request, env, 'user');
    const rows = await env.DB.prepare(
      `SELECT user_warnings.id, user_warnings.reason, user_warnings.created_at,
              COALESCE(moderator.display_name, 'Модерация NTE Meta') AS moderator_name
       FROM user_warnings
       LEFT JOIN users AS moderator ON moderator.id = user_warnings.created_by
       WHERE user_warnings.user_id = ? AND user_warnings.status = 'active'
       ORDER BY user_warnings.created_at DESC`,
    )
      .bind(user.id)
      .all();
    return json({
      data: rows.results.map((row) => ({
        id: row.id,
        reason: row.reason,
        moderatorName: row.moderator_name,
        createdAt: row.created_at,
      })),
    });
  }

  return json({ error: 'Auth endpoint не найден' }, 404);
}

async function handleUsers(request, env, parts, ctx) {
  if (parts[2] === 'warnings') {
    const actor = await requireRole(request, env, 'moderator');
    const target = await env.DB.prepare(
      'SELECT id, role, status FROM users WHERE id = ?',
    )
      .bind(parts[1])
      .first();
    if (!target || target.status === 'deleted') {
      return json({ error: 'Пользователь не найден' }, 404);
    }
    if (
      actor.role !== 'owner' &&
      ROLE_WEIGHT[target.role] >= ROLE_WEIGHT[actor.role]
    ) {
      return json(
        {
          error: 'Нельзя модерировать пользователя с равной или старшей ролью',
        },
        403,
      );
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      const reason = cleanString(body.reason, 5, 1000);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO user_warnings (id, user_id, created_by, reason) VALUES (?, ?, ?, ?)',
      )
        .bind(id, target.id, actor.id, reason)
        .run();
      ctx.waitUntil(
        logAudit(env, actor.id, 'users.warning', target.id, { reason }),
      );
      return json({ data: { id } }, 201);
    }
    if (request.method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT id, reason, status, created_at FROM user_warnings WHERE user_id = ? ORDER BY created_at DESC',
      )
        .bind(target.id)
        .all();
      return json({ data: rows.results });
    }
    return json({ error: 'Метод не поддерживается' }, 405);
  }

  const actor = await requireRole(request, env, ADMIN_ROLE);

  if (request.method === 'PATCH' && parts[2] === 'editor-permissions') {
    const target = await env.DB.prepare(
      'SELECT id, role, status FROM users WHERE id = ?',
    )
      .bind(parts[1])
      .first();
    if (!target || target.status === 'deleted') {
      return json({ error: 'Пользователь не найден' }, 404);
    }
    if (target.role !== 'editor') {
      return json(
        {
          error: 'Точные права назначаются только пользователям с ролью editor',
        },
        409,
      );
    }

    const body = await readJson(request);
    const permissions = normalizeEditorPermissions(body);
    await env.DB.prepare(
      `INSERT INTO editor_permissions (
         user_id, grade, scopes_json, can_create, can_edit,
         can_publish, can_delete, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         grade = excluded.grade,
         scopes_json = excluded.scopes_json,
         can_create = excluded.can_create,
         can_edit = excluded.can_edit,
         can_publish = excluded.can_publish,
         can_delete = excluded.can_delete,
         updated_by = excluded.updated_by,
         updated_at = current_timestamp`,
    )
      .bind(
        target.id,
        permissions.grade,
        JSON.stringify(permissions.scopes),
        permissions.canCreate ? 1 : 0,
        permissions.canEdit ? 1 : 0,
        permissions.canPublish ? 1 : 0,
        permissions.canDelete ? 1 : 0,
        actor.id,
      )
      .run();
    ctx.waitUntil(
      logAudit(
        env,
        actor.id,
        'users.editor_permissions',
        target.id,
        permissions,
      ),
    );
    return json({ data: permissions });
  }

  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT users.id, users.username, users.display_name, users.role,
              users.status, users.created_at, users.last_login_at,
              editor_permissions.grade AS editor_grade,
              editor_permissions.scopes_json AS editor_scopes_json,
              editor_permissions.can_create AS editor_can_create,
              editor_permissions.can_edit AS editor_can_edit,
              editor_permissions.can_publish AS editor_can_publish,
              editor_permissions.can_delete AS editor_can_delete
       FROM users
       LEFT JOIN editor_permissions ON editor_permissions.user_id = users.id
       ORDER BY users.created_at DESC`,
    ).all();
    return json({ data: rows.results.map(serializeUser) });
  }

  if (request.method === 'PATCH' && parts[2] === 'role') {
    const body = await readJson(request);
    const nextRole = String(body.role || '');
    const target = await env.DB.prepare(
      'SELECT id, role, status FROM users WHERE id = ?',
    )
      .bind(parts[1])
      .first();
    if (!target) {
      return json({ error: 'Пользователь не найден' }, 404);
    }
    if (target.status !== 'active') {
      return json(
        { error: 'Роль можно менять только активному аккаунту' },
        409,
      );
    }
    if (!(nextRole in ROLE_WEIGHT)) {
      return json({ error: 'Неизвестная роль' }, 400);
    }
    if (
      actor.role !== 'owner' &&
      (ROLE_WEIGHT[nextRole] >= ROLE_WEIGHT.admin ||
        ROLE_WEIGHT[target.role] >= ROLE_WEIGHT.admin)
    ) {
      return json({ error: 'Только owner может менять роли admin/owner' }, 403);
    }
    if (
      target.role === 'owner' &&
      nextRole !== 'owner' &&
      (await isLastActiveOwner(env, target.id))
    ) {
      return json(
        { error: 'Нельзя понизить роль последнего активного owner' },
        409,
      );
    }
    const statements = [
      env.DB.prepare(
        'UPDATE users SET role = ?, updated_at = current_timestamp WHERE id = ?',
      ).bind(nextRole, parts[1]),
    ];
    if (nextRole === 'editor') {
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO editor_permissions (user_id, updated_by)
           VALUES (?, ?)`,
        ).bind(parts[1], actor.id),
      );
    }
    await env.DB.batch(statements);
    ctx.waitUntil(
      logAudit(env, actor.id, 'users.role', parts[1], { role: nextRole }),
    );
    return json({ data: { success: true } });
  }

  if (request.method === 'PATCH' && parts[2] === 'status') {
    const body = await readJson(request);
    const status = String(body.status || '');
    if (!['active', 'disabled'].includes(status)) {
      return json({ error: 'Неизвестный статус пользователя' }, 400);
    }
    if (parts[1] === actor.id) {
      return json({ error: 'Нельзя отключить собственный аккаунт' }, 409);
    }
    const target = await env.DB.prepare(
      'SELECT id, role, status FROM users WHERE id = ?',
    )
      .bind(parts[1])
      .first();
    if (!target || target.status === 'deleted') {
      return json({ error: 'Пользователь не найден' }, 404);
    }
    if (
      actor.role !== 'owner' &&
      ROLE_WEIGHT[target.role] >= ROLE_WEIGHT.admin
    ) {
      return json({ error: 'Только owner управляет admin/owner' }, 403);
    }
    if (
      target.role === 'owner' &&
      status === 'disabled' &&
      (await isLastActiveOwner(env, target.id))
    ) {
      return json(
        { error: 'Нельзя отключить последнего активного owner' },
        409,
      );
    }
    await env.DB.prepare(
      'UPDATE users SET status = ?, updated_at = current_timestamp WHERE id = ?',
    )
      .bind(status, target.id)
      .run();
    if (status === 'disabled') {
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?')
        .bind(target.id)
        .run();
    }
    ctx.waitUntil(
      logAudit(env, actor.id, 'users.status', target.id, { status }),
    );
    return json({ data: { success: true } });
  }

  if (request.method === 'DELETE' && parts[1]) {
    if (actor.role !== 'owner') {
      return json({ error: 'Удалять пользователей может только owner' }, 403);
    }
    if (parts[1] === actor.id) {
      return json({ error: 'Нельзя удалить собственный owner-аккаунт' }, 409);
    }
    const target = await env.DB.prepare(
      'SELECT id, role FROM users WHERE id = ?',
    )
      .bind(parts[1])
      .first();
    if (!target) {
      return json({ error: 'Пользователь не найден' }, 404);
    }
    if (target.role === 'owner' && (await isLastActiveOwner(env, target.id))) {
      return json({ error: 'Нельзя удалить последнего активного owner' }, 409);
    }
    await env.DB.prepare(
      'UPDATE users SET status = ?, updated_at = current_timestamp WHERE id = ?',
    )
      .bind('deleted', parts[1])
      .run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?')
      .bind(parts[1])
      .run();
    ctx.waitUntil(logAudit(env, actor.id, 'users.delete', parts[1], {}));
    return json({ data: { success: true } });
  }

  return json({ error: 'Users endpoint не найден' }, 404);
}

async function isLastActiveOwner(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND status = 'active' AND id <> ?",
  )
    .bind(userId)
    .first();
  return Number(row?.count || 0) === 0;
}

async function handleEntity(request, env, parts, ctx) {
  const entity = parts[0];
  const idOrSlug = parts[1];
  const config = tableConfig[entity];

  if (request.method === 'GET') {
    if (!PUBLIC_GET.has(entity)) {
      await requireRole(request, env, config.role);
    }
    return readEntity(env, entity, idOrSlug, request);
  }

  if (request.method === 'POST') {
    const body = await readJson(request);
    const actor = await authorizeEntityMutation(
      request,
      env,
      entity,
      'create',
      body,
      config.role,
    );
    const record = normalizeRecord(config, body, { deriveSlug: true });
    record.id = record.id || crypto.randomUUID();
    if (entity === 'guides') {
      record.author_id = actor.id;
      record.author_name = record.author_name || actor.displayName;
    }
    if (entity === 'news') {
      record.author_id = actor.id;
      record.author_name = record.author_name || actor.displayName;
    }
    if (entity === 'leaks' && record.approved) {
      record.approved_by = actor.id;
      record.approved_at = new Date().toISOString();
    }
    validateEntityRecord(entity, record, true);
    await validateEntityRelations(env, entity, body, record.id);
    const insert = buildInsert(config.table, record);
    const statements = [
      env.DB.prepare(insert.sql).bind(...insert.values),
      ...buildRelationStatements(env, entity, record.id, body, false),
    ];
    await env.DB.batch(statements);
    ctx.waitUntil(
      logAudit(env, actor.id, `${entity}.create`, record.id, record),
    );
    return json(
      {
        data: {
          id: record.id,
          slug: record.slug || undefined,
          status: record.status || undefined,
        },
      },
      201,
    );
  }

  if (request.method === 'PATCH' && idOrSlug) {
    const body = await readJson(request);
    const actor = await authorizeEntityMutation(
      request,
      env,
      entity,
      'edit',
      body,
      config.role,
    );
    const record = normalizeRecord(config, body, { deriveSlug: false });
    if (entity === 'leaks' && record.approved) {
      record.approved_by = actor.id;
      record.approved_at = new Date().toISOString();
    }
    if (Object.keys(record).length === 0) {
      return json({ error: 'Нет полей для обновления' }, 400);
    }
    validateEntityRecord(entity, record, false);
    const patch = buildUpdate(config.table, record, idOrSlug, config.slug);
    const target = await findEntityId(env, config, idOrSlug);
    if (!target) {
      return json({ error: 'Запись не найдена' }, 404);
    }
    await validateEntityRelations(env, entity, body, target.id);
    const statements = [
      env.DB.prepare(patch.sql).bind(...patch.values),
      ...buildRelationStatements(env, entity, target.id, body, true),
    ];
    await env.DB.batch(statements);
    ctx.waitUntil(
      logAudit(env, actor.id, `${entity}.update`, idOrSlug, record),
    );
    return json({
      data: {
        success: true,
        id: target.id,
        slug: record.slug || target.slug || undefined,
        status: record.status || undefined,
      },
    });
  }

  if (request.method === 'DELETE' && idOrSlug) {
    const actor = await authorizeEntityMutation(
      request,
      env,
      entity,
      'delete',
      {},
      config.role,
    );
    const target = await findEntityId(env, config, idOrSlug);
    if (!target) {
      return json({ error: 'Запись не найдена' }, 404);
    }
    await env.DB.prepare(`DELETE FROM ${config.table} WHERE id = ?`)
      .bind(target.id)
      .run();
    ctx.waitUntil(logAudit(env, actor.id, `${entity}.delete`, target.id, {}));
    return json({ data: { success: true } });
  }

  return json({ error: 'Метод не поддерживается' }, 405);
}

function entityPermissionScope(entity) {
  if (entity === 'teams' || entity === 'rotations') return 'guides';
  if (entity === 'guides') return 'guides';
  return entity;
}

async function authorizeEntityMutation(
  request,
  env,
  entity,
  action,
  body,
  fallbackRole,
) {
  const scope = entityPermissionScope(entity);
  if (!CONTENT_SCOPES.has(scope)) {
    return requireRole(request, env, fallbackRole);
  }
  const actor = await requireContentPermission(request, env, scope, action);
  const wantsPublish =
    body.status === 'published' ||
    body.publishStatus === 'published' ||
    (entity === 'leaks' && Boolean(body.approved));
  if (wantsPublish && action !== 'delete') {
    await requireContentPermission(request, env, scope, 'publish', actor);
  }
  return actor;
}

async function readEntity(env, entity, idOrSlug, request) {
  const user = await getAuthUser(request, env);
  const scope = entityPermissionScope(entity);
  const includeDrafts = userHasContentPermission(user, scope, 'edit');
  let data;

  if (entity === 'characters') {
    data = idOrSlug
      ? await getCharacter(env, idOrSlug, includeDrafts)
      : await listCharacters(env, includeDrafts);
  } else if (entity === 'guides') {
    data = idOrSlug
      ? await getGuide(env, idOrSlug, includeDrafts)
      : await listGuides(env, includeDrafts);
  } else if (entity === 'rotations') {
    data = idOrSlug
      ? await getRotation(env, idOrSlug, includeDrafts)
      : await listRotations(env, includeDrafts);
  } else if (entity === 'tierlists') {
    data = idOrSlug
      ? await getTierlist(env, idOrSlug, includeDrafts)
      : await listTierlists(env, includeDrafts);
  } else if (entity === 'teams') {
    data = idOrSlug
      ? await getTeam(env, idOrSlug, includeDrafts)
      : await listTeams(env, includeDrafts);
  } else if (entity === 'news') {
    const where = includeDrafts ? '1 = 1' : "status = 'published'";
    const rows = idOrSlug
      ? [
          await env.DB.prepare(
            `SELECT * FROM news WHERE ${where} AND (id = ? OR slug = ?)`,
          )
            .bind(idOrSlug, idOrSlug)
            .first(),
        ]
      : (
          await env.DB.prepare(
            `SELECT * FROM news WHERE ${where} ORDER BY created_at DESC`,
          ).all()
        ).results;
    data = idOrSlug ? serializeNews(rows[0]) : rows.map(serializeNews);
  } else if (entity === 'leaks') {
    const where = includeDrafts ? '1=1' : 'approved = 1';
    const rows = idOrSlug
      ? [
          await env.DB.prepare(
            `SELECT * FROM leaks WHERE (${where}) AND (id = ? OR slug = ?)`,
          )
            .bind(idOrSlug, idOrSlug)
            .first(),
        ]
      : (
          await env.DB.prepare(
            `SELECT * FROM leaks WHERE ${where} ORDER BY created_at DESC`,
          ).all()
        ).results;
    data = idOrSlug ? serializeLeak(rows[0]) : rows.map(serializeLeak);
  } else if (entity === 'sources') {
    const rows = (
      await env.DB.prepare('SELECT * FROM sources ORDER BY source_name').all()
    ).results;
    data = rows.map(serializeSource);
  } else {
    const config = tableConfig[entity];
    const statusClause =
      config.writable.includes('status') && !includeDrafts
        ? " AND status = 'published'"
        : '';
    const rows = idOrSlug
      ? [
          await env.DB.prepare(
            `SELECT * FROM ${config.table} WHERE id = ?${statusClause}`,
          )
            .bind(idOrSlug)
            .first(),
        ]
      : (
          await env.DB.prepare(
            `SELECT * FROM ${config.table} WHERE 1 = 1${statusClause} ORDER BY created_at DESC`,
          ).all()
        ).results;
    data = idOrSlug ? rows[0] : rows;
  }

  if (idOrSlug && !data) {
    return json({ error: 'Запись не найдена' }, 404);
  }
  return json({ data });
}

async function listCharacters(env, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const rows = await env.DB.prepare(
    `${characterProfileSelect()} WHERE ${where} ORDER BY tier_rank, name`,
  ).all();
  return rows.results.map(serializeCharacter);
}

async function getCharacter(env, idOrSlug, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const row = await env.DB.prepare(
    `${characterProfileSelect()} WHERE ${where} AND (characters.id = ? OR slug = ?)`,
  )
    .bind(idOrSlug, idOrSlug)
    .first();
  return row ? serializeCharacter(row) : null;
}

function characterProfileSelect() {
  return `SELECT characters.*,
    character_profiles.faction AS profile_faction,
    character_profiles.arc_type AS profile_arc_type,
    character_profiles.birthday AS profile_birthday,
    character_profiles.release_date AS profile_release_date,
    character_profiles.biography_short AS profile_biography_short,
    character_profiles.biography_markdown AS profile_biography_markdown,
    character_profiles.trivia_markdown AS profile_trivia_markdown,
    character_profiles.role_tags_json AS profile_role_tags_json,
    character_profiles.role_icons_json AS profile_role_icons_json,
    character_profiles.voice_actors_json AS profile_voice_actors_json,
    character_profiles.materials_json AS profile_materials_json,
    character_profiles.base_stats_json AS profile_base_stats_json,
    character_profiles.abilities_json AS profile_abilities_json,
    character_profiles.skins_json AS profile_skins_json,
    character_profiles.friendship_json AS profile_friendship_json,
    character_profiles.gifts_json AS profile_gifts_json,
      character_profiles.voice_lines_json AS profile_voice_lines_json,
      character_profiles.awakenings_json AS profile_awakenings_json
  FROM characters
  LEFT JOIN character_profiles ON character_profiles.character_id = characters.id`;
}

async function listGuides(env, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const rows = await env.DB.prepare(
    `SELECT * FROM guides WHERE ${where} ORDER BY updated_at DESC`,
  ).all();
  return Promise.all(
    rows.results.map((row) => serializeGuideWithRelations(env, row)),
  );
}

async function getGuide(env, idOrSlug, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const row = await env.DB.prepare(
    `SELECT * FROM guides WHERE ${where} AND (id = ? OR slug = ?)`,
  )
    .bind(idOrSlug, idOrSlug)
    .first();
  return row ? serializeGuideWithRelations(env, row) : null;
}

async function listRotations(env, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const rows = await env.DB.prepare(
    `SELECT * FROM rotations WHERE ${where} ORDER BY updated_at DESC, title`,
  ).all();
  return rows.results.map(serializeRotation);
}

async function getRotation(env, id, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const row = await env.DB.prepare(
    `SELECT * FROM rotations WHERE ${where} AND id = ?`,
  )
    .bind(id)
    .first();
  return row ? serializeRotation(row) : null;
}

async function serializeGuideWithRelations(env, row) {
  const sections = await env.DB.prepare(
    'SELECT * FROM guide_sections WHERE guide_id = ? ORDER BY position',
  )
    .bind(row.id)
    .all();
  const rotations = await env.DB.prepare(
    'SELECT * FROM rotations WHERE guide_id = ? OR character_id = ? ORDER BY created_at',
  )
    .bind(row.id, row.character_id)
    .all();
  return {
    id: row.id,
    slug: row.slug,
    characterId: row.character_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    patch: row.patch_version,
    author: row.author_name,
    updatedAt: row.updated_at,
    videoUrl: row.video_url || undefined,
    transcript: row.transcript_markdown || undefined,
    sections: sections.results.map(serializeSection),
    rotations: rotations.results.map(serializeRotation),
  };
}

async function listTierlists(env, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const rows = await env.DB.prepare(
    `SELECT * FROM tierlists WHERE ${where} ORDER BY updated_at DESC`,
  ).all();
  return Promise.all(
    rows.results.map((row) => serializeTierlistWithItems(env, row)),
  );
}

async function getTierlist(env, idOrSlug, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const row = await env.DB.prepare(
    `SELECT * FROM tierlists WHERE ${where} AND (id = ? OR slug = ?)`,
  )
    .bind(idOrSlug, idOrSlug)
    .first();
  return row ? serializeTierlistWithItems(env, row) : null;
}

async function serializeTierlistWithItems(env, row) {
  const items = await env.DB.prepare(
    'SELECT * FROM tierlist_items WHERE tierlist_id = ? ORDER BY tier_rank, position',
  )
    .bind(row.id)
    .all();
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    kind: row.tierlist_type,
    patch: row.patch_version,
    updatedAt: row.updated_at,
    changelog: parseJson(row.changelog_json, []),
    status: row.status,
    items: items.results.map((item) => ({
      characterId: item.character_id,
      tier: item.tier,
      note: item.note || '',
    })),
  };
}

async function listTeams(env, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const rows = await env.DB.prepare(
    `SELECT * FROM teams WHERE ${where} ORDER BY power DESC, title`,
  ).all();
  return Promise.all(
    rows.results.map((row) => serializeTeamWithMembers(env, row)),
  );
}

async function getTeam(env, idOrSlug, includeDrafts = false) {
  const where = includeDrafts ? '1 = 1' : "status = 'published'";
  const row = await env.DB.prepare(
    `SELECT * FROM teams WHERE ${where} AND (id = ? OR slug = ?)`,
  )
    .bind(idOrSlug, idOrSlug)
    .first();
  return row ? serializeTeamWithMembers(env, row) : null;
}

async function serializeTeamWithMembers(env, row) {
  const members = await env.DB.prepare(
    'SELECT * FROM team_members WHERE team_id = ? ORDER BY position',
  )
    .bind(row.id)
    .all();
  return {
    id: row.id,
    slug: row.slug,
    guideId: row.guide_id || undefined,
    title: row.title,
    type: row.team_type,
    budget: row.budget,
    difficulty: row.difficulty,
    power: row.power,
    goodAt: row.good_at,
    weakAt: row.weak_at,
    synergy: row.synergy,
    rotation: row.rotation,
    rotationSteps: parseJson(row.rotation_steps_json, []).length
      ? parseJson(row.rotation_steps_json, [])
      : String(row.rotation || '')
          .split('\n')
          .map((step) => step.trim())
          .filter(Boolean),
    status: row.status,
    updatedAt: row.updated_at,
    members: members.results.map((member) => ({
      characterId: member.character_id,
      role: member.role,
    })),
  };
}

async function createGuideSection(request, env, guideId, ctx) {
  const actor = await requireContentPermission(request, env, 'guides', 'edit');
  const body = await readJson(request);
  const guide = await env.DB.prepare('SELECT id FROM guides WHERE id = ?')
    .bind(guideId)
    .first();
  if (!guide) {
    return json({ error: 'Гайд не найден' }, 404);
  }
  const id = crypto.randomUUID();
  const positionRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM guide_sections WHERE guide_id = ?',
  )
    .bind(guideId)
    .first();
  await env.DB.prepare(
    `INSERT INTO guide_sections (id, guide_id, title, section_type, content_markdown, position, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      guideId,
      cleanString(body.title, 1, 120),
      cleanString(body.type || 'custom', 1, 40),
      String(body.content || ''),
      positionRow.next_position,
      '{}',
    )
    .run();
  ctx.waitUntil(
    logAudit(env, actor.id, 'guide_sections.create', id, { guideId }),
  );
  return json({ data: { id } }, 201);
}

async function handleGuideSection(request, env, parts, ctx) {
  const actor = await requireContentPermission(
    request,
    env,
    'guides',
    request.method === 'DELETE' ? 'delete' : 'edit',
  );
  const id = parts[1];
  if (!id) {
    return json({ error: 'Нужен id секции' }, 400);
  }

  if (request.method === 'PATCH') {
    const body = await readJson(request);
    const section = await env.DB.prepare(
      'SELECT id FROM guide_sections WHERE id = ?',
    )
      .bind(id)
      .first();
    if (!section) {
      return json({ error: 'Секция не найдена' }, 404);
    }
    const title =
      body.title === undefined ? null : cleanString(body.title, 1, 120);
    const type = body.type === undefined ? null : cleanString(body.type, 1, 40);
    const content =
      body.content === undefined
        ? null
        : cleanString(body.content, 0, 60000, true);
    await env.DB.prepare(
      'UPDATE guide_sections SET title = COALESCE(?, title), section_type = COALESCE(?, section_type), content_markdown = COALESCE(?, content_markdown), updated_at = current_timestamp WHERE id = ?',
    )
      .bind(title, type, content, id)
      .run();
    ctx.waitUntil(logAudit(env, actor.id, 'guide_sections.update', id, body));
    return json({ data: { success: true } });
  }

  if (request.method === 'DELETE') {
    const section = await env.DB.prepare(
      'SELECT id FROM guide_sections WHERE id = ?',
    )
      .bind(id)
      .first();
    if (!section) {
      return json({ error: 'Секция не найдена' }, 404);
    }
    await env.DB.prepare('DELETE FROM guide_sections WHERE id = ?')
      .bind(id)
      .run();
    ctx.waitUntil(logAudit(env, actor.id, 'guide_sections.delete', id, {}));
    return json({ data: { success: true } });
  }

  return json({ error: 'Метод не поддерживается' }, 405);
}

async function reorderGuideSections(request, env, guideId, ctx) {
  const actor = await requireContentPermission(request, env, 'guides', 'edit');
  const body = await readJson(request);
  const ids = Array.isArray(body.sectionIds) ? body.sectionIds : [];

  if (ids.length === 0) {
    return json({ error: 'sectionIds должен быть массивом' }, 400);
  }

  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string')
  ) {
    return json(
      { error: 'sectionIds должен содержать уникальные строковые id' },
      400,
    );
  }

  const existing = await env.DB.prepare(
    'SELECT id FROM guide_sections WHERE guide_id = ?',
  )
    .bind(guideId)
    .all();
  const existingIds = new Set(existing.results.map((row) => row.id));
  if (
    ids.some((id) => !existingIds.has(id)) ||
    ids.length !== existingIds.size
  ) {
    return json({ error: 'Передайте полный список секций этого гайда' }, 400);
  }

  await env.DB.batch(
    ids.map((id, index) =>
      env.DB.prepare(
        'UPDATE guide_sections SET position = ?, updated_at = current_timestamp WHERE guide_id = ? AND id = ?',
      ).bind(index + 1, guideId, id),
    ),
  );

  ctx.waitUntil(
    logAudit(env, actor.id, 'guide_sections.reorder', guideId, {
      sectionIds: ids,
    }),
  );
  return json({ data: { success: true } });
}

async function handleComments(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const targetType = url.searchParams.get('targetType');
    const targetId = url.searchParams.get('targetId');
    if (!targetType || !targetId) {
      await requireRole(request, env, 'moderator');
      const rows = await env.DB.prepare(
        `SELECT comments.*, users.display_name AS author_name
         FROM comments
         LEFT JOIN users ON users.id = comments.user_id
         ORDER BY comments.created_at DESC
         LIMIT 200`,
      ).all();
      return json({ data: rows.results.map(serializeComment) });
    }
    const orderBy =
      url.searchParams.get('sort') === 'popular'
        ? 'comments.score DESC, comments.created_at DESC'
        : 'comments.created_at DESC';
    const rows = await env.DB.prepare(
      `SELECT comments.*, users.display_name AS author_name
       FROM comments
       LEFT JOIN users ON users.id = comments.user_id
       WHERE target_type = ?
         AND target_id = ?
         AND comments.status = 'visible'
         AND (
           comments.parent_id IS NULL
           OR EXISTS (
             SELECT 1 FROM comments AS parent
             WHERE parent.id = comments.parent_id AND parent.status = 'visible'
           )
         )
       ORDER BY ${orderBy}`,
    )
      .bind(targetType, targetId)
      .all();
    return json({ data: rows.results.map(serializeComment) });
  }

  if (request.method === 'POST') {
    await rateLimit(request, env, 'comment', 20, 60 * 60);
    const actor = await requireRole(request, env, 'user');
    const body = await readJson(request);
    const targetType = cleanString(body.targetType, 1, 30);
    if (
      !['guide', 'character', 'news', 'leak', 'site', 'thread'].includes(
        targetType,
      )
    ) {
      return json({ error: 'Неизвестный тип объекта комментария' }, 400);
    }
    const targetId = cleanString(body.targetId, 1, 80);
    if (!(await interactionTargetExists(env, targetType, targetId))) {
      return json({ error: 'Объект для комментария не найден' }, 404);
    }
    const parentId = body.parentId ? cleanString(body.parentId, 1, 80) : null;
    if (parentId) {
      const parent = await env.DB.prepare(
        `SELECT id FROM comments
         WHERE id = ? AND target_type = ? AND target_id = ? AND status = 'visible'`,
      )
        .bind(parentId, targetType, targetId)
        .first();
      if (!parent) {
        return json({ error: 'Родительский комментарий не найден' }, 400);
      }
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO comments (id, target_type, target_id, parent_id, user_id, body_markdown)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        targetType,
        targetId,
        parentId,
        actor.id,
        cleanString(body.body, 1, 4000),
      )
      .run();
    ctx.waitUntil(
      logAudit(env, actor.id, 'comments.create', id, {
        targetType,
        targetId,
        parentId,
      }),
    );
    return json(
      {
        data: {
          id,
          userId: actor.id,
          targetType,
          targetId,
          parentId: parentId || undefined,
          author: actor.displayName,
          body: String(body.body).trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          score: 0,
          status: 'visible',
        },
      },
      201,
    );
  }

  const match = new URL(request.url).pathname.match(/\/api\/comments\/([^/]+)/);
  if (!match) {
    return json({ error: 'Нужен id комментария' }, 400);
  }

  const actor = await requireRole(request, env, 'user');
  const comment = await env.DB.prepare('SELECT * FROM comments WHERE id = ?')
    .bind(match[1])
    .first();
  if (!comment) {
    return json({ error: 'Комментарий не найден' }, 404);
  }
  const canModerate = ROLE_WEIGHT[actor.role] >= ROLE_WEIGHT.moderator;
  const ownsComment = comment.user_id === actor.id;

  if (!canModerate && !ownsComment) {
    return json({ error: 'Недостаточно прав' }, 403);
  }

  if (request.method === 'PATCH') {
    const body = await readJson(request);
    const updates = [];
    const values = [];

    if (body.body !== undefined) {
      updates.push('body_markdown = ?');
      values.push(cleanString(body.body, 1, 4000));
    }

    if (body.status !== undefined) {
      if (!canModerate) {
        return json({ error: 'Изменять статус может только модератор' }, 403);
      }
      const status = String(body.status);
      if (!['visible', 'moderated', 'deleted'].includes(status)) {
        return json({ error: 'Неизвестный статус комментария' }, 400);
      }
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return json({ error: 'Нет полей для обновления' }, 400);
    }

    await env.DB.prepare(
      `UPDATE comments
       SET ${updates.join(', ')}, updated_at = current_timestamp
       WHERE id = ?`,
    )
      .bind(...values, match[1])
      .run();
    ctx.waitUntil(
      logAudit(env, actor.id, 'comments.update', match[1], {
        status: body.status,
      }),
    );
    return json({ data: { success: true } });
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('UPDATE comments SET status = ? WHERE id = ?')
      .bind(canModerate ? 'moderated' : 'deleted', match[1])
      .run();
    ctx.waitUntil(logAudit(env, actor.id, 'comments.delete', match[1], {}));
    return json({ data: { success: true } });
  }

  return json({ error: 'Метод не поддерживается' }, 405);
}

async function handleThreads(request, env, parts, ctx) {
  const idOrSlug = parts[1];
  if (request.method === 'GET') {
    const includeHidden =
      ROLE_WEIGHT[(await getAuthUser(request, env))?.role] >= ROLE_WEIGHT.moderator;
    const data = idOrSlug
      ? await getThread(env, idOrSlug, includeHidden)
      : await listThreads(env, includeHidden);
    if (idOrSlug && !data) {
      return json({ error: 'Тред не найден' }, 404);
    }
    return json({ data });
  }

  const actor = await requireRole(request, env, 'user');
  if (request.method === 'POST') {
    await rateLimit(request, env, 'thread', 10, 60 * 60);
    const body = await readJson(request);
    const id = crypto.randomUUID();
    const title = cleanString(body.title, 5, 120);
    const summary = cleanString(body.summary || title, 0, 240);
    const markdown = cleanString(body.body || body.bodyMarkdown, 10, 20000);
    const tags = Array.isArray(body.tags) ? body.tags.slice(0, 12) : [];
    const slug = slugify(String(body.slug || title));
    await env.DB.prepare(
      `INSERT INTO community_threads
       (id, slug, title, summary, body_markdown, author_id, author_name, status, tags_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
      .bind(
        id,
        slug,
        title,
        summary,
        markdown,
        actor.id,
        actor.displayName,
        JSON.stringify(tags),
      )
      .run();
    ctx.waitUntil(logAudit(env, actor.id, 'threads.create', id, { slug }));
    return json({ data: await getThread(env, id, true) }, 201);
  }

  const thread = await env.DB.prepare(
    'SELECT * FROM community_threads WHERE id = ? OR slug = ?',
  )
    .bind(idOrSlug, idOrSlug)
    .first();
  if (!thread) return json({ error: 'Тред не найден' }, 404);
  const canModerate = ROLE_WEIGHT[actor.role] >= ROLE_WEIGHT.moderator;
  const ownsThread = thread.author_id === actor.id;
  if (!canModerate && !ownsThread) {
    return json({ error: 'Недостаточно прав' }, 403);
  }

  if (request.method === 'PATCH') {
    const body = await readJson(request);
    const updates = [];
    const values = [];
    const setString = (column, value, min, max) => {
      if (value === undefined) return;
      updates.push(`${column} = ?`);
      values.push(cleanString(value, min, max));
    };
    setString('title', body.title, 5, 120);
    setString('summary', body.summary, 0, 240);
    setString('body_markdown', body.body || body.bodyMarkdown, 10, 20000);
    if (Array.isArray(body.tags)) {
      updates.push('tags_json = ?');
      values.push(JSON.stringify(body.tags.slice(0, 12)));
    }
    if (canModerate && body.status) {
      const status = cleanString(body.status, 1, 20);
      if (!['open', 'closed', 'hidden'].includes(status)) {
        return json({ error: 'Неизвестный статус треда' }, 400);
      }
      updates.push('status = ?');
      values.push(status);
    }
    if (!updates.length) {
      return json({ error: 'Нет изменений для сохранения' }, 400);
    }
    updates.push('updated_at = current_timestamp');
    await env.DB.prepare(
      `UPDATE community_threads SET ${updates.join(', ')} WHERE id = ?`,
    )
      .bind(...values, thread.id)
      .run();
    ctx.waitUntil(logAudit(env, actor.id, 'threads.update', thread.id, body));
    return json({ data: await getThread(env, thread.id, true) });
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare(
      "UPDATE community_threads SET status = 'hidden', updated_at = current_timestamp WHERE id = ?",
    )
      .bind(thread.id)
      .run();
    ctx.waitUntil(logAudit(env, actor.id, 'threads.hide', thread.id, {}));
    return json({ data: { success: true } });
  }

  return json({ error: 'Метод не поддерживается' }, 405);
}

async function handleReactions(request, env, parts, ctx) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const targetType = cleanString(url.searchParams.get('targetType'), 1, 30);
    const targetId = cleanString(url.searchParams.get('targetId'), 1, 80);
    const rows = await env.DB.prepare(
      `SELECT reaction_type, SUM(value) AS total
       FROM reactions
       WHERE target_type = ? AND target_id = ?
       GROUP BY reaction_type`,
    )
      .bind(targetType, targetId)
      .all();
    const summary = { likes: 0, dislikes: 0, useful: 0 };
    for (const row of rows.results) {
      if (row.reaction_type === 'like') summary.likes = Number(row.total || 0);
      if (row.reaction_type === 'dislike')
        summary.dislikes = Number(row.total || 0);
      if (row.reaction_type === 'useful')
        summary.useful = Number(row.total || 0);
    }
    return json({ data: summary });
  }

  const actor = await requireRole(request, env, 'user');

  if (request.method === 'POST') {
    await rateLimit(request, env, 'reaction', 120, 60 * 60);
    const body = await readJson(request);
    const targetType = cleanString(body.targetType, 1, 30);
    const targetId = cleanString(body.targetId, 1, 80);
    if (
      !['guide', 'news', 'leak', 'comment', 'site', 'thread'].includes(
        targetType,
      )
    ) {
      return json({ error: 'Неизвестный тип объекта реакции' }, 400);
    }
    if (!(await interactionTargetExists(env, targetType, targetId))) {
      return json({ error: 'Объект для реакции не найден' }, 404);
    }
    const reactionType = cleanString(body.reactionType || 'useful', 1, 30);
    if (!['like', 'dislike', 'useful'].includes(reactionType)) {
      return json({ error: 'Неизвестный тип реакции' }, 400);
    }
    if (reactionType === 'like' || reactionType === 'dislike') {
      await env.DB.prepare(
        `DELETE FROM reactions
         WHERE user_id = ? AND target_type = ? AND target_id = ? AND reaction_type IN ('like', 'dislike')`,
      )
        .bind(actor.id, targetType, targetId)
        .run();
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO reactions (id, user_id, target_type, target_id, reaction_type, value)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, target_type, target_id, reaction_type)
       DO UPDATE SET value = excluded.value, created_at = current_timestamp`,
    )
      .bind(id, actor.id, targetType, targetId, reactionType, 1)
      .run();
    if (targetType === 'comment' && reactionType === 'useful') {
      await refreshCommentScore(env, targetId);
    }
    ctx.waitUntil(
      logAudit(env, actor.id, 'reactions.upsert', body.targetId, body),
    );
    return handleReactions(
      new globalThis.Request(
        `${new URL(request.url).origin}/api/reactions?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
      ),
      env,
      [],
      ctx,
    );
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const targetType = url.searchParams.get('targetType');
    const targetId = url.searchParams.get('targetId');
    const reactionType = url.searchParams.get('reactionType');
    if (parts[1]) {
      await env.DB.prepare('DELETE FROM reactions WHERE id = ? AND user_id = ?')
        .bind(parts[1], actor.id)
        .run();
    } else if (
      targetType &&
      targetId &&
      ['like', 'dislike', 'useful'].includes(reactionType || '')
    ) {
      await env.DB.prepare(
        `DELETE FROM reactions
         WHERE user_id = ? AND target_type = ? AND target_id = ? AND reaction_type = ?`,
      )
        .bind(actor.id, targetType, targetId, reactionType)
        .run();
      if (targetType === 'comment' && reactionType === 'useful') {
        await refreshCommentScore(env, targetId);
      }
    } else {
      return json({ error: 'Нужны параметры удаляемой реакции' }, 400);
    }
    ctx.waitUntil(
      logAudit(env, actor.id, 'reactions.delete', targetId || parts[1], {
        targetType,
        reactionType,
      }),
    );
    return json({ data: { success: true } });
  }

  return json({ error: 'Метод не поддерживается' }, 405);
}

async function interactionTargetExists(env, targetType, targetId) {
  if (targetType === 'site') {
    return targetId === 'community';
  }

  const targets = {
    guide: ['guides', "status = 'published'"],
    character: ['characters', "status = 'published'"],
    news: ['news', "status = 'published'"],
    leak: ['leaks', 'approved = 1'],
    comment: ['comments', "status = 'visible'"],
    thread: ['community_threads', "status <> 'hidden'"],
  };
  const target = targets[targetType];
  if (!target) return false;
  const row = await env.DB.prepare(
    `SELECT id FROM ${target[0]} WHERE id = ? AND ${target[1]}`,
  )
    .bind(targetId)
    .first();
  return Boolean(row);
}

async function refreshCommentScore(env, commentId) {
  await env.DB.prepare(
    `UPDATE comments
     SET score = (
       SELECT COALESCE(SUM(value), 0)
       FROM reactions
       WHERE target_type = 'comment'
         AND target_id = comments.id
         AND reaction_type = 'useful'
     )
     WHERE id = ?`,
  )
    .bind(commentId)
    .run();
}

const IMPORT_SOURCE_TIMEOUT_MS = 7000;
const IMPORT_MAX_HTML_BYTES = 600000;
const IMPORT_FETCH_CONCURRENCY = 4;
const IMPORT_MEDIA_LOOKUP_LIMIT = 6;
const IMPORT_AUTO_SOURCE_LIMIT = 14;
const IMPORT_SOURCE_PRIORITY = new Map([
  ['official-ru', 100],
  ['fandom-ru-api', 98],
  ['ntewiki-ru', 96],
  ['gamewith-detail-ru', 94],
  ['interactivemap-profile-ru', 92],
  ['neverness-app-profile', 90],
  ['genshin-builds-ru', 88],
  ['fandom-ru-images-api', 86],
  ['fandom-ru-media-library', 84],
  ['game8-skins', 82],
  ['game8-voice', 80],
  ['btva-en', 78],
  ['dubbing-wiki', 76],
  ['fandom-character', 74],
]);

function selectImportSources(sources) {
  const trustWeight = { official: 4, high: 3, medium: 2, low: 1 };
  const automatic = sources
    .filter((source) => !source.referenceOnly)
    .map((source, index) => ({ source, index }))
    .sort(
      (left, right) =>
        (IMPORT_SOURCE_PRIORITY.get(right.source.id) || 0) -
          (IMPORT_SOURCE_PRIORITY.get(left.source.id) || 0) ||
        (trustWeight[right.source.trust] || 0) -
          (trustWeight[left.source.trust] || 0) ||
        left.index - right.index,
    )
    .slice(0, IMPORT_AUTO_SOURCE_LIMIT)
    .map(({ source }) => source);
  const references = sources.filter((source) => source.referenceOnly);
  return [...automatic, ...references];
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await callback(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function htmlToPlainText(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div|section|article|tr|td|th)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

function compactImportLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractYoutubeUrls(text) {
  const seen = new Set();
  return Array.from(
    String(text || '').matchAll(
      /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^"' <>\n]*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})[^"' <>\n]*/gi,
    ),
  )
    .map((match) => `https://www.youtube.com/watch?v=${match[1]}`)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function nextImportLine(lines, label) {
  const index = lines.findIndex(
    (line) => line.toLocaleLowerCase('ru-RU') === label.toLocaleLowerCase('ru-RU'),
  );
  return index >= 0 ? lines[index + 1] || '' : '';
}

function normalizeImportArcType(value) {
  const normalized = normalizeImportSearch(value);
  if (!normalized) return '';
  if (
    [
      'camellia',
      'сообщество камелии',
      'бозе',
      'boze',
      'arc',
      'арка',
      'арк',
      'best arc',
      'preferred arc',
      'arcana',
      'дуги для',
      'лучшие дуги',
    ].some((item) => normalized.includes(normalizeImportSearch(item)))
  ) {
    return '';
  }
  const direct = [
    ['重合', 'Гибридный'],
    ['гибрид', 'Гибридный'],
    ['hybrid', 'Гибридный'],
    ['cluster', 'Гибридный'],
    ['固', 'Твёрдый'],
    ['тверд', 'Твёрдый'],
    ['solid', 'Твёрдый'],
    ['液', 'Жидкий'],
    ['жидк', 'Жидкий'],
    ['liquid', 'Жидкий'],
    ['気', 'Газовый'],
    ['газ', 'Газовый'],
    ['gas', 'Газовый'],
    ['プラズマ', 'Плазменный'],
    ['плазм', 'Плазменный'],
    ['plasma', 'Плазменный'],
    ['凝縮', 'Конденсат'],
    ['конденсат', 'Конденсат'],
    ['condensate', 'Конденсат'],
  ].find(([key]) => normalized.includes(key));
  return direct?.[1] || '';
}

function normalizeImportElement(value) {
  const normalized = normalizeImportSearch(value);
  if (!normalized) return '';
  if (
    [
      'бозе',
      'boze',
      'arc',
      'arcana',
      'арка',
      'арк',
      'дуга',
      'лучшие дуги',
      'сообщество камелии',
      'camellia',
      'best arc',
      'preferred arc',
    ].some((item) => normalized.includes(normalizeImportSearch(item)))
  ) {
    return '';
  }
  const localized = [
    ['呪', 'Чары'],
    ['混沌', 'Хаос'],
    ['精神', 'Психика'],
    ['魂', 'Анима'],
    ['相', 'Лакшана'],
  ].find(([key]) => String(value || '').includes(key));
  if (localized) return localized[1];
  const translated = [
    ['incantation', 'Чары'],
    ['spell', 'Чары'],
    ['chaos', 'Хаос'],
    ['psyche', 'Психика'],
    ['psychic', 'Психика'],
    ['spirit', 'Психика'],
    ['anima', 'Анима'],
    ['cosmos', 'Космос'],
    ['cosmic', 'Космос'],
    ['lakshana', 'Лакшана'],
  ].find(([key]) => normalized.includes(key));
  if (translated) return translated[1];
  const direct = ['Чары', 'Хаос', 'Психика', 'Анима', 'Космос', 'Лакшана'].find(
    (item) => normalized.includes(normalizeImportSearch(item)),
  );
  return direct || translateEsperType(value);
}

function normalizeImportFaction(value) {
  const text = normalizeImportedRuText(value);
  const normalized = normalizeImportSearch(text);
  if (normalized.includes('тои 4') && normalized.includes('бюро')) {
    return 'Бюро по борьбе с аномалиями, ТОИ-4';
  }
  return text;
}

function normalizeProfileImportValue(field, value) {
  if (typeof value !== 'string') return value;
  if (field === 'attribute') return normalizeImportElement(value);
  if (field === 'profile.arcType') return normalizeImportArcType(value);
  if (field === 'profile.faction') return normalizeImportFaction(value);
  if (
    (field === 'profile.biography' || field === 'profile.biographyShort') &&
    isSeoImportText(value)
  ) {
    return '';
  }
  return normalizeImportedRuText(value);
}

function makeImportSuggestion(field, label, value, source, confidence = 'medium', note = '') {
  const normalizedInput = normalizeProfileImportValue(field, value);
  const normalizedValue =
    typeof normalizedInput === 'string' && /(?:image|splash|icon)url/i.test(field)
      ? normalizeExternalImageUrl(normalizedInput)
      : normalizedInput;
  const cleanValue =
    typeof normalizedValue === 'string'
      ? normalizedValue.trim()
      : JSON.stringify(normalizedValue);
  if (!cleanValue || cleanValue === '[]' || cleanValue === '{}') return null;
  const canonicalLabel =
    {
      attribute: 'Атрибут',
      imageUrl: 'Карточка персонажа',
      splashUrl: 'Splash персонажа',
      'profile.arcType': 'Тип дуги',
      'profile.voiceActors': 'Актёры озвучки',
      'profile.voiceLines': 'Реплики озвучки',
      'profile.roleTags': 'Роли персонажа',
    }[field] || label;
  return {
    id: `${source.id}:${field}:${hashText(cleanValue).slice(0, 10)}`,
    field,
    label: canonicalLabel,
    value: cleanValue,
    sourceName: source.name,
    sourceUrl: source.url,
    confidence,
    note,
  };
}

function normalizeExternalImageUrl(value) {
  const url = String(value || '').trim().replace(/&amp;/g, '&');
  if (!url) return '';
  if (/^https:\/\/static\.wikia\.nocookie\.net\//i.test(url)) {
    try {
      const parsed = new URL(url);
      parsed.pathname = parsed.pathname.replace(
        /\/revision\/latest(?:\/(?:scale-to-width-down|smart|thumbnail|width)\/[^/?#]+|\/[^/?#]+)?$/i,
        '/revision/latest',
      );
      parsed.searchParams.delete('cb');
      return parsed.toString();
    } catch {
      return url;
    }
  }
  if (url.startsWith('/nte/')) return `https://gamewith.ai${url}`;
  return url;
}

function hashText(value) {
  let hash = 5381;
  for (const char of String(value)) hash = (hash * 33) ^ char.charCodeAt(0);
  return Math.abs(hash >>> 0).toString(36);
}

function normalizeImportSlug(value) {
  return transliterateRuToLatin(String(value || ''))
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function transliterateRuToLatin(value) {
  const map = {
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
    ы: 'y',
    э: 'e',
    ю: 'yu',
    я: 'ya',
    ъ: '',
    ь: '',
  };
  return String(value).replace(/[А-Яа-яЁё]/g, (letter) => {
    const lower = letter.toLocaleLowerCase('ru-RU');
    const transliterated = map[lower] ?? letter;
    return letter === lower ? transliterated : transliterated.toUpperCase();
  });
}

function normalizeImportSearch(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function characterNameCandidates(character) {
  return Array.from(
    new Set(
      [character.name, character.originalName, character.slug]
        .map((value) => normalizeImportSearch(value))
        .filter(Boolean),
    ),
  );
}

function lineMatchesCharacter(line, character) {
  const normalizedLine = normalizeImportSearch(line);
  return characterNameCandidates(character).some((candidate) =>
    normalizedLine.includes(candidate),
  );
}

function nevernessAppCharacterCode(character) {
  const codes = new Map([
    ['adler', 'adler'],
    ['aurelia', 'mitsuki'],
    ['baicang', 'cang'],
    ['chaos', 'chaos'],
    ['chiz', 'chiichan'],
    ['daffodill', 'daffodill'],
    ['edgar', 'edgar'],
    ['esper-zero', 'zero'],
    ['fadia', 'fadia'],
    ['haniel', 'haniel'],
    ['hathor', 'hathor'],
    ['hotori', 'jin'],
    ['jiuyuan', 'kuhara'],
    ['lacrimosa', 'lacrimosa'],
    ['mint', 'mint'],
    ['nanally', 'nanally'],
    ['sakiri', 'sagiri'],
    ['shinku', 'shinku'],
    ['skia', 'skia'],
    ['zero', 'zero'],
  ]);
  const candidates = [character.slug, character.originalName, character.name]
    .map((value) => normalizeImportSlug(value))
    .filter(Boolean);
  return candidates.map((candidate) => codes.get(candidate)).find(Boolean) || '';
}

function interactiveMapEsperId(character) {
  const ids = new Map([
    ['adler', '1033'],
    ['mitsuki', '1070'],
    ['cang', '1023'],
    ['chaos', '1071'],
    ['chiichan', '1073'],
    ['daffodill', '1054'],
    ['edgar', '1021'],
    ['fadia', '1039'],
    ['haniel', '1020'],
    ['hathor', '1025'],
    ['jin', '1052'],
    ['kuhara', '1055'],
    ['lacrimosa', '1004'],
    ['mint', '1019'],
    ['nanally', '1010'],
    ['sagiri', '1003'],
    ['shinku', '1076'],
    ['skia', '1008'],
    ['zero', '1046'],
  ]);
  return ids.get(nevernessAppCharacterCode(character)) || '';
}

function characterImportSources(slug, character = {}) {
  const fandomTitle = encodeURIComponent(
    String(character.originalName || character.name || slug || '')
      .trim()
      .replace(/\s+/g, '_') || slug,
  );
  const fandomRuTitle = encodeURIComponent(
    String(character.name || character.originalName || slug || '')
      .trim()
      .replace(/\s+/g, '_') || slug,
  );
  const fandomRuImagePrefix = encodeURIComponent(
    String(character.name || character.originalName || slug || '').trim() || slug,
  );
  const nevernessCode = nevernessAppCharacterCode({ ...character, slug });
  const interactiveMapId = interactiveMapEsperId({ ...character, slug });

  return [
    {
      id: 'fandom-ru-api',
      name: 'Fandom RU: профиль персонажа',
      trust: 'high',
      url: `https://neverness-to-everness.fandom.com/ru/api.php?action=query&prop=revisions|pageimages|categories&rvprop=content&rvslots=main&piprop=original&cllimit=100&format=json&formatversion=2&titles=${fandomRuTitle}&origin=*`,
      parser: parseFandomRuApiImport,
      raw: true,
    },
    {
      id: 'fandom-ru-images-api',
      name: 'Fandom RU: изображения',
      trust: 'high',
      url: `https://neverness-to-everness.fandom.com/ru/api.php?action=query&generator=images&gimlimit=50&prop=imageinfo&iiprop=url|mime|size&format=json&formatversion=2&titles=${fandomRuTitle}&origin=*`,
      parser: parseFandomRuImagesImport,
      raw: true,
    },
    {
      id: 'fandom-ru-media-library',
      name: 'Fandom RU: медиатека персонажа',
      trust: 'high',
      url: `https://neverness-to-everness.fandom.com/ru/api.php?action=query&list=allimages&aifrom=${fandomRuImagePrefix}&ailimit=50&aiprop=url|mime|size|dimensions&format=json&formatversion=2&origin=*`,
      parser: parseFandomRuAllImagesImport,
      raw: true,
    },
    {
      id: 'gamewith-detail-ru',
      name: 'GameWith NTE RU: страница персонажа',
      trust: 'high',
      url: `https://gamewith.ai/nte/ru/character/${slug}`,
      parser: parseGameWithCharacterDetailImport,
      extractImages: true,
      raw: true,
    },
    {
      id: 'game8-skins',
      name: 'Game8: гардероб персонажей',
      trust: 'medium',
      url: 'https://game8.co/games/Neverness-to-Everness/archives/598619',
      parser: parseGame8SkinsImport,
      raw: true,
    },
    nevernessCode
      ? {
          id: 'neverness-app-profile',
          name: 'Neverness Codex: симпатия, подарки и гардероб',
          trust: 'medium',
          url: `https://www.neverness.app/codex/characters/${nevernessCode}`,
          parser: parseNevernessAppProfileImport,
          raw: true,
        }
      : null,
    interactiveMapId
      ? {
          id: 'interactivemap-profile-ru',
          name: 'InteractiveMap RU: профиль, навыки и симпатия',
          trust: 'high',
          url: `https://interactivemap.app/neverness-to-everness/database/ru/espers/esper-${interactiveMapId}/`,
          parser: parseInteractiveMapRuImport,
          raw: true,
        }
      : null,
    {
      id: 'playground-affinity-reference-ru',
      name: 'Playground RU: лучшие подарки персонажей',
      trust: 'medium',
      url: 'https://www.playground.ru/neverness_to_everness/guide/lyubov_i_podarki_v_nte_est_li_nastoyaschaya_romantika_v_igre-1842798',
      referenceOnly: true,
      referenceMessage:
        'Русскоязычный справочник используется для сверки названий лучших подарков. Очки, стоимость и изображения берутся из Neverness Codex; каждую строку подтверждает редактор.',
    },
    {
      id: 'zeroluck-voice-reference',
      name: 'ZeroLuck: каталог реплик',
      trust: 'medium',
      url: `https://zeroluck.gg/nte/characters/${slug}/`,
      referenceOnly: true,
      referenceMessage:
        'Источник содержит текст и внутренние audio-event ID, но не прямые аудиофайлы и не русскую локализацию. Автозаполнение реплик отключено, чтобы не публиковать английский текст как русский.',
    },
    {
      id: 'ntewiki-ru',
      name: 'NTE Wiki RU',
      trust: 'high',
      url: `https://ntewiki.org/ru/characters/${slug}/`,
      parser: parseNteWikiImport,
      extractImages: true,
    },
    {
      id: 'ntewiki-characters-index',
      name: 'NTE Wiki RU: персонажи',
      trust: 'high',
      url: 'https://ntewiki.org/ru/characters/',
      parser: parseNteWikiCharactersIndexImport,
    },
    {
      id: 'ntewiki-arcs-ru',
      name: 'NTE Wiki RU: дуги',
      trust: 'high',
      url: 'https://ntewiki.org/ru/arcs/',
      referenceOnly: true,
    },
    {
      id: 'genshin-builds-ru',
      name: 'GenshinBuilds NTE RU',
      trust: 'high',
      url: `https://genshin-builds.com/ru/neverness-to-everness/characters/${slug}`,
      parser: parseGenshinBuildsImport,
      extractImages: true,
    },
    {
      id: 'icy-veins-tier',
      name: 'Icy Veins tier list',
      trust: 'medium',
      url: 'https://www.icy-veins.com/neverness-to-everness/tier-list',
      parser: parseIcyVeinsTierImport,
    },
    {
      id: 'game8-voice',
      name: 'Game8 voice actors',
      trust: 'medium',
      url: 'https://game8.co/games/Neverness-to-Everness/archives/597746',
      parser: parseGame8VoiceImport,
    },
    {
      id: 'gamewith-ru',
      name: 'GameWith NTE RU',
      trust: 'medium',
      url: 'https://gamewith.ai/nte/ru/character',
      parser: parseGameWithCharacterImport,
    },
    {
      id: 'gamewith-home-ru',
      name: 'GameWith NTE RU: база',
      trust: 'medium',
      url: 'https://gamewith.ai/nte/ru',
      referenceOnly: true,
    },
    {
      id: 'neverness-gg-characters',
      name: 'Neverness.gg characters',
      trust: 'medium',
      url: 'https://neverness.gg/neverness-to-everness-characters/',
      referenceOnly: true,
    },
    {
      id: 'neverness-gg-materials',
      name: 'Neverness.gg materials',
      trust: 'medium',
      url: 'https://neverness.gg/materials/',
      referenceOnly: true,
    },
    {
      id: 'fandom-ru-characters',
      name: 'Fandom RU: персонажи',
      trust: 'low',
      url: 'https://neverness-to-everness.fandom.com/ru/wiki/%D0%9F%D0%B5%D1%80%D1%81%D0%BE%D0%BD%D0%B0%D0%B6%D0%B8',
      referenceOnly: true,
    },
    {
      id: 'fandom-character',
      name: 'Fandom character profile',
      trust: 'medium',
      url: `https://neverness-to-everness.fandom.com/wiki/${fandomTitle}`,
      parser: parseFandomCharacterImport,
      extractImages: true,
    },
    {
      id: 'btva-en',
      name: 'Behind The Voice Actors',
      trust: 'medium',
      url: 'https://www.behindthevoiceactors.com/video-games/Neverness-to-Everness/',
      parser: parseBtvaImport,
    },
    {
      id: 'dubbing-wiki',
      name: 'Dubbing Wiki',
      trust: 'medium',
      url: 'https://dubbing.fandom.com/wiki/Neverness_to_Everness',
      parser: parseDubbingWikiVoiceImport,
    },
    {
      id: 'kaiden-tier',
      name: 'Kaiden.gg tier list',
      trust: 'medium',
      url: 'https://www.kaiden.gg/nte/characters/tier-list/',
      parser: parseKaidenTierImport,
    },
    {
      id: 'official-ru',
      name: 'Официальный сайт NTE RU',
      trust: 'official',
      url: 'https://nte.perfectworld.com/ru/main.html?nav=2',
      parser: parseOfficialImport,
    },
  ].filter(Boolean);
}

function guideImportSources(slug, character = {}) {
  return [
    {
      id: 'genshin-builds-guide-ru',
      name: 'GenshinBuilds NTE RU: гайд',
      trust: 'medium',
      url: `https://genshin-builds.com/ru/neverness-to-everness/characters/${slug}`,
      parser: parseEditorialGuideImport,
      extractImages: true,
      raw: true,
    },
    {
      id: 'gamewith-guide-ru',
      name: 'GameWith NTE RU: гайд',
      trust: 'medium',
      url: `https://gamewith.ai/nte/ru/character/${slug}`,
      parser: parseGameWithGuideImport,
      extractImages: true,
      raw: true,
    },
    {
      id: 'ntewiki-build-guide-ru',
      name: 'NTE Wiki RU: билд-гайд',
      trust: 'high',
      url: `https://ntewiki.org/ru/blog/${slug}-build-guide-2026/`,
      parser: parseEditorialGuideImport,
      extractImages: true,
      raw: true,
    },
  ].map((source) => ({ ...source, character }));
}

function buildKnownAffinitySource(character) {
  const code = nevernessAppCharacterCode(character);
  if (!code) return null;
  const source = {
    id: 'verified-affinity-fallback',
    name: 'Проверенная сводка симпатии NTE',
    trust: 'medium',
    url: `https://www.neverness.app/codex/characters/${code}`,
  };
  const levelRequirements = [100, 500, 1000, 2000, 3500, 5000, 7000, 9000, 12000, 16000];
  const friendship = levelRequirements.map((points, index) => ({
    level: index + 1,
    rewardName: '',
    rewardIconUrl: '',
    description: `Для достижения уровня ${index + 1} требуется ${points.toLocaleString('ru-RU')} очков симпатии. Награда за уровень в проверенном источнике не указана.`,
  }));
  const suggestions = [
    makeImportSuggestion(
      'profile.friendship',
      'Симпатия 1–10',
      friendship,
      source,
      'high',
      'Подтверждены только числовые требования уровней. Поля наград намеренно оставлены пустыми.',
    ),
  ];

  if (code === 'jin') {
    const gifts = [
      ['SpecialGift_letter', 2000, 'награда за задание'],
      ['Furniture_Ornament_002', 400, '15 000 фонов'],
      ['SpecialGift_ticket', 400, 'не продаётся за фоны'],
      ['Flower0000', 200, '7 500 фонов'],
      ['Furniture_FlowerPot_001', 200, '3 600 фонов'],
      ['Food_038', 100, '300 фонов'],
      ['Food_098', 100, '750 фонов'],
      ['Food_103', 100, 'не продаётся за фоны'],
    ].map(([itemId, points, acquisition]) => ({
      id: itemId,
      name: knownGiftLocalizations.get(itemId),
      iconUrl: `https://www.neverness.app/assets/codex/likeability/${itemId}.webp`,
      effect: `+${Number(points).toLocaleString('ru-RU')} очков симпатии · ${acquisition}`,
    }));
    const outfitIds = ['Fashion_1052_0', 'Fashion_1052_3', 'Fashion_1052_2'];
    const outfitFolders = new Map([
      ['Fashion_1052_0', 'YH_UI_shizhuang_big_xun'],
      ['Fashion_1052_2', 'YH_UI_shizhuang_big_xun2'],
      ['Fashion_1052_3', 'YH_UI_shizhuang_big_xun3'],
    ]);
    const skins = outfitIds.map((outfitId) => ({
      id: outfitId,
      ...knownOutfitLocalizations.get(outfitId),
      imageUrl: `https://www.neverness.app/assets/codex/outfits/${outfitFolders.get(outfitId)}/splash.webp`,
    }));
    suggestions.push(
      makeImportSuggestion(
        'profile.gifts',
        'Любимые подарки Хотори',
        gifts,
        source,
        'high',
        'Сверены очки симпатии, стоимость и прямые иконки. Каждая строка всё равно требует подтверждения редактором.',
      ),
      makeImportSuggestion(
        'profile.skins',
        'Гардероб Хотори',
        skins,
        source,
        'medium',
        'Прямые изображения проверены; русские названия являются рабочим переводом до сверки с клиентом игры.',
      ),
    );
  }

  return {
    ...source,
    status: 'ok',
    message:
      code === 'jin'
        ? 'Доступны требования симпатии, подарки и гардероб Хотори.'
        : 'Доступны проверенные требования симпатии 1–10; награды источник не указывает.',
    suggestions: suggestions.filter(Boolean),
  };
}

function buildKnownVoiceActorSource(character) {
  const esperZeroVoiceActors = [
    { language: 'Английский (мужской)', name: 'Hunter McCoy' },
    { language: 'Английский (женский)', name: 'Suzie Yeung' },
    { language: 'Японский (мужской)', name: 'Yuma Uchida (内田雄馬)' },
    { language: 'Японский (женский)', name: 'Maaya Uchida (内田真礼)' },
    { language: 'Китайский (мужской)', name: 'Ma Yang (马洋)' },
    { language: 'Китайский (женский)', name: 'Zeng Tong (曾彤)' },
    { language: 'Корейский (мужской)', name: 'Park Ki-wook (박기욱)' },
    { language: 'Корейский (женский)', name: 'Lee Eun-jo (이은조)' },
  ];
  const knownActors = new Map([
    [
      'lacrimosa',
      [
        { language: 'Английский', name: 'Baraka May' },
        { language: 'Японский', name: 'Maria Naganawa (長縄まりあ)' },
      ],
    ],
    ['zero', esperZeroVoiceActors],
    ['esper zero', esperZeroVoiceActors],
    [
      'hotori',
      [
        { language: 'Английский', name: 'Lindsay Sheppard' },
        { language: 'Японский', name: 'Shizuka Itō (伊藤 静)' },
        { language: 'Китайский', name: 'Du Qingqing (杜晴晴)' },
        { language: 'Корейский', name: 'Lee Ji-hyeon (이지현)' },
      ],
    ],
    [
      'nanally',
      [
        { language: 'Английский', name: 'Brittany Lauda' },
        { language: 'Японский', name: 'Ayana Taketatsu (竹達彩奈)' },
        { language: 'Китайский', name: 'Song Yuanyuan (宋媛媛)' },
        { language: 'Корейский', name: 'Kang Saebom (강새봄)' },
      ],
    ],
    [
      'sakiri',
      [
        { language: 'Английский', name: 'Brianna Knickerbocker' },
        { language: 'Японский', name: 'Miku Ito (伊藤美来)' },
        { language: 'Китайский', name: 'Cai Shujin (蔡书瑾)' },
        { language: 'Корейский', name: 'Kim Nayul (김나율)' },
      ],
    ],
    [
      'adler',
      [
        { language: 'Английский', name: 'Jacob Craner' },
        { language: 'Японский', name: 'Toshiyuki Morikawa (森川智之)' },
        { language: 'Китайский', name: 'Wang Yuhang (王宇航)' },
        { language: 'Корейский', name: 'Shim Gyuhyeok (심규혁)' },
      ],
    ],
    [
      'edgar',
      [
        { language: 'Английский', name: 'Casey Mongillo' },
        { language: 'Японский', name: 'Yūko Sanpei (三瓶由布子)' },
        { language: 'Китайский', name: 'Sibai (四白)' },
        { language: 'Корейский', name: 'Jang Chaeyeon (장채연)' },
      ],
    ],
    [
      'daffodill',
      [
        { language: 'Английский', name: 'Natalie Van Sistine' },
        { language: 'Японский', name: 'Sayaka Ohara (大原さやか)' },
        { language: 'Китайский', name: 'Chen Yanyi (陈彦亦)' },
        { language: 'Корейский', name: 'Lee Myeongho (이명호)' },
      ],
    ],
    [
      'daffodil',
      [
        { language: 'Английский', name: 'Natalie Van Sistine' },
        { language: 'Японский', name: 'Sayaka Ohara (大原さやか)' },
        { language: 'Китайский', name: 'Chen Yanyi (陈彦亦)' },
        { language: 'Корейский', name: 'Lee Myeongho (이명호)' },
      ],
    ],
    [
      'hathor',
      [
        { language: 'Английский', name: 'Allegra Clark' },
        { language: 'Японский', name: 'Kana Ichinose (市ノ瀬加那)' },
        { language: 'Китайский', name: 'Hong Haitian (洪海天)' },
        { language: 'Корейский', name: 'Lee Daeun (이다은)' },
      ],
    ],
    [
      'haniel',
      [
        { language: 'Английский', name: 'Alexis Tipton' },
        { language: 'Японский', name: 'Manaka Iwami (石見舞菜香)' },
        { language: 'Китайский', name: 'Su Ziwu (苏子芜)' },
        { language: 'Корейский', name: 'Kim Garyeong (김가령)' },
      ],
    ],
    [
      'jiuyuan',
      [
        { language: 'Английский', name: 'Baraka May' },
        { language: 'Японский', name: 'Rie Tanaka (田中理恵)' },
        { language: 'Китайский', name: 'Zhang Anqi (张安琪)' },
        { language: 'Корейский', name: 'Bang Siu (방시우)' },
      ],
    ],
    [
      'mint',
      [
        { language: 'Английский', name: 'Brianna Knickerbocker' },
        { language: 'Японский', name: 'Akari Kito (鬼頭明里)' },
        { language: 'Китайский', name: 'Chen Yu (陈雨)' },
        { language: 'Корейский', name: 'Seong Yewon (성예원)' },
      ],
    ],
    [
      'fadia',
      [
        { language: 'Английский', name: 'Amber Lee Connors' },
        { language: 'Японский', name: 'Kei Shindo (真堂圭)' },
        { language: 'Китайский', name: 'Pei Zhiying (裴致莹)' },
        { language: 'Корейский', name: 'Jo Hyeonjeong (조현정)' },
      ],
    ],
    [
      'baicang',
      [
        { language: 'Английский', name: 'Griffin Burns' },
        { language: 'Японский', name: 'Yuichi Nakamura (中村悠一)' },
        { language: 'Китайский', name: 'Sang Yuze (桑毓泽)' },
        { language: 'Корейский', name: 'Shim Gyuhyeok (심규혁)' },
      ],
    ],
    [
      'skia',
      [
        { language: 'Английский', name: 'Bill Butts' },
        { language: 'Японский', name: 'Tomokazu Sugita (杉田智和)' },
        { language: 'Китайский', name: 'Liu Yuxuan (刘雨轩)' },
        { language: 'Корейский', name: 'Lee Donghun (이동훈)' },
      ],
    ],
    [
      'chiz',
      [
        { language: 'Английский', name: 'Alice Himora' },
        { language: 'Японский', name: 'Konomi Kohara (小原好美)' },
        { language: 'Китайский', name: 'Zeling (则灵)' },
        { language: 'Корейский', name: 'Kwon Daye (권다예)' },
      ],
    ],
    [
      'aurelia',
      [
        { language: 'Английский', name: 'Kira Buckland' },
        { language: 'Японский', name: 'Karin Takahashi (高橋花林)' },
        { language: 'Китайский', name: 'Ge Zirui (葛子瑞)' },
        { language: 'Корейский', name: 'Jeong Haeun (정해은)' },
      ],
    ],
  ]);
  const actors = characterNameCandidates(character)
    .map((candidate) => knownActors.get(candidate))
    .find(Boolean);
  if (!actors) return null;
  const source = {
    id: 'known-voice-actors',
    name: 'Опубликованный voice cast NTE',
    trust: 'medium',
    url: 'https://neverness.gg/nte-voice-actors-cast/',
  };
  return {
    ...source,
    status: 'ok',
    suggestions: [
      makeImportSuggestion(
        'profile.voiceActors',
        'Актёры озвучки',
        actors,
        source,
        'medium',
      ),
    ],
  };
}

async function fetchImportSource(source, character) {
  if (source.referenceOnly) {
    return {
      ...source,
      status: 'partial',
      message:
        source.referenceMessage ||
        'Справочный источник подключен для ручной проверки; структурированный авторазбор пока не включен.',
      suggestions: [],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMPORT_SOURCE_TIMEOUT_MS);
  try {
      const response = await fetch(source.url, {
        headers: {
          accept: 'text/html,application/xhtml+xml,application/json',
        'user-agent': 'NTE-Meta-Editorial/1.0 (+https://bonaqu.github.io/nte-meta/)',
      },
      signal: controller.signal,
    });
    const length = Number(response.headers.get('content-length') || 0);
    if (!response.ok) {
      return {
        ...source,
        status: response.status === 403 ? 'blocked' : 'failed',
        message: `HTTP ${response.status}`,
        suggestions: [],
      };
    }
    if (length > IMPORT_MAX_HTML_BYTES) {
      return {
        ...source,
        status: 'failed',
        message: 'Страница слишком большая для безопасного автоимпорта.',
        suggestions: [],
      };
    }
      const html = await readLimitedImportResponse(response);
      const text = htmlToPlainText(html.slice(0, IMPORT_MAX_HTML_BYTES));
      const suggestions = [
        ...source
          .parser(source.raw ? html.slice(0, IMPORT_MAX_HTML_BYTES) : text, source, character)
          .filter(Boolean),
        ...extractImportImages(html, source, character),
      ];
    return {
      ...source,
      status: suggestions.length ? 'ok' : 'partial',
      message: suggestions.length
        ? `Найдено предложений: ${suggestions.length}`
        : 'Структурированные поля не найдены.',
      suggestions,
    };
  } catch (error) {
    return {
      ...source,
      status: 'failed',
      message:
        error instanceof Error && error.message === 'IMPORT_SOURCE_TOO_LARGE'
          ? 'Страница слишком большая для безопасного автоимпорта.'
          : error instanceof Error && error.name === 'AbortError'
          ? 'Источник не ответил вовремя.'
          : 'Источник временно недоступен.',
      suggestions: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedImportResponse(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new globalThis.TextDecoder();
  let received = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > IMPORT_MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error('IMPORT_SOURCE_TOO_LARGE');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function parseMediaWikiApiContent(text) {
  try {
    const payload = JSON.parse(text);
    const page = payload?.query?.pages?.[0];
    const revision = page?.revisions?.[0];
    const content =
      revision?.content ||
      revision?.slots?.main?.content ||
      revision?.['*'] ||
      '';
    return {
      page,
      content: String(content || ''),
      originalImage: normalizeExternalImageUrl(page?.original?.source || ''),
    };
  } catch {
    return { page: null, content: '', originalImage: '' };
  }
}

function cleanWikiText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function cleanWikiParagraphText(value) {
  return normalizeImportedRuText(
    String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
      .replace(/\{\{[^{}]*\}\}/g, ' ')
      .replace(/'''?/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
}

function normalizeImportedRuText(value) {
  return String(value || '')
    .replace(/\bЦветение зените\b/g, 'Цветение в зените')
    .trim();
}

function readWikiParam(content, key) {
  const pattern = new RegExp(
    `(?:^|\\n|\\|)\\s*${escapeRegExp(key)}\\s*=?\\s*([^\\n{}]+)`,
    'i',
  );
  const raw = String(content.match(pattern)?.[1] || '').replace(
    /\s+(?:rarity|espertype|arctype|role\d*|gender|birthday|affiliation\d*|prefix\d*|obtain|releaseDate|voice[A-Z]{2}|namecard\w*|type|bagel_\w*|esperability)\s*=.*$/i,
    '',
  ).replace(/\|\s*[A-Za-z_][A-Za-z0-9_-]*\s*=.*$/i, '');
  return normalizeImportedRuText(cleanWikiText(raw));
}

function extractFandomCharacterIntro(content) {
  const match = String(content || '').match(
    /'''[^']+'''\s*[—-]\s*([\s\S]*?)(?=\n==|\n\{\{|$)/,
  );
  return cleanWikiParagraphText(match?.[1] || '');
}

function extractFandomCharacterDescription(content) {
  const match = String(content || '').match(
    /\{\{Описание[\s\S]*?\|\s*текст\s*=\s*([\s\S]*?)(?:\|\s*источник\s*=|\}\})/i,
  );
  return cleanWikiParagraphText(match?.[1] || '');
}

function formatRuImportDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`));
}

function isSeoImportText(value) {
  return /указан[ао]? в базе|предназначена|ищет гайд|материалы .*характеристики|быстрый справочный обзор|здесь собраны|поисковые ориентиры|как использовать страницу|используйте раздел|связанные гайды|long-tail/i.test(
    String(value || ''),
  );
}

function fandomRoleTagsFromCategories(page) {
  const roleTags = [];
  for (const category of page?.categories || []) {
    const match = String(category.title || '').match(
      /^Категория:Персонажи с ролью\s+(.+)$/i,
    );
    const role = cleanWikiText(match?.[1] || '');
    if (
      role &&
      !roleTags.some(
        (item) => normalizeImportSearch(item) === normalizeImportSearch(role),
      )
    ) {
      roleTags.push(role);
    }
  }
  return roleTags;
}

function parseFandomRuApiImport(text, source) {
  const { page, content } = parseMediaWikiApiContent(text);
  if (!content) return [];

  const roleTags = Array.from(
    new Set(
      [
        ...['role', 'role2', 'role3', 'role4'].map((key) =>
          readWikiParam(content, key),
        ),
        ...fandomRoleTagsFromCategories(page),
      ].filter(Boolean),
    ),
  );
  const faction = [
    readWikiParam(content, 'affiliation'),
    readWikiParam(content, 'affiliation2'),
  ]
    .filter(Boolean)
    .join(', ');
  const quote = cleanWikiText(content.match(/\{\{Цитата\|([^|}]+)/i)?.[1] || '');
  const biographyShort = extractFandomCharacterIntro(content);
  const biography = extractFandomCharacterDescription(content);
  const voiceActors = [
    ['Английский', readWikiParam(content, 'voiceEN')],
    ['Японский', readWikiParam(content, 'voiceJP')],
    ['Китайский', readWikiParam(content, 'voiceCN')],
    ['Корейский', readWikiParam(content, 'voiceKR')],
  ]
    .filter(([, name]) => name)
    .map(([language, name]) => ({ language, name }));

  return [
    makeImportSuggestion('rarity', 'Редкость', readWikiParam(content, 'rarity'), source, 'high'),
    makeImportSuggestion('attribute', 'Атрибут', readWikiParam(content, 'espertype'), source, 'high'),
    makeImportSuggestion('profile.arcType', 'Тип дуги', readWikiParam(content, 'arctype'), source, 'high'),
    makeImportSuggestion('profile.roleTags', 'Роли персонажа', roleTags, source, 'high'),
    makeImportSuggestion('profile.faction', 'Фракция', faction, source, 'high'),
    makeImportSuggestion('profile.birthday', 'День рождения', readWikiParam(content, 'birthday'), source, 'high'),
    makeImportSuggestion('profile.releaseDate', 'Дата релиза', formatRuImportDate(readWikiParam(content, 'releaseDate')), source, 'medium'),
    makeImportSuggestion('profile.biographyShort', 'Краткая биография', biographyShort || quote, source, biographyShort ? 'high' : 'medium'),
    makeImportSuggestion('profile.biography', 'Подробная биография', biography, source, 'high'),
    makeImportSuggestion('profile.voiceActors', 'Актёры озвучки', voiceActors, source, 'high'),
  ].filter(Boolean);
}

function parseFandomRuImagesImport(text, source, character) {
  try {
    const payload = JSON.parse(text);
    const pages = payload?.query?.pages || [];
    const characterName = normalizeImportSearch(character.name || character.slug || '');
    const images = pages
      .map((page) => ({
        title: String(page.title || ''),
        url: normalizeExternalImageUrl(page.imageinfo?.[0]?.url || ''),
        width: page.imageinfo?.[0]?.width || 0,
        height: page.imageinfo?.[0]?.height || 0,
      }))
      .filter((image) => image.url);
    const ownImages = images.filter((image) =>
      normalizeImportSearch(image.title).includes(characterName),
    );
    const card =
      ownImages.find((image) => /иконка|представление|карточка/i.test(image.title)) ||
      ownImages[0] ||
      images.find((image) => /представление|карточка/i.test(image.title));
    const splash =
      ownImages.find((image) => /спл[эе]ш|splash/i.test(image.title)) ||
      ownImages.find((image) => image.height > image.width) ||
      card;
    const imageMap = buildImportImageMap(images, character);

    return [
      makeImportSuggestion('imageUrl', 'Карточка персонажа', card?.url || '', source, 'high'),
      makeImportSuggestion('splashUrl', 'Splash персонажа', splash?.url || '', source, 'high'),
      makeImportSuggestion('__imageMap', 'Индекс изображений', imageMap, source, 'low'),
    ].filter(Boolean);
  } catch {
    return [];
  }
}

function cleanImportImageTitle(title) {
  return String(title || '')
    .replace(/^Файл:/i, '')
    .replace(/^File:\s*/i, '')
    .replace(/^Image:\s*/i, '')
    .replace(/\.(png|webp|jpe?g|gif|svg)$/i, '')
    .replace(/\s+(?:Детали|Details)$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function importImageNameAliases(value) {
  const base = cleanImportImageTitle(value);
  const aliases = new Set();
  const add = (alias) => {
    const clean = cleanImportImageTitle(alias)
      .replace(/[«»"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean) aliases.add(clean);
  };

  add(base);
  add(base.replace(/^(?:Роль|Редкость|Эспер|Esper|Role|Rarity)\s+/i, ''));
  add(
    base.replace(
      /\s+(?:Иконка|Icon|Skill|Ability|Awakening|Constellation|Card|Portrait|Представление|СплэшАрт|Сплэш|Splash(?:\s+Art)?)$/i,
      '',
    ),
  );
  add(
    base.replace(
      /^(?:Icon|Skill|Ability|Awakening|Constellation|Иконка|Навык|Способность|Пробуждение)\s+/i,
      '',
    ),
  );
  add(
    base.replace(
      /^(?:Базовая атака|Сверхспособность|Навык поддержки|Пассивный навык|Повседневный навык|Навык)\s+/i,
      '',
    ),
  );

  return [...aliases];
}

function buildImportImageMap(images, character = {}) {
  const map = {};
  const characterNames = characterNameCandidates(character);

  for (const image of images) {
    const title = cleanImportImageTitle(image.title);
    if (!title || !image.url) continue;
    const aliases = new Set(importImageNameAliases(title));
    const normalizedTitle = normalizeImportSearch(title);

    for (const characterName of characterNames) {
      if (normalizedTitle.startsWith(characterName)) {
        const alias = title.slice(characterName.length).trim();
        if (alias) aliases.add(alias);
      }
      const prefixPattern = new RegExp(`^${escapeRegExp(characterName)}\\s+`, 'i');
      const withoutCharacter = title.replace(prefixPattern, '').trim();
      if (withoutCharacter && withoutCharacter !== title) aliases.add(withoutCharacter);
    }

    for (const alias of importImageNameAliases(title)) aliases.add(alias);

    for (const alias of aliases) {
      if (alias) map[alias] = image.url;
    }
  }

  return map;
}

function parseFandomRuAllImagesImport(text, source, character) {
  try {
    const payload = JSON.parse(text);
    const images = (payload?.query?.allimages || [])
      .map((image) => ({
        title: String(image.name || image.title || ''),
        url: normalizeExternalImageUrl(image.url || ''),
        width: image.width || 0,
        height: image.height || 0,
        size: image.size || 0,
      }))
      .filter((image) => image.url);
    const characterNames = characterNameCandidates(character);
    const ownImages = images.filter((image) => {
      const title = normalizeImportSearch(cleanImportImageTitle(image.title));
      return characterNames.some((name) => title.includes(name));
    });
    const icon =
      ownImages.find((image) => /(^|\s)иконка($|\s)/i.test(cleanImportImageTitle(image.title))) ||
      ownImages.find((image) => /аватар/i.test(cleanImportImageTitle(image.title)));
    const presentation = ownImages.find((image) =>
      /представление|карточка/i.test(cleanImportImageTitle(image.title)),
    );
    const splash = ownImages.find((image) =>
      /спл[эе]ш|splash/i.test(cleanImportImageTitle(image.title)),
    );
    const imageMap = buildImportImageMap(images, character);

    return [
      makeImportSuggestion(
        'imageUrl',
        'Иконка персонажа',
        icon?.url || presentation?.url || '',
        source,
        'high',
        'Подходит для миниатюр в списках, тир-листе и карточках.',
      ),
      makeImportSuggestion(
        'splashUrl',
        'Splash персонажа',
        splash?.url || presentation?.url || '',
        source,
        'medium',
        'Проверьте, что изображение подходит как крупный арт профиля.',
      ),
      makeImportSuggestion('__imageMap', 'Индекс изображений', imageMap, source, 'low'),
    ].filter(Boolean);
  } catch {
    return [];
  }
}

function cleanGame8Text(value) {
  return htmlToPlainText(value)
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function game8ImageUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `https://game8.co${url}`;
  return url;
}

function translateGame8Obtain(value, characterName) {
  const text = cleanGame8Text(value);
  if (!text) return 'Способ получения требует ручной проверки.';
  if (/^Default Outfit$/i.test(text)) return 'Стандартный наряд.';
  const bondMatch = text.match(/Achieve Bond Level\s+(\d+)\s+with\s+(.+)/i);
  if (bondMatch) {
    return `Открывается за ${bondMatch[1]} уровень симпатии с ${characterName}.`;
  }
  const translated = text
    .replace(/Purchased for\s+([\d,]+)\s+Fons/i, 'Покупается за $1 фонов')
    .replace(
      /Purchased for\s+([\d,]+)\s+Riftcrystals/i,
      'Покупается за $1 рифт-кристаллов',
    )
    .replace(/\bScarborough Fair\b/g, 'Ярмарка в Скарборо')
    .replace(/\bEpisodes\b/g, 'Эпизоды')
    .replace(/\bSpinoffs\b/g, 'Спин-оффы');
  return /[A-Za-z]{3,}/.test(translated)
    ? 'Способ получения требует ручной проверки.'
    : translated;
}

const knownGiftLocalizations = new Map([
  ['SpecialGift_letter', 'Рукописное письмо'],
  ['Furniture_Ornament_002', 'Золотая луна'],
  ['SpecialGift_ticket', 'Билет в кинотеатр «Флоу»'],
  ['Furniture_Light_002', 'Окружающий ночник'],
  ['Furniture_Light_007', 'Лампа из белого нефрита'],
  ['Flower0000', 'Золотой источник'],
  ['Flower0001', 'Соната соловья'],
  ['Flower0002', 'Голубая басня'],
  ['Flower0007', 'Пылающий багрянец'],
  ['Flower0009', 'Фантазия'],
  ['Furniture_FlowerPot_001', 'Ваза с жёлтой глазурью'],
  ['Food_006', 'Острая закуска «Кул-лала»'],
  ['Food_033', 'Супер-рамен со свининой'],
  ['Food_038', 'Семейный напиток Чиё'],
  ['Food_051', 'Розовый личи-торт'],
  ['Food_060', 'В глубине сердца'],
  ['Food_062', 'Песнь гладиатора'],
  ['Food_084', 'Рамен «Нэкомару Они»'],
  ['Food_092', 'Яркий лёгкий салат'],
  ['Food_093', 'Энергетический обед для детей'],
  ['Food_094', 'Охлаждающий напиток «Кули Кул»'],
  ['Food_098', 'Чжу! Витамин!'],
  ['Food_103', 'Королевская башня Эбису'],
]);

const knownOutfitLocalizations = new Map([
  [
    'Fashion_1052_0',
    {
      name: 'Под яркой луной',
      description:
        'Наряд, созданный известным дизайнером специально для Хотори. По слухам, на его стоимость можно было бы открыть ещё десять магазинов «Эйбон». Рабочий перевод требует сверки с русской версией игры.',
    },
  ],
  [
    'Fashion_1052_2',
    {
      name: 'Двор для отдыха',
      description:
        'Лёгкая и удобная домашняя одежда Хотори. Рабочий перевод названия требует сверки с русской версией игры.',
    },
  ],
  [
    'Fashion_1052_3',
    {
      name: 'Бесценная орхидея',
      description:
        'Высококлассный наряд в тематике призрачной орхидеи, особенно эффектный на студийных снимках. Рабочий перевод названия требует сверки с русской версией игры.',
    },
  ],
]);

const knownOutfitIdsBySourceName = new Map([
  ['Under the Bright Moon', 'Fashion_1052_0'],
  ['Recreational Courtyard', 'Fashion_1052_2'],
  ['Priceless Orchid', 'Fashion_1052_3'],
]);

function parseHtmlJsonAttribute(html, attribute) {
  const raw = String(html || '').match(
    new RegExp(`${escapeRegExp(attribute)}=["']([^"']+)["']`, 'i'),
  )?.[1];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeHtmlEntities(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseNevernessAppProfileImport(html, source) {
  const levels = parseHtmlJsonAttribute(html, 'data-levels')
    .map((item) => ({
      level: Number(item.level) + 1,
      rewardName: '',
      rewardIconUrl: '',
      description: `Для достижения уровня ${Number(item.level) + 1} требуется ${Number(item.bondsRequired).toLocaleString('ru-RU')} очков симпатии. Награда за уровень в источнике не указана.`,
    }))
    .filter(
      (item) =>
        Number.isInteger(item.level) &&
        item.level >= 1 &&
        item.level <= 10 &&
        !item.description.includes('NaN'),
    );

  const gifts = parseHtmlJsonAttribute(html, 'data-gifts')
    .map((item) => {
      const itemId = String(item.itemId || '');
      const name = knownGiftLocalizations.get(itemId);
      if (!name || !Number.isFinite(Number(item.bondPoints))) return null;
      const acquisition =
        itemId === 'SpecialGift_letter'
          ? 'награда за задание'
          : item.currency === 'fons' && Number.isFinite(Number(item.price))
            ? `${Number(item.price).toLocaleString('ru-RU')} фонов`
            : 'не продаётся за фоны';
      return {
        id: itemId || crypto.randomUUID(),
        name,
        iconUrl: normalizeImportImageSrc(item.icon || '', source.url),
        effect: `+${Number(item.bondPoints).toLocaleString('ru-RU')} очков симпатии · ${acquisition}`,
      };
    })
    .filter(Boolean);

  const skins = [];
  const outfitPattern = /<article\b[^>]*data-outfit-id=["']([^"']+)["'][\s\S]*?<\/article>/gi;
  for (const match of String(html || '').matchAll(outfitPattern)) {
    const outfitId = decodeHtmlEntities(match[1]);
    const localization = knownOutfitLocalizations.get(outfitId);
    if (!localization) continue;
    const block = match[0];
    const imageUrl = normalizeImportImageSrc(
      block.match(/data-outfit-splash=["']([^"']+)["']/i)?.[1] || '',
      source.url,
    );
    if (!imageUrl) continue;
    skins.push({
      id: outfitId,
      name: localization.name,
      imageUrl,
      description: localization.description,
    });
  }

  return [
    makeImportSuggestion(
      'profile.friendship',
      'Симпатия 1–10',
      levels,
      source,
      'high',
      'Источник подтверждает только количество очков для достижения уровней. Награды не подставляются и остаются пустыми.',
    ),
    makeImportSuggestion(
      'profile.gifts',
      'Любимые подарки',
      gifts,
      source,
      'high',
      'Очки симпатии и изображения взяты из структурированного каталога; доступные русские названия сверены по русскоязычному справочнику и всё равно подтверждаются редактором.',
    ),
    makeImportSuggestion(
      'profile.skins',
      'Гардероб',
      skins,
      source,
      'medium',
      'Изображения взяты из каталога, названия являются рабочим переводом и требуют подтверждения редактором.',
    ),
  ].filter(Boolean);
}

function extractImportPanel(html, panelId) {
  const source = String(html || '');
  const start = source.indexOf(`id="${panelId}"`);
  if (start < 0) return '';
  const end = source.indexOf('<div role="tabpanel"', start + panelId.length + 5);
  return source.slice(start, end < 0 ? source.length : end);
}

function readImportDefinition(html, label) {
  const match = String(html || '').match(
    new RegExp(
      `<dt[^>]*>${escapeRegExp(label)}<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`,
      'i',
    ),
  );
  return htmlToPlainText(match?.[1] || '');
}

function importRecordIdFromHref(href, fallback) {
  return (
    String(href || '').match(/\/items\/([^/?#]+)\/?/i)?.[1] ||
    `import-${hashText(fallback).slice(0, 12)}`
  );
}

function parseInteractiveMapRuImport(html, source, character) {
  const plainText = htmlToPlainText(html);
  if (!lineMatchesCharacter(plainText, character)) return [];

  const profilePanel = extractImportPanel(html, 'panel-profile');
  const abilityPanel = extractImportPanel(html, 'panel-abilities');
  const awakeningPanel = extractImportPanel(html, 'panel-awakening');
  const cosmeticsPanel = extractImportPanel(html, 'panel-cosmetics');
  const affinityPanel = extractImportPanel(html, 'panel-affinity');

  const faction = readImportDefinition(profilePanel, 'Место жительства');
  const birthday = readImportDefinition(profilePanel, 'День рождения');
  const dossierHtml =
    profilePanel.match(/>Досье<\/h2>([\s\S]*?)(?=<\/section>)/i)?.[1] || '';
  const dossierParts = [];
  for (const match of dossierHtml.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    const title = htmlToPlainText(match[1].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '');
    const description = htmlToPlainText(
      match[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '',
    );
    if (description) dossierParts.push({ title, description });
  }
  const biography = dossierParts
    .map(({ title, description }) =>
      title ? `### ${title}\n\n${description}` : description,
    )
    .join('\n\n');

  const typeLabels = new Map([
    ['Обычная атака', 'Базовая атака'],
    ['Навык', 'Навык'],
    ['Ульта', 'Сверхспособность'],
    ['QTE', 'Навык поддержки'],
    ['Пассивка 1', 'Пассивный навык'],
    ['Пассивка 2', 'Пассивный навык'],
  ]);
  const abilities = [];
  for (const match of abilityPanel.matchAll(
    /<article\b[^>]*class="[^"]*group\/skill[^"]*"[^>]*>([\s\S]*?)<\/article>/gi,
  )) {
    const block = match[1].split('<details')[0];
    const sourceType = htmlToPlainText(
      block.match(/<p\b[^>]*uppercase[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '',
    );
    const type = typeLabels.get(sourceType);
    if (!type) continue;
    const name = htmlToPlainText(
      block.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || '',
    );
    const iconUrl = normalizeImportImageSrc(
      block.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] || '',
      source.url,
    );
    const body = block.slice(block.indexOf('</header>') + 9);
    const description = compactImportLines(htmlToPlainText(body))
      .filter((line) => line !== sourceType && line !== name)
      .join('\n\n');
    if (!name || !description) continue;
    abilities.push({
      id: `ability-${hashText(`${sourceType}:${name}`).slice(0, 12)}`,
      type,
      name,
      iconUrl,
      description,
    });
  }

  const awakenings = [];
  for (const match of awakeningPanel.matchAll(
    /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
  )) {
    const block = match[1];
    const level = Number(
      htmlToPlainText(block.match(/<p\b[^>]*>(Effect[1-6])<\/p>/i)?.[1] || '').replace(
        /\D/g,
        '',
      ),
    );
    if (!Number.isInteger(level) || level < 1 || level > 6) continue;
    const name = htmlToPlainText(
      block.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || '',
    );
    const description = htmlToPlainText(
      block.match(/<p\b[^>]*whitespace-pre-line[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '',
    );
    const iconUrl = normalizeImportImageSrc(
      block.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] || '',
      source.url,
    );
    if (name && description) {
      awakenings.push({ level, name, description, iconUrl });
    }
  }

  const friendshipHeading = affinityPanel.indexOf('Уровни дружбы</h3>');
  const giftsHtml = friendshipHeading >= 0 ? affinityPanel.slice(0, friendshipHeading) : '';
  const gifts = [];
  for (const match of giftsHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1];
    const block = match[2];
    const points = block.match(/♥\s*\+([\d\s,.]+)/)?.[1]?.replace(/\D/g, '') || '';
    if (!points) continue;
    const name = decodeHtmlEntities(attributes.match(/\btitle="([^"]+)"/i)?.[1] || '').trim();
    const href = decodeHtmlEntities(attributes.match(/\bhref="([^"]+)"/i)?.[1] || '');
    const iconUrl = normalizeImportImageSrc(
      block.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] || '',
      source.url,
    );
    if (!name || !hasRussianText(name)) continue;
    gifts.push({
      id: importRecordIdFromHref(href, name),
      name,
      iconUrl,
      effect: `+${Number(points).toLocaleString('ru-RU')} очков симпатии`,
    });
  }

  const friendship = [];
  const friendshipHtml = friendshipHeading >= 0 ? affinityPanel.slice(friendshipHeading) : '';
  const levelMarker =
    '<div class="flex items-start gap-4 rounded-lg border border-[rgb(var(--border))] p-3 sm:p-4">';
  const levelChunks = friendshipHtml.split(levelMarker).slice(1, 11);
  for (const chunk of levelChunks) {
    const levelMatch = chunk.match(
      /Уровень<\/p>\s*<p[^>]*>(\d+)<\/p>\s*<p[^>]*>([\d\s,.\u00a0]+)<\/p>/i,
    );
    const level = Number(levelMatch?.[1]);
    const points = Number(String(levelMatch?.[2] || '').replace(/\D/g, ''));
    if (!Number.isInteger(level) || level < 1 || level > 10 || !points) continue;
    const rewards = [];
    for (const rewardMatch of chunk.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const attributes = rewardMatch[1];
      const block = rewardMatch[2];
      const sourceName = decodeHtmlEntities(
        attributes.match(/\btitle="([^"]+)"/i)?.[1] || '',
      ).trim();
      const name = /[A-Za-z]{2,}/.test(sourceName)
        ? `Именная награда уровня ${level}`
        : sourceName;
      const quantity = block.match(/>×\s*([^<]+)<\/span>/i)?.[1]?.trim() || '';
      const href = decodeHtmlEntities(attributes.match(/\bhref="([^"]+)"/i)?.[1] || '');
      const iconUrl = normalizeImportImageSrc(
        block.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] || '',
        source.url,
      );
      if (!name || !hasRussianText(name)) continue;
      rewards.push({
        id: importRecordIdFromHref(href, `${level}:${name}`),
        name,
        quantity,
        iconUrl,
      });
    }
    friendship.push({
      level,
      rewardName: rewards
        .map((reward) => `${reward.name} ×${reward.quantity}`)
        .join('; ')
        .slice(0, 160),
      rewardIconUrl: rewards[0]?.iconUrl || '',
      rewards,
      description: `Для достижения уровня ${level} требуется ${points.toLocaleString('ru-RU')} очков симпатии.`,
    });
  }

  const skins = [];
  for (const match of cosmeticsPanel.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    const block = match[1];
    const name = htmlToPlainText(
      block.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || '',
    );
    const imageUrl = normalizeImportImageSrc(
      block.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] || '',
      source.url,
    );
    const description = htmlToPlainText(
      block.match(/<p\b[^>]*leading-relaxed[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '',
    );
    if (name && imageUrl) {
      skins.push({
        id: `skin-${hashText(name).slice(0, 12)}`,
        name,
        imageUrl,
        description,
      });
    }
  }

  return [
    makeImportSuggestion('profile.faction', 'Фракция', faction, source, 'high'),
    makeImportSuggestion('profile.birthday', 'День рождения', birthday, source, 'high'),
    makeImportSuggestion(
      'profile.biographyShort',
      'Краткая биография',
      dossierParts[0]?.description || '',
      source,
      'high',
    ),
    makeImportSuggestion('profile.biography', 'Подробная биография', biography, source, 'high'),
    makeImportSuggestion('profile.abilities', 'Способности', abilities, source, 'high'),
    makeImportSuggestion('profile.awakenings', 'Пробуждения', awakenings, source, 'high'),
    makeImportSuggestion('profile.gifts', 'Любимые подарки', gifts, source, 'high'),
    makeImportSuggestion('profile.friendship', 'Симпатия 1–10', friendship, source, 'high'),
    makeImportSuggestion('profile.skins', 'Гардероб', skins, source, 'high'),
  ].filter(Boolean);
}

function parseGame8SkinsImport(text, source, character) {
  const characterNames = characterNameCandidates(character);
  if (!characterNames.length) return [];
  const chunks = String(text || '').split(
    /(?=<td class="center">\s*<div class='imageLink)/g,
  );
  const skins = [];
  const friendship = [];
  const seen = new Set();
  const displayCharacterName =
    character.name || character.originalName || character.slug || 'персонажем';

  for (const chunk of chunks) {
    const imageUrl = game8ImageUrl(
      chunk.match(/data-image-url='([^']+)'/)?.[1] ||
        chunk.match(/data-src='([^']+)'/)?.[1] ||
        '',
    );
    const sourceSkinName = cleanGame8Text(
      chunk.match(/<b class='a-bold'>([\s\S]*?)<\/b>/i)?.[1] || '',
    );
    const skinName = knownOutfitLocalizations.get(
      knownOutfitIdsBySourceName.get(sourceSkinName),
    )?.name;
    const characterFromAlt = cleanGame8Text(
      chunk.match(/alt='([^']+)\s+Icon'/i)?.[1] || '',
    );
    const cells = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (match) => cleanGame8Text(match[1]),
    );
    const characterCellIndex = cells.findIndex((cell) => {
      const normalized = normalizeImportSearch(cell);
      return characterNames.some((name) => normalized === name || normalized.includes(name));
    });
    const normalizedAlt = normalizeImportSearch(characterFromAlt);
    const matchesCharacter =
      characterNames.some((name) => normalizedAlt === name) || characterCellIndex >= 0;
    if (!matchesCharacter || !skinName || !imageUrl) continue;

    const obtainText =
      characterCellIndex >= 0 ? cells[characterCellIndex + 1] || '' : cells[2] || '';
    const description = [
      translateGame8Obtain(obtainText, displayCharacterName),
      'Название является рабочим переводом; перед публикацией проверьте его в русской версии игры.',
    ]
      .filter(Boolean)
      .join('\n\n');
    const key = normalizeImportSearch(skinName);
    if (!seen.has(key)) {
      skins.push({
        id: crypto.randomUUID(),
        name: skinName,
        imageUrl,
        description,
      });
      seen.add(key);
    }

    const bondMatch = obtainText.match(/Bond Level\s+(\d+)/i);
    if (bondMatch && Number(bondMatch[1]) >= 1 && Number(bondMatch[1]) <= 10) {
      friendship.push({
        level: Number(bondMatch[1]),
        rewardName: `Скин: ${skinName}`,
        rewardIconUrl: imageUrl,
        description,
      });
    }
  }

  return [
    makeImportSuggestion(
      'profile.skins',
      'Гардероб',
      skins,
      source,
      'medium',
      'Скины найдены в таблице Game8. Предлагаются только строки с русским рабочим переводом.',
    ),
    makeImportSuggestion(
      'profile.friendship',
      'Награды симпатии',
      friendship,
      source,
      'medium',
      'Добавляются только найденные уровни. Пустые уровни 1-9 не выдумываются.',
    ),
  ].filter(Boolean);
}

function parseNteWikiImport(text, source) {
  const lines = compactImportLines(text);
  const suggestions = [
    makeImportSuggestion('rarity', 'Редкость', (lines.find((line) => /^Ранг\s+[SA]/i.test(line)) || '').match(/Ранг\s+([SA])/i)?.[1] || '', source, 'high'),
    makeImportSuggestion('attribute', 'Атрибут', nextImportLine(lines, 'Элемент'), source, 'high'),
    makeImportSuggestion('profile.birthday', 'День рождения', nextImportLine(lines, 'День рождения'), source, 'high'),
    makeImportSuggestion('profile.faction', 'Фракция', nextImportLine(lines, 'Фракция'), source, 'high'),
  ];
  const quote = lines.find((line) => line.startsWith('> '));
  suggestions.push(
    makeImportSuggestion(
      'profile.biographyShort',
      'Краткая биография',
      quote ? quote.replace(/^>\s*/, '') : '',
      source,
      'medium',
    ),
  );
  const overviewIndex = lines.findIndex((line) => line === 'Обзор Хотори' || /^Обзор\s+/i.test(line));
  const overviewText =
    overviewIndex >= 0
      ? lines.slice(overviewIndex + 1, overviewIndex + 4).join('\n\n')
      : '';
  if (overviewText && !isSeoImportText(overviewText)) {
    suggestions.push(
      makeImportSuggestion(
        'profile.biography',
        'Подробная биография',
        overviewText,
        source,
        'medium',
      ),
    );
  }
  const stats = ['HP', 'ATK', 'DEF', 'Crit', 'CDMG']
    .map((label) => ({ id: crypto.randomUUID(), label, value: nextImportLine(lines, label) }))
    .filter((item) => item.value);
  suggestions.push(
    makeImportSuggestion('profile.baseStats', 'Начальные показатели', stats, source, 'medium'),
  );
  const abilityStart = lines.findIndex((line) => normalizeImportSearch(line) === 'навыки');
  const abilityEnd =
    abilityStart >= 0
      ? lines.findIndex(
          (line, index) =>
            index > abilityStart &&
            (/^обзор\s+/i.test(line) ||
              /^как использовать/i.test(line) ||
              normalizeImportSearch(line) === 'пробуждение' ||
              normalizeImportSearch(line) === 'материалы прорыва'),
        )
      : -1;
  const pageAbilityNames =
    abilityStart >= 0
      ? lines
          .slice(abilityStart + 1, abilityEnd > abilityStart ? abilityEnd : abilityStart + 14)
          .map((line) =>
            cleanImportImageTitle(line)
              .replace(/^#+\s*/, '')
              .replace(/^Image:\s*/i, '')
              .replace(/\s+Детали$/i, '')
              .trim(),
          )
          .filter(
            (line) =>
              line &&
              !/^#+$/.test(line) &&
              !/^навыки$/i.test(line) &&
              !/^пассив/i.test(line) &&
              !/^пробуж/i.test(line) &&
              !/^материал/i.test(line) &&
              !/^обзор/i.test(line),
          )
      : [];
  const faqAbilityNames = parseGenshinBuildsFaqAbilityNames(text);
  const abilityNames = pageAbilityNames.length ? pageAbilityNames : faqAbilityNames;
  const abilityTypes = [
    'Базовая атака',
    'Навык',
    'Сверхспособность',
    'Навык поддержки',
    'Пассивный навык',
    'Пассивный навык',
    'Повседневный навык',
    'Повседневный навык',
  ];
  const abilities = Array.from(new Set(abilityNames))
    .slice(0, 8)
    .map((name, index) => ({
      id: crypto.randomUUID(),
      name,
      type: abilityTypes[index] || 'Навык',
      iconUrl: '',
      description: 'Название найдено в NTE Wiki; описание подтягивается из других источников или заполняется вручную.',
    }));
  if (abilities.length) {
    suggestions.push(
      makeImportSuggestion(
        'profile.abilities',
        'Способности',
        abilities,
        source,
        'medium',
        'NTE Wiki даёт русские названия и иконки; описания нужно сверить с GameWith или игрой.',
      ),
    );
  }
  const materialStart = lines.findIndex((line) => line.includes('Сводка материалов'));
  if (materialStart >= 0) {
    const materials = [];
    for (let index = materialStart + 1; index < Math.min(lines.length, materialStart + 30); index += 3) {
      const name = lines[index];
      const amount = lines[index + 1];
      const sourceText = lines[index + 2];
      if (!name || !hasRussianText(name) || !/^×?\d+/.test(amount || '')) continue;
      materials.push({
        id: crypto.randomUUID(),
        name,
        iconUrl: '',
        amount,
        source: hasRussianText(sourceText)
          ? sourceText
          : 'Источник получения указан на странице NTE Wiki.',
      });
    }
    suggestions.push(
      makeImportSuggestion('profile.materials', 'Материалы прокачки', materials, source, 'medium'),
    );
  }
  return suggestions;
}

function parseNteWikiCharactersIndexImport(text, source, character) {
  const lines = compactImportLines(text);
  const candidates = characterNameCandidates(character);
  const line = lines.find((item) => {
    const normalized = normalizeImportSearch(item);
    return candidates.some(
      (candidate) =>
        normalized === candidate ||
        normalized.startsWith(`${candidate} `) ||
        normalized.includes(` ${candidate} `),
    );
  });
  if (!line) return [];

  const esperTypes = ['Хаос', 'Чары', 'Психея', 'Психика', 'Космос', 'Лакшана', 'Анима'];
  const knownRoles = [
    'Перенаправление урона',
    'Усиление разрушения',
    'Урон со временем',
    'Взрывной урон',
    'Усиление урона',
    'Последующая атака',
    'Мгновенный цикл',
    'Основной УВС',
    'Выживание',
    'Управление',
    'Исцеление',
    'Усиление',
    'Контроль',
    'Щит',
    'Урон',
  ];
  const compactLine = line.replace(/\s+/g, ' ').trim();
  const attribute = esperTypes.find((item) => compactLine.includes(item)) || '';
  let roleText = compactLine;
  const matchedName = [character.name, character.originalName, character.slug]
    .filter(Boolean)
    .sort((a, b) => String(b).length - String(a).length)
    .find((name) =>
      normalizeImportSearch(compactLine).startsWith(normalizeImportSearch(String(name))),
    );
  if (matchedName) roleText = roleText.slice(String(matchedName).length).trim();
  if (attribute) roleText = roleText.split(attribute)[0].trim();
  const roleTags = knownRoles.filter((role) =>
    normalizeImportSearch(roleText).includes(normalizeImportSearch(role)),
  );

  return [
    makeImportSuggestion(
      'profile.roleTags',
      'Роли из индекса персонажей',
      roleTags,
      source,
      'medium',
      'Индекс NTE Wiki полезен для первичного набора тегов роли; подтвердите каждую строку перед публикацией.',
    ),
    makeImportSuggestion('attribute', 'Атрибут', attribute, source, 'medium'),
  ];
}

function parseGenshinBuildsFaqAbilityNames(text) {
  const match = String(text || '').match(/skills include:\s*([^"<.]+)(?:\.|"|<)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((name) => normalizeImportedRuText(decodeHtmlEntities(name).trim()))
    .filter(Boolean)
    .slice(0, 8);
}

function parseGenshinBuildsImport(text, source, character) {
  const lines = compactImportLines(text);
  const suggestions = [];
  const candidates = characterNameCandidates(character);
  const titleIndex = lines.findIndex((line) =>
    candidates.some((candidate) => normalizeImportSearch(line) === candidate),
  );
  const profileLine = titleIndex >= 0 ? lines[titleIndex + 1] || '' : '';
  if (profileLine) {
    const parts = profileLine.split(/\s{1,}/).filter(Boolean);
    suggestions.push(
      makeImportSuggestion('attribute', 'Атрибут', parts[0], source, 'medium'),
    );
  }
  const awakenings = [];
  const awakeningStart = lines.findIndex((line) => line === 'Awakening');
  const voiceStart = lines.findIndex((line) => line === 'Voice Actors');
  for (let index = awakeningStart + 1; awakeningStart >= 0 && index < voiceStart; index += 2) {
    const match = (lines[index] || '').match(/^(\d+)\s+(.+)/);
    if (!match) continue;
    const level = Number(match[1]);
    if (!Number.isInteger(level) || level < 1 || level > 6) continue;
    awakenings.push({
      level,
      name: match[2],
      iconUrl: '',
      description: lines[index + 1] || '',
    });
  }
  suggestions.push(
    makeImportSuggestion('profile.awakenings', 'Пробуждения', awakenings, source, 'medium'),
  );
  const voiceActors = [];
  const languageMap = {
    CN: 'Китайский',
    EN: 'Английский',
    JA: 'Японский',
    KO: 'Корейский',
  };
  for (const [code, language] of Object.entries(languageMap)) {
    const actor = nextImportLine(lines, code);
    if (actor) voiceActors.push({ language, name: actor });
  }
  suggestions.push(
    makeImportSuggestion('profile.voiceActors', 'Актёры озвучки', voiceActors, source, 'high'),
  );
  const abilities = [];
  const skillsStart = lines.findIndex((line) => line === 'Skills');
  const passivesStart = lines.findIndex((line) => line === 'Passives');
  if (skillsStart >= 0 && passivesStart > skillsStart) {
    const skillTypes = ['Базовая атака', 'Навык', 'Сверхспособность', 'Навык поддержки'];
    for (let index = skillsStart + 1; index < passivesStart; index += 1) {
      const match = (lines[index] || '').match(/^Proactive\s+(.+)/i);
      if (!match || abilities.length >= skillTypes.length) continue;
      const nextSkillIndex = lines.findIndex(
        (line, lineIndex) => lineIndex > index && /^Proactive\s+/i.test(line),
      );
      const end =
        nextSkillIndex > index && nextSkillIndex < passivesStart
          ? nextSkillIndex
          : passivesStart;
      abilities.push({
        id: crypto.randomUUID(),
        name: normalizeImportedRuText(match[1]),
        type: skillTypes[abilities.length],
        iconUrl: '',
        description: normalizeImportedRuText(lines.slice(index + 1, end).join(' ')),
      });
    }
  }
  if (passivesStart >= 0 && awakeningStart > passivesStart) {
    const passiveLines = lines.slice(passivesStart + 1, awakeningStart);
    for (let index = 0; index + 1 < passiveLines.length && abilities.length < 6; index += 2) {
      const name = normalizeImportedRuText(passiveLines[index]);
      const description = normalizeImportedRuText(passiveLines[index + 1]);
      if (!name || !description || !hasRussianText(name) || !hasRussianText(description)) continue;
      abilities.push({
        id: crypto.randomUUID(),
        name,
        type: 'Пассивный навык',
        iconUrl: '',
        description,
      });
    }
  }
  suggestions.push(
    makeImportSuggestion(
      'profile.abilities',
      'Способности',
      abilities,
      source,
      'medium',
      'Русские названия и описания сверяются с другими источниками; технические имена в итог не публикуются.',
    ),
  );
  const faqAbilityNames = parseGenshinBuildsFaqAbilityNames(text);
  if (faqAbilityNames.length) {
    const abilityTypes = [
      'Базовая атака',
      'Навык',
      'Сверхспособность',
      'Навык поддержки',
      'Пассивный навык',
      'Пассивный навык',
      'Повседневный навык',
      'Повседневный навык',
    ];
    suggestions.push(
      makeImportSuggestion(
        'profile.abilities',
        'Способности',
        faqAbilityNames.map((name, index) => ({
          id: crypto.randomUUID(),
          name,
          type: abilityTypes[index] || 'Навык',
          iconUrl: '',
          description:
            'Название найдено в FAQ GenshinBuilds; описание подтягивается из GameWith или заполняется вручную.',
        })),
        source,
        'medium',
        'Список имён нужен для сверки русских названий; строку с техническим GA_* отклоните, если источник не дал локализованное имя.',
      ),
    );
  }
  return suggestions;
}

function extractGuideHeadingBlocks(html) {
  const blocks = [];
  const expression = /<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[2-4]\b|$)/gi;
  for (const match of String(html || '').matchAll(expression)) {
    blocks.push({
      level: Number(match[1]),
      heading: htmlToPlainText(match[2]),
      lines: compactImportLines(htmlToPlainText(match[3]))
        .filter((line) => line.length >= 3 && line.length <= 1200)
        .slice(0, 18),
    });
  }
  return blocks;
}

function classifyGuideHeading(value) {
  const heading = normalizeImportSearch(value);
  const rules = [
    ['guide.summary', /кратк.*(?:справ|вывод|итог|обзор)|tl.?dr|quick summary/],
    ['guide.pullAdvice', /стоит ли|нужно ли|(?:выбив|крут|получ).*(?:персонаж|геро)|pulling advice|pull advice/],
    ['guide.strengths', /плюс|сильн.*сторон|strength/],
    ['guide.weaknesses', /минус|слаб.*сторон|weakness/],
    ['guide.skillPriority', /навык.*приоритет|приоритет.*(?:навык|прокач)|прокач.*навык|skill priority/],
    ['guide.alternativeArcs', /альтернатив|f2p.*(?:arc|дуг)|(?:arc|дуг).*f2p|alternative arcs?/],
    ['guide.bestArcs', /лучш.*(?:дуг|arc|арк)|best arcs?/],
    ['guide.modules', /патрон|картридж|консол|модул|cartridge|console|module layout/],
    ['guide.mainStats', /основн.*(?:стат|характерист)|^характеристик|main stats?|приоритет характеристик/],
    ['guide.subStats', /саб.*стат|дополнительн.*(?:стат|характерист)|sub.?stats?/],
    ['guide.teams', /лучш.*команд|лучш.*состав|^команд|состав.*(?:команд|для)|отряд|best teams?/],
    ['guide.rotations', /ротац|rotation/],
    ['guide.tips', /как играть|совет|механик|управлен|how to play|tips?/],
  ];
  return rules.find(([, pattern]) => pattern.test(heading))?.[0] || '';
}

function localizeImportedGuideText(value) {
  const replacements = new Map([
    ['Baicang', 'Байканг'],
    ['Hotori', 'Хотори'],
    ['Nanally', 'Наналли'],
    ['Sakiri', 'Сакири'],
    ['Fadia', 'Фадия'],
    ['Daffodill', 'Даффодил'],
    ['Hathor', 'Хатор'],
    ['Jiuyuan', 'Цзююань'],
    ['Chiz', 'Чиз'],
    ['Mint', 'Минт'],
    ['Aurelia', 'Аурелия'],
    ['Adler', 'Адлер'],
    ['Skia', 'Ския'],
    ['Haniel', 'Ханиэль'],
    ['Edgar', 'Эдгар'],
    ['Lacrimosa', 'Лакримоза'],
    ['Esper Zero', 'Нулевой эспер'],
    ['DPS', 'ДД'],
    ['ATK', 'АТК'],
    ['Ultimate', 'сверхспособность'],
    ['Skill', 'навык'],
  ]);
  let result = String(value || '');
  for (const [source, target] of replacements) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(source)}\\b`, 'gi'), target);
  }
  return result.trim();
}

function parseEditorialGuideImport(html, source, character) {
  const plainText = htmlToPlainText(html);
  if (!compactImportLines(plainText).some((line) => lineMatchesCharacter(line, character))) {
    return [];
  }

  const labels = {
    'guide.summary': 'Краткий вывод',
    'guide.pullAdvice': 'Стоит ли качать',
    'guide.strengths': 'Плюсы',
    'guide.weaknesses': 'Минусы',
    'guide.skillPriority': 'Приоритет навыков',
    'guide.bestArcs': 'Лучшие дуги',
    'guide.alternativeArcs': 'Альтернативные дуги',
    'guide.modules': 'Модули и картриджи',
    'guide.mainStats': 'Основные статы',
    'guide.subStats': 'Саб-статы',
    'guide.teams': 'Лучшие команды',
    'guide.rotations': 'Ротации',
    'guide.tips': 'Советы и механики',
  };
  const rowsByField = new Map();
  let inheritedField = '';

  for (const block of extractGuideHeadingBlocks(html)) {
    const directField = classifyGuideHeading(block.heading);
    if (directField) inheritedField = directField;
    else if (block.level === 2) inheritedField = '';
    const field = directField || inheritedField;
    if (!field || !block.lines.length) continue;
    const heading = localizeImportedGuideText(block.heading);
    const description = localizeImportedGuideText(block.lines.join(' '));
    if (!isPredominantlyRussianText(description)) continue;
    const rows = rowsByField.get(field) || [];
    rows.push({
      title: hasRussianText(heading) ? heading : labels[field],
      description,
    });
    rowsByField.set(field, rows);
  }

  const suggestions = [...rowsByField].map(([field, rows]) => {
    const value =
      field === 'guide.summary'
        ? rows
            .map((row) => row.description)
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 2000)
        : rows;
    return makeImportSuggestion(
      field,
      labels[field],
      value,
      source,
      source.trust === 'high' ? 'high' : 'medium',
      'Это материал внешнего гайда. Подтвердите факты, формулировки и актуальность патча перед публикацией.',
    );
  });
  suggestions.push(
    makeImportSuggestion(
      'guide.videoUrl',
      'Видео-гайд',
      extractYoutubeUrls(html)[0] || '',
      source,
      'medium',
    ),
  );
  return suggestions.filter(Boolean);
}

function parseGameWithGuideImport(text, source, character) {
  const structured = parseGameWithStructuredGuideImport(text, source, character);
  const plainText = /<\/?[a-z][\s\S]*>/i.test(text) ? htmlToPlainText(text) : text;
  const lines = compactImportLines(plainText);
  if (!lines.some((line) => lineMatchesCharacter(line, character))) return [];
  const videoUrl = extractYoutubeUrls(text)[0] || '';
  return [
    ...structured,
    makeImportSuggestion('guide.videoUrl', 'Видео-гайд', videoUrl, source, 'medium'),
  ].filter(Boolean);
}

function parseGameWithStructuredGuideImport(text, source, character) {
  const item = parseEscapedGameWithJsonObject(text, 'item');
  if (!item) return [];
  const characterNames = characterNameCandidates(character);
  const importedNames = [item.slug, gameWithLocaleText(item.name), item.reading]
    .map((value) => normalizeImportSearch(value))
    .filter(Boolean);
  if (
    characterNames.length &&
    !characterNames.some((candidate) =>
      importedNames.some((name) => name.includes(candidate)),
    )
  ) {
    return [];
  }

  const signatureArcName = gameWithLocaleText(item.signatureArc?.name);
  const signatureArcIcon = normalizeExternalImageUrl(item.signatureArc?.iconUrl || '');
  const bestArcs = signatureArcName && hasRussianText(signatureArcName)
    ? [
        {
          name: signatureArcName,
          imageUrl: signatureArcIcon,
          description:
            'GameWith указывает эту дугу как связанную/сигнатурную. Финальную оценку BiS подтверждает редактор гайда.',
        },
      ]
    : [];
  return [
    makeImportSuggestion(
      'guide.bestArcs',
      'Сигнатурная дуга из источника',
      bestArcs,
      source,
      'medium',
      'Это не автоматический BiS-рейтинг: проверьте дугу и итоговую рекомендацию вручную.',
    ),
  ].filter(Boolean);
}

function parseIcyVeinsTierImport(text, source, character) {
  const name = character.originalName || character.name;
  const pattern = new RegExp(`\\b([SABCD])\\b[^\\n]{0,220}\\b${escapeRegExp(name)}\\b`, 'i');
  const match = text.match(pattern);
  return [
    makeImportSuggestion(
      'tier',
      'Подсказка для тир-листа',
      match?.[1] || '',
      source,
      'low',
      'Внешний тир-лист нужен как ориентир, финальную оценку подтверждает редакция NTE Meta.',
    ),
  ];
}

function parseGame8VoiceImport(text, source, character) {
  return parseVoiceTableImport(text, source, character, 'Game8');
}

function parseBtvaImport(text, source, character) {
  return parseVoiceTableImport(text, source, character, 'BTVA');
}

function gameWithLocaleText(value) {
  if (!value) return '';
  if (typeof value === 'string') return normalizeImportedRuText(value);
  if (typeof value !== 'object') return normalizeImportedRuText(value);
  return normalizeImportedRuText(value.ru || value.en || value.ja || value.cn || value.ko || '');
}

function formatGameWithRuDate(value, options = {}) {
  const raw = gameWithLocaleText(value);
  const match = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (!match) return formatRuImportDate(raw) || raw;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!month || !day) return raw;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(options.withoutYear ? {} : { year: 'numeric' }),
  }).format(date);
}

function translateGameWithElement(value) {
  const raw = gameWithLocaleText(value) || String(value || '');
  const normalized = normalizeImportSearch(raw);
  const direct = [
    ['呪', 'Чары'],
    ['混沌', 'Хаос'],
    ['精神', 'Психика'],
    ['魂', 'Анима'],
    ['相', 'Лакшана'],
  ].find(([key]) => raw.includes(key));
  if (direct) return direct[1];
  const ru = ['Чары', 'Хаос', 'Психика', 'Анима', 'Космос', 'Лакшана'].find((item) =>
    normalized.includes(normalizeImportSearch(item)),
  );
  return ru || translateEsperType(raw) || raw;
}

function translateGameWithArcType(value) {
  const raw = gameWithLocaleText(value) || String(value || '');
  const normalized = normalizeImportSearch(raw);
  if (
    [
      'camellia',
      'сообщество камелии',
      'arcana',
      'preferred arc',
      'best arc',
    ].some((item) => normalized.includes(normalizeImportSearch(item)))
  ) {
    return '';
  }
  const slug = [
    ['cluster', 'Гибридный'],
    ['hybrid', 'Гибридный'],
    ['solid', 'Твёрдый'],
    ['liquid', 'Жидкий'],
    ['gas', 'Газовый'],
    ['plasma', 'Плазменный'],
    ['condensate', 'Конденсат'],
  ].find(([key]) => normalized === key || normalized.includes(key));
  if (slug) return slug[1];
  const direct = [
    ['重合', 'Гибридный'],
    ['固', 'Твёрдый'],
    ['液', 'Жидкий'],
    ['気', 'Газовый'],
    ['プラズマ', 'Плазменный'],
    ['凝縮', 'Конденсат'],
  ].find(([key]) => raw.includes(key));
  if (direct) return direct[1];
  const ru = [
    'Гибридный',
    'Твёрдый',
    'Жидкий',
    'Газовый',
    'Плазменный',
    'Конденсат',
  ].find((item) => normalized.includes(normalizeImportSearch(item)));
  return ru || translateArcType(raw) || raw;
}

function translateGameWithRoleTags(value) {
  const raw = gameWithLocaleText(value) || String(value || '');
  const normalized = normalizeImportSearch(raw);
  const roles = [];
  if (/ダメージ|damage|урон/i.test(raw) || normalized.includes('урон')) roles.push('Урон');
  if (/main dps|основн/i.test(normalized)) roles.push('Основной ДД');
  if (/dot|periodic|период/i.test(normalized)) roles.push('Периодический урон');
  if (/support|поддерж/i.test(normalized)) roles.push('Поддержка');
  if (/heal|исцел|леч/i.test(normalized)) roles.push('Хилер');
  if (/buff|усилен|бафф/i.test(normalized)) roles.push('Баффер');
  return Array.from(new Set(roles));
}

function parseEscapedGameWithJsonObject(text, key) {
  const marker = '\\"' + key + '\\":';
  const start = String(text || '').indexOf(marker);
  if (start < 0) return null;
  const objectStart = text.indexOf('{', start + marker.length);
  if (objectStart < 0) return null;
  let depth = 0;
  for (let index = objectStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const raw = text.slice(objectStart, index + 1);
        const normalized = raw
          .replace(/\\"/g, '"')
          .replace(/\\u0026/g, '&')
          .replace(/\\n/g, '\\n');
        try {
          return JSON.parse(normalized);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function gameWithSkillDescription(entry) {
  const effect = gameWithLocaleText(entry?.effect);
  const initialStat = gameWithLocaleText(entry?.initialStat);
  return [effect, initialStat ? 'Базовые значения:\n' + initialStat : '']
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function isImportPlaceholderText(value) {
  const text = String(value || '').trim();
  return (
    !text ||
    /(?:^|_)GA_[A-Za-z0-9_]+_(?:name|des)$/i.test(text) ||
    /(?:Skill|Ultra|Attack|Passive|Support)_(?:name|des)$/i.test(text) ||
    /^(?:name|description|effect|undefined|null)$/i.test(text)
  );
}

function hasRussianText(value) {
  return /[а-яё]/i.test(String(value || ''));
}

function isPredominantlyRussianText(value, minimumRatio = 0.55) {
  const letters = String(value || '').match(/[a-zа-яё]/gi) || [];
  if (!letters.length) return false;
  const russianLetters = letters.filter((letter) => /[а-яё]/i.test(letter)).length;
  return russianLetters / letters.length >= minimumRatio;
}

function gameWithAbility(entry, type) {
  const name = normalizeImportedRuText(gameWithLocaleText(entry?.name));
  if (isImportPlaceholderText(name) || !hasRussianText(name)) return null;
  const description = normalizeImportedRuText(gameWithSkillDescription(entry));
  return {
    id: crypto.randomUUID(),
    name,
    type,
    iconUrl: normalizeExternalImageUrl(entry?.iconUrl || ''),
    description:
      !isImportPlaceholderText(description) && hasRussianText(description)
        ? description
        : 'Описание требует проверки в игре.',
  };
}

function firstGameWithEntry(section) {
  if (Array.isArray(section?.entries)) return section.entries[0];
  if (Array.isArray(section)) return section[0];
  return section;
}

function firstGameWithSkill(skills, keys) {
  for (const key of keys) {
    const entry = firstGameWithEntry(skills?.[key]);
    if (entry?.name || entry?.description || entry?.effect) return entry;
  }
  return null;
}

function parseGameWithStructuredAbilities(item) {
  const skills = item?.skills || {};
  const supportEntries = Array.isArray(skills.support) ? skills.support : [];
  const citySkills = Array.isArray(item?.citySkills) ? item.citySkills : [];
  const abilities = [
    gameWithAbility(
      firstGameWithSkill(skills, ['normalAttack', 'basicAttack', 'attack']),
      'Базовая атака',
    ),
    gameWithAbility(
      firstGameWithSkill(skills, ['bilane', 'skill', 'activeSkill']),
      'Навык',
    ),
    gameWithAbility(
      firstGameWithSkill(skills, ['exRail', 'ultimate', 'specialSkill']),
      'Сверхспособность',
    ),
    gameWithAbility(supportEntries[0], 'Навык поддержки'),
    gameWithAbility(supportEntries[1], 'Пассивный навык'),
    gameWithAbility(supportEntries[2], 'Пассивный навык'),
    gameWithAbility(citySkills[0], 'Повседневный навык'),
  ].filter(Boolean);

  if (abilities.filter((ability) => ability.type === 'Повседневный навык').length < 2) {
    abilities.push({
      id: crypto.randomUUID(),
      name: 'Не введено',
      type: 'Повседневный навык',
      iconUrl: '',
      description: 'В проверенных источниках не найден второй повседневный навык.',
    });
  }

  return abilities.slice(0, 8);
}

function parseGameWithStructuredAwakenings(item) {
  const effects = Array.isArray(item?.awakeningEffects) ? item.awakeningEffects : [];
  return effects
    .map((awakening) => ({
      level: Number(awakening.level || 0),
      name: gameWithLocaleText(awakening.name),
      iconUrl: normalizeExternalImageUrl(awakening.iconUrl || ''),
      description: gameWithLocaleText(awakening.effect),
    }))
    .filter((awakening) => awakening.level >= 1 && awakening.level <= 6 && awakening.name);
}


function formatGameWithMaterialCount(value) {
  if (value === undefined || value === null || value === '') return '';
  return '×' + String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function collectGameWithMaterialRows(groups, sourceLabel) {
  if (!Array.isArray(groups)) return [];
  const grouped = new Map();
  for (const group of groups) {
    const levelLabel = group?.level ? 'Ур. ' + group.level : sourceLabel;
    const items = Array.isArray(group?.items) ? group.items : [];
    for (const item of items) {
      const name = gameWithLocaleText(item?.name);
      if (!name) continue;
      const key = sourceLabel + ':' + name;
      const current = grouped.get(key) || {
        id: crypto.randomUUID(),
        name,
        iconUrl: '',
        amountParts: [],
        source: sourceLabel,
      };
      const count = formatGameWithMaterialCount(item?.count);
      current.amountParts.push(count ? levelLabel + ': ' + count : levelLabel);
      grouped.set(key, current);
    }
  }
  return Array.from(grouped.values()).map((item) => ({
    id: item.id,
    name: item.name,
    iconUrl: '',
    amount: item.amountParts.slice(0, 8).join('; '),
    source: item.source,
  }));
}

function collectGameWithStructuredMaterials(item) {
  return [
    ...collectGameWithMaterialRows(item?.breakthroughMaterials, 'Материалы прорыва'),
    ...collectGameWithMaterialRows(item?.skillUpgradeMaterials, 'Материалы навыков'),
    ...collectGameWithMaterialRows(item?.supportSkillMaterials, 'Материалы навыков поддержки'),
  ].slice(0, 80);
}

function parseGameWithStructuredCharacterImport(text, source, character) {
  const item = parseEscapedGameWithJsonObject(text, 'item');
  if (!item) return [];
  const characterNames = characterNameCandidates(character);
  const importedNames = [item.slug, gameWithLocaleText(item.name), item.reading]
    .map((value) => normalizeImportSearch(value))
    .filter(Boolean);
  if (
    characterNames.length &&
    !characterNames.some((candidate) => importedNames.some((name) => name.includes(candidate)))
  ) {
    return [];
  }

  const stats = [
    ['АТК', item.stats?.attack],
    ['ЗАЩ', item.stats?.defense],
    ['ОЗ', item.stats?.hp],
    ['Шанс крит.', item.stats?.critRate ? item.stats.critRate + '%' : ''],
    ['Урон крит.', item.stats?.critDamage ? item.stats.critDamage + '%' : ''],
    ['Усиление урона', item.stats?.damageBonus ? item.stats.damageBonus + '%' : '0%'],
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => ({ id: crypto.randomUUID(), label, value: String(value) }));

  const abilities = parseGameWithStructuredAbilities(item);
  const awakenings = parseGameWithStructuredAwakenings(item);
  const gifts = (Array.isArray(item.favoriteGifts) ? item.favoriteGifts : [])
    .map((gift) => gameWithLocaleText(gift))
    .filter(Boolean)
    .slice(0, 12)
    .map((name) => ({
      id: crypto.randomUUID(),
      name,
      iconUrl: '',
      effect: 'Любимый подарок для повышения симпатии; значение подтверждено источником GameWith.',
    }));
  const materials = collectGameWithStructuredMaterials(item);


  return [
    makeImportSuggestion('rarity', 'Редкость', String(item.rarity || '').match(/[SA]/)?.[0] || '', source, 'high'),
    makeImportSuggestion('attribute', 'Атрибут', translateGameWithElement(item.element), source, 'high'),
    makeImportSuggestion('profile.arcType', 'Тип дуги', translateGameWithArcType(item.arcType), source, 'high'),
    makeImportSuggestion('profile.faction', 'Фракция', gameWithLocaleText(item.profile?.faction), source, 'high'),
    makeImportSuggestion('profile.birthday', 'День рождения', formatGameWithRuDate(item.profile?.birthday, { withoutYear: true }), source, 'medium'),
    makeImportSuggestion('profile.biographyShort', 'Краткая биография', gameWithLocaleText(item.profileText), source, 'high'),
    makeImportSuggestion('profile.roleTags', 'Роли персонажа', translateGameWithRoleTags(item.role), source, 'medium'),
    makeImportSuggestion('profile.baseStats', 'Начальные показатели', stats, source, 'high'),
    makeImportSuggestion(
      'profile.materials',
      'Материалы прокачки',
      materials,
      source,
      'high',
      'Материалы собраны из структурированных данных GameWith; иконки сопоставляются по Fandom RU, когда файл найден.',
    ),
    makeImportSuggestion(
      'profile.abilities',
      'Способности',
      abilities,
      source,
      'high',
      'Навыки взяты из структурированных данных GameWith. Если название отличается от русской версии в игре, отклоните строку и заполните вручную.',
    ),
    makeImportSuggestion(
      'profile.awakenings',
      'Пробуждения',
      awakenings,
      source,
      'high',
      'Иконки пробуждений источник не отдаёт; их можно добавить вручную.',
    ),
    makeImportSuggestion(
      'profile.gifts',
      'Любимые подарки',
      gifts,
      source,
      'high',
      'GameWith отдаёт названия подарков без иконок; иконки можно добавить вручную.',
    ),
    makeImportSuggestion('imageUrl', 'Иконка персонажа', normalizeExternalImageUrl(item.iconUrl || ''), source, 'medium'),
  ].filter(Boolean);
}

function parseGameWithCharacterDetailImport(text, source, character) {
  const plainText = /<\/?[a-z][\s\S]*>/i.test(text) ? htmlToPlainText(text) : text;
  const lines = compactImportLines(plainText);
  if (!lines.some((line) => lineMatchesCharacter(line, character))) return [];
  const structuredSuggestions = parseGameWithStructuredCharacterImport(text, source, character);

  const nextAfter = (label) => {
    const index = lines.findIndex(
      (line) => normalizeImportSearch(line) === normalizeImportSearch(label),
    );
    return index >= 0 ? lines[index + 1] || '' : '';
  };
  const stats = [
    ['АТК', 'АТК'],
    ['ЗАЩ', 'ЗАЩ'],
    ['ОЗ', 'ОЗ'],
    ['Шанс крит.', 'Шанс крит.'],
    ['Урон крит.', 'Урон крит.'],
    ['Усиление урона', 'Усиление урона'],
  ]
    .map(([sourceLabel, label]) => ({
      id: crypto.randomUUID(),
      label,
      value: nextAfter(sourceLabel),
    }))
    .filter((item) => item.value);

  const abilityHeadings = [
    ['Обычная атака', 'Базовая атака'],
    ['Навык', 'Навык'],
    ['Завершение EX Rail', 'Сверхспособность'],
    ['Навыки поддержки', 'Навык поддержки'],
  ];
  const stopWords = [
    'Базовые значения',
    'Материалы улучшения навыков',
    'Пассивные эффекты',
    'Эффекты резонанса',
    'Городские навыки',
    'Любимые подарки',
    'Сообщество',
    'Meta Tier',
  ];
  const abilities = [];
  const majorHeadings = abilityHeadings.map(([heading]) => heading);
  for (const [heading, type] of abilityHeadings) {
    const index = lines.findIndex((line) => normalizeImportSearch(line).startsWith(normalizeImportSearch(heading)));
    if (index < 0) continue;
    const name = lines[index + 1] || heading;
    const nextMajor = lines.findIndex(
      (line, lineIndex) =>
        lineIndex > index &&
        majorHeadings.some((candidate) =>
          normalizeImportSearch(line).startsWith(normalizeImportSearch(candidate)),
        ),
    );
    const end = nextMajor > index ? nextMajor : Math.min(lines.length, index + 18);
    const description = lines
      .slice(index + 2, end)
      .filter((line) => !stopWords.some((word) => line.startsWith(word)))
      .slice(0, 6)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    abilities.push({
      id: crypto.randomUUID(),
      name,
      type,
      iconUrl: '',
      description: description || 'Описание требует проверки в игре.',
    });
  }

  const giftsStart = lines.findIndex((line) => line === 'Любимые подарки');
  const gifts =
    giftsStart >= 0
      ? lines
          .slice(giftsStart + 1, giftsStart + 14)
          .filter(
            (line) =>
              line &&
              !/^\d+$/.test(line) &&
              !/^NEW$|^Новый$|^Сообщество|^Meta Tier/i.test(line),
          )
          .slice(0, 10)
          .map((name) => ({
            id: crypto.randomUUID(),
            name,
            iconUrl: '',
            effect: 'Любимый подарок для повышения симпатии; проверьте значение в игре.',
          }))
      : [];

  return [
    ...structuredSuggestions,
    makeImportSuggestion('rarity', 'Редкость', nextAfter('Редкость').match(/[SA]/)?.[0] || '', source, 'high'),
    makeImportSuggestion('attribute', 'Атрибут', nextAfter('Стихия'), source, 'high'),
    makeImportSuggestion('profile.arcType', 'Тип дуги', nextAfter('Тип арки'), source, 'high'),
    makeImportSuggestion('profile.baseStats', 'Начальные показатели', stats, source, 'high'),
    makeImportSuggestion('profile.abilities', 'Способности', abilities.slice(0, 8), source, 'medium'),
    makeImportSuggestion('profile.gifts', 'Любимые подарки', gifts, source, 'medium'),
  ].filter(Boolean);
}

function parseGameWithCharacterImport(text, source, character) {
  const line = compactImportLines(text).find((item) =>
    lineMatchesCharacter(item, character),
  );
  if (!line) return [];

  const arcTypes = ['Твёрдый', 'Твёрдое', 'Жидкий', 'Жидкость', 'Гибридный', 'Газ', 'Плазма'];
  const arcType = arcTypes.find((item) =>
    normalizeImportSearch(line).includes(normalizeImportSearch(item)),
  );
  return [
    makeImportSuggestion(
      'profile.arcType',
      'Тип дуги',
      arcType || '',
      source,
      'medium',
      'GameWith показывает тип арки в каталоге персонажей; проверьте написание в профиле.',
    ),
  ];
}

function parseKaidenTierImport(text, source, character) {
  const candidates = characterNameCandidates(character);
  const tierRows = text.match(/\b[SABCD]\b[\s\S]{0,600}/g) || [];
  const row = tierRows.find((item) =>
    candidates.some((candidate) => normalizeImportSearch(item).includes(candidate)),
  );
  const tier = row?.match(/\b([SABCD])\b/)?.[1] || '';
  return [
    makeImportSuggestion(
      'tier',
      'Подсказка для тир-листа',
      tier,
      source,
      'low',
      'Внешний тир-лист нужен только как сигнал; итоговую позицию подтверждает редакция.',
    ),
  ];
}

function parseDubbingWikiVoiceImport(text, source, character) {
  const line = text
    .split(/\n/)
    .find((item) => lineMatchesCharacter(item, character));
  if (!line) return [];

  const cleaned = line
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const names = cleaned.split(/\s{2,}| {1,}(?=[A-ZА-ЯЁ][a-zа-яё]+ [A-ZА-ЯЁ])/).filter(Boolean);
  const actorCandidates = names.filter(
    (item) =>
      !lineMatchesCharacter(item, character) &&
      !/\b(TBA|Character|Actor|Original|Japanese|Dub)\b/i.test(item),
  );
  const voiceActors = [];
  if (actorCandidates[0]) voiceActors.push({ language: 'Китайский', name: actorCandidates[0] });
  if (actorCandidates[1]) voiceActors.push({ language: 'Японский', name: actorCandidates[1] });
  if (actorCandidates[2]) voiceActors.push({ language: 'Английский', name: actorCandidates[2] });

  return [
    makeImportSuggestion(
      'profile.voiceActors',
      'Актёры озвучки (Dubbing Wiki)',
      voiceActors,
      source,
      'medium',
      'Данные из community-wiki требуют ручной сверки перед публикацией.',
    ),
  ];
}

function parseVoiceTableImport(text, source, character, label) {
  const nearby = text
    .split(/\n/)
    .find((line) => lineMatchesCharacter(line, character));
  if (!nearby) return [];

  const voiceActors = [];
  const patterns = [
    ['Английский', /(?:English VA:|English Actor:|Dub Actor\s+)([^.;|]+?)(?=(?:Japanese|Chinese|Korean|$))/i],
    ['Японский', /(?:Japanese VA:|Japanese Actor\s+)([^.;|]+?)(?=(?:English|Chinese|Korean|$))/i],
    ['Китайский', /(?:Chinese VA:|Original Actor\s+)([^.;|]+?)(?=(?:English|Japanese|Korean|$))/i],
    ['Корейский', /(?:Korean VA:|Korean Actor\s+)([^.;|]+?)(?=(?:English|Japanese|Chinese|$))/i],
  ];
  for (const [language, pattern] of patterns) {
    const match = nearby.match(pattern);
    const name = match?.[1]?.replace(/\s+/g, ' ').trim();
    if (name && !/^(TBA|Unknown)$/i.test(name)) {
      voiceActors.push({ language, name });
    }
  }

  if (!voiceActors.length) {
    const fallback = nearby.match(/(?:voiced by|voice[:\s]+)([^.;|]+)/i)?.[1]?.trim();
    if (fallback) voiceActors.push({ language: 'Английский', name: fallback });
  }

  return [
    makeImportSuggestion(
      'profile.voiceActors',
      `Актёры озвучки (${label})`,
      voiceActors,
      source,
      'medium',
    ),
  ];
}

function parseOfficialImport(_text, source) {
  void source;
  return [];
}

function translateEsperType(value) {
  const normalized = normalizeImportSearch(value);
  const map = [
    ['cosmos', 'Космос'],
    ['chaos', 'Хаос'],
    ['psyche', 'Психика'],
    ['anima', 'Анима'],
    ['lakshana', 'Лакшана'],
    ['incantation', 'Чары'],
  ];
  return map.find(([key]) => normalized.includes(key))?.[1] || '';
}

function translateArcType(value) {
  const normalized = normalizeImportSearch(value);
  const map = [
    ['solid', 'Твёрдый'],
    ['liquid', 'Жидкий'],
    ['gas', 'Газовый'],
    ['plasma', 'Плазменный'],
    ['condensate', 'Конденсат'],
    ['hybrid', 'Гибридный'],
    ['cluster', 'Гибридный'],
  ];
  return map.find(([key]) => normalized.includes(key))?.[1] || '';
}

function translateCombatRole(value) {
  const normalized = normalizeImportSearch(value);
  const roles = [
    ['main dps', 'Основной ДД'],
    ['sub dps', 'Второстепенный ДД'],
    ['damage', 'Урон'],
    ['dot', 'Периодический урон'],
    ['buff', 'Баффер'],
    ['support', 'Поддержка'],
    ['healer', 'Хилер'],
    ['control', 'Контроль'],
    ['sustain', 'Выживаемость'],
  ];
  return roles
    .filter(([key]) => normalized.includes(key))
    .map(([, label]) => label);
}

function firstLineAfter(lines, label) {
  const index = lines.findIndex(
    (line) => normalizeImportSearch(line) === normalizeImportSearch(label),
  );
  return index >= 0 ? lines[index + 1] || '' : '';
}

function parseFandomAbilities(lines) {
  const abilityLabels = [
    ['Support Skill', 'Навык поддержки'],
    ['Basic Attack', 'Базовая атака'],
    ['Ultimate', 'Сверхспособность'],
    ['Passive', 'Пассивный навык'],
    ['Life Skill', 'Повседневный навык'],
    ['Skill', 'Навык'],
  ];
  const abilities = [];

  for (const line of lines) {
    const normalized = normalizeImportSearch(line);
    const label = abilityLabels.find(([sourceLabel]) =>
      normalized.startsWith(normalizeImportSearch(sourceLabel)),
    );
    if (!label) continue;

    const [sourceLabel, type] = label;
    const rest = line
      .replace(new RegExp(`^${escapeRegExp(sourceLabel)}\\s*-?\\s*`, 'i'), '')
      .trim();
    if (!rest || /^(type|name|description|total cost)$/i.test(rest)) continue;

    const parts = rest.split(/\s{2,}/).filter(Boolean);
    const name = parts[0] || rest.slice(0, 80);
    const description = parts.slice(1).join(' ') || rest;

    abilities.push({
      id: crypto.randomUUID(),
      name,
      type,
      iconUrl: '',
      description,
    });
  }

  return abilities.slice(0, 8);
}

function parseFandomCharacterImport(text, source, character) {
  const lines = compactImportLines(text);
  const suggestions = [];
  const candidates = characterNameCandidates(character);
  const joined = lines.join(' ');
  if (!candidates.some((candidate) => normalizeImportSearch(joined).includes(candidate))) {
    return [];
  }

  const birthday = firstLineAfter(lines, 'Birthday');
  const releaseDate = firstLineAfter(lines, 'Release Date');
  const profileWindow = lines
    .slice(0, Math.min(lines.length, 120))
    .join(' ');
  const esperType = translateEsperType(profileWindow);
  const arcType = translateArcType(profileWindow);
  const roleTags = translateCombatRole(profileWindow);
  const abilities = parseFandomAbilities(lines);

  suggestions.push(
    makeImportSuggestion('attribute', 'Атрибут', esperType, source, 'medium'),
    makeImportSuggestion('profile.arcType', 'Тип дуги', arcType, source, 'medium'),
    makeImportSuggestion('profile.birthday', 'День рождения', birthday, source, 'medium'),
    makeImportSuggestion(
      'profile.releaseDate',
      'Дата релиза',
      releaseDate,
      source,
      'medium',
    ),
    makeImportSuggestion(
      'profile.roleTags',
      'Роли персонажа',
      roleTags,
      source,
      'medium',
    ),
    makeImportSuggestion(
      'profile.abilities',
      'Навыки персонажа',
      abilities,
      source,
      'medium',
      'Проверьте названия и описания навыков по игре перед публикацией.',
    ),
  );

  return suggestions.filter(Boolean);
}

function normalizeImportImageSrc(value, sourceUrl) {
  const raw = decodeHtmlEntities(String(value || '').trim()).replace(/\\u0026/g, '&');
  if (!raw) return '';
  if (raw.startsWith('//')) return normalizeExternalImageUrl(`https:${raw}`);
  if (/^https?:\/\//i.test(raw)) return normalizeExternalImageUrl(raw);
  try {
    return normalizeExternalImageUrl(new URL(raw, sourceUrl).toString());
  } catch {
    return normalizeExternalImageUrl(raw);
  }
}

function extractImportImages(html, source, character = {}) {
  if (!source.extractImages) return [];
  const images = [];
  const titledImages = [];
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi,
    /(https:\/\/static\.wikia\.nocookie\.net\/neverness-to-everness\/images\/[^"'<>\s)]+)/gi,
    /<img[^>]+src=["']([^"']*article_tools\/nte\/gacha\/chara_[^"']+)["'][^>]*>/gi,
  ];

  for (const pattern of patterns) {
    for (const match of String(html || '').matchAll(pattern)) {
      const url = normalizeImportImageSrc(match[1] || match[0], source.url);
      if (
        url &&
        !images.includes(url) &&
        !/Icon|Logo|Fandom|App|Badge/i.test(url)
      ) {
        images.push(url);
      }
    }
  }
  for (const match of String(html || '').matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const alt =
      tag.match(/\balt=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\btitle=["']([^"']+)["']/i)?.[1] ||
      '';
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ||
      '';
    const title = cleanImportImageTitle(decodeHtmlEntities(alt));
    const url = normalizeImportImageSrc(src, source.url);
    if (!title || !url || /logo|fandom|app|badge|advert/i.test(title)) continue;
    titledImages.push({ title, url });
    if (!images.includes(url) && !/Icon|Logo|Fandom|App|Badge/i.test(url)) {
      images.push(url);
    }
  }

  const bestImage = images[0] || '';
  const imageMap = buildImportImageMap(titledImages, character);
  return [
    makeImportSuggestion(
      'imageUrl',
      'Карточка персонажа',
      bestImage,
      source,
      'medium',
      'Проверьте качество, кадрирование и права перед сохранением.',
    ),
    makeImportSuggestion(
      'splashUrl',
      'Splash персонажа',
      bestImage,
      source,
      'medium',
      'Можно использовать как временный splash, если изображение подходит.',
    ),
    makeImportSuggestion('__imageMap', 'Индекс изображений', imageMap, source, 'low'),
  ].filter(Boolean);
}

function buildKnownVoiceMediaSource(character) {
  const knownSources = new Map([
    [
      'hotori',
      {
        url: 'https://www.youtube.com/watch?v=3kVJaEinOG0',
        title: 'Hotori Voice Records / Profile Voice Lines',
      },
    ],
    [
      'chiz',
      {
        url: 'https://www.youtube.com/watch?v=y94feRER9KI',
        title: 'Chiz Voice Records / Profile Voice Lines',
      },
    ],
    [
      'skia',
      {
        url: 'https://www.youtube.com/watch?v=Qo3o25KqARM',
        title: 'Skia Voice Records / Profile Voice Lines',
      },
    ],
    [
      'hathor',
      {
        url: 'https://www.youtube.com/watch?v=Ywp_xIiIVHY',
        title: 'Hathor Voice Records / Profile Voice Lines',
      },
    ],
    [
      'lacrimosa',
      {
        url: 'https://www.youtube.com/watch?v=uLoAq4DvAOs',
        title: 'Lacrimosa Voice Records / Profile Voice Lines',
      },
    ],
    [
      'daffodill',
      {
        url: 'https://www.youtube.com/watch?v=wD0MX3GU3NM',
        title: 'Daffodill Voice Records / Profile Voice Lines',
      },
    ],
  ]);
  const sourceInfo = characterNameCandidates(character)
    .map((candidate) => knownSources.get(candidate))
    .find(Boolean);
  if (!sourceInfo) return null;

  const source = {
    id: 'youtube-voice-records',
    name: 'YouTube Voice Records',
    trust: 'medium',
    url: sourceInfo.url,
  };
  return {
    ...source,
    status: 'reference',
    message:
      `Найден видео-справочник «${sourceInfo.title}». Язык отдельных реплик и права на аудиофайлы источник не подтверждает, поэтому строки не создаются автоматически.`,
    suggestions: [],
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function parseImportSuggestionJson(item) {
  try {
    return JSON.parse(item.value);
  } catch {
    return null;
  }
}

function importImageMapFromSuggestions(items) {
  const map = new Map();
  for (const item of items) {
    if (!item || item.field !== '__imageMap') continue;
    const parsed = parseImportSuggestionJson(item);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    for (const [name, url] of Object.entries(parsed)) {
      const normalizedName = normalizeImportSearch(name);
      if (normalizedName && typeof url === 'string') {
        map.set(normalizedName, normalizeExternalImageUrl(url));
      }
    }
  }
  return map;
}

function findImportImageByName(imageMap, name, options = {}) {
  const candidates = importImageNameAliases(name)
    .map((item) => normalizeImportSearch(item))
    .filter(Boolean);
  for (const candidate of candidates) {
    const imageUrl = imageMap.get(candidate);
    if (imageUrl) return imageUrl;
  }
  if (options.fuzzy === false) return '';
  for (const candidate of candidates) {
    if (candidate.length < 4) continue;
    const fuzzy = [...imageMap.entries()].find(([key]) =>
      key.includes(candidate) || candidate.includes(key),
    );
    if (fuzzy?.[1]) return fuzzy[1];
  }
  return '';
}

function importMediaLookupLabels(entry, field = '') {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
  const record = entry;
  const labels = [];
  const add = (value) => {
    const clean = normalizeImportedRuText(value);
    if (!clean || clean === 'Не введено') return;
    if (!labels.some((label) => normalizeImportSearch(label) === normalizeImportSearch(clean))) {
      labels.push(clean);
    }
  };

  add(record.name || record.rewardName || record.title || record.label);

  if (field === 'profile.abilities') {
    add([record.type, record.name].filter(Boolean).join(' '));
    add([record.name, record.type].filter(Boolean).join(' '));
    add(`${record.name || ''} Иконка`);
    add(`${record.name || ''} Icon`);
    add(`${record.name || ''} Skill`);
  }

  if (field === 'profile.awakenings' && Number(record.level) > 0) {
    add(`Пробуждение ${record.level}`);
    add(`Пробуждение ${record.level} ${record.name || ''}`);
    add(`Пробуждение ${record.level} Иконка`);
    add(`C${record.level}`);
    add(`C${record.level} ${record.name || ''}`);
    add(`C${record.level} Icon`);
    add(`A${record.level}`);
    add(`A${record.level} ${record.name || ''}`);
    add(`A${record.level} Icon`);
  }

  return labels;
}

function enrichArraySuggestionMedia(item, imageMap) {
  if (
    !imageMap.size ||
    !item ||
    ![
      'profile.materials',
      'profile.gifts',
      'profile.abilities',
      'profile.awakenings',
      'profile.skins',
      'profile.friendship',
    ].includes(item.field)
  ) {
    return item;
  }
  const parsed = parseImportSuggestionJson(item);
  if (!Array.isArray(parsed)) return item;
  let changed = false;
  const allowFuzzyMediaMatch = !['profile.abilities', 'profile.awakenings'].includes(item.field);
  const nextValue = parsed.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const record = entry;
    const imageUrl = importMediaLookupLabels(record, item.field)
      .map((label) => findImportImageByName(imageMap, label, { fuzzy: allowFuzzyMediaMatch }))
      .find(Boolean);
    if (!imageUrl) return entry;
    if ('imageUrl' in record && !record.imageUrl) {
      changed = true;
      return { ...record, imageUrl };
    }
    if ('rewardIconUrl' in record && !record.rewardIconUrl) {
      changed = true;
      return { ...record, rewardIconUrl: imageUrl };
    }
    if ('iconUrl' in record && !record.iconUrl) {
      changed = true;
      return { ...record, iconUrl: imageUrl };
    }
    return entry;
  });
  if (!changed) return item;
  const cleanValue = JSON.stringify(nextValue);
  const mediaNote = 'Иконки сопоставлены по названию или алиасам файла из Fandom RU; проверьте превью перед сохранением.';
  return {
    ...item,
    id: item.id + ':media:' + hashText(cleanValue).slice(0, 8),
    value: cleanValue,
    note: item.note ? item.note + ' ' + mediaNote : mediaNote,
  };
}

function abilityDescriptionScore(ability) {
  const description = String(ability?.description || '').trim();
  if (!description || /требует проверки|не найден/i.test(description)) return 0;
  return Math.min(description.length, 1200);
}

const IMPORT_CONFIDENCE_WEIGHT = { high: 30, medium: 20, low: 10 };

function importSuggestionSourceWeight(item) {
  const source = `${item.sourceName} ${item.sourceUrl}`.toLocaleLowerCase('ru-RU');
  if (item.field === 'profile.biography' || item.field === 'profile.biographyShort') {
    if (source.includes('официаль')) return 120;
    if (source.includes('interactivemap')) return 118;
    if (source.includes('fandom ru')) return 115;
    if (source.includes('gamewith')) return 75;
    if (source.includes('genshinbuilds')) return 50;
  }
  if (
    item.field === 'profile.arcType' ||
    item.field === 'profile.faction' ||
    item.field === 'profile.roleTags'
  ) {
    if (source.includes('interactivemap')) return 122;
    if (source.includes('fandom ru')) return 120;
    if (source.includes('официаль')) return 110;
  }
  if (item.field === 'imageUrl' || item.field === 'splashUrl') {
    if (source.includes('медиатека персонажа')) return 125;
    if (source.includes('изображения')) return 120;
    if (source.includes('fandom ru')) return 110;
  }
  if (source.includes('официаль')) return 100;
  if (source.includes('interactivemap')) return 118;
  if (source.includes('медиатека персонажа')) return 98;
  if (source.includes('fandom ru')) return 95;
  if (source.includes('gamewith')) return 90;
  if (source.includes('nte wiki')) return 70;
  if (source.includes('genshinbuilds')) return 60;
  if (source.includes('icy') || source.includes('kaiden')) return 45;
  return 50;
}

function importSuggestionScore(item) {
  return (
    importSuggestionSourceWeight(item) +
    (IMPORT_CONFIDENCE_WEIGHT[item.confidence] || 0)
  );
}

const PROFILE_COLLECTION_MERGE_CONFIGS = [
  {
    field: 'profile.roleTags',
    label: 'Роли персонажа',
    limit: 12,
    preferTopCandidate: true,
    key: (entry) => normalizeImportSearch(entry),
  },
  {
    field: 'profile.roleIcons',
    label: 'Иконки ролей',
    limit: 12,
    key: (entry) => normalizeImportSearch(entry?.name),
  },
  {
    field: 'profile.voiceActors',
    label: 'Актёры озвучки',
    limit: 12,
    key: (entry) => normalizeImportSearch(entry?.language),
  },
  {
    field: 'profile.materials',
    label: 'Материалы прокачки',
    limit: 80,
    key: (entry) => normalizeImportSearch(entry?.name),
  },
  {
    field: 'profile.baseStats',
    label: 'Начальные показатели',
    limit: 40,
    key: (entry) => normalizeImportSearch(entry?.label),
  },
  {
    field: 'profile.awakenings',
    label: 'Пробуждения',
    limit: 7,
    key: (entry) => `level:${Number(entry?.level)}`,
    sort: (left, right) => Number(left?.level) - Number(right?.level),
  },
  {
    field: 'profile.friendship',
    label: 'Симпатия',
    limit: 10,
    key: (entry) => `level:${Number(entry?.level)}`,
    sort: (left, right) => Number(left?.level) - Number(right?.level),
  },
  {
    field: 'profile.gifts',
    label: 'Любимые подарки',
    limit: 30,
    key: (entry) => normalizeImportSearch(entry?.id || entry?.name),
  },
  {
    field: 'profile.skins',
    label: 'Гардероб',
    limit: 30,
    key: (entry) => normalizeImportSearch(entry?.id || entry?.name),
  },
  {
    field: 'profile.voiceLines',
    label: 'Реплики озвучки',
    limit: 200,
    key: (entry) =>
      `${normalizeImportSearch(entry?.language)}:${normalizeImportSearch(entry?.title)}`,
  },
];

function isUsefulImportCollectionValue(value) {
  const text = String(value || '').trim();
  return Boolean(text && !/требует проверки|не найден|undefined|null/i.test(text));
}

function mergeImportCollectionEntry(primary, fallback) {
  if (typeof primary === 'string' || typeof fallback === 'string') {
    return primary || fallback;
  }
  const merged = { ...fallback, ...primary };
  for (const key of new Set([
    ...Object.keys(fallback || {}),
    ...Object.keys(primary || {}),
  ])) {
    const current = primary?.[key];
    const candidate = fallback?.[key];
    if (!isUsefulImportCollectionValue(current) && isUsefulImportCollectionValue(candidate)) {
      merged[key] = candidate;
      continue;
    }
    if (
      ['description', 'source', 'effect'].includes(key) &&
      isUsefulImportCollectionValue(candidate) &&
      String(candidate).length > String(current || '').length
    ) {
      merged[key] = candidate;
    }
  }
  return merged;
}

function mergeProfileCollectionImportSuggestions(items, config) {
  const candidates = items
    .filter((item) => item?.field === config.field)
    .map((item) => ({ item, value: parseImportSuggestionJson(item) }))
    .filter(({ value }) => Array.isArray(value) && value.length)
    .sort((left, right) => importSuggestionScore(right.item) - importSuggestionScore(left.item));
  if (candidates.length < 2) return null;

  if (config.preferTopCandidate) {
    const best = candidates[0];
    const limited = best.value
      .filter((entry) => config.key(entry))
      .slice(0, config.limit);
    if (!limited.length) return null;
    const cleanValue = JSON.stringify(limited);
    return {
      ...best.item,
      id: `preferred:${config.field}:${hashText(cleanValue).slice(0, 10)}`,
      label: config.label,
      value: cleanValue,
      note: [
        best.item.note,
        `Выбран целостный набор из наиболее надёжного источника: ${best.item.sourceName}.`,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  const rows = new Map();
  for (const candidate of candidates) {
    for (const entry of candidate.value) {
      const key = config.key(entry);
      if (!key || /level:nan$/.test(key)) continue;
      const current = rows.get(key);
      rows.set(key, current ? mergeImportCollectionEntry(current, entry) : entry);
    }
  }
  const merged = [...rows.values()];
  if (config.sort) merged.sort(config.sort);
  const limited = merged.slice(0, config.limit);
  if (!limited.length) return null;

  const cleanValue = JSON.stringify(limited);
  const sourceNames = [...new Set(
    candidates.map(({ item }) => item.sourceName).filter(Boolean),
  )];
  return {
    id: `merged:${config.field}:${hashText(cleanValue).slice(0, 10)}`,
    field: config.field,
    label: config.label,
    value: cleanValue,
    sourceName: 'Сводка проверенных источников',
    sourceUrl: candidates[0].item.sourceUrl,
    confidence: 'high',
    note: `Источники: ${sourceNames.join(', ')}. Более надёжные значения сохранены, а пустые описания и медиа дополнены. Подтвердите каждую строку отдельно.`,
  };
}

function mergeAbilityImportSuggestions(items) {
  const abilityItems = items
    .filter((item) => item?.field === 'profile.abilities')
    .map((item) => ({ item, value: parseImportSuggestionJson(item) }))
    .filter(({ value }) => Array.isArray(value) && value.length);
  if (abilityItems.length < 2) return null;

  const sorted = [...abilityItems].sort((a, b) => {
    const score = (entry) =>
      entry.value.reduce((sum, ability) => sum + abilityDescriptionScore(ability), 0);
    return score(b) - score(a);
  });
  const base = sorted[0];
  const maxLength = Math.min(
    8,
    Math.max(...abilityItems.map(({ value }) => value.length), base.value.length),
  );
  const merged = Array.from({ length: maxLength }, (_, index) => {
    const candidates = abilityItems
      .map(({ item, value }) => ({ item, ability: value[index] }))
      .filter(({ ability }) => Boolean(ability));
    const hasCleanName = ({ ability }) => {
      const name = normalizeImportedRuText(ability?.name || '');
      return (
        name &&
        !isImportPlaceholderText(name) &&
        !/bilane|rail|skill|attack|ultra|support/i.test(name)
      );
    };
    const withDescription =
      candidates.find(({ ability }) => abilityDescriptionScore(ability) > 0)?.ability ||
      base.value[index] ||
      candidates[0]?.ability;
    const preferredName =
      candidates.find((candidate) => {
        if (!hasCleanName(candidate)) return false;
        const source = `${candidate.item.sourceName} ${candidate.item.sourceUrl}`.toLocaleLowerCase('ru-RU');
        return (
          source.includes('genshinbuilds') ||
          source.includes('interactivemap') ||
          source.includes('nte wiki') ||
          source.includes('fandom ru')
        );
      }) || candidates.find(hasCleanName);
    const withCleanName =
      preferredName?.ability || withDescription;
    const importedName =
      withCleanName?.name || withDescription?.name || 'Требует проверки';
    return {
      ...withDescription,
      id: withDescription?.id || crypto.randomUUID(),
      name: isImportPlaceholderText(importedName)
        ? 'Требует проверки'
        : importedName,
      type: withCleanName?.type || withDescription?.type || 'Навык',
      iconUrl: withCleanName?.iconUrl || withDescription?.iconUrl || '',
      description:
        withDescription?.description ||
        withCleanName?.description ||
        'Описание требует проверки в игре.',
    };
  });

  return {
    id: `merged:profile.abilities:${hashText(JSON.stringify(merged)).slice(0, 10)}`,
    field: 'profile.abilities',
    label: 'Способности',
    value: JSON.stringify(merged),
    sourceName: 'Сводка проверенных источников',
    sourceUrl: base.item.sourceUrl,
    confidence: 'high',
    note:
      'Названия, описания и иконки объединены из нескольких источников. Подтвердите каждую строку перед сохранением.',
  };
}

function completeKnownAbilitySlots(suggestion, character) {
  if (!suggestion || nevernessAppCharacterCode(character) !== 'cang') return suggestion;
  const current = parseImportSuggestionJson(suggestion);
  if (!Array.isArray(current) || !current.length) return suggestion;

  const expected = [
    ['Базовая атака', 'Слово и действие', 'Описание требует проверки в игре.'],
    ['Навык', 'Щедрое руководство', 'Описание требует проверки в игре.'],
    ['Сверхспособность', 'Суд осени', 'Описание требует проверки в игре.'],
    ['Навык поддержки', 'Перерыв окончен', 'Описание требует проверки в игре.'],
    ['Пассивный навык', 'Умеренное озорство', 'Описание требует проверки в игре.'],
    ['Пассивный навык', 'Умеренная работа', 'Описание требует проверки в игре.'],
    [
      'Повседневный навык',
      'Цветение в зените',
      'На 1-м уровне Байканг увеличивает поток на 18 ед. Масштабирование следующих уровней требует проверки.',
    ],
    [
      'Повседневный навык',
      'Не введено',
      'В проверенных источниках второй повседневный навык не указан.',
    ],
  ];
  const completed = expected.map(([type, name, fallbackDescription], index) => {
    const ability = current[index] || {};
    return {
      ...ability,
      id: ability.id || `ability-baicang-${index + 1}`,
      type,
      name,
      iconUrl: ability.iconUrl || '',
      description: isUsefulImportCollectionValue(ability.description)
        ? ability.description
        : fallbackDescription,
    };
  });
  return {
    ...suggestion,
    id: `completed:profile.abilities:${hashText(JSON.stringify(completed)).slice(0, 10)}`,
    value: JSON.stringify(completed),
    note: `${suggestion.note || ''} Порядок и два повседневных слота сверены с русской страницей GameWith.`.trim(),
  };
}

function enrichCharacterImportSuggestions(items, character = {}) {
  const imageMap = importImageMapFromSuggestions(items);
  const enriched = items.map((item) => enrichArraySuggestionMedia(item, imageMap));
  const mergedAbilities = completeKnownAbilitySlots(
    mergeAbilityImportSuggestions(enriched),
    character,
  );
  const mergedCollections = PROFILE_COLLECTION_MERGE_CONFIGS.map((config) =>
    mergeProfileCollectionImportSuggestions(enriched, config),
  ).filter(Boolean);
  const roleTagsSuggestion =
    mergedCollections.find((item) => item.field === 'profile.roleTags') ||
    enriched.find((item) => item?.field === 'profile.roleTags');
  const importedRoleTags = parseImportSuggestionJson(roleTagsSuggestion);
  const roleIcons = Array.isArray(importedRoleTags)
    ? importedRoleTags
        .map((name) => ({
          name: String(name || '').trim(),
          iconUrl: findImportImageByName(imageMap, `Роль ${name}`, {
            fuzzy: false,
          }),
        }))
        .filter((item) => item.name && item.iconUrl)
    : [];
  const roleIconSuggestion = roleIcons.length
    ? {
        id: `merged:profile.roleIcons:${hashText(JSON.stringify(roleIcons)).slice(0, 10)}`,
        field: 'profile.roleIcons',
        label: 'Иконки ролей',
        value: JSON.stringify(roleIcons),
        sourceName: 'Fandom RU: изображения ролей',
        sourceUrl:
          enriched.find((item) => item?.field === '__imageMap')?.sourceUrl || '',
        confidence: 'high',
        note:
          'Иконки сопоставлены с подтверждёнными русскими названиями ролей. Подтвердите каждую строку.',
      }
    : null;
  const mergedFields = new Set(mergedCollections.map((item) => item.field));
  return [
    ...enriched.filter(
      (item) =>
        (!mergedAbilities || item?.field !== 'profile.abilities') &&
        !mergedFields.has(item?.field),
    ),
    ...(mergedAbilities
      ? [enrichArraySuggestionMedia(mergedAbilities, imageMap)]
      : []),
    ...mergedCollections.map((item) => enrichArraySuggestionMedia(item, imageMap)),
    ...(roleIconSuggestion ? [roleIconSuggestion] : []),
  ];
}

function dedupeImportSuggestions(items) {
  const scalarFields = new Set([
    'name',
    'originalName',
    'rarity',
    'attribute',
    'tier',
    'imageUrl',
    'splashUrl',
    'profile.arcType',
    'profile.birthday',
    'profile.releaseDate',
    'profile.faction',
    'profile.biographyShort',
    'profile.biography',
    'profile.baseStats',
    'profile.abilities',
    'profile.awakenings',
    'profile.materials',
    'profile.roleTags',
    'profile.roleIcons',
    'profile.voiceActors',
    'profile.friendship',
    'profile.gifts',
    'profile.skins',
    'profile.voiceLines',
  ]);

  const bestByField = new Map();
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item || item.field.startsWith('__')) continue;
    const key = `${item.field}:${item.value}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (item.field === 'tier' || item.field.startsWith('guide.')) continue;

    if (scalarFields.has(item.field)) {
      const current = bestByField.get(item.field);
      if (!current || importSuggestionScore(item) > importSuggestionScore(current)) {
        bestByField.set(item.field, item);
      }
      continue;
    }

    result.push(item);
  }

  return [...bestByField.values(), ...result];
}

function dedupeGuideImportSuggestions(items) {
  const limits = {
    'guide.pullAdvice': 6,
    'guide.strengths': 12,
    'guide.weaknesses': 12,
    'guide.bestArcs': 12,
    'guide.alternativeArcs': 12,
    'guide.modules': 16,
    'guide.mainStats': 12,
    'guide.subStats': 12,
    'guide.rotations': 20,
    'guide.tips': 24,
    'guide.teams': 16,
  };
  const grouped = new Map();
  for (const item of items) {
    if (!item?.field?.startsWith('guide.')) continue;
    const current = grouped.get(item.field) || [];
    current.push(item);
    grouped.set(item.field, current);
  }

  const result = [];
  for (const [field, candidates] of grouped) {
    const sorted = [...candidates].sort(
      (left, right) => importSuggestionScore(right) - importSuggestionScore(left),
    );
    if (field === 'guide.videoUrl') {
      const best = sorted.find((item) => isUsefulImportCollectionValue(item.value));
      if (best) result.push(best);
      continue;
    }

    const rows = new Map();
    for (const candidate of sorted) {
      const value = parseImportSuggestionJson(candidate);
      if (!Array.isArray(value)) continue;
      for (const entry of value) {
        const primaryText =
          typeof entry === 'string'
            ? entry
            : entry?.name || entry?.title || entry?.label || entry?.description || '';
        if (!hasRussianText(primaryText)) continue;
        const key = normalizeImportSearch(
          primaryText,
        );
        if (!key) continue;
        const current = rows.get(key);
        rows.set(key, current ? mergeImportCollectionEntry(current, entry) : entry);
      }
    }
    if (!rows.size) {
      if (sorted[0]) result.push(sorted[0]);
      continue;
    }

    const merged = [...rows.values()].slice(0, limits[field] || 24);
    const cleanValue = JSON.stringify(merged);
    const sourceNames = [...new Set(sorted.map((item) => item.sourceName).filter(Boolean))];
    result.push({
      id: `merged:${field}:${hashText(cleanValue).slice(0, 10)}`,
      field,
      label: sorted[0].label,
      value: cleanValue,
      sourceName: 'Сводка проверенных источников',
      sourceUrl: sorted[0].sourceUrl,
      confidence: sorted[0].confidence,
      note: `Источники: ${sourceNames.join(', ')}. Добавляйте только подтверждённые строки; место персонажа берётся из единого тир-листа NTE Meta.`,
    });
  }
  return result;
}

function collectImportMediaLookupNames(items) {
  const names = [];
  const add = (value) => {
    const clean = normalizeImportedRuText(value);
    if (!clean || clean === 'Не введено' || clean.length < 3 || clean.length > 80) return;
    if (!names.some((name) => normalizeImportSearch(name) === normalizeImportSearch(clean))) {
      names.push(clean);
    }
  };

  for (const item of items) {
    if (
      !item ||
      ![
        'profile.abilities',
        'profile.awakenings',
        'profile.gifts',
        'profile.materials',
        'profile.skins',
        'profile.friendship',
      ].includes(item.field)
    ) {
      continue;
    }
    const parsed = parseImportSuggestionJson(item);
    if (!Array.isArray(parsed)) continue;
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      for (const label of importMediaLookupLabels(entry, item.field)) {
        add(label);
      }
    }
  }

  return names.slice(0, IMPORT_MEDIA_LOOKUP_LIMIT);
}

async function fetchFandomMediaLookupSource(items) {
  const names = collectImportMediaLookupNames(items);
  const source = {
    id: 'fandom-ru-media-lookup',
    name: 'Fandom RU: поиск иконок',
    trust: 'high',
    url: 'https://neverness-to-everness.fandom.com/ru/api.php?action=query&list=allimages',
  };
  if (!names.length) {
    return {
      ...source,
      status: 'partial',
      message: 'Нет названий для поиска иконок.',
      suggestions: [],
    };
  }

  const imageMap = {};
  await mapWithConcurrency(
    names,
    3,
    async (name) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), IMPORT_SOURCE_TIMEOUT_MS);
      try {
        const response = await fetch(
          `${source.url}&aifrom=${encodeURIComponent(name)}&ailimit=6&aiprop=url|mime|size|dimensions&format=json&formatversion=2&origin=*`,
          {
            headers: {
              accept: 'application/json',
              'user-agent': 'NTE-Meta-Editorial/1.0 (+https://bonaqu.github.io/nte-meta/)',
            },
            signal: controller.signal,
          },
        );
        if (!response.ok) return;
        const payload = await response.json();
        const normalizedName = normalizeImportSearch(name);
        const exactImages = (payload?.query?.allimages || [])
          .map((image) => ({
            title: image.name || '',
            url: normalizeExternalImageUrl(image.url || ''),
          }))
          .filter((image) => {
            const title = normalizeImportSearch(cleanImportImageTitle(image.title));
          return (
            image.url &&
            (title.startsWith(normalizedName) || title.includes(normalizedName))
          );
          });
        Object.assign(imageMap, buildImportImageMap(exactImages, {}));
      } catch {
        // Media lookup is best-effort; missing icons should not block text import.
      } finally {
        clearTimeout(timeout);
      }
    },
  );

  const suggestion = makeImportSuggestion('__imageMap', 'Индекс иконок', imageMap, source, 'low');
  return {
    ...source,
    status: suggestion ? 'ok' : 'partial',
    message: suggestion
      ? 'Найдены точные совпадения файлов для части строк.'
      : 'Иконки навыков, пробуждений, подарков или материалов по точным названиям не найдены.',
    suggestions: suggestion ? [suggestion] : [],
  };
}

async function handleCharacterImportLookup(request, env) {
  await requireContentPermission(request, env, 'characters', 'edit');
  if (request.method !== 'POST') {
    return json({ error: 'Метод не поддерживается' }, 405);
  }
  await rateLimit(request, env, 'character-import', 12, 60);
  const body = await readJson(request);
  const query = cleanString(body.query, 2, 120);
  const character =
    (await env.DB.prepare(
      'SELECT slug, name, original_name FROM characters WHERE slug = ? OR name = ? OR original_name = ? LIMIT 1',
    )
      .bind(query, query, query)
      .first()) || {};
  const slug = character.slug || normalizeImportSlug(query);
  if (!slug) {
    return json({
      data: {
        found: false,
        message:
          'Не удалось определить slug персонажа. Сначала выберите существующего персонажа или заполните латинское имя.',
        sources: [],
        suggestions: [],
        fields: {},
      },
    });
  }
  const importCharacter = {
      name: character.name || query,
      originalName: character.original_name || query,
      slug,
    };
  const sourceResults = await mapWithConcurrency(
    selectImportSources(characterImportSources(slug, importCharacter)),
    IMPORT_FETCH_CONCURRENCY,
    (source) => fetchImportSource(source, importCharacter),
  );
  const voiceActorSource = buildKnownVoiceActorSource({
    name: character.name || query,
    originalName: character.original_name || query,
    slug,
  });
  if (voiceActorSource) sourceResults.push(voiceActorSource);
  const voiceMediaSource = buildKnownVoiceMediaSource({
    name: character.name || query,
    originalName: character.original_name || query,
    slug,
  });
  if (voiceMediaSource) sourceResults.push(voiceMediaSource);
  const affinitySource = buildKnownAffinitySource({
    name: character.name || query,
    originalName: character.original_name || query,
    slug,
  });
  if (affinitySource) sourceResults.push(affinitySource);
  const rawSuggestions = sourceResults.flatMap((source) => source.suggestions);
  sourceResults.push(await fetchFandomMediaLookupSource(rawSuggestions));
  const suggestions = dedupeImportSuggestions(
    enrichCharacterImportSuggestions(
      sourceResults.flatMap((source) => source.suggestions),
      importCharacter,
    ),
  );
  return json({
    data: {
      found: suggestions.length > 0,
      message: suggestions.length
        ? `Найдено ${suggestions.length} предложений. Подтвердите каждую строку перед сохранением.`
        : `Для "${query}" не найдено структурированных данных. Проверьте источники вручную.`,
      sources: sourceResults.map((source) => ({
        id: source.id,
        name: source.name,
        url: source.url,
        trust: source.trust,
        status: source.status,
        message: source.message,
      })),
      suggestions,
      fields: Object.fromEntries(
        suggestions
          .filter((suggestion) => !suggestion.field.startsWith('guide.'))
          .map((suggestion) => [suggestion.field, suggestion.value]),
      ),
    },
  });
}

async function handleGuideImportLookup(request, env) {
  await requireContentPermission(request, env, 'guides', 'edit');
  if (request.method !== 'POST') {
    return json({ error: 'Метод не поддерживается' }, 405);
  }
  await rateLimit(request, env, 'guide-import', 12, 60);
  const body = await readJson(request);
  let query = cleanString(body.query || '', 0, 120);
  let character = {};

  const guideId = cleanString(body.guideId || '', 0, 80);
  if (guideId) {
    const guideRow = await env.DB.prepare(
      `SELECT characters.slug, characters.name, characters.original_name
      FROM guides
      JOIN characters ON characters.id = guides.character_id
      WHERE guides.id = ?
      LIMIT 1`,
    )
      .bind(guideId)
      .first();
    if (guideRow) {
      character = guideRow;
      query = guideRow.name || guideRow.original_name || guideRow.slug || query;
    }
  }

  if (!query || query.length < 2) {
    return json({ error: 'Укажите персонажа для поиска источников гайда' }, 400);
  }

  if (!character.slug) {
    character =
      (await env.DB.prepare(
        'SELECT slug, name, original_name FROM characters WHERE slug = ? OR name = ? OR original_name = ? LIMIT 1',
      )
        .bind(query, query, query)
        .first()) || {};
  }

  const slug = character.slug || normalizeImportSlug(query);
  if (!slug) {
    return json({
      data: {
        found: false,
        message: 'Не удалось определить персонажа для импорта гайда.',
        sources: [],
        suggestions: [],
        fields: {},
      },
    });
  }

  const importCharacter = {
    name: character.name || query,
    originalName: character.original_name || query,
    slug,
  };
  const sourceResults = await mapWithConcurrency(
    selectImportSources(guideImportSources(slug, importCharacter)),
    IMPORT_FETCH_CONCURRENCY,
    (source) => fetchImportSource(source, importCharacter),
  );
  const suggestions = dedupeGuideImportSuggestions(
    sourceResults.flatMap((source) => source.suggestions),
  );

  return json({
    data: {
      found: suggestions.length > 0,
      message: suggestions.length
        ? `Найдено ${suggestions.length} предложений для гайда. Подтвердите каждую строку.`
        : `Для "${query}" не найдено структурированных guide-данных. Проверьте источники вручную.`,
      sources: sourceResults.map((source) => ({
        id: source.id,
        name: source.name,
        url: source.url,
        trust: source.trust,
        status: source.status,
        message: source.message,
      })),
      suggestions,
      fields: Object.fromEntries(
        suggestions.map((suggestion) => [suggestion.field, suggestion.value]),
      ),
    },
  });
}

const MAX_PROXIED_MEDIA_BYTES = 2 * 1024 * 1024;

async function handleMediaProxy(request, ctx) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return json({ error: 'Метод не поддерживается' }, 405);
  }
  const requestUrl = new URL(request.url);
  const rawTarget = requestUrl.searchParams.get('url') || '';
  if (!rawTarget || rawTarget.length > 2048) {
    return json({ error: 'Некорректная ссылка на медиа' }, 400);
  }

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    return json({ error: 'Некорректная ссылка на медиа' }, 400);
  }
  if (
    target.protocol !== 'https:' ||
    target.hostname !== 'www.neverness.app' ||
    !/^\/assets\/codex\/(?:likeability|outfits)\/[A-Za-z0-9_./-]+\.webp$/i.test(
      target.pathname,
    )
  ) {
    return json({ error: 'Этот источник медиа не разрешён' }, 403);
  }

  const cache = globalThis.caches?.default;
  const cacheKey = new globalThis.Request(request.url, { method: 'GET' });
  if (request.method === 'GET' && cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(cached.body, cached);
  }

  const upstream = await fetch(target.toString(), {
    headers: { accept: 'image/webp,image/*;q=0.8' },
    redirect: 'manual',
  });
  if (!upstream.ok) {
    return json({ error: 'Изображение источника временно недоступно' }, 502);
  }
  const contentType = upstream.headers.get('Content-Type') || '';
  const contentLength = Number(upstream.headers.get('Content-Length') || 0);
  if (
    !/^image\/(?:webp|png|jpeg)$/i.test(contentType) ||
    contentLength > MAX_PROXIED_MEDIA_BYTES
  ) {
    return json({ error: 'Источник вернул неподдерживаемое изображение' }, 415);
  }
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_PROXIED_MEDIA_BYTES) {
    return json({ error: 'Изображение источника слишком большое' }, 413);
  }

  const response = new Response(request.method === 'HEAD' ? null : bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
  if (request.method === 'GET' && cache) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

async function handleSystemStatus(request, env) {
  await requireRole(request, env, ADMIN_ROLE);
  if (request.method !== 'GET') {
    return json({ error: 'Метод не поддерживается' }, 405);
  }
  const tables = [
    ['users', 'users'],
    ['characters', 'characters'],
    ['guides', 'guides'],
    ['news', 'news'],
    ['leaks', 'leaks'],
    ['threads', 'community_threads'],
  ];
  const counts = {};
  for (const [key, table] of tables) {
    const row = await env.DB.prepare(`SELECT COUNT(*) count FROM ${table}`).first();
    counts[key] = Number(row?.count || 0);
  }
  return json({
    data: {
      api: 'ok',
      d1: 'ok',
      generatedAt: new Date().toISOString(),
      counts,
      migrations: { latestKnown: '0023_fix_hotori_guide_markdown_newlines.sql' },
    },
  });
}

async function handleWarnings(request, env, parts, ctx) {
  const actor = await requireRole(request, env, 'moderator');
  if (request.method === 'GET' && !parts[1]) {
    const rows = await env.DB.prepare(
      `SELECT user_warnings.*, users.display_name AS user_name,
              COALESCE(moderator.display_name, 'Модерация NTE Meta') AS moderator_name
       FROM user_warnings
       LEFT JOIN users ON users.id = user_warnings.user_id
       LEFT JOIN users AS moderator ON moderator.id = user_warnings.created_by
       ORDER BY user_warnings.created_at DESC
       LIMIT 200`,
    ).all();
    return json({
      data: rows.results.map((warning) => ({
        id: warning.id,
        userId: warning.user_id,
        reason: warning.reason,
        moderatorName: warning.moderator_name,
        createdAt: warning.created_at,
        status: warning.status,
        userName: warning.user_name,
      })),
    });
  }
  if (request.method === 'PATCH' && parts[1]) {
    const body = await readJson(request);
    const status = cleanString(body.status, 1, 20);
    if (!['active', 'dismissed'].includes(status)) {
      return json({ error: 'Неизвестный статус предупреждения' }, 400);
    }
    await env.DB.prepare('UPDATE user_warnings SET status = ? WHERE id = ?')
      .bind(status, parts[1])
      .run();
    ctx.waitUntil(
      logAudit(env, actor.id, 'warnings.status', parts[1], { status }),
    );
    return json({ data: { success: true } });
  }
  return json({ error: 'Warnings endpoint не найден' }, 404);
}

async function handleSettings(request, env, ctx) {
  if (request.method === 'GET') {
    const user = await getAuthUser(request, env);
    const canManageSettings = Boolean(
      user && ROLE_WEIGHT[user.role] >= ROLE_WEIGHT.admin,
    );
    const rows = canManageSettings
      ? await env.DB.prepare('SELECT key, value_json FROM settings').all()
      : await env.DB.prepare(
          "SELECT key, value_json FROM settings WHERE key IN ('site', 'seo')",
        ).all();
    const data = Object.fromEntries(
      rows.results.map((row) => [row.key, parseJson(row.value_json, null)]),
    );
    return json({ data });
  }

  if (request.method === 'PATCH') {
    const actor = await requireRole(request, env, ADMIN_ROLE);
    const body = await readJson(request);
    const allowedKeys = new Set(['site', 'seo']);
    const entries = Object.entries(body).map(([key, value]) => {
      if (!allowedKeys.has(key)) {
        throwHttp(`Настройка ${key} не поддерживается`, 400);
      }
      return [key, normalizeSetting(key, value)];
    });
    if (!entries.length) {
      throwHttp('Нет настроек для сохранения', 400);
    }
    await env.DB.batch(
      entries.map(([key, value]) =>
        env.DB.prepare(
          `INSERT INTO settings (key, value_json, updated_by)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = current_timestamp`,
        ).bind(key, JSON.stringify(value), actor.id),
      ),
    );
    ctx.waitUntil(logAudit(env, actor.id, 'settings.update', 'settings', body));
    return json({ data: { success: true } });
  }

  return json({ error: 'Метод не поддерживается' }, 405);
}

async function getSetting(env, key, fallback) {
  const row = await env.DB.prepare(
    'SELECT value_json FROM settings WHERE key = ?',
  )
    .bind(key)
    .first();
  return row ? parseJson(row.value_json, fallback) : fallback;
}

function normalizeSetting(key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throwHttp(`Настройка ${key} должна быть объектом`, 400);
  }

  if (key === 'site') {
    return {
      title: cleanString(value.title || 'NTE Meta', 2, 60),
      language: 'ru',
      registrationEnabled: value.registrationEnabled !== false,
      leaksRequireApproval: true,
    };
  }

  const canonical = cleanString(value.canonical, 8, 300);
  validateResourceUrl(canonical, 'основной адрес сайта');
  return {
    canonical,
    description: cleanString(value.description, 20, 180),
  };
}

function serializeCharacter(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    originalName: row.original_name,
    rarity: row.rarity,
    role: row.role,
    type: row.type,
    attribute: row.attribute,
    tier: row.tier,
    premiumTier: row.premium_tier,
    imageUrl: row.image_url,
    splashUrl: row.splash_url || row.image_url,
    shortDescription: row.short_description,
    summary: row.summary,
    tags: parseJson(row.tags_json, []),
    profile: {
      faction: row.profile_faction || '',
      arcType: row.profile_arc_type || '',
      birthday: row.profile_birthday || '',
      releaseDate: row.profile_release_date || '',
      biographyShort:
        row.profile_biography_short || row.short_description || '',
      biography: row.profile_biography_markdown || row.summary || '',
      trivia: row.profile_trivia_markdown || '',
      roleTags: parseJson(row.profile_role_tags_json, [row.role]),
      roleIcons: parseJson(row.profile_role_icons_json, []),
      voiceActors: parseJson(row.profile_voice_actors_json, []),
      materials: parseJson(row.profile_materials_json, []),
      baseStats: parseJson(row.profile_base_stats_json, []),
      abilities: parseJson(row.profile_abilities_json, []),
      skins: parseJson(row.profile_skins_json, []),
      friendship: parseJson(row.profile_friendship_json, []),
      gifts: parseJson(row.profile_gifts_json, []),
      voiceLines: parseJson(row.profile_voice_lines_json, []),
      awakenings: parseJson(row.profile_awakenings_json, []),
    },
    status: row.status,
    patch: row.patch_version,
    updatedAt: row.updated_at,
  };
}

function serializeSection(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.section_type,
    content: row.content_markdown,
    position: row.position,
  };
}

function serializeRotation(row) {
  return {
    id: row.id,
    guideId: row.guide_id || undefined,
    characterId: row.character_id,
    title: row.title,
    type: row.rotation_type,
    purpose: row.purpose,
    steps: parseJson(row.steps_json, []),
    logic: row.logic,
    mediaUrl: row.media_url || undefined,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function serializeNews(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body_markdown,
    date: row.created_at,
    author: row.author_name || 'NTE Meta',
    category: row.category,
    sourceName: row.source_name || undefined,
    sourceUrl: row.source_url || undefined,
    imageUrl: row.image_url,
    tags: parseJson(row.tags_json, []),
    publishStatus: row.status,
    updatedAt: row.updated_at,
  };
}

function serializeLeak(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body_markdown,
    date: row.created_at,
    trustLevel: row.trust_level,
    status: row.leak_status,
    sourceName: row.source_name,
    sourceUrl: row.source_url || undefined,
    approved: Boolean(row.approved),
    tags: parseJson(row.tags_json, []),
    approvedAt: row.approved_at || undefined,
    updatedAt: row.updated_at,
  };
}

async function listThreads(env, includeHidden = false) {
  const where = includeHidden ? '1 = 1' : "community_threads.status <> 'hidden'";
  const rows = await env.DB.prepare(
    `SELECT community_threads.*,
            COUNT(comments.id) AS comments_count
     FROM community_threads
     LEFT JOIN comments ON comments.target_type = 'thread'
       AND comments.target_id = community_threads.id
       AND comments.status = 'visible'
     WHERE ${where}
     GROUP BY community_threads.id
     ORDER BY community_threads.updated_at DESC
     LIMIT 80`,
  ).all();
  return rows.results.map(serializeThread);
}

async function getThread(env, idOrSlug, includeHidden = false) {
  const where = includeHidden ? '1 = 1' : "community_threads.status <> 'hidden'";
  const row = await env.DB.prepare(
    `SELECT community_threads.*,
            COUNT(comments.id) AS comments_count
     FROM community_threads
     LEFT JOIN comments ON comments.target_type = 'thread'
       AND comments.target_id = community_threads.id
       AND comments.status = 'visible'
     WHERE ${where} AND (community_threads.id = ? OR community_threads.slug = ?)
     GROUP BY community_threads.id`,
  )
    .bind(idOrSlug, idOrSlug)
    .first();
  return row ? serializeThread(row) : null;
}

function serializeThread(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body_markdown,
    author: row.author_name || 'NTE Meta',
    authorId: row.author_id || undefined,
    status: row.status,
    tags: parseJson(row.tags_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commentsCount: Number(row.comments_count || 0),
    score: Number(row.score || 0),
  };
}

function serializeComment(row) {
  return {
    id: row.id,
    userId: row.user_id,
    targetType: row.target_type,
    targetId: row.target_id,
    parentId: row.parent_id || undefined,
    author: row.author_name || 'Пользователь',
    body: row.body_markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    score: row.score || 0,
    status: row.status,
  };
}

function serializeUser(row) {
  const user = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
  if (row.role === 'editor') {
    user.editorPermissions = serializeEditorPermissions(row);
  }
  return user;
}

function serializeEditorPermissions(row) {
  const storedScopes = parseJson(
    row.editor_scopes_json,
    DEFAULT_EDITOR_PERMISSIONS.scopes,
  );
  return {
    grade: row.editor_grade || DEFAULT_EDITOR_PERMISSIONS.grade,
    scopes: (Array.isArray(storedScopes)
      ? storedScopes
      : DEFAULT_EDITOR_PERMISSIONS.scopes
    ).filter((scope) => CONTENT_SCOPES.has(scope)),
    canCreate:
      row.editor_can_create === null || row.editor_can_create === undefined
        ? DEFAULT_EDITOR_PERMISSIONS.canCreate
        : Boolean(row.editor_can_create),
    canEdit:
      row.editor_can_edit === null || row.editor_can_edit === undefined
        ? DEFAULT_EDITOR_PERMISSIONS.canEdit
        : Boolean(row.editor_can_edit),
    canPublish:
      row.editor_can_publish === null || row.editor_can_publish === undefined
        ? DEFAULT_EDITOR_PERMISSIONS.canPublish
        : Boolean(row.editor_can_publish),
    canDelete:
      row.editor_can_delete === null || row.editor_can_delete === undefined
        ? DEFAULT_EDITOR_PERMISSIONS.canDelete
        : Boolean(row.editor_can_delete),
  };
}

function normalizeEditorPermissions(value) {
  const grade = String(value.grade || 'junior');
  if (!['junior', 'editor', 'senior', 'lead'].includes(grade)) {
    throwHttp('Неизвестный грейд редактора', 400);
  }
  const scopes = Array.isArray(value.scopes)
    ? [...new Set(value.scopes.map(String))]
    : [];
  if (scopes.some((scope) => !CONTENT_SCOPES.has(scope))) {
    throwHttp('Передан неизвестный раздел доступа', 400);
  }
  return {
    grade,
    scopes,
    canCreate: Boolean(value.canCreate),
    canEdit: Boolean(value.canEdit),
    canPublish: Boolean(value.canPublish),
    canDelete: Boolean(value.canDelete),
  };
}

function serializeSource(row) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    trustLevel: row.trust_level,
    autoImportEnabled: Boolean(row.auto_import_enabled),
    lastCheckedAt: row.last_checked_at || undefined,
    updatedAt: row.updated_at,
  };
}

function normalizeRecord(config, body, options = {}) {
  const record = {};
  for (const field of config.writable) {
    const value = body[field] ?? body[toCamel(field)];
    if (value === undefined) continue;
    if (field.endsWith('_json')) {
      record[field] = typeof value === 'string' ? value : JSON.stringify(value);
    } else if (field === 'approved' || field === 'auto_import_enabled') {
      record[field] = value ? 1 : 0;
    } else if (field === 'slug') {
      record[field] = slugify(String(value));
    } else {
      record[field] = value;
    }
  }
  if (options.deriveSlug !== false && !record.slug && (body.title || body.name) && config.slug) {
    record.slug = slugify(String(body.title || body.name));
  }
  return record;
}

function validateEntityRecord(entity, record, isCreate) {
  const fieldLabels = {
    slug: 'адрес страницы',
    name: 'имя',
    original_name: 'оригинальное имя',
    role: 'роль',
    type: 'тип',
    attribute: 'атрибут',
    image_url: 'изображение',
    splash_url: 'splash-изображение',
    short_description: 'краткое описание',
    summary: 'краткий вывод',
    character_id: 'персонаж',
    title: 'название',
    patch_version: 'патч',
    body_markdown: 'текст публикации',
    category: 'категория',
    source_name: 'название источника',
    source_url: 'ссылка на источник',
    source_type: 'тип источника',
    trust_level: 'уровень доверия',
    tierlist_type: 'тир-лист',
  };
  const fieldLabel = (field) => fieldLabels[field] || 'поле';
  const requiredByEntity = {
    characters: [
      'slug',
      'name',
      'original_name',
      'role',
      'type',
      'attribute',
      'image_url',
      'short_description',
      'summary',
    ],
    guides: ['slug', 'character_id', 'title', 'summary'],
    rotations: ['character_id', 'title', 'rotation_type', 'purpose', 'logic'],
    teams: [
      'slug',
      'title',
      'team_type',
      'budget',
      'difficulty',
      'good_at',
      'weak_at',
      'synergy',
      'rotation',
    ],
    tierlists: ['slug', 'title', 'tierlist_type', 'patch_version'],
    news: [
      'slug',
      'title',
      'summary',
      'body_markdown',
      'category',
      'image_url',
    ],
    leaks: ['slug', 'title', 'body_markdown', 'source_name'],
    sources: ['source_type', 'source_url', 'source_name', 'trust_level'],
  };

  if (isCreate) {
    const missing = (requiredByEntity[entity] || []).filter(
      (field) =>
        record[field] === undefined ||
        record[field] === null ||
        String(record[field]).trim() === '',
    );
    if (missing.length) {
      throwHttp(
        `Заполните обязательные поля: ${missing.map(fieldLabel).join(', ')}`,
        400,
      );
    }
  }

  for (const [field, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      const maxLength =
        field === 'body_markdown' || field === 'transcript_markdown'
          ? 60000
          : 8000;
      if (value.length > maxLength) {
        throwHttp(`Поле «${fieldLabel(field)}» содержит слишком много текста`, 400);
      }
      record[field] = value.trim();
    }
  }

  if (record.slug !== undefined && !record.slug) {
    throwHttp('Slug не может быть пустым', 400);
  }
  if (record.status !== undefined) {
    const guideStatuses = ['draft', 'pending_review', 'published', 'archived'];
    const contentStatuses = ['draft', 'published', 'archived'];
    const allowed = ['guides', 'news'].includes(entity)
      ? guideStatuses
      : contentStatuses;
    if (!allowed.includes(record.status)) {
      throwHttp('Неизвестный статус публикации', 400);
    }
  }
  if (
    record.tier !== undefined &&
    !['S', 'A', 'B', 'C', 'D'].includes(record.tier)
  ) {
    throwHttp('Неизвестный тир', 400);
  }
  if (
    record.premium_tier !== undefined &&
    !['S', 'A', 'B', 'C', 'D'].includes(record.premium_tier)
  ) {
    throwHttp('Неизвестный premium-тир', 400);
  }
  if (
    record.tierlist_type !== undefined &&
    record.tierlist_type !== 'base'
  ) {
    throwHttp('На сайте используется один единый тир-лист', 400);
  }
  if (
    record.budget !== undefined &&
    !['F2P', 'Premium', 'Mixed'].includes(record.budget)
  ) {
    throwHttp('Неизвестный бюджет команды', 400);
  }
  if (
    record.power !== undefined &&
    (!Number.isFinite(Number(record.power)) ||
      Number(record.power) < 0 ||
      Number(record.power) > 100)
  ) {
    throwHttp('Сила команды должна быть числом от 0 до 100', 400);
  }
  if (
    record.trust_level !== undefined &&
    !['низкий', 'средний', 'высокий'].includes(record.trust_level)
  ) {
    throwHttp('Неизвестный уровень доверия', 400);
  }
  if (
    record.leak_status !== undefined &&
    !['слух', 'слив', 'подтверждено', 'опровергнуто'].includes(
      record.leak_status,
    )
  ) {
    throwHttp('Неизвестный статус слива', 400);
  }
  for (const field of [
    'image_url',
    'splash_url',
    'video_url',
    'media_url',
    'source_url',
  ]) {
    if (
      record[field] !== undefined &&
      record[field] !== null &&
      record[field] !== ''
    ) {
      validateResourceUrl(record[field], fieldLabel(field));
    }
  }
}

function profileCollectionLabel(name) {
  return (
    {
      roleTags: 'роли персонажа',
      roleIcons: 'иконки ролей',
      voiceActors: 'актёры озвучки',
      materials: 'материалы прокачки',
      baseStats: 'начальные показатели',
      abilities: 'способности',
      skins: 'гардероб',
      friendship: 'симпатия',
      gifts: 'любимые подарки',
      voiceLines: 'реплики',
      awakenings: 'пробуждения',
    }[name] || name
  );
}

function normalizeCharacterProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throwHttp('Профиль персонажа должен быть объектом', 400);
  }

  const collection = (name, limit, mapper) => {
    const items = value[name] ?? [];
    if (!Array.isArray(items) || items.length > limit) {
      throwHttp(
        `Раздел «${profileCollectionLabel(name)}» должен содержать не больше ${limit} записей`,
        400,
      );
    }
    return items.map(mapper);
  };
  const text = (input, max = 8000) => {
    const result = String(input || '').trim();
    if (result.length > max) throwHttp('Поле профиля слишком длинное', 400);
    return result;
  };
  const url = (input, label = 'URL медиа') => {
    const result = String(input || '').trim();
    if (result.startsWith('data:')) {
      if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(result)) {
        throwHttp(`${label} должен быть изображением PNG, JPEG или WebP`, 400);
      }
      if (result.length > MAX_PROFILE_DATA_URL_CHARS) {
        throwHttp(`${label} слишком большой. Уменьшите изображение перед загрузкой.`, 400);
      }
      return result;
    }
    if (result.length > 4096) {
      throwHttp(
        `${label} слишком длинный. Используйте прямую ссылку на файл до 4096 символов.`,
        400,
      );
    }
    if (result) validateResourceUrl(result, label);
    return result;
  };
  const id = (input) => {
    const raw = String(input || '').trim();
    if (!raw) return crypto.randomUUID();
    return raw.length <= 80 ? raw : `media-${hashText(raw).slice(0, 24)}`;
  };

  const friendship = collection('friendship', 10, (item) => {
    const level = Number(item.level);
    if (!Number.isInteger(level) || level < 1 || level > 10) {
      throwHttp('Уровень симпатии должен быть от 1 до 10', 400);
    }
    const rawRewards = Array.isArray(item.rewards) ? item.rewards : [];
    if (rawRewards.length > 12) {
      throwHttp('На одном уровне симпатии можно указать не больше 12 наград', 400);
    }
    const rewards = rawRewards.map((reward) => ({
      id: id(reward?.id),
      name: text(reward?.name, 160),
      quantity: text(reward?.quantity, 40),
      iconUrl: url(reward?.iconUrl, 'URL иконки награды симпатии'),
    }));
    return {
      level,
      rewardName: text(item.rewardName, 160),
      rewardIconUrl: url(item.rewardIconUrl, 'URL иконки награды симпатии'),
      description: text(item.description, 2000),
      rewards,
    };
  });

  const awakenings = collection('awakenings', 7, (item) => {
    const level = Number(item.level);
    if (!Number.isInteger(level) || level < 0 || level > 6) {
      throwHttp('Пробуждение должно иметь уровень от 0 до 6', 400);
    }
    return {
      level,
      name: text(item.name, 160),
      iconUrl: url(item.iconUrl),
      description: text(item.description, 8000),
    };
  });

  const profile = {
    faction: text(value.faction, 160),
    arcType: text(value.arcType, 120),
    birthday: text(value.birthday, 80),
    releaseDate: text(value.releaseDate, 80),
    biographyShort: text(value.biographyShort, 1000),
    biography: text(value.biography, 60000),
    trivia: text(value.trivia, 60000),
    roleTags: collection('roleTags', 12, (item) => text(item, 80)).filter(
      Boolean,
    ),
    roleIcons: collection('roleIcons', 12, (item) => ({
      name: text(item.name, 80),
      iconUrl: url(item.iconUrl, 'URL иконки роли'),
    })).filter((item) => item.name && item.iconUrl),
    voiceActors: collection('voiceActors', 12, (item) => ({
      language: text(item.language, 40),
      name: text(item.name, 160),
    })),
    materials: collection('materials', 80, (item) => ({
      id: id(item.id),
      name: text(item.name, 160),
      iconUrl: url(item.iconUrl),
      amount: text(item.amount, 80),
      source: text(item.source, 1000),
    })),
    baseStats: collection('baseStats', 40, (item) => ({
      id: id(item.id),
      label: text(item.label, 120),
      value: text(item.value, 120),
    })),
    abilities: collection('abilities', 30, (item) => ({
      id: id(item.id),
      name: text(item.name, 160),
      type: text(item.type, 80),
      iconUrl: url(item.iconUrl),
      description: text(item.description, 8000),
    })),
    skins: collection('skins', 30, (item) => ({
      id: id(item.id),
      name: text(item.name, 160),
      imageUrl: url(item.imageUrl),
      description: text(item.description, 4000),
    })),
    friendship,
    gifts: collection('gifts', 40, (item) => ({
      id: id(item.id),
      name: text(item.name, 160),
      iconUrl: url(item.iconUrl),
      effect: text(item.effect, 1000),
    })),
    voiceLines: collection('voiceLines', 200, (item) => ({
      id: id(item.id),
      title: text(item.title, 160),
      language: text(item.language, 40),
      audioUrl: url(item.audioUrl),
      sourceUrl: url(item.sourceUrl),
      description: text(item.description, 1000),
    })),
    awakenings,
  };
  if (new TextEncoder().encode(JSON.stringify(profile)).byteLength > MAX_PROFILE_JSON_BYTES) {
    throwHttp(
      'Общий размер изображений профиля слишком большой. Уменьшите файлы или используйте прямые ссылки.',
      400,
    );
  }
  return profile;
}

function validateResourceUrl(value, field) {
  const text = String(value);
  if (
    text.startsWith('/') ||
    text.startsWith('assets/') ||
    text.startsWith('./assets/')
  )
    return;
  try {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol))
      throw new Error('protocol');
  } catch {
    throwHttp(
      `Проверьте поле «${field}»: нужна корректная ссылка http(s)`,
      400,
    );
  }
}

async function findEntityId(env, config, idOrSlug) {
  const where = config.slug ? 'id = ? OR slug = ?' : 'id = ?';
  const statement = env.DB.prepare(
    `SELECT id${config.slug ? ', slug' : ''} FROM ${config.table} WHERE ${where}`,
  );
  return config.slug
    ? statement.bind(idOrSlug, idOrSlug).first()
    : statement.bind(idOrSlug).first();
}

function buildRelationStatements(env, entity, entityId, body, replace) {
  const statements = [];

  if (entity === 'characters' && body.profile !== undefined) {
    const profile = normalizeCharacterProfile(body.profile);
    statements.push(
      env.DB.prepare(
        `INSERT INTO character_profiles (
        character_id, faction, arc_type, birthday, release_date, biography_short,
        biography_markdown, trivia_markdown, role_tags_json, role_icons_json,
        voice_actors_json, materials_json, base_stats_json,
        abilities_json, skins_json, friendship_json, gifts_json,
        voice_lines_json, awakenings_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(character_id) DO UPDATE SET
        faction = excluded.faction,
        arc_type = excluded.arc_type,
        birthday = excluded.birthday,
        release_date = excluded.release_date,
        biography_short = excluded.biography_short,
           biography_markdown = excluded.biography_markdown,
           trivia_markdown = excluded.trivia_markdown,
           role_tags_json = excluded.role_tags_json,
           role_icons_json = excluded.role_icons_json,
           voice_actors_json = excluded.voice_actors_json,
           materials_json = excluded.materials_json,
           base_stats_json = excluded.base_stats_json,
           abilities_json = excluded.abilities_json,
           skins_json = excluded.skins_json,
           friendship_json = excluded.friendship_json,
           gifts_json = excluded.gifts_json,
           voice_lines_json = excluded.voice_lines_json,
           awakenings_json = excluded.awakenings_json,
           updated_at = current_timestamp`,
      ).bind(
        entityId,
        profile.faction,
        profile.arcType,
        profile.birthday,
        profile.releaseDate,
        profile.biographyShort,
        profile.biography,
        profile.trivia,
        JSON.stringify(profile.roleTags),
        JSON.stringify(profile.roleIcons),
        JSON.stringify(profile.voiceActors),
        JSON.stringify(profile.materials),
        JSON.stringify(profile.baseStats),
        JSON.stringify(profile.abilities),
        JSON.stringify(profile.skins),
        JSON.stringify(profile.friendship),
        JSON.stringify(profile.gifts),
        JSON.stringify(profile.voiceLines),
        JSON.stringify(profile.awakenings),
      ),
    );
  }

  if (entity === 'teams' && Array.isArray(body.members)) {
    if (body.members.length > 8)
      throwHttp('В команде может быть не больше 8 участников', 400);
    if (replace)
      statements.push(
        env.DB.prepare('DELETE FROM team_members WHERE team_id = ?').bind(
          entityId,
        ),
      );
    body.members.forEach((member, index) => {
      statements.push(
        env.DB.prepare(
          'INSERT INTO team_members (team_id, character_id, role, position) VALUES (?, ?, ?, ?)',
        ).bind(
          entityId,
          cleanString(member.characterId, 1, 80),
          cleanString(member.role, 1, 80),
          index + 1,
        ),
      );
    });
  }

  if (entity === 'tierlists' && Array.isArray(body.items)) {
    if (body.items.length > 200)
      throwHttp('В тир-листе может быть не больше 200 позиций', 400);
    if (replace)
      statements.push(
        env.DB.prepare('DELETE FROM tierlist_items WHERE tierlist_id = ?').bind(
          entityId,
        ),
      );
    body.items.forEach((item, index) => {
      if (!['S', 'A', 'B', 'C', 'D'].includes(item.tier))
        throwHttp('Неизвестный тир в позиции', 400);
      statements.push(
        env.DB.prepare(
          'INSERT INTO tierlist_items (tierlist_id, character_id, tier, position, note) VALUES (?, ?, ?, ?, ?)',
        ).bind(
          entityId,
          cleanString(item.characterId, 1, 80),
          item.tier,
          index + 1,
          String(item.note || '').slice(0, 1000),
        ),
      );
    });
  }

  if (entity === 'guides' && Array.isArray(body.sections)) {
    if (body.sections.length > 60)
      throwHttp('В гайде может быть не больше 60 разделов', 400);
    if (replace)
      statements.push(
        env.DB.prepare('DELETE FROM guide_sections WHERE guide_id = ?').bind(
          entityId,
        ),
      );
    body.sections.forEach((section, index) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO guide_sections (id, guide_id, title, section_type, content_markdown, position, meta_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          section.id || crypto.randomUUID(),
          entityId,
          cleanString(section.title, 1, 120),
          cleanString(section.type || 'custom', 1, 40),
          String(section.content || '').slice(0, 60000),
          index + 1,
          '{}',
        ),
      );
    });
  }

  return statements;
}

async function validateEntityRelations(env, entity, body, entityId) {
  if (entity === 'teams' && Array.isArray(body.members)) {
    const characterIds = body.members.map((member) =>
      cleanString(member.characterId, 1, 80),
    );
    if (new Set(characterIds).size !== characterIds.length) {
      throwHttp('Один персонаж не может занимать две позиции в команде', 400);
    }
    await assertCharacterIdsExist(env, characterIds);
  }

  if (entity === 'teams' && (body.guideId || body.guide_id)) {
    const guideId = cleanString(body.guideId || body.guide_id, 1, 80);
    const guide = await env.DB.prepare('SELECT id FROM guides WHERE id = ?')
      .bind(guideId)
      .first();
    if (!guide) throwHttp('Связанный гайд не найден', 400);
  }

  if (entity === 'tierlists' && Array.isArray(body.items)) {
    const characterIds = body.items.map((item) =>
      cleanString(item.characterId, 1, 80),
    );
    if (new Set(characterIds).size !== characterIds.length) {
      throwHttp('Персонаж не может повторяться в одном тир-листе', 400);
    }
    await assertCharacterIdsExist(env, characterIds);
  }

  if (entity === 'guides') {
    if (body.characterId || body.character_id) {
      const characterId = body.characterId || body.character_id;
      await assertCharacterIdsExist(env, [characterId]);
      const duplicate = await env.DB.prepare(
        'SELECT id FROM guides WHERE character_id = ? AND id <> ?',
      )
        .bind(characterId, entityId)
        .first();
      if (duplicate) {
        throwHttp('Для этого персонажа уже существует гайд', 409);
      }
    }
    if (Array.isArray(body.sections)) {
      const ids = body.sections
        .map((section) => section.id)
        .filter((id) => typeof id === 'string' && id);
      if (new Set(ids).size !== ids.length) {
        throwHttp('ID разделов гайда должны быть уникальными', 400);
      }
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(', ');
        const rows = await env.DB.prepare(
          `SELECT id, guide_id FROM guide_sections WHERE id IN (${placeholders})`,
        )
          .bind(...ids)
          .all();
        if (rows.results.some((row) => row.guide_id !== entityId)) {
          throwHttp('Раздел уже принадлежит другому гайду', 409);
        }
      }
    }
  }

  if (entity === 'rotations' && (body.characterId || body.character_id)) {
    await assertCharacterIdsExist(env, [body.characterId || body.character_id]);
  }
}

async function assertCharacterIdsExist(env, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
  if (uniqueIds.length === 0) return;
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM characters WHERE id IN (${placeholders})`,
  )
    .bind(...uniqueIds)
    .first();
  if (Number(row?.count || 0) !== uniqueIds.length) {
    throwHttp('Один или несколько персонажей не найдены', 400);
  }
}

function toCamel(value) {
  return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function buildInsert(table, record) {
  const keys = Object.keys(record);
  const placeholders = keys.map(() => '?').join(', ');
  return {
    sql: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
    values: keys.map((key) => record[key]),
  };
}

function buildUpdate(table, record, idOrSlug, hasSlug) {
  const keys = Object.keys(record);
  const set = keys.map((key) => `${key} = ?`).join(', ');
  const where = hasSlug ? '(id = ? OR slug = ?)' : 'id = ?';
  return {
    sql: `UPDATE ${table} SET ${set}, updated_at = current_timestamp WHERE ${where}`,
    values: hasSlug
      ? [...keys.map((key) => record[key]), idOrSlug, idOrSlug]
      : [...keys.map((key) => record[key]), idOrSlug],
  };
}

async function getAuthUser(request, env) {
  const tokenHash = await getSessionTokenHash(request);
  if (!tokenHash) {
    return null;
  }
  const row = await env.DB.prepare(
    `SELECT users.id, users.username, users.display_name, users.role,
            sessions.expires_at,
            editor_permissions.grade AS editor_grade,
            editor_permissions.scopes_json AS editor_scopes_json,
            editor_permissions.can_create AS editor_can_create,
            editor_permissions.can_edit AS editor_can_edit,
            editor_permissions.can_publish AS editor_can_publish,
            editor_permissions.can_delete AS editor_can_delete
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     LEFT JOIN editor_permissions ON editor_permissions.user_id = users.id
     WHERE sessions.token_hash = ? AND users.status = 'active'`,
  )
    .bind(tokenHash)
    .first();

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return null;
  }

  const user = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
  };
  if (row.role === 'editor') {
    user.editorPermissions = serializeEditorPermissions(row);
  }
  return user;
}

async function requireRole(request, env, minRole) {
  const user = await getAuthUser(request, env);
  if (!user) {
    throwHttp('Не авторизован', 401);
  }
  if (ROLE_WEIGHT[user.role] < ROLE_WEIGHT[minRole]) {
    throwHttp('Недостаточно прав', 403);
  }
  return user;
}

async function requireContentPermission(
  request,
  env,
  scope,
  action,
  knownUser,
) {
  const user = knownUser || (await requireRole(request, env, CONTENT_ROLE));
  if (!userHasContentPermission(user, scope, action)) {
    throwHttp('Для этого действия редактору не выданы права', 403);
  }
  return user;
}

function userHasContentPermission(user, scope, action) {
  if (!user) return false;
  if (user.role === 'owner' || user.role === 'admin') return true;
  if (user.role !== 'editor') return false;
  const permissions = user.editorPermissions || DEFAULT_EDITOR_PERMISSIONS;
  const actionKey = {
    create: 'canCreate',
    edit: 'canEdit',
    publish: 'canPublish',
    delete: 'canDelete',
  }[action];
  return Boolean(
    permissions.scopes.includes(scope) && actionKey && permissions[actionKey],
  );
}

async function createSession(env, userId, request) {
  const token = randomToken(32);
  const tokenHash = await sha256Base64(token);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      tokenHash,
      userId,
      expiresAt,
      getClientIp(request),
      request.headers.get('User-Agent') || '',
    )
    .run();
  return { token, expiresAt };
}

function sessionResponse(request, data, expiresAt, status = 200) {
  const response = json({ data }, status);
  response.headers.append(
    'Set-Cookie',
    serializeSessionCookie(request, data.token, new Date(expiresAt)),
  );
  return response;
}

function serializeSessionCookie(request, token, expiresAt) {
  const secure = new URL(request.url).protocol === 'https:';
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    secure ? 'Secure' : '',
    `SameSite=${secure ? 'None' : 'Lax'}`,
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${token ? SESSION_TTL_SECONDS : 0}`,
    secure ? 'Partitioned' : '',
  ].filter(Boolean);
  return attributes.join('; ');
}

function readCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const cookie of cookies.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator === -1) continue;
    if (cookie.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(cookie.slice(separator + 1).trim());
      } catch {
        return '';
      }
    }
  }
  return '';
}

async function cleanupAuthData(env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < current_timestamp'),
    env.DB.prepare(
      "DELETE FROM rate_limits WHERE window_start < unixepoch('now') - 86400",
    ),
  ]);
}

async function getSessionTokenHash(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const cookieToken = readCookie(request, SESSION_COOKIE);
  const token = match?.[1] || cookieToken;
  return token ? sha256Base64(token) : null;
}

async function hashPassword(password, env) {
  const salt = randomToken(16);
  const passwordMaterial = await pepperPassword(password, env);
  const key = await crypto.subtle.importKey(
    'raw',
    passwordMaterial,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64UrlToBytes(salt),
      iterations: PASSWORD_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return { salt, hash: bytesToBase64Url(new Uint8Array(bits)) };
}

async function verifyPassword(
  password,
  salt,
  expectedHash,
  iterations = PASSWORD_ITERATIONS,
  env,
) {
  const passwordMaterial = await pepperPassword(password, env);
  const key = await crypto.subtle.importKey(
    'raw',
    passwordMaterial,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64UrlToBytes(salt),
      iterations,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return constantTimeEqual(
    bytesToBase64Url(new Uint8Array(bits)),
    expectedHash,
  );
}

async function pepperPassword(password, env) {
  const pepper = String(env.PASSWORD_PEPPER || '');
  if (!pepper) {
    throwHttp('Секрет хеширования паролей не настроен', 503);
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(password),
  );
  return new Uint8Array(signature);
}

async function rateLimit(request, env, action, limit, windowSeconds) {
  const key = `${getClientIp(request)}:${action}`;
  const windowStart =
    Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, action, window_start, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(key, action, window_start)
     DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(key, action, windowStart)
    .first();

  if (Number(row?.count || 0) > limit) {
    throwHttp('Слишком много запросов. Попробуйте позже.', 429);
  }
}

async function logAudit(env, userId, action, targetId, details) {
  await env.DB.prepare(
    'INSERT INTO audit_log (id, user_id, action, target_id, details_json) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      userId,
      action,
      targetId,
      JSON.stringify(details || {}),
    )
    .run();
}

async function readJson(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_JSON_BYTES) {
    throwHttp('Тело запроса слишком большое', 413);
  }
  if (!request.body) {
    throwHttp('Тело запроса обязательно', 400);
  }

  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_JSON_BYTES) {
      await reader.cancel();
      throwHttp('Тело запроса слишком большое', 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new globalThis.TextDecoder().decode(bytes));
  } catch {
    throwHttp('Некорректный JSON', 400);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'no-store' : 'no-store',
    },
  });
}

function withCors(request, env, response) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  const hasSession = Boolean(
    request.headers.get('Authorization') || readCookie(request, SESSION_COOKIE),
  );
  const isPublicMedia = request.method === 'GET' && url.pathname === '/api/media';
  if (isAllowedOrigin(origin, env)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  if (isPublicMedia && response.status === 200) {
    response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  } else if (
    request.method === 'GET' &&
    response.status === 200 &&
    !hasSession &&
    !response.headers.has('Set-Cookie') &&
      /^\/api\/(characters|guides|rotations|teams|tierlists|news|leaks|threads)(\/|$)/.test(
      url.pathname,
    )
  ) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=300',
    );
  } else {
    response.headers.set('Cache-Control', 'no-store');
  }
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PATCH, DELETE, OPTIONS',
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization',
  );
  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.set('Vary', 'Origin, Authorization, Cookie');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'",
  );
  return response;
}

function handleOptions(request, env) {
  return withCors(request, env, new Response(null, { status: 204 }));
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (env.FRONTEND_ORIGIN && origin === env.FRONTEND_ORIGIN) return true;
  if (env.FRONTEND_ORIGINS) {
    const origins = String(env.FRONTEND_ORIGINS)
      .split(',')
      .map((value) => value.trim());
    if (origins.includes(origin)) return true;
  }
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function getClientIp(request) {
  const forwarded = request.headers
    .get('X-Forwarded-For')
    ?.split(',')[0]
    ?.trim();
  return String(
    request.headers.get('CF-Connecting-IP') || forwarded || 'unknown',
  ).slice(0, 80);
}

function cleanString(value, min, max) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) {
    throwHttp(`Поле должно быть длиной от ${min} до ${max} символов`, 400);
  }
  return text;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'e')
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function randomToken(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64(value) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(hash));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function throwHttp(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
