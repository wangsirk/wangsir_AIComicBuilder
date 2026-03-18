/**
 * Prompt for reference-image-based video generation (Toonflow/Kling reference mode).
 * No frame interpolation header, no [FRAME ANCHORS] — the reference image provides visual context.
 */
export function buildReferenceVideoPrompt(params: {
  videoScript: string;
  cameraDirection: string;
  motionScript?: string;
  characterDescriptions?: string;
  dialogues?: Array<{ characterName: string; text: string }>;
}): string {
  const lines: string[] = [];

  if (params.characterDescriptions) {
    lines.push(`[CHARACTERS]`);
    lines.push(params.characterDescriptions);
    lines.push(``);
  }

  lines.push(`[MOTION]`);
  lines.push(params.videoScript);

  if (params.motionScript && params.motionScript !== params.videoScript) {
    lines.push(``);
    lines.push(`[SCRIPT]`);
    lines.push(params.motionScript);
  }

  lines.push(``);
  lines.push(`[CAMERA]`);
  lines.push(params.cameraDirection);

  if (params.dialogues?.length) {
    lines.push(``);
    lines.push(`[DIALOGUE]`);
    for (const d of params.dialogues) {
      lines.push(`- ${d.characterName} says: "${d.text}"`);
    }
  }

  return lines.join("\n");
}

export function buildVideoPrompt(params: {
  videoScript: string;
  cameraDirection: string;
  motionScript?: string;           // full screenplay action script; included as [SCRIPT] when present and different from videoScript
  startFrameDesc?: string;
  endFrameDesc?: string;
  sceneDescription?: string;       // kept for call-site compatibility, not used in output
  duration?: number;
  characterDescriptions?: string;
  dialogues?: Array<{ characterName: string; text: string }>;
}): string {
  const lines: string[] = [];

  lines.push(`Smoothly interpolate from the first frame to the last frame.`);
  lines.push(``);

  if (params.characterDescriptions) {
    lines.push(`[CHARACTERS]`);
    lines.push(params.characterDescriptions);
    lines.push(``);
  }

  lines.push(`[MOTION]`);
  lines.push(params.videoScript);

  if (params.motionScript && params.motionScript !== params.videoScript) {
    lines.push(``);
    lines.push(`[SCRIPT]`);
    lines.push(params.motionScript);
  }

  lines.push(``);
  lines.push(`[CAMERA]`);
  lines.push(params.cameraDirection);

  const hasStart = !!params.startFrameDesc;
  const hasEnd = !!params.endFrameDesc;
  if (hasStart || hasEnd) {
    lines.push(``);
    lines.push(`[FRAME ANCHORS]`);
    if (hasStart) lines.push(`Opening frame: ${params.startFrameDesc}`);
    if (hasEnd) lines.push(`Closing frame: ${params.endFrameDesc}`);
  }

  if (params.dialogues?.length) {
    lines.push(``);
    lines.push(`[DIALOGUE]`);
    for (const d of params.dialogues) {
      lines.push(`- ${d.characterName} says: "${d.text}"`);
    }
  }

  return lines.join("\n");
}
