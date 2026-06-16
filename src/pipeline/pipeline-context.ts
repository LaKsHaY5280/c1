export type RunStatus = "pending" | "running" | "completed" | "failed";

export type StepName =
  | "idea"
  | "script"
  | "characters"
  | "scenes"
  | "visualSearch"
  | "pexels"
  | "manifest"
  | "voice"
  | "captions"
  | "render"
  | "metadata"
  | "upload"
  | "thumbnail";

export const STEP_ORDER: StepName[] = [
  "idea",
  "script",
  "characters",
  "scenes",
  "visualSearch",
  "pexels",
  "manifest",
  "voice",
  "captions",
  "render",
  "metadata",
  "upload",
  "thumbnail",
];

export interface StepRecord {
  step: StepName;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  outputId?: string; // e.g. "IDEA-HOR-20260615-001"
  error?: string;
}

// Append-only event — one entry per transition (started / completed / failed)
export interface StepEvent {
  step: StepName;
  event: "started" | "completed" | "failed";
  timestamp: string;
  outputId?: string;
  error?: string;
}

export interface RunRecord {
  id: string; // RUN-YYYYMMDD-NNN
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  currentStep?: StepName;
  // Map for current state — O(1) lookup, one row per step in the dashboard
  steps: Record<StepName, StepRecord>;
  // Append-only event log — tracks what happened over time, survives reruns
  history: StepEvent[];
  error?: string;
}

// Build the initial steps map with all steps set to "pending"
export function createInitialSteps(): Record<StepName, StepRecord> {
  const steps = {} as Record<StepName, StepRecord>;
  for (const step of STEP_ORDER) {
    steps[step] = {
      step,
      status: "pending",
      startedAt: "",
    };
  }
  return steps;
}
