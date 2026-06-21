import type { ContentAction, ContentScope, User } from '../types';

// Owner и admin всегда имеют полный доступ. Для editor решение принимает
// Worker по индивидуальному профилю, а эта функция только синхронизирует UI.
export function canManageContent(
  user: User | null,
  scope: ContentScope,
  action: ContentAction = 'edit',
) {
  if (!user) return false;
  if (user.role === 'owner' || user.role === 'admin') return true;
  if (user.role !== 'editor' || !user.editorPermissions) return false;

  const permissions = user.editorPermissions;
  if (!permissions.scopes.includes(scope)) return false;
  if (action === 'create') return permissions.canCreate;
  if (action === 'publish') return permissions.canPublish;
  if (action === 'delete') return permissions.canDelete;
  return permissions.canEdit;
}

export function editorGradeLabel(user: User) {
  const grade = user.editorPermissions?.grade;
  const labels = {
    junior: 'Младший редактор',
    editor: 'Редактор',
    senior: 'Старший редактор',
    lead: 'Ведущий редактор',
  } as const;
  return grade ? labels[grade] : user.role;
}
