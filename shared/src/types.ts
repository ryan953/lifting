/**
 * Domain types shared by web, functions, and scripts.
 * All weights are canonical kilograms. All timestamps are epoch milliseconds
 * (numbers survive Firestore, JSON, and structured clone identically, unlike
 * Firestore Timestamp which differs between client and Admin SDKs).
 */

export type WeightUnit = 'lb' | 'kg';

export type MuscleGroup =
  | 'chest'
  | 'lats'
  | 'upper_back'
  | 'lower_back'
  | 'traps'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'adductors'
  | 'abductors'
  | 'abs'
  | 'obliques'
  | 'neck';

export type BodyArea = 'upper_push' | 'upper_pull' | 'lower' | 'core' | 'other';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'bands'
  | 'bodyweight'
  | 'other';

export interface UserProfile {
  displayName: string;
  units: WeightUnit;
  activeSessionId: string | null;
  createdAt: number;
}

/** Per-user overlay on the static catalog, or a fully custom exercise. */
export type UserExercise =
  | ({ kind: 'custom' } & CustomExercise)
  | ({ kind: 'override' } & CatalogOverride);

export interface CustomExercise {
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  bodyArea: BodyArea;
  equipment: Equipment;
  notes?: string;
  isArchived: boolean;
  trainingMaxKg?: number;
  createdAt: number;
}

export interface CatalogOverride {
  catalogId: string;
  isArchived?: boolean;
  notes?: string;
  trainingMaxKg?: number;
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

export type ProgressionRule =
  | { kind: 'linear_weight'; incrementKg: number }
  | { kind: 'double_progression'; repRange: [number, number]; incrementKg: number }
  | { kind: 'set_progression'; setRange: [number, number]; incrementKg: number }
  | { kind: 'percentage'; wave: WaveStep[][]; tmIncrementKg: number };

export interface WaveStep {
  percentOfTM: number;
  reps: number;
  amrap?: boolean;
}

export interface Targets {
  sets: number;
  reps: number;
  weightKg: number | null;
}

export type Outcome = 'met' | 'missed' | 'skipped';

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TemplateExercise {
  exerciseId: string;
  order: number;
  targetSets: number;
  targetReps: number;
  targetWeightKg: number | null;
  progressionOptions: ProgressionRule[];
  defaultProgressionIndex: number;
  restSec?: number;
}

export interface WorkoutTemplate {
  name: string;
  notes?: string;
  exercises: TemplateExercise[];
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface LoggedSet {
  weightKg: number;
  reps: number;
  rpe?: number;
  isWarmup: boolean;
  completedAt: number;
}

export interface SessionExercise {
  exerciseId: string;
  order: number;
  targetSets: number;
  targetReps: number;
  targetWeightKg: number | null;
  appliedRule: ProgressionRule | null;
  /** For percentage rules: which wave step (0-based) this session executes. */
  waveWeek?: number;
  restSec?: number;
  sets: LoggedSet[];
  outcome?: Outcome;
}

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface Session {
  templateId: string | null;
  templateName: string;
  status: SessionStatus;
  startedAt: number;
  completedAt: number | null;
  exercises: SessionExercise[];
  /** Denormalized for array-contains queries (recent sessions per exercise). */
  exerciseIds: string[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Aggregates (function-written, client-read-only)
// ---------------------------------------------------------------------------

export interface PerformanceSummary {
  sessionId: string;
  date: number;
  appliedRule: ProgressionRule | null;
  waveWeek?: number;
  targetSets: number;
  targetReps: number;
  targetWeightKg: number | null;
  topSet: { weightKg: number; reps: number } | null;
  totalVolumeKg: number;
  outcome: Outcome;
}

export interface ExerciseStats {
  lastPerformedAt: number;
  bestE1rm: { valueKg: number; weightKg: number; reps: number; sessionId: string; date: number } | null;
  /** Best weight ever lifted for exactly N reps, keyed by rep count (1..12). */
  repPRs: Record<string, { weightKg: number; sessionId: string; date: number }>;
  /** Most recent performances, newest first, capped at 10. Feeds recommendations. */
  recentPerformances: PerformanceSummary[];
}

export interface ExerciseWeek {
  volumeKg: number;
  topSetWeightKg: number;
  bestE1rmKg: number;
  setCount: number;
}

export interface WeeklyStats {
  sessionCount: number;
  /** ISO dates ('yyyy-MM-dd') trained this week — feeds the frequency heatmap. */
  trainedDates: string[];
  /** Working-set volume per muscle; secondary muscles count 0.5x. */
  volumeByMuscleKg: Partial<Record<MuscleGroup, number>>;
  setsByRepRange: { r1_5: number; r6_10: number; r11_15: number; r16p: number };
  progression: { attempted: number; met: number };
}
