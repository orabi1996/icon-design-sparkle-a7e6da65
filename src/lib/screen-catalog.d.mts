export type ScreenEntry = { path: string; title: string; section: string; status: "phase1" | "legacy" | "needs_business" | "business" };
export const SCREENS: readonly ScreenEntry[];