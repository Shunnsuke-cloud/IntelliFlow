export const issueStatuses = { open: '未着手', in_progress: '進行中', review: '確認待ち', done: '完了' } as const;
export const projectStatuses = { planned: '計画中', active: '進行中', completed: '完了' } as const;
export const priorities = { high: '高', normal: '中', low: '低' } as const;
export type IssueStatus = keyof typeof issueStatuses | 'blocked';
export type ProjectStatus = keyof typeof projectStatuses;
export type Priority = keyof typeof priorities;
export type WorkKind = 'issue' | 'project';
export type BaseItem = {
  id: string; workspace_id: string; title: string; description: string;
  created_by: string; updated_by: string; version: number;
  created_at: string; updated_at: string; archived_at: string | null; due_on: string | null;
};
export type Issue = BaseItem & { issue_number: number; code: string; status: IssueStatus; priority: Priority; assignee_id: string | null; project_id: string | null; labels: string[] };
export type Project = BaseItem & { status: ProjectStatus; start_on: string | null; member_ids: string[]; issue_count: number; completed_count: number };
export type Person = { user_id: string; display_name: string; role: string; joined_at: string };
export type Options = { projects: { id: string; title: string }[]; labels: string[] };
export type ItemComment = { id: string; author_id: string; body: string; version: number; created_at: string; updated_at: string };
export type RelatedIssue = { relation_id: string; id: string; code: string; title: string };
export type WorkEvent = { id: string; actor_id: string; action: string; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; created_at: string };
export type Detail<T> = { item: T; comments: ItemComment[]; relations: RelatedIssue[]; events: WorkEvent[] };
export type Listing<T> = { items: T[]; total: number; offset: number; limit: number };
export function progress(project: Pick<Project, 'issue_count' | 'completed_count'>) {
  return project.issue_count ? Math.round(project.completed_count / project.issue_count * 100) : 0;
}
export function issueStatusLabel(status: IssueStatus) { return status === 'blocked' ? '保留（旧データ）' : issueStatuses[status]; }
export function issueCode(number: number) { return `ISSUE-${String(number).padStart(3, '0')}`; }
