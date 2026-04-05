# AIComicBuilder Full Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 27 optimization items from `docs/optimization-review.md`, organized into 4 phases matching P0→P3 priority.

**Architecture:** Incremental enhancement of existing Next.js 16 + SQLite + Drizzle ORM stack. Each phase adds DB migrations, pipeline logic, prompt updates, and UI changes. All changes are backwards-compatible — existing projects continue to work.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, SQLite/Drizzle ORM, FFmpeg (fluent-ffmpeg), Zustand, Tailwind CSS v4, next-intl

---

## Phase 1: P0 — Core Experience Fixes (Tasks 1-8)

### Task 1: DB Migration — Add transition and subtitle fields to shots

**Files:**
- Create: `drizzle/0016_add_transition_fields.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts:93-124`

- [ ] **Step 1: Create migration SQL**

```sql
ALTER TABLE shots ADD COLUMN transition_in TEXT DEFAULT 'cut';
ALTER TABLE shots ADD COLUMN transition_out TEXT DEFAULT 'cut';
```

- [ ] **Step 2: Update journal**

Add entry to `drizzle/meta/_journal.json`:
```json
{
  "idx": 16,
  "version": "6",
  "when": 1775100000000,
  "tag": "0016_add_transition_fields",
  "breakpoints": true
}
```

- [ ] **Step 3: Update schema.ts — add transition fields to shots table**

Add after `videoPrompt` field in `shots` table:
```typescript
transitionIn: text("transition_in").default("cut"),
transitionOut: text("transition_out").default("cut"),
```

- [ ] **Step 4: Commit**

```bash
git add drizzle/0016_add_transition_fields.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: add transition fields to shots table"
```

---

### Task 2: DB Migration — Add dialogue timing fields

**Files:**
- Create: `drizzle/0017_add_dialogue_timing.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts:126-137`

- [ ] **Step 1: Create migration SQL**

```sql
ALTER TABLE dialogues ADD COLUMN start_ratio REAL DEFAULT 0.0;
ALTER TABLE dialogues ADD COLUMN end_ratio REAL DEFAULT 1.0;
```

- [ ] **Step 2: Update journal**

Add entry:
```json
{
  "idx": 17,
  "version": "6",
  "when": 1775200000000,
  "tag": "0017_add_dialogue_timing",
  "breakpoints": true
}
```

- [ ] **Step 3: Update schema.ts — add timing fields to dialogues table**

Add after `sequence` field in `dialogues` table:
```typescript
startRatio: text("start_ratio").default("0"),
endRatio: text("end_ratio").default("1"),
```

Note: SQLite doesn't have a real REAL type in Drizzle, use text and parse as float.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0017_add_dialogue_timing.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: add dialogue timing fields (startRatio, endRatio)"
```

---

### Task 3: FFmpeg Transition Effects (Review Item 6.1)

**Files:**
- Modify: `src/lib/video/ffmpeg.ts`

- [ ] **Step 1: Add transition type definition and xfade duration constant**

At the top of `ffmpeg.ts`, after imports, add:
```typescript
type TransitionType = "cut" | "dissolve" | "fade_in" | "fade_out" | "wipeleft" | "slideright" | "circleopen";

interface TransitionInfo {
  type: TransitionType;
  duration: number; // seconds
}

const DEFAULT_XFADE_DURATION = 0.5;
```

- [ ] **Step 2: Update AssembleParams to include transitions**

```typescript
interface AssembleParams {
  videoPaths: string[];
  subtitles: SubtitleEntry[];
  projectId: string;
  shotDurations: number[];
  transitions?: TransitionType[]; // transition between shot[i] and shot[i+1]
}
```

- [ ] **Step 3: Replace concat logic with xfade-based concatenation**

Replace the concat block (lines 74-99) with a new function `concatWithTransitions`:

```typescript
async function concatWithTransitions(
  videoPaths: string[],
  transitions: TransitionType[],
  shotDurations: number[],
  outputPath: string
): Promise<void> {
  if (videoPaths.length === 1) {
    fs.copyFileSync(path.resolve(videoPaths[0]), outputPath);
    return;
  }

  // Check if all transitions are "cut" — use fast concat demuxer
  const allCuts = transitions.every((t) => t === "cut");
  if (allCuts) {
    const concatListPath = outputPath.replace(/\.mp4$/, "-concat.txt");
    const concatContent = videoPaths
      .map((p) => `file '${path.resolve(p)}'`)
      .join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy"])
        .output(outputPath)
        .on("end", () => {
          fs.unlinkSync(concatListPath);
          resolve();
        })
        .on("error", (err) =>
          reject(new Error(`FFmpeg concat failed: ${err.message}`))
        )
        .run();
    });
    return;
  }

  // Build xfade filter chain for non-cut transitions
  const inputs = videoPaths.map((p) => path.resolve(p));
  const xfadeDur = DEFAULT_XFADE_DURATION;

  // Calculate offsets: each xfade starts at (cumulative_duration - xfade_overlap)
  let filterComplex = "";
  let prevLabel = "[0:v]";
  let cumulativeDuration = shotDurations[0];

  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    const nextLabel = i === transitions.length - 1 ? "[vout]" : `[v${i}]`;

    if (t === "cut") {
      // For cut transitions, just concat without xfade
      const offset = cumulativeDuration;
      filterComplex += `${prevLabel}[${i + 1}:v]concat=n=2:v=1:a=0${nextLabel};`;
      cumulativeDuration += shotDurations[i + 1];
    } else {
      const xfadeName = t === "fade_in" || t === "fade_out" ? "fade" : t;
      const offset = cumulativeDuration - xfadeDur;
      filterComplex += `${prevLabel}[${i + 1}:v]xfade=transition=${xfadeName}:duration=${xfadeDur}:offset=${offset}${nextLabel};`;
      cumulativeDuration += shotDurations[i + 1] - xfadeDur;
    }
    prevLabel = nextLabel.replace(";", "");
  }

  // Remove trailing semicolon
  filterComplex = filterComplex.replace(/;$/, "");

  const cmd = ffmpeg();
  for (const input of inputs) {
    cmd.input(input);
  }

  await new Promise<void>((resolve, reject) => {
    cmd
      .complexFilter(filterComplex)
      .outputOptions(["-map", "[vout]", "-c:v", "libx264", "-preset", "fast", "-crf", "23"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) =>
        reject(new Error(`FFmpeg xfade failed: ${err.message}`))
      )
      .run();
  });
}
```

- [ ] **Step 4: Update assembleVideo to use concatWithTransitions**

In `assembleVideo`, replace the concat section:
```typescript
export async function assembleVideo(params: AssembleParams): Promise<string> {
  const { videoPaths, subtitles, projectId, shotDurations, transitions } = params;
  const outputDir = path.resolve(uploadDir, "videos");
  fs.mkdirSync(outputDir, { recursive: true });
  const concatOutputPath = path.resolve(outputDir, `${projectId}-concat-${ulid()}.mp4`);
  const outputPath = path.resolve(outputDir, `${projectId}-final-${ulid()}.mp4`);

  // Build transition array, default to "cut" if not provided
  const transArray: TransitionType[] = transitions ??
    new Array(Math.max(0, videoPaths.length - 1)).fill("cut");

  // Step 1: Concatenate with transitions
  await concatWithTransitions(videoPaths, transArray, shotDurations, concatOutputPath);

  // Step 2: Burn subtitles (unchanged)
  // ... rest of subtitle logic stays the same
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/video/ffmpeg.ts
git commit -m "feat: add xfade transition effects to video assembly (6.1)"
```

---

### Task 4: Subtitle Timing Fix (Review Item 6.2)

**Files:**
- Modify: `src/lib/video/ffmpeg.ts` (generateSrtFile function)

- [ ] **Step 1: Update SubtitleEntry to include dialogue sequence and count**

```typescript
interface SubtitleEntry {
  text: string;
  shotSequence: number;
  dialogueSequence: number; // 0-based index within the shot
  dialogueCount: number;    // total dialogues in this shot
  startRatio?: number;      // 0-1, when this dialogue starts relative to shot duration
  endRatio?: number;        // 0-1, when this dialogue ends relative to shot duration
}
```

- [ ] **Step 2: Update generateSrtFile to distribute dialogues across shot duration**

Replace the loop in `generateSrtFile`:
```typescript
for (const sub of subtitles) {
  const shotIdx = sub.shotSequence - 1;
  if (shotIdx < 0 || shotIdx >= shotDurations.length) continue;

  const shotStart = shotStartTimes[shotIdx];
  const shotDur = shotDurations[shotIdx];

  let startTime: number;
  let endTime: number;

  if (sub.startRatio !== undefined && sub.endRatio !== undefined) {
    // Use explicit timing ratios from DB
    startTime = shotStart + shotDur * sub.startRatio;
    endTime = shotStart + shotDur * sub.endRatio;
  } else {
    // Auto-distribute: divide shot duration equally among dialogues
    const segmentDur = shotDur / sub.dialogueCount;
    startTime = shotStart + segmentDur * sub.dialogueSequence;
    endTime = startTime + segmentDur;
  }

  srtEntries.push(
    `${index}\n${formatSrtTime(startTime)} --> ${formatSrtTime(endTime)}\n${sub.text}\n`
  );
  index++;
}
```

- [ ] **Step 3: Update video-assemble.ts to pass dialogue sequence info**

In `src/lib/pipeline/video-assemble.ts`, when building the subtitles array, include the sequence info:

Find where subtitles are built and update to:
```typescript
const subtitles: SubtitleEntry[] = [];
for (const shot of completedShots) {
  const shotDialogues = shot.dialogues || [];
  const count = shotDialogues.length;
  shotDialogues.forEach((d, idx) => {
    subtitles.push({
      text: `${d.characterName}: ${d.text}`,
      shotSequence: shot.sequence,
      dialogueSequence: idx,
      dialogueCount: count,
      startRatio: d.startRatio ? parseFloat(d.startRatio) : undefined,
      endRatio: d.endRatio ? parseFloat(d.endRatio) : undefined,
    });
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/video/ffmpeg.ts src/lib/pipeline/video-assemble.ts
git commit -m "fix: distribute subtitle timing across shot duration (6.2)"
```

---

### Task 5: Update shot-split prompt to generate transitions (Review Item 3.1 + 6.1)

**Files:**
- Modify: `src/lib/ai/prompts/shot-split.ts`
- Modify: `src/lib/pipeline/shot-split.ts`

- [ ] **Step 1: Add transition field to shot-split system prompt**

In `buildShotSplitSystem()`, add to the JSON output schema description:
```
- "transitionIn": transition entering this shot ("cut" | "dissolve" | "fade_in" | "wipeleft" | "circleopen"). Default "cut". Use "dissolve" for scene changes, "fade_in" for opening shots.
- "transitionOut": transition leaving this shot. Default "cut". Use "fade_out" for ending shots.
```

Add to the cinematography rules section:
```
## TRANSITION GUIDELINES
- Scene changes (different location/time): prefer "dissolve"
- First shot of the film: "fade_in"
- Last shot of the film: "fade_out"
- Same scene, continuous action: "cut"
- Dramatic time skip: "wipeleft" or "circleopen"
- Default to "cut" when unsure
```

- [ ] **Step 2: Update shot-split pipeline to save transition fields**

In `src/lib/pipeline/shot-split.ts`, when inserting shots into DB, add:
```typescript
transitionIn: shot.transitionIn || "cut",
transitionOut: shot.transitionOut || "cut",
```

- [ ] **Step 3: Update video-assemble to read transitions from DB**

In `src/lib/pipeline/video-assemble.ts`, read transitions from shots and pass to `assembleVideo`:
```typescript
const transitions = completedShots.slice(0, -1).map((shot, i) => {
  const nextShot = completedShots[i + 1];
  return shot.transitionOut !== "cut" ? shot.transitionOut : nextShot?.transitionIn || "cut";
});

const result = await assembleVideo({
  videoPaths,
  subtitles,
  projectId,
  shotDurations,
  transitions,
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/prompts/shot-split.ts src/lib/pipeline/shot-split.ts src/lib/pipeline/video-assemble.ts
git commit -m "feat: AI-recommended transitions in shot-split + assembly (3.1, 6.1)"
```

---

### Task 6: Dependency Chain & Staleness Tracking (Review Item 7.1)

**Files:**
- Create: `drizzle/0018_add_staleness_tracking.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/staleness.ts`
- Modify: `src/app/api/projects/[id]/route.ts` (PATCH handler)

- [ ] **Step 1: Create migration — add stale flag and upstream_hash to shots and characters**

```sql
ALTER TABLE shots ADD COLUMN is_stale INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN is_stale INTEGER DEFAULT 0;
ALTER TABLE episodes ADD COLUMN script_hash TEXT DEFAULT '';
```

Update journal with idx 18.

- [ ] **Step 2: Update schema.ts**

Add to `shots` table:
```typescript
isStale: integer("is_stale").notNull().default(0),
```

Add to `characters` table:
```typescript
isStale: integer("is_stale").notNull().default(0),
```

Add to `episodes` table:
```typescript
scriptHash: text("script_hash").default(""),
```

- [ ] **Step 3: Create staleness utility**

```typescript
// src/lib/staleness.ts
import { db } from "@/lib/db";
import { shots, characters, episodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

export function hashScript(script: string): string {
  return createHash("sha256").update(script || "").digest("hex").slice(0, 16);
}

/**
 * Mark downstream assets as stale when script changes.
 * Call this after updating episode.script or project.script.
 */
export async function markDownstreamStale(
  entityType: "episode" | "project",
  entityId: string
): Promise<void> {
  if (entityType === "episode") {
    // Mark all shots in this episode as stale
    await db()
      .update(shots)
      .set({ isStale: 1 })
      .where(eq(shots.episodeId, entityId));
    // Mark episode-scoped characters as stale
    await db()
      .update(characters)
      .set({ isStale: 1 })
      .where(eq(characters.episodeId, entityId));
  }
}

/**
 * Clear stale flag after regeneration.
 */
export async function clearStale(
  table: "shots" | "characters",
  id: string
): Promise<void> {
  const target = table === "shots" ? shots : characters;
  await db()
    .update(target)
    .set({ isStale: 0 })
    .where(eq(target.id, id));
}
```

- [ ] **Step 4: Hook staleness into script update API**

In `src/app/api/projects/[id]/route.ts` PATCH handler, after updating script:
```typescript
import { markDownstreamStale, hashScript } from "@/lib/staleness";

// After script update:
if (body.script !== undefined) {
  await markDownstreamStale("project", id);
}
```

Similarly in episode update API.

- [ ] **Step 5: Expose isStale in project-store Shot type**

In `src/stores/project-store.ts`, add to Shot interface:
```typescript
isStale?: boolean;
```

- [ ] **Step 6: Commit**

```bash
git add drizzle/0018_add_staleness_tracking.sql drizzle/meta/_journal.json src/lib/db/schema.ts src/lib/staleness.ts src/app/api/projects/[id]/route.ts src/stores/project-store.ts
git commit -m "feat: dependency chain staleness tracking (7.1)"
```

---

### Task 7: Staleness UI Indicators (Review Item 7.1 continued)

**Files:**
- Modify: `src/components/editor/shot-card.tsx`

- [ ] **Step 1: Add stale badge to ShotCard**

In the ShotCard component, add a visual stale indicator when `shot.isStale` is true. Find the shot header/title area and add:

```tsx
{shot.isStale && (
  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
    <RefreshCw className="h-3 w-3" />
    {t("storyboard.stale")}
  </span>
)}
```

- [ ] **Step 2: Add i18n keys for stale labels**

Add to both `zh.json` and `en.json` message files:
```json
"storyboard": {
  "stale": "需要更新",
  "regenerateStale": "重新生成过期镜头"
}
```
English:
```json
"storyboard": {
  "stale": "Outdated",
  "regenerateStale": "Regenerate outdated shots"
}
```

- [ ] **Step 3: Add "Regenerate Stale" batch button to storyboard page**

In the storyboard page's batch action area, add a button that filters for stale shots and regenerates them:

```tsx
{project.shots.some((s) => s.isStale) && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => handleBatchGenerateFrames(true, true)} // overwrite=true, staleOnly=true
    className="border-yellow-500 text-yellow-700"
  >
    <RefreshCw className="mr-1 h-4 w-4" />
    {t("storyboard.regenerateStale")}
  </Button>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/shot-card.tsx
git commit -m "feat: stale indicators and batch regenerate for outdated shots (7.1)"
```

---

### Task 8: Batch Operation Failure Recovery (Review Item 7.4)

**Files:**
- Modify: `src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx`

- [ ] **Step 1: Add progress tracking state**

Add to the storyboard page state:
```typescript
const [batchProgress, setBatchProgress] = useState<{
  total: number;
  completed: number;
  failed: string[]; // shot IDs that failed
} | null>(null);
```

- [ ] **Step 2: Refactor batch handlers to track progress and skip failures**

Update `handleBatchGenerateFrames` (and similar batch handlers) pattern:

```typescript
async function handleBatchGenerateFrames(overwrite = false, staleOnly = false) {
  if (!imageGuard()) return;
  setGeneratingFrames(true);

  let targets = project.shots.filter((s) =>
    staleOnly ? s.isStale : overwrite ? true : !s.firstFrame
  );

  setBatchProgress({ total: targets.length, completed: 0, failed: [] });

  for (const shot of targets) {
    try {
      const resp = await apiFetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        body: JSON.stringify({
          type: "frame_generate",
          shotId: shot.id,
          episodeId: currentEpisodeId,
        }),
      });
      if (!resp.ok) throw new Error(`Shot ${shot.sequence} failed`);
      // Poll for completion...

      setBatchProgress((prev) =>
        prev ? { ...prev, completed: prev.completed + 1 } : null
      );
    } catch (err) {
      setBatchProgress((prev) =>
        prev
          ? { ...prev, completed: prev.completed + 1, failed: [...prev.failed, shot.id] }
          : null
      );
      console.error(`Frame generation failed for shot ${shot.id}:`, err);
      // Continue to next shot — don't abort batch
    }
  }

  setGeneratingFrames(false);
  await fetchProject(project.id, currentEpisodeId);

  const progress = batchProgress;
  if (progress && progress.failed.length > 0) {
    toast.error(
      t("storyboard.batchPartialFail", {
        failed: progress.failed.length,
        total: progress.total,
      })
    );
  } else {
    toast.success(t("storyboard.batchComplete"));
  }
  setBatchProgress(null);
}
```

- [ ] **Step 3: Add progress bar UI component**

Below the batch action buttons, add:
```tsx
{batchProgress && (
  <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/50">
    <Loader2 className="h-4 w-4 animate-spin" />
    <div className="flex-1">
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{
            width: `${(batchProgress.completed / batchProgress.total) * 100}%`,
          }}
        />
      </div>
    </div>
    <span className="text-sm text-muted-foreground">
      {batchProgress.completed}/{batchProgress.total}
      {batchProgress.failed.length > 0 && (
        <span className="text-destructive ml-1">
          ({batchProgress.failed.length} failed)
        </span>
      )}
    </span>
  </div>
)}
```

- [ ] **Step 4: Add "Retry Failed" button**

```tsx
{batchProgress === null && lastFailedShots.length > 0 && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => handleRetryFailed()}
    className="border-destructive text-destructive"
  >
    <RefreshCw className="mr-1 h-4 w-4" />
    {t("storyboard.retryFailed", { count: lastFailedShots.length })}
  </Button>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx
git commit -m "feat: batch operation progress tracking and failure recovery (7.4)"
```

---

## Phase 2: P1 — High Value Enhancements (Tasks 9-18)

### Task 9: Script Outline Stage (Review Item 1.2)

**Files:**
- Create: `drizzle/0019_add_outline_field.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/ai/prompts/registry.ts` — add `script_outline` prompt definition
- Create: `src/lib/pipeline/script-outline.ts`
- Modify: `src/lib/pipeline/index.ts`
- Modify: `src/lib/task-queue/types.ts` (if task types are hardcoded)

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE projects ADD COLUMN outline TEXT DEFAULT '';
ALTER TABLE episodes ADD COLUMN outline TEXT DEFAULT '';
```

Update journal (idx 19).

- [ ] **Step 2: Update schema.ts**

Add to `projects` after `script`:
```typescript
outline: text("outline").default(""),
```
Add to `episodes` after `script`:
```typescript
outline: text("outline").default(""),
```

- [ ] **Step 3: Add script_outline prompt definition to registry**

Add a new prompt definition:
```typescript
const OUTLINE_SYSTEM = `你是一位资深编剧。根据用户的创意构想，生成一份故事大纲。

大纲结构：
1. 故事前提（1句话核心冲突）
2. 3-5个关键节拍（beat），每个节拍包含：
   - 节拍名称
   - 核心动作/事件
   - 情感转变
   - 预计占比（如20%）
3. 高潮点描述
4. 结局走向

【语言规则】使用与用户输入相同的语言。

以 JSON 格式输出：
{
  "premise": "一句话前提",
  "beats": [
    { "name": "...", "action": "...", "emotion": "...", "ratio": "20%" }
  ],
  "climax": "...",
  "ending": "..."
}`;
```

- [ ] **Step 4: Create pipeline handler**

```typescript
// src/lib/pipeline/script-outline.ts
import { db } from "@/lib/db";
import { projects, episodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider-factory";
import { resolvePrompt } from "@/lib/ai/prompts/resolver";
import type { Task } from "@/lib/task-queue/types";

export async function handleScriptOutline(task: Task): Promise<unknown> {
  const payload = task.payload as { projectId: string; episodeId?: string; idea: string };
  const { projectId, episodeId, idea } = payload;

  const systemPrompt = await resolvePrompt("script_outline", projectId);

  const provider = createAIProvider(/* read from model store via payload */);
  const result = await provider.generateText(
    `创意构想：${idea}`,
    { systemPrompt }
  );

  // Save outline to project/episode
  if (episodeId) {
    await db().update(episodes).set({ outline: result }).where(eq(episodes.id, episodeId));
  } else {
    await db().update(projects).set({ outline: result }).where(eq(projects.id, projectId));
  }

  return { outline: result };
}
```

- [ ] **Step 5: Register handler and add task type**

In `src/lib/pipeline/index.ts`:
```typescript
import { handleScriptOutline } from "./script-outline";
// In registration:
registerHandler("script_outline", handleScriptOutline);
```

Add `"script_outline"` to the task type enum in `schema.ts`:
```typescript
type: text("type", {
  enum: [
    "script_outline",
    "script_parse",
    // ...existing types
  ],
}).notNull(),
```

- [ ] **Step 6: Commit**

```bash
git add drizzle/0019_add_outline_field.sql drizzle/meta/_journal.json src/lib/db/schema.ts src/lib/ai/prompts/registry.ts src/lib/pipeline/script-outline.ts src/lib/pipeline/index.ts
git commit -m "feat: script outline generation stage (1.2)"
```

---

### Task 10: Outline UI — Script Page Enhancement

**Files:**
- Modify: `src/app/[locale]/project/[id]/episodes/[episodeId]/script/page.tsx`
- Modify: `src/stores/project-store.ts`

- [ ] **Step 1: Add outline to project store**

In `src/stores/project-store.ts`, add `outline` field to the project interface and relevant fetch logic.

- [ ] **Step 2: Add outline section to script page**

Add a collapsible "Outline" section above the script editor:
```tsx
{/* Outline Section */}
<div className="rounded-lg border p-4 mb-4">
  <div className="flex items-center justify-between mb-2">
    <h3 className="text-sm font-medium">{t("script.outline")}</h3>
    <Button
      size="sm"
      variant="outline"
      onClick={handleGenerateOutline}
      disabled={!idea || generatingOutline}
    >
      {generatingOutline ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {t("script.generateOutline")}
    </Button>
  </div>
  {outline && (
    <div className="space-y-2 text-sm">
      {/* Render parsed outline beats */}
      {parsedOutline?.beats?.map((beat, i) => (
        <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/50">
          <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
          <div>
            <span className="font-medium">{beat.name}</span>
            <p className="text-muted-foreground">{beat.action}</p>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{beat.ratio}</span>
        </div>
      ))}
    </div>
  )}
  <Textarea
    value={outline}
    onChange={(e) => setOutline(e.target.value)}
    className="mt-2"
    rows={4}
    placeholder={t("script.outlinePlaceholder")}
  />
</div>
```

- [ ] **Step 3: Wire generate outline button to API**

```typescript
async function handleGenerateOutline() {
  setGeneratingOutline(true);
  try {
    const resp = await apiFetch(`/api/projects/${project.id}/generate`, {
      method: "POST",
      body: JSON.stringify({
        type: "script_outline",
        idea: project.idea,
        episodeId: currentEpisodeId,
      }),
    });
    // Poll task...
    await fetchProject(project.id, currentEpisodeId);
  } finally {
    setGeneratingOutline(false);
  }
}
```

- [ ] **Step 4: Update script generation to include outline in prompt**

When generating script, if outline exists, inject it:
```typescript
// In script_generate prompt builder, prepend outline:
const outlineContext = outline
  ? `\n\n【故事大纲】（请严格按照以下大纲展开剧本）\n${outline}\n`
  : "";
```

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/project/[id]/episodes/[episodeId]/script/page.tsx src/stores/project-store.ts
git commit -m "feat: outline UI and generation flow in script page (1.2)"
```

---

### Task 11: Character Relations (Review Item 2.1)

**Files:**
- Create: `drizzle/0020_add_character_relations.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`
- Create: `src/app/api/projects/[id]/character-relations/route.ts`

- [ ] **Step 1: Create migration**

```sql
CREATE TABLE character_relations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_a_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  character_b_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'neutral',
  description TEXT DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Update journal (idx 20).

- [ ] **Step 2: Add to schema.ts**

```typescript
export const characterRelations = sqliteTable("character_relations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  characterAId: text("character_a_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  characterBId: text("character_b_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull().default("neutral"),
  description: text("description").default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

- [ ] **Step 3: Create API route for character relations CRUD**

```typescript
// src/app/api/projects/[id]/character-relations/route.ts
import { db } from "@/lib/db";
import { characterRelations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const relations = await db()
    .select()
    .from(characterRelations)
    .where(eq(characterRelations.projectId, id));
  return NextResponse.json(relations);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const relation = {
    id: ulid(),
    projectId: id,
    characterAId: body.characterAId,
    characterBId: body.characterBId,
    relationType: body.relationType || "neutral",
    description: body.description || "",
  };
  await db().insert(characterRelations).values(relation);
  return NextResponse.json(relation, { status: 201 });
}
```

- [ ] **Step 4: Inject relations into shot-split prompt**

In `src/lib/ai/prompts/shot-split.ts`, `buildShotSplitPrompt`:
```typescript
// After character descriptions, add:
if (relations && relations.length > 0) {
  prompt += "\n\n## CHARACTER RELATIONSHIPS\n";
  for (const rel of relations) {
    prompt += `- ${rel.characterAName} ↔ ${rel.characterBName}: ${rel.relationType} (${rel.description})\n`;
  }
  prompt += "\nUse these relationships to inform framing, character proximity, and eye direction in compositions.\n";
}
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/0020_add_character_relations.sql drizzle/meta/_journal.json src/lib/db/schema.ts src/app/api/projects/[id]/character-relations/route.ts src/lib/ai/prompts/shot-split.ts
git commit -m "feat: character relations system with prompt injection (2.1)"
```

---

### Task 12: Character Relations UI

**Files:**
- Create: `src/components/editor/character-relations.tsx`
- Modify: `src/app/[locale]/project/[id]/characters/page.tsx`

- [ ] **Step 1: Create CharacterRelations component**

```tsx
// src/components/editor/character-relations.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-fetch";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

const RELATION_TYPES = [
  "ally", "enemy", "lover", "family", "mentor", "rival", "stranger", "neutral",
];

interface Character {
  id: string;
  name: string;
}

interface Relation {
  id: string;
  characterAId: string;
  characterBId: string;
  relationType: string;
  description: string;
}

export function CharacterRelations({
  projectId,
  characters,
}: {
  projectId: string;
  characters: Character[];
}) {
  const t = useTranslations();
  const [relations, setRelations] = useState<Relation[]>([]);
  const [charA, setCharA] = useState("");
  const [charB, setCharB] = useState("");
  const [relType, setRelType] = useState("neutral");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    apiFetch(`/api/projects/${projectId}/character-relations`)
      .then((r) => r.json())
      .then(setRelations);
  }, [projectId]);

  async function handleAdd() {
    if (!charA || !charB || charA === charB) return;
    const resp = await apiFetch(`/api/projects/${projectId}/character-relations`, {
      method: "POST",
      body: JSON.stringify({
        characterAId: charA,
        characterBId: charB,
        relationType: relType,
        description: desc,
      }),
    });
    const newRel = await resp.json();
    setRelations((prev) => [...prev, newRel]);
    setDesc("");
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/projects/${projectId}/character-relations/${id}`, {
      method: "DELETE",
    });
    setRelations((prev) => prev.filter((r) => r.id !== id));
  }

  const getName = (id: string) => characters.find((c) => c.id === id)?.name || id;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">{t("characters.relations")}</h3>

      {/* Existing relations */}
      {relations.map((rel) => (
        <div key={rel.id} className="flex items-center gap-2 rounded border p-2 text-sm">
          <span className="font-medium">{getName(rel.characterAId)}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs">{rel.relationType}</span>
          <span className="font-medium">{getName(rel.characterBId)}</span>
          {rel.description && (
            <span className="text-muted-foreground">— {rel.description}</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => handleDelete(rel.id)} className="ml-auto">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {/* Add new relation */}
      {characters.length >= 2 && (
        <div className="flex flex-wrap items-end gap-2">
          <Select value={charA} onValueChange={setCharA}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Character A" /></SelectTrigger>
            <SelectContent>
              {characters.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={relType} onValueChange={setRelType}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RELATION_TYPES.map((rt) => (
                <SelectItem key={rt} value={rt}>{rt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={charB} onValueChange={setCharB}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Character B" /></SelectTrigger>
            <SelectContent>
              {characters.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={t("characters.relationDesc")}
            className="w-48"
          />
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-3 w-3" />
            {t("characters.addRelation")}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add CharacterRelations to characters page**

In `src/app/[locale]/project/[id]/characters/page.tsx`, import and render:
```tsx
import { CharacterRelations } from "@/components/editor/character-relations";

// After the character list:
<CharacterRelations projectId={project.id} characters={allCharacters} />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/character-relations.tsx src/app/[locale]/project/[id]/characters/page.tsx
git commit -m "feat: character relations UI with add/delete (2.1)"
```

---

### Task 13: Scene Layer in Data Model (Review Item 9.2)

**Files:**
- Create: `drizzle/0021_add_scenes_table.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
CREATE TABLE scenes (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  lighting TEXT DEFAULT '',
  color_palette TEXT DEFAULT '',
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE shots ADD COLUMN scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL;
```

Update journal (idx 21).

- [ ] **Step 2: Add scenes table to schema.ts**

```typescript
export const scenes = sqliteTable("scenes", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  description: text("description").default(""),
  lighting: text("lighting").default(""),
  colorPalette: text("color_palette").default(""),
  sequence: integer("sequence").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

Add to `shots` table:
```typescript
sceneId: text("scene_id").references(() => scenes.id, { onDelete: "set null" }),
```

- [ ] **Step 3: Update shot-split pipeline to create scenes**

In `src/lib/pipeline/shot-split.ts`, update the prompt to ask AI to group shots by scene, then create scene records first:

```typescript
// Parse AI response which now includes scene groupings
for (const scene of parsedScenes) {
  const sceneId = ulid();
  await db().insert(scenes).values({
    id: sceneId,
    episodeId,
    projectId,
    title: scene.title,
    description: scene.description,
    lighting: scene.lighting || "",
    colorPalette: scene.colorPalette || "",
    sequence: scene.sequence,
  });

  for (const shot of scene.shots) {
    // Insert shot with sceneId
    await db().insert(shots).values({
      ...shotData,
      sceneId,
    });
  }
}
```

- [ ] **Step 4: Update shot-split prompt to output scene groupings**

In `buildShotSplitSystem`, update JSON output format:
```
Output a JSON array of scenes, each containing shots:
[
  {
    "sceneTitle": "酒馆对话",
    "sceneDescription": "昏暗的中世纪酒馆...",
    "lighting": "warm candlelight, low key",
    "colorPalette": "amber, deep brown, shadow",
    "shots": [
      { "sequence": 1, "prompt": "...", ... }
    ]
  }
]
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/0021_add_scenes_table.sql drizzle/meta/_journal.json src/lib/db/schema.ts src/lib/pipeline/shot-split.ts src/lib/ai/prompts/shot-split.ts
git commit -m "feat: scene layer data model with shot grouping (9.2)"
```

---

### Task 14: Video Quality Assessment (Review Item 5.2)

**Files:**
- Create: `src/lib/pipeline/video-quality-check.ts`
- Modify: `src/lib/pipeline/video-generate.ts`

- [ ] **Step 1: Create video quality check utility**

```typescript
// src/lib/pipeline/video-quality-check.ts
import { createAIProvider } from "@/lib/ai/provider-factory";

interface QualityResult {
  pass: boolean;
  score: number; // 0-100
  issues: string[];
}

const QUALITY_CHECK_PROMPT = `Analyze this generated video frame for quality issues. Score 0-100.

Check for:
1. Face integrity (no distortion, correct proportions)
2. Limb integrity (correct number of fingers, natural poses)
3. Visual coherence (no artifacts, glitches, or object clipping)
4. Consistency with reference frame

Output JSON: { "score": number, "issues": ["..."], "pass": boolean }
A score >= 60 passes. Only fail for serious visual defects.`;

export async function checkVideoQuality(
  videoFrameUrl: string,
  referenceFrameUrl?: string
): Promise<QualityResult> {
  try {
    const provider = createAIProvider(/* vision model config */);
    const images = [videoFrameUrl];
    if (referenceFrameUrl) images.push(referenceFrameUrl);

    const result = await provider.generateText(QUALITY_CHECK_PROMPT, {
      images,
    });

    const parsed = JSON.parse(result);
    return {
      pass: parsed.pass ?? parsed.score >= 60,
      score: parsed.score ?? 0,
      issues: parsed.issues ?? [],
    };
  } catch {
    // If quality check fails, default to pass (don't block generation)
    return { pass: true, score: 100, issues: [] };
  }
}
```

- [ ] **Step 2: Integrate quality check into video-generate pipeline**

In `src/lib/pipeline/video-generate.ts`, after video is generated:

```typescript
// After video generation succeeds:
const qualityResult = await checkVideoQuality(
  generatedVideoUrl,
  shot.firstFrame || undefined
);

if (!qualityResult.pass && retryCount < 2) {
  // Retry generation
  console.warn(`[VideoQuality] Shot ${shotId} failed quality check (score: ${qualityResult.score}), retrying...`);
  // Re-enqueue with retry count
  return { retry: true, qualityScore: qualityResult.score, issues: qualityResult.issues };
}

// Store quality score in result
return {
  videoUrl: generatedVideoUrl,
  qualityScore: qualityResult.score,
  qualityIssues: qualityResult.issues,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/pipeline/video-quality-check.ts src/lib/pipeline/video-generate.ts
git commit -m "feat: AI-powered video quality assessment with auto-retry (5.2)"
```

---

### Task 15: Composition Guide in Shot Split (Review Item 4.1)

**Files:**
- Modify: `src/lib/ai/prompts/shot-split.ts`
- Create: `drizzle/0022_add_composition_guide.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE shots ADD COLUMN composition_guide TEXT DEFAULT '';
```

Update journal (idx 22).

- [ ] **Step 2: Update schema.ts**

Add to `shots` table:
```typescript
compositionGuide: text("composition_guide").default(""),
```

- [ ] **Step 3: Add composition rules to shot-split prompt**

In `buildShotSplitSystem`, add:
```
## COMPOSITION GUIDE
For each shot, recommend a composition technique:
- "rule_of_thirds": Subject at 1/3 intersection. Best for: conversations, character introductions
- "golden_ratio": Natural spiral focus. Best for: landscapes, beauty shots
- "symmetric": Mirror composition. Best for: power, authority, confrontation
- "diagonal": Dynamic lines. Best for: action, tension, movement
- "frame_within_frame": Doorways/windows framing subject. Best for: isolation, voyeurism
- "leading_lines": Lines guide eye to subject. Best for: journeys, reveals

Add "compositionGuide" to each shot's JSON output.
```

- [ ] **Step 4: Save composition guide in pipeline**

In `shot-split.ts`, add when inserting:
```typescript
compositionGuide: shot.compositionGuide || "",
```

- [ ] **Step 5: Inject composition into frame-generate prompt**

In frame generation, add composition guide to the image prompt:
```typescript
if (shot.compositionGuide) {
  prompt += `\nComposition: ${shot.compositionGuide}`;
}
```

- [ ] **Step 6: Commit**

```bash
git add drizzle/0022_add_composition_guide.sql drizzle/meta/_journal.json src/lib/db/schema.ts src/lib/ai/prompts/shot-split.ts src/lib/pipeline/shot-split.ts src/lib/pipeline/frame-generate.ts
git commit -m "feat: AI-recommended composition guides for shots (4.1)"
```

---

### Task 16: Global Color Palette Management (Review Item 4.2)

**Files:**
- Create: `drizzle/0023_add_color_palette.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE projects ADD COLUMN color_palette TEXT DEFAULT '';
ALTER TABLE episodes ADD COLUMN color_palette TEXT DEFAULT '';
```

Update journal (idx 23).

- [ ] **Step 2: Update schema.ts**

Add to `projects` and `episodes`:
```typescript
colorPalette: text("color_palette").default(""),
```

- [ ] **Step 3: Inject color palette into frame-generate and shot-split prompts**

In the prompt builders, when `colorPalette` exists:
```typescript
if (colorPalette) {
  prompt += `\n\n## GLOBAL COLOR PALETTE (MANDATORY)\nAll frames must adhere to this color scheme: ${colorPalette}\nDo not deviate from these colors unless the scene explicitly requires it.\n`;
}
```

- [ ] **Step 4: Add color palette input to project settings**

In the project layout or settings page, add a text input for color palette:
```tsx
<div className="space-y-2">
  <Label>{t("project.colorPalette")}</Label>
  <Input
    value={colorPalette}
    onChange={(e) => setColorPalette(e.target.value)}
    placeholder="e.g., warm amber, deep teal, muted gold, charcoal shadows"
  />
  <p className="text-xs text-muted-foreground">{t("project.colorPaletteHint")}</p>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/0023_add_color_palette.sql drizzle/meta/_journal.json src/lib/db/schema.ts src/lib/ai/prompts/shot-split.ts src/lib/pipeline/frame-generate.ts
git commit -m "feat: global color palette management (4.2)"
```

---

### Task 17: Transition Type Editor in Shot Card UI

**Files:**
- Modify: `src/components/editor/shot-card.tsx`
- Modify: `src/stores/project-store.ts`

- [ ] **Step 1: Add transition fields to Shot interface in project-store**

```typescript
interface Shot {
  // ...existing fields
  transitionIn?: string;
  transitionOut?: string;
  compositionGuide?: string;
  sceneId?: string;
}
```

- [ ] **Step 2: Add transition selector to ShotCard**

In the shot card's metadata section, add:
```tsx
const TRANSITIONS = [
  { value: "cut", label: "Cut" },
  { value: "dissolve", label: "Dissolve" },
  { value: "fade_in", label: "Fade In" },
  { value: "fade_out", label: "Fade Out" },
  { value: "wipeleft", label: "Wipe Left" },
  { value: "circleopen", label: "Circle Open" },
];

<div className="flex items-center gap-2 text-xs">
  <span className="text-muted-foreground">{t("storyboard.transition")}:</span>
  <Select
    value={shot.transitionIn || "cut"}
    onValueChange={(v) => handleUpdateShot(shot.id, { transitionIn: v })}
  >
    <SelectTrigger className="h-7 w-24 text-xs">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {TRANSITIONS.map((t) => (
        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/shot-card.tsx src/stores/project-store.ts
git commit -m "feat: transition type editor in shot cards (6.1 UI)"
```

---

### Task 18: Scene Grouping UI in Storyboard

**Files:**
- Modify: `src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx`

- [ ] **Step 1: Group shots by scene in the storyboard view**

```tsx
// Group shots by sceneId
const sceneGroups = useMemo(() => {
  const groups: Map<string, { scene: { title: string; description: string }; shots: Shot[] }> = new Map();
  const ungrouped: Shot[] = [];

  for (const shot of project.shots) {
    if (shot.sceneId) {
      const existing = groups.get(shot.sceneId);
      if (existing) {
        existing.shots.push(shot);
      } else {
        groups.set(shot.sceneId, {
          scene: { title: `Scene ${shot.sceneId}`, description: "" },
          shots: [shot],
        });
      }
    } else {
      ungrouped.push(shot);
    }
  }

  return { groups: Array.from(groups.values()), ungrouped };
}, [project.shots]);
```

- [ ] **Step 2: Render scene dividers**

```tsx
{sceneGroups.groups.map((group) => (
  <div key={group.scene.title} className="space-y-3">
    <div className="flex items-center gap-2 border-b pb-2">
      <Film className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-medium">{group.scene.title}</h3>
      <span className="text-xs text-muted-foreground">
        {group.scene.description}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {group.shots.length} shots
      </span>
    </div>
    {group.shots.map((shot) => (
      <ShotCard key={shot.id} shot={shot} /* ...props */ />
    ))}
  </div>
))}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx
git commit -m "feat: scene grouping display in storyboard view (9.2 UI)"
```

---

## Phase 3: P2 — Enhanced Experience (Tasks 19-28)

### Task 19: World Setting (Review Item 1.1)

**Files:**
- Create: `drizzle/0024_add_world_setting.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE projects ADD COLUMN world_setting TEXT DEFAULT '';
```

Update journal (idx 24).

- [ ] **Step 2: Update schema.ts**

Add to `projects`:
```typescript
worldSetting: text("world_setting").default(""),
```

- [ ] **Step 3: Add world setting input to script page**

Before the idea/script area, add a collapsible "World Setting" section:
```tsx
<div className="rounded-lg border p-4 mb-4">
  <h3 className="text-sm font-medium mb-2">{t("script.worldSetting")}</h3>
  <Textarea
    value={worldSetting}
    onChange={(e) => setWorldSetting(e.target.value)}
    rows={3}
    placeholder={t("script.worldSettingPlaceholder")}
  />
</div>
```

- [ ] **Step 4: Inject world setting into script generation prompt**

In the script_generate prompt builder, prepend world setting:
```typescript
if (worldSetting) {
  userPrompt = `【世界观设定】${worldSetting}\n\n${userPrompt}`;
}
```

Also inject into shot-split and character-extract prompts.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0024_add_world_setting.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: world setting field with prompt injection (1.1)"
```

---

### Task 20: Target Duration Control (Review Item 1.3)

**Files:**
- Create: `drizzle/0025_add_target_duration.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE projects ADD COLUMN target_duration INTEGER DEFAULT 0;
ALTER TABLE episodes ADD COLUMN target_duration INTEGER DEFAULT 0;
```

Update journal (idx 25).

- [ ] **Step 2: Update schema.ts**

```typescript
targetDuration: integer("target_duration").default(0),
```

- [ ] **Step 3: Inject target duration into script and shot-split prompts**

In script_generate:
```typescript
if (targetDuration > 0) {
  const estimatedScenes = Math.ceil(targetDuration / 10); // ~10s per scene
  prompt += `\n目标时长：约${targetDuration}秒（${Math.floor(targetDuration / 60)}分${targetDuration % 60}秒）。请生成约${estimatedScenes}个场景。`;
}
```

In shot-split:
```typescript
if (targetDuration > 0) {
  prompt += `\n总目标时长：${targetDuration}秒。请确保所有镜头的 duration 之和接近此目标。`;
}
```

- [ ] **Step 4: Show estimated vs target duration in storyboard**

```tsx
const totalDuration = project.shots.reduce((sum, s) => sum + s.duration, 0);
const targetDuration = project.targetDuration;

{targetDuration > 0 && (
  <div className="text-sm text-muted-foreground">
    {t("storyboard.duration")}: {totalDuration}s / {targetDuration}s
    {totalDuration > targetDuration * 1.2 && (
      <span className="text-yellow-500 ml-1">({t("storyboard.overTarget")})</span>
    )}
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/0025_add_target_duration.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: target duration control for projects and episodes (1.3)"
```

---

### Task 21: Focal Point & Depth of Field (Review Item 3.3)

**Files:**
- Create: `drizzle/0026_add_dof_fields.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE shots ADD COLUMN focal_point TEXT DEFAULT '';
ALTER TABLE shots ADD COLUMN depth_of_field TEXT DEFAULT 'medium';
```

Update journal (idx 26).

- [ ] **Step 2: Update schema.ts and shot-split prompt**

Add to `shots`:
```typescript
focalPoint: text("focal_point").default(""),
depthOfField: text("depth_of_field").default("medium"),
```

Add to shot-split system prompt:
```
- "focalPoint": what the camera focuses on (character name or object). e.g., "李明's face", "the sword on the table"
- "depthOfField": "shallow" (blurred background, cinematic) | "medium" (normal) | "deep" (everything sharp)
```

- [ ] **Step 3: Inject into frame-generate prompt**

```typescript
if (shot.focalPoint) {
  prompt += `, focus on ${shot.focalPoint}`;
}
if (shot.depthOfField === "shallow") {
  prompt += `, shallow depth of field, bokeh background`;
} else if (shot.depthOfField === "deep") {
  prompt += `, deep focus, everything sharp`;
}
```

- [ ] **Step 4: Commit**

```bash
git add drizzle/0026_add_dof_fields.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: focal point and depth of field controls (3.3)"
```

---

### Task 22: Sound Design & Music Cue Fields (Review Item 3.4)

**Files:**
- Create: `drizzle/0027_add_sound_fields.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE shots ADD COLUMN sound_design TEXT DEFAULT '';
ALTER TABLE shots ADD COLUMN music_cue TEXT DEFAULT '';
```

Update journal (idx 27).

- [ ] **Step 2: Update schema.ts**

```typescript
soundDesign: text("sound_design").default(""),
musicCue: text("music_cue").default(""),
```

- [ ] **Step 3: Add to shot-split prompt**

```
- "soundDesign": ambient/environmental sounds for this shot. e.g., "rain on roof, distant thunder, wood creaking"
- "musicCue": music direction. e.g., "tense strings crescendo", "silence", "soft piano melody"
```

- [ ] **Step 4: Save in pipeline and display in shot card**

In `shot-split.ts`, save the fields. In `shot-card.tsx`, display them in a collapsible "Audio" section:
```tsx
{(shot.soundDesign || shot.musicCue) && (
  <div className="text-xs text-muted-foreground mt-1">
    {shot.soundDesign && <span>🔊 {shot.soundDesign}</span>}
    {shot.musicCue && <span className="ml-2">🎵 {shot.musicCue}</span>}
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/0027_add_sound_fields.sql drizzle/meta/_journal.json src/lib/db/schema.ts src/lib/ai/prompts/shot-split.ts src/lib/pipeline/shot-split.ts src/components/editor/shot-card.tsx
git commit -m "feat: sound design and music cue fields (3.4)"
```

---

### Task 23: Multi-Version A/B Comparison (Review Item 7.2)

**Files:**
- Create: `src/components/editor/version-compare.tsx`
- Modify: `src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx`

- [ ] **Step 1: Create VersionCompare component**

```tsx
// src/components/editor/version-compare.tsx
"use client";

import { useState } from "react";
import type { Shot, StoryboardVersion } from "@/stores/project-store";
import Image from "next/image";
import { useTranslations } from "next-intl";

interface VersionCompareProps {
  versions: StoryboardVersion[];
  shotsByVersion: Record<string, Shot[]>;
  onSelectPreferred: (versionId: string, shotId: string) => void;
}

export function VersionCompare({ versions, shotsByVersion, onSelectPreferred }: VersionCompareProps) {
  const t = useTranslations();
  const [versionA, setVersionA] = useState(versions[0]?.id || "");
  const [versionB, setVersionB] = useState(versions[1]?.id || "");

  const shotsA = shotsByVersion[versionA] || [];
  const shotsB = shotsByVersion[versionB] || [];

  const maxLen = Math.max(shotsA.length, shotsB.length);

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        {/* Version selectors */}
        {/* Side-by-side shot comparison */}
      </div>

      {Array.from({ length: maxLen }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-4 border rounded-lg p-3">
          {/* Version A shot */}
          <div className="space-y-2">
            <span className="text-xs font-medium">Shot {i + 1} — v{versions.find((v) => v.id === versionA)?.versionNum}</span>
            {shotsA[i]?.firstFrame && (
              <img src={shotsA[i].firstFrame!} alt="" className="rounded w-full aspect-video object-cover" />
            )}
          </div>
          {/* Version B shot */}
          <div className="space-y-2">
            <span className="text-xs font-medium">Shot {i + 1} — v{versions.find((v) => v.id === versionB)?.versionNum}</span>
            {shotsB[i]?.firstFrame && (
              <img src={shotsB[i].firstFrame!} alt="" className="rounded w-full aspect-video object-cover" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add compare mode toggle to storyboard page**

```tsx
const [compareMode, setCompareMode] = useState(false);

<Button
  variant={compareMode ? "default" : "outline"}
  size="sm"
  onClick={() => setCompareMode(!compareMode)}
  disabled={versions.length < 2}
>
  {t("storyboard.compare")}
</Button>

{compareMode && (
  <VersionCompare
    versions={versions}
    shotsByVersion={shotsByVersion}
    onSelectPreferred={handleSelectPreferred}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/version-compare.tsx src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx
git commit -m "feat: multi-version side-by-side comparison view (7.2)"
```

---

### Task 24: Continuity Check (Review Item 3.5)

**Files:**
- Create: `src/lib/pipeline/continuity-check.ts`

- [ ] **Step 1: Create continuity check utility**

```typescript
// src/lib/pipeline/continuity-check.ts
import { createAIProvider } from "@/lib/ai/provider-factory";

interface ContinuityResult {
  pass: boolean;
  issues: string[];
}

const CONTINUITY_PROMPT = `Compare these two consecutive frames from an animated film.
Frame 1 is the LAST frame of shot N.
Frame 2 is the FIRST frame of shot N+1.

Check for continuity issues:
1. Character costume consistency (same clothes, accessories)
2. Character position logical progression (natural movement between shots)
3. Lighting direction consistency
4. Color tone consistency
5. Background continuity (if same location)

Output JSON: { "pass": boolean, "issues": ["description of each issue found"] }
Pass if no significant continuity breaks. Minor perspective changes are OK (different camera angle).`;

export async function checkContinuity(
  lastFrameUrl: string,
  nextFirstFrameUrl: string
): Promise<ContinuityResult> {
  try {
    const provider = createAIProvider(/* vision model */);
    const result = await provider.generateText(CONTINUITY_PROMPT, {
      images: [lastFrameUrl, nextFirstFrameUrl],
    });
    return JSON.parse(result);
  } catch {
    return { pass: true, issues: [] };
  }
}
```

- [ ] **Step 2: Add batch continuity check to storyboard page**

In the storyboard page, add a "Check Continuity" button:
```typescript
async function handleContinuityCheck() {
  const results: { shotSequence: number; issues: string[] }[] = [];
  for (let i = 0; i < project.shots.length - 1; i++) {
    const current = project.shots[i];
    const next = project.shots[i + 1];
    if (current.lastFrame && next.firstFrame) {
      const result = await checkContinuity(current.lastFrame, next.firstFrame);
      if (!result.pass) {
        results.push({ shotSequence: current.sequence, issues: result.issues });
      }
    }
  }
  setContinuityIssues(results);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/pipeline/continuity-check.ts
git commit -m "feat: AI-powered continuity check between consecutive shots (3.5)"
```

---

### Task 25: Prompt Language Optimization (Review Item 8.1)

**Files:**
- Modify: `src/lib/ai/prompts/video-generate.ts`

- [ ] **Step 1: Create language-aware label function**

```typescript
function getLabels(lang: "zh" | "en") {
  const labels = {
    zh: {
      characterAppearance: "角色形象",
      dialogue: "对白口型",
      camera: "镜头运动",
      duration: "时长",
    },
    en: {
      characterAppearance: "Character Appearance",
      dialogue: "Dialogue Lip Sync",
      camera: "Camera Movement",
      duration: "Duration",
    },
  };
  return labels[lang] || labels.en;
}

function detectLanguage(text: string): "zh" | "en" {
  const chineseChars = text.match(/[\u4e00-\u9fff]/g);
  return chineseChars && chineseChars.length > text.length * 0.1 ? "zh" : "en";
}
```

- [ ] **Step 2: Replace hardcoded labels in buildVideoPrompt and buildReferenceVideoPrompt**

Replace all hardcoded Chinese/English labels with `getLabels(detectLanguage(scriptText))` calls. For example:

```typescript
const lang = detectLanguage(videoScript || prompt);
const L = getLabels(lang);

// Replace: "角色形象：" with `${L.characterAppearance}：`
// Replace: "Camera:" with `${L.camera}:`
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/prompts/video-generate.ts
git commit -m "feat: language-aware prompt labels for multi-language support (8.1)"
```

---

### Task 26: Title Card / Opening / Ending Support (Review Item 6.3)

**Files:**
- Modify: `src/lib/video/ffmpeg.ts`
- Modify: `src/lib/pipeline/video-assemble.ts`

- [ ] **Step 1: Add title card generation function to ffmpeg.ts**

```typescript
export async function generateTitleCard(
  text: string,
  duration: number,
  outputPath: string,
  options?: { fontSize?: number; bgColor?: string; textColor?: string }
): Promise<string> {
  const { fontSize = 48, bgColor = "black", textColor = "white" } = options || {};
  const cardPath = outputPath.replace(/\.mp4$/, `-title-${ulid()}.mp4`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(`color=c=${bgColor}:s=1920x1080:d=${duration}`)
      .inputOptions(["-f", "lavfi"])
      .outputOptions([
        "-vf",
        `drawtext=text='${text.replace(/'/g, "\\'")}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2:font=Noto Sans CJK SC`,
        "-c:v", "libx264",
        "-preset", "fast",
        "-t", String(duration),
      ])
      .output(cardPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  return cardPath;
}
```

- [ ] **Step 2: Update AssembleParams for title/credits**

```typescript
interface AssembleParams {
  videoPaths: string[];
  subtitles: SubtitleEntry[];
  projectId: string;
  shotDurations: number[];
  transitions?: TransitionType[];
  titleCard?: { text: string; duration: number };
  creditsCard?: { text: string; duration: number };
}
```

- [ ] **Step 3: Generate and prepend/append title cards in assembleVideo**

```typescript
// Before concatenation:
const allPaths = [...videoPaths];
const allDurations = [...shotDurations];
const allTransitions = [...(transitions || [])];

if (titleCard) {
  const titlePath = await generateTitleCard(titleCard.text, titleCard.duration, outputPath);
  allPaths.unshift(titlePath);
  allDurations.unshift(titleCard.duration);
  allTransitions.unshift("fade_in");
}

if (creditsCard) {
  const creditsPath = await generateTitleCard(creditsCard.text, creditsCard.duration, outputPath);
  allPaths.push(creditsPath);
  allDurations.push(creditsCard.duration);
  allTransitions.push("fade_out");
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/video/ffmpeg.ts src/lib/pipeline/video-assemble.ts
git commit -m "feat: title card and credits generation in video assembly (6.3)"
```

---

### Task 27: Prompt Template Reuse (Review Item 8.2)

**Files:**
- Create: `src/lib/ai/prompts/blocks.ts`
- Modify: `src/lib/ai/prompts/registry.ts`

- [ ] **Step 1: Extract common prompt blocks**

```typescript
// src/lib/ai/prompts/blocks.ts

export function artStyleBlock(): string {
  return `## ART STYLE CONSISTENCY
- Maintain the visual style defined in the project's "Visual Style" section throughout ALL generated images
- Style elements include: rendering technique, color palette, lighting mood, texture quality
- DO NOT mix styles within a single project (e.g., no photorealistic character in cartoon background)`;
}

export function referenceImageBlock(): string {
  return `## REFERENCE IMAGE USAGE
- Reference images define the character's canonical appearance
- Match: face shape, hair style/color, eye color, skin tone, outfit details
- Adapt: pose, expression, angle — these change per shot
- NEVER contradict the reference image's core identity markers`;
}

export function languageRuleBlock(defaultLang?: string): string {
  return `## CRITICAL LANGUAGE RULE
Output MUST match the input language. If the user writes in Chinese, respond entirely in Chinese. If English, respond entirely in English.${
    defaultLang ? `\nDefault language: ${defaultLang}` : ""
  }`;
}

export function safetyBlock(): string {
  return `## CONTENT SAFETY
- No explicit violence, gore, or sexual content
- No real-world political figures or trademarked characters
- Age-appropriate content suitable for general audiences`;
}
```

- [ ] **Step 2: Replace duplicated text in registry.ts with block calls**

Find all duplicated prompt text blocks in `registry.ts` and replace with:
```typescript
import { artStyleBlock, referenceImageBlock, languageRuleBlock } from "./blocks";

// In prompt definitions, replace inline duplicated text:
// OLD: const ART_STYLE_TEXT = `## ART STYLE CONSISTENCY...`;
// NEW: const ART_STYLE_TEXT = artStyleBlock();
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/prompts/blocks.ts src/lib/ai/prompts/registry.ts
git commit -m "refactor: extract reusable prompt building blocks (8.2)"
```

---

### Task 28: SRT External Subtitle Export

**Files:**
- Modify: `src/lib/video/ffmpeg.ts`
- Modify: `src/lib/pipeline/video-assemble.ts`

- [ ] **Step 1: Keep SRT file after burning subtitles**

In `assembleVideo`, instead of deleting the SRT file, keep it:
```typescript
// Remove: fs.unlinkSync(srtPath);
// The SRT file now persists alongside the final video for external subtitle use
```

- [ ] **Step 2: Return srtPath in the result**

```typescript
return {
  videoPath: path.relative(process.cwd(), outputPath),
  srtPath: srtPath ? path.relative(process.cwd(), srtPath) : undefined,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/video/ffmpeg.ts src/lib/pipeline/video-assemble.ts
git commit -m "feat: preserve SRT subtitle file for external use (6.2)"
```

---

## Phase 4: P3 — Long-term (Tasks 29-35)

### Task 29: Character Performance Style (Review Item 2.2)

**Files:**
- Create: `drizzle/0028_add_performance_style.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE characters ADD COLUMN performance_style TEXT DEFAULT '';
```

Update journal (idx 28).

- [ ] **Step 2: Update schema.ts**

```typescript
performanceStyle: text("performance_style").default(""),
```

- [ ] **Step 3: Add performance style to character extract prompt**

```
For each character, also define:
- "performanceStyle": acting/motion style description including:
  - Motion range: broad/exaggerated OR subtle/restrained
  - Signature gestures: habitual actions (pushes glasses, crosses arms, clenches fist)
  - Emotion patterns: how they express key emotions (happy: slight smile / nervous: bites lip / thinking: rubs chin)
```

- [ ] **Step 4: Inject into motionScript generation**

When building video prompts, if character has performanceStyle:
```typescript
if (character.performanceStyle) {
  prompt += `\nPerformance style for ${character.name}: ${character.performanceStyle}`;
}
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/0028_add_performance_style.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: character performance style field (2.2)"
```

---

### Task 30: Character Height Comparison Data (Review Item 2.4)

**Files:**
- Create: `drizzle/0029_add_character_height.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE characters ADD COLUMN height_cm INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN body_type TEXT DEFAULT 'average';
```

Update journal (idx 29).

- [ ] **Step 2: Update schema and character-extract prompt**

Add fields and prompt AI to include height/body type:
```
- "heightCm": estimated height in cm (e.g., 175)
- "bodyType": "slim" | "average" | "athletic" | "heavy" | "petite" | "tall"
```

- [ ] **Step 3: Inject into multi-character frame prompts**

When multiple characters appear in a shot, include relative height info:
```typescript
const charsInShot = getCharactersInShot(shot);
if (charsInShot.length > 1) {
  const heightInfo = charsInShot
    .sort((a, b) => (b.heightCm || 170) - (a.heightCm || 170))
    .map((c) => `${c.name}: ${c.heightCm || 170}cm (${c.bodyType || "average"})`)
    .join(", ");
  prompt += `\nCharacter heights (tallest first): ${heightInfo}. Ensure correct relative proportions.`;
}
```

- [ ] **Step 4: Commit**

```bash
git add drizzle/0029_add_character_height.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: character height and body type for multi-character consistency (2.4)"
```

---

### Task 31: Character Costume Sets (Review Item 2.3)

**Files:**
- Create: `drizzle/0030_add_costume_sets.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
CREATE TABLE character_costumes (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'default',
  description TEXT DEFAULT '',
  reference_image TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE shots ADD COLUMN costume_overrides TEXT DEFAULT '';
```

Update journal (idx 30).

- [ ] **Step 2: Add to schema.ts**

```typescript
export const characterCostumes = sqliteTable("character_costumes", {
  id: text("id").primaryKey(),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("default"),
  description: text("description").default(""),
  referenceImage: text("reference_image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

Add to `shots`:
```typescript
costumeOverrides: text("costume_overrides").default(""), // JSON: { "characterId": "costumeId" }
```

- [ ] **Step 3: Use costume overrides in frame generation**

When generating frames, check if shot has costume overrides and use the corresponding costume's description/reference instead of the default character appearance.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0030_add_costume_sets.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: character costume sets for multi-outfit support (2.3)"
```

---

### Task 32: Background Music Support (Review Item 6.4)

**Files:**
- Modify: `src/lib/video/ffmpeg.ts`
- Modify: `src/lib/pipeline/video-assemble.ts`
- Create: `drizzle/0031_add_bgm_field.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE projects ADD COLUMN bgm_url TEXT DEFAULT '';
ALTER TABLE episodes ADD COLUMN bgm_url TEXT DEFAULT '';
```

Update journal (idx 31).

- [ ] **Step 2: Add BGM mixing to assembleVideo**

```typescript
// In AssembleParams:
bgmPath?: string;
bgmVolume?: number; // 0-1, default 0.3

// After subtitle burn, if bgmPath exists:
if (bgmPath && fs.existsSync(bgmPath)) {
  const withBgmPath = outputPath.replace(/\.mp4$/, "-bgm.mp4");
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(outputPath)
      .input(bgmPath)
      .complexFilter([
        `[1:a]volume=${bgmVolume || 0.3}[bgm]`,
        `[0:a][bgm]amix=inputs=2:duration=first[aout]`,
      ])
      .outputOptions(["-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac"])
      .output(withBgmPath)
      .on("end", () => {
        fs.unlinkSync(outputPath);
        fs.renameSync(withBgmPath, outputPath);
        resolve();
      })
      .on("error", (err) => reject(err))
      .run();
  });
}
```

- [ ] **Step 3: Add BGM upload UI**

Add file upload for background music in the preview/assembly page.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0031_add_bgm_field.sql drizzle/meta/_journal.json src/lib/db/schema.ts src/lib/video/ffmpeg.ts src/lib/pipeline/video-assemble.ts
git commit -m "feat: background music support with volume mixing (6.4)"
```

---

### Task 33: Emotion Curve Visualization (Review Item 1.4)

**Files:**
- Create: `src/components/editor/emotion-curve.tsx`

- [ ] **Step 1: Create EmotionCurve component**

```tsx
// src/components/editor/emotion-curve.tsx
"use client";

import { useMemo } from "react";
import type { Shot } from "@/stores/project-store";

interface EmotionCurveProps {
  shots: Shot[];
  emotionScores?: { shotId: string; tension: number; emotion: number }[];
}

export function EmotionCurve({ shots, emotionScores }: EmotionCurveProps) {
  const width = 600;
  const height = 120;
  const padding = 20;

  const points = useMemo(() => {
    if (!emotionScores || emotionScores.length === 0) return [];
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;
    return emotionScores.map((s, i) => ({
      x: padding + (i / (emotionScores.length - 1)) * plotWidth,
      y: height - padding - (s.tension / 100) * plotHeight,
      tension: s.tension,
    }));
  }, [emotionScores]);

  if (points.length === 0) return null;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <div className="rounded-lg border p-3">
      <h4 className="text-xs font-medium mb-2">Tension Curve</h4>
      <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`}>
        <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="hsl(var(--primary))" />
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Add AI emotion analysis endpoint**

Create an API that analyzes script/shot descriptions and returns tension scores per shot. Wire to the storyboard page.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/emotion-curve.tsx
git commit -m "feat: emotion/tension curve visualization for storyboard (1.4)"
```

---

### Task 34: Mood Board / Reference Image Upload (Review Item 4.3)

**Files:**
- Create: `drizzle/0032_add_mood_board.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
CREATE TABLE mood_board_images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  annotation TEXT DEFAULT '',
  extracted_style TEXT DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Update journal (idx 32).

- [ ] **Step 2: Add schema, API, and UI**

Add table to schema. Create upload API endpoint. Create mood board component where users can upload reference images with annotations.

- [ ] **Step 3: Extract visual style from mood board with AI**

When images are uploaded, use vision AI to extract style descriptors and inject them into frame generation prompts.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0032_add_mood_board.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: mood board with AI style extraction (4.3)"
```

---

### Task 35: Structured Action Layer (Review Item 9.4) & Prompt A/B Testing (8.3)

**Files:**
- Create: `drizzle/0033_add_structured_actions.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create structured actions table**

```sql
CREATE TABLE shot_actions (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  body_part TEXT DEFAULT 'full_body',
  motion TEXT NOT NULL DEFAULT '',
  start_time REAL DEFAULT 0,
  end_time REAL DEFAULT 0,
  intensity TEXT DEFAULT 'normal',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

- [ ] **Step 2: Add prompt A/B testing table**

```sql
CREATE TABLE prompt_ab_tests (
  id TEXT PRIMARY KEY,
  prompt_key TEXT NOT NULL,
  variant_a TEXT NOT NULL,
  variant_b TEXT NOT NULL,
  shot_id TEXT REFERENCES shots(id) ON DELETE CASCADE,
  result_a_url TEXT,
  result_b_url TEXT,
  preferred TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

- [ ] **Step 3: Add to schema.ts and create basic API routes**

- [ ] **Step 4: Commit**

```bash
git add drizzle/0033_add_structured_actions.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat: structured action layer and prompt A/B testing tables (9.4, 8.3)"
```

---

## Summary

| Phase | Tasks | Items Covered | Focus |
|-------|-------|---------------|-------|
| **Phase 1 (P0)** | Tasks 1-8 | 6.1, 6.2, 3.1, 7.1, 7.4 | Core fixes: transitions, subtitles, staleness, batch recovery |
| **Phase 2 (P1)** | Tasks 9-18 | 1.2, 2.1, 9.2, 5.2, 4.1, 4.2 | High value: outline, relations, scenes, quality, composition, color |
| **Phase 3 (P2)** | Tasks 19-28 | 1.1, 1.3, 3.3, 3.4, 7.2, 3.5, 8.1, 6.3, 8.2 | Enhanced: world setting, duration, DoF, sound, compare, continuity |
| **Phase 4 (P3)** | Tasks 29-35 | 2.2, 2.4, 2.3, 6.4, 1.4, 4.3, 9.4, 8.3 | Long-term: performance, costumes, BGM, emotion curve, mood board |

Total: **35 tasks**, **16 DB migrations** (0016-0033), covering all **27 optimization items**.
