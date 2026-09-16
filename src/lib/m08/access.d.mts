/* eslint-disable @typescript-eslint/no-explicit-any */
export const ACTIONS: string[];
export function allowed(actor: any, action: string, entity?: any): boolean;
export function allowedField(actor: any, field: string, entity?: any): boolean;
export function assertAccess(actor: any, action: string, entity?: any): void;
export function employeeScope(state: any, id: string, workDate?: string): any;
export function authorizeRoster(actor: any, action: string, roster: any, state: any): void;
export function projectState(state: any, actor: any): any;
