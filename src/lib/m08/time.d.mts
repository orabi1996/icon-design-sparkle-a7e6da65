export const MINUTE: number;
export const DAY: number;
export class RuleError extends Error { code: string; details: Record<string, unknown>; constructor(code: string, message: string, details?: Record<string, unknown>); }
export function requireRule(condition: unknown, code: string, message: string, details?: Record<string, unknown>): asserts condition;
export function date(value: string): string;
export function dates(from: string, to: string): string[];
export function addDays(day: string, days: number): string;
export function clock(value: string): number;
export function zonedInstant(day: string, time: string, zone: string, disambiguation?: string): { at: string; offsetMinutes: number };
export function localParts(ms: number, zone: string): { date: string; time: string; second: string };
export function instant(value: string): number;
export function interval(start: string, end: string): number[];
export function overlap(a: number[], b: number[]): boolean;
export function union(parts: number[][]): number[][];
export function intersect(left: number[][], right: number[][]): number[][];
export function subtract(left: number[][], right: number[][]): number[][];
export function minutes(parts: number[][]): number;
export function splitLocalDays(parts: number[][], zone: string, holidays?: string[]): { date: string; month: string; holiday: boolean; minutes: number; start: string; end: string }[];
