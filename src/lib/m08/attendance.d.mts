/* eslint-disable @typescript-eslint/no-explicit-any */
export const ENGINE_VERSION: string;
export function grace(raw: number, policy: any): number;
export function overtimeEligible(raw: number, policy: any): number;
export function matchPunches(assignments: any[], raw: any[], corrections?: any[]): any;
export function calculateAttendance(state: any, assignment: any, events: any[], now: string): any;
export function canonical(value: unknown): string;
export function payrollQuantities(result: any): Record<string, number>;
export function payrollDelta(result: any, delivered: any[]): Record<string, number>;
