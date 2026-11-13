// Shared goals and encouragement (vision batch 8, slice C; docs/vision/social.md), the rules without a database.
// For now the audience is the person's household – the family; friends come with slice B. Tests: server/test-goal-social.mjs.

export interface Viewer { email: string; household: string; child: boolean }
export interface PostOwner { email: string; household: string; child: boolean }

/** who sees a post: the household of the one who shared it (sharing is always the person's own choice, per goal) */
export const maySee = (v: Viewer, p: PostOwner) => v.household === p.household;
/** a heart: anyone who sees it, but not on one's own post */
export const mayHeart = (v: Viewer, p: PostOwner) => maySee(v, p) && v.email !== p.email;
/** advice: the same; and a child (under 12) gets advice only from the family – the household, for now */
export const mayAdvise = (v: Viewer, p: PostOwner) => mayHeart(v, p) && (!p.child || v.household === p.household);

export const ADVICE_MAX = 300;
/** a short open message: trimmed, one line breaks at most twice, not empty */
export function cleanAdvice(t: unknown): string {
  return String(t ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, ADVICE_MAX);
}

/** the post a step makes: one a day for each goal, counting the day's steps */
export function stepPostText(goal: string, steps: number): string {
  return steps <= 1 ? `התקדמות ב"${goal}": עוד צעד` : `התקדמות ב"${goal}": ${steps} צעדים היום`;
}
export const goalPostText = (goal: string) => `השגת המטרה "${goal}"`;

/** the badges encouragement earns (the ids are the goals' badges):
      adviser  – advice you gave got a heart from the one you advised;
      shoulder – you gave hearts to others' progress, five in all ("עקבת אחרי המסע של חבר");
      angel    – a goal you advised on was achieved ("עזרת … להשלים מטרה") */
export const SHOULDER_AT = 5;
export function encouragementBadges(s: { adviceHearted: number; heartsGiven: number; advisedGoalsDone: number }): string[] {
  return [s.adviceHearted > 0 && 'adviser', s.heartsGiven >= SHOULDER_AT && 'shoulder', s.advisedGoalsDone > 0 && 'angel'].filter(Boolean) as string[];
}
