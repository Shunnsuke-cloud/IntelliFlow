export const roles = ['owner', 'admin', 'member', 'viewer'] as const;
export type WorkspaceRole = (typeof roles)[number];
export function isRole(value: unknown): value is WorkspaceRole {
  return typeof value === 'string' && roles.some(role => role === value);
}
export function canManage(role: WorkspaceRole) { return role === 'owner' || role === 'admin'; }
export function canAssign(actor: WorkspaceRole, current: WorkspaceRole, next: WorkspaceRole) {
  return actor === 'owner' || (actor === 'admin' && ['member', 'viewer'].includes(current) && ['member', 'viewer'].includes(next));
}
export function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/app';
  try {
    const url = new URL(value, 'https://intelliflow.invalid');
    return url.origin === 'https://intelliflow.invalid' ? url.pathname + url.search + url.hash : '/app';
  } catch { return '/app'; }
}
export function sameOrigin(request: Request) { return request.headers.get('origin') === new URL(request.url).origin; }
export function validatedUser<T extends { id: string; is_anonymous?: boolean }>(result: { data: { user: T | null }; error: unknown }): T | null {
  return result.error || !result.data.user || result.data.user.is_anonymous ? null : result.data.user;
}
