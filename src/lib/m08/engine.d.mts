/** Persisted JSON is validated by the domain command boundary; generated DB types are not hand-edited. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type M08State = { schemaVersion: number; [key: string]: any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type M08Actor = { id: string; roles: string[]; grants: any[]; etag: string; canManageAccess?: boolean };
export type M08Command = { type: string; payload: Record<string, unknown>; operationId: string; reason: string };
export const COLLECTIONS: string[];
export function emptyState(): M08State;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function execute(state: M08State, command: M08Command, actor: M08Actor, now: string): { state: M08State; result: any; event: any };
