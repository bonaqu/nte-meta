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
  'videos',
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
const MAX_JSON_BYTES = 512 * 1024;

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
    return json({ data: { id: record.id } }, 201);
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
    return json({ data: { success: true } });
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

function entityPermissionScope(entity, body = {}) {
  if (entity === 'teams' || entity === 'rotations') return 'guides';
  if (entity === 'guides') {
    const keys = Object.keys(body).map((key) =>
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    );
    const videoOnly =
      keys.length > 0 &&
      keys.every((key) =>
        ['videoUrl', 'transcriptMarkdown', 'status'].includes(key),
      );
    return videoOnly ? 'videos' : 'guides';
  }
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
  const scope = entityPermissionScope(entity, body);
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
  const includeDrafts =
    userHasContentPermission(user, scope, 'edit') ||
    (entity === 'guides' && userHasContentPermission(user, 'videos', 'edit'));
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
    character_profiles.birthday AS profile_birthday,
    character_profiles.biography_short AS profile_biography_short,
    character_profiles.biography_markdown AS profile_biography_markdown,
    character_profiles.trivia_markdown AS profile_trivia_markdown,
    character_profiles.role_tags_json AS profile_role_tags_json,
    character_profiles.voice_actors_json AS profile_voice_actors_json,
    character_profiles.materials_json AS profile_materials_json,
    character_profiles.base_stats_json AS profile_base_stats_json,
    character_profiles.abilities_json AS profile_abilities_json,
    character_profiles.skins_json AS profile_skins_json,
    character_profiles.friendship_json AS profile_friendship_json,
    character_profiles.gifts_json AS profile_gifts_json,
    character_profiles.voice_lines_json AS profile_voice_lines_json,
    character_profiles.awakenings_json AS profile_awakenings_json,
    character_profiles.consoles_json AS profile_consoles_json
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

async function handleCharacterImportLookup(request, env) {
  await requireContentPermission(request, env, 'characters', 'edit');
  if (request.method !== 'POST') {
    return json({ error: 'Метод не поддерживается' }, 405);
  }
  const body = await readJson(request);
  const query = cleanString(body.query, 2, 120);
  const sources = await env.DB.prepare(
    "SELECT source_name, source_url, trust_level FROM sources WHERE auto_import_enabled = 1 AND source_type IN ('website', 'manual') ORDER BY trust_level DESC LIMIT 5",
  ).all();
  return json({
    data: {
      found: false,
      message:
        sources.results.length > 0
          ? `Автоимпорт для "${query}" пока не подключен. Найденные источники требуют ручной проверки.`
          : 'Источники базовой информации пока не настроены. Заполните поля вручную и не публикуйте неподтвержденные факты.',
      sources: sources.results.map((source) => ({
        name: source.source_name,
        url: source.source_url,
        trust: source.trust_level,
      })),
      fields: {},
    },
  });
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
      migrations: { latestKnown: '0011_clean_editorial_placeholder_copy.sql' },
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
  validateResourceUrl(canonical, 'canonical');
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
      birthday: row.profile_birthday || '',
      biographyShort:
        row.profile_biography_short || row.short_description || '',
      biography: row.profile_biography_markdown || row.summary || '',
      trivia: row.profile_trivia_markdown || '',
      roleTags: parseJson(row.profile_role_tags_json, [row.role]),
      voiceActors: parseJson(row.profile_voice_actors_json, []),
      materials: parseJson(row.profile_materials_json, []),
      baseStats: parseJson(row.profile_base_stats_json, []),
      abilities: parseJson(row.profile_abilities_json, []),
      skins: parseJson(row.profile_skins_json, []),
      friendship: parseJson(row.profile_friendship_json, []),
      gifts: parseJson(row.profile_gifts_json, []),
      voiceLines: parseJson(row.profile_voice_lines_json, []),
      awakenings: parseJson(row.profile_awakenings_json, []),
      consoles: parseJson(row.profile_consoles_json, []),
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
      throwHttp(`Не заполнены обязательные поля: ${missing.join(', ')}`, 400);
    }
  }

  for (const [field, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      const maxLength =
        field === 'body_markdown' || field === 'transcript_markdown'
          ? 60000
          : 8000;
      if (value.length > maxLength) {
        throwHttp(`Поле ${field} слишком длинное`, 400);
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
    !['base', 'premium'].includes(record.tierlist_type)
  ) {
    throwHttp('Неизвестный тип тир-листа', 400);
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
      validateResourceUrl(record[field], field);
    }
  }
}

function normalizeCharacterProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throwHttp('Профиль персонажа должен быть объектом', 400);
  }

  const collection = (name, limit, mapper) => {
    const items = value[name] ?? [];
    if (!Array.isArray(items) || items.length > limit) {
      throwHttp(
        `Поле profile.${name} должно содержать не больше ${limit} записей`,
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
  const url = (input) => {
    const result = text(input, 1000);
    if (result) validateResourceUrl(result, 'profile URL');
    return result;
  };
  const id = (input) => text(input, 80) || crypto.randomUUID();

  const friendship = collection('friendship', 10, (item) => {
    const level = Number(item.level);
    if (!Number.isInteger(level) || level < 1 || level > 10) {
      throwHttp('Уровень симпатии должен быть от 1 до 10', 400);
    }
    return {
      level,
      rewardName: text(item.rewardName, 160),
      rewardIconUrl: url(item.rewardIconUrl),
      description: text(item.description, 2000),
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

  return {
    faction: text(value.faction, 160),
    birthday: text(value.birthday, 80),
    biographyShort: text(value.biographyShort, 1000),
    biography: text(value.biography, 60000),
    trivia: text(value.trivia, 60000),
    roleTags: collection('roleTags', 12, (item) => text(item, 80)).filter(
      Boolean,
    ),
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
    })),
    awakenings,
    consoles: collection('consoles', 20, (item) => ({
      id: id(item.id),
      name: text(item.name, 160),
      imageUrls: Array.isArray(item.imageUrls)
        ? item.imageUrls.slice(0, 8).map(url)
        : [],
      description: text(item.description, 8000),
      features: Array.isArray(item.features)
        ? item.features.slice(0, 30).map((feature) => text(feature, 1000))
        : [],
      recommendedModules: text(item.recommendedModules, 8000),
    })),
  };
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
    throwHttp(`Поле ${field} должно содержать корректный URL`, 400);
  }
}

async function findEntityId(env, config, idOrSlug) {
  const where = config.slug ? 'id = ? OR slug = ?' : 'id = ?';
  const statement = env.DB.prepare(
    `SELECT id FROM ${config.table} WHERE ${where}`,
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
           character_id, faction, birthday, biography_short,
           biography_markdown, trivia_markdown, role_tags_json,
           voice_actors_json, materials_json, base_stats_json,
           abilities_json, skins_json, friendship_json, gifts_json,
           voice_lines_json, awakenings_json, consoles_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(character_id) DO UPDATE SET
           faction = excluded.faction,
           birthday = excluded.birthday,
           biography_short = excluded.biography_short,
           biography_markdown = excluded.biography_markdown,
           trivia_markdown = excluded.trivia_markdown,
           role_tags_json = excluded.role_tags_json,
           voice_actors_json = excluded.voice_actors_json,
           materials_json = excluded.materials_json,
           base_stats_json = excluded.base_stats_json,
           abilities_json = excluded.abilities_json,
           skins_json = excluded.skins_json,
           friendship_json = excluded.friendship_json,
           gifts_json = excluded.gifts_json,
           voice_lines_json = excluded.voice_lines_json,
           awakenings_json = excluded.awakenings_json,
           consoles_json = excluded.consoles_json,
           updated_at = current_timestamp`,
      ).bind(
        entityId,
        profile.faction,
        profile.birthday,
        profile.biographyShort,
        profile.biography,
        profile.trivia,
        JSON.stringify(profile.roleTags),
        JSON.stringify(profile.voiceActors),
        JSON.stringify(profile.materials),
        JSON.stringify(profile.baseStats),
        JSON.stringify(profile.abilities),
        JSON.stringify(profile.skins),
        JSON.stringify(profile.friendship),
        JSON.stringify(profile.gifts),
        JSON.stringify(profile.voiceLines),
        JSON.stringify(profile.awakenings),
        JSON.stringify(profile.consoles),
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
  if (isAllowedOrigin(origin, env)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  if (
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
