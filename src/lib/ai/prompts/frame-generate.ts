export function buildFirstFramePrompt(params: {
  shotPrompt: string;
  characterDescriptions: string;
  previousLastFrame?: string;
}): string {
  const lines: string[] = [];

  lines.push(`Create the OPENING FRAME of this animated shot as a single, stunning illustration.`);
  lines.push(``);
  lines.push(`=== SHOT DESCRIPTION ===`);
  lines.push(params.shotPrompt);
  lines.push(``);
  lines.push(`=== CHARACTER VISUAL REFERENCES ===`);
  lines.push(params.characterDescriptions);
  lines.push(``);

  if (params.previousLastFrame) {
    lines.push(`=== CONTINUITY REQUIREMENT ===`);
    lines.push(`This shot DIRECTLY follows the previous shot. The opening frame must maintain visual continuity:`);
    lines.push(`- Same characters must appear in consistent outfits and proportions`);
    lines.push(`- Environmental lighting and color temperature should transition smoothly`);
    lines.push(`- Character positions should logically follow from where the previous shot ended`);
    lines.push(``);
  }

  lines.push(`=== ARTISTIC DIRECTION ===`);
  lines.push(`Style: High-end cinematic anime illustration — the quality of a theatrical film key frame`);
  lines.push(`Rendering: Rich color depth, detailed textures (fabric, skin, hair), volumetric atmospheric effects`);
  lines.push(`Lighting: Cinematic three-point lighting with motivated light sources. Use rim lighting for character separation.`);
  lines.push(`Backgrounds: Fully rendered, no blank/abstract backgrounds. Every environment should feel lived-in and detailed.`);
  lines.push(`Characters: On-model with reference descriptions. Expressive faces with clear emotions. Natural, dynamic poses — avoid stiffness.`);
  lines.push(`Composition: Follow cinematographic framing rules. Clear focal point with depth-of-field hierarchy.`);
  lines.push(`This frame represents the STARTING STATE of the shot — characters in their initial positions before the action unfolds.`);

  return lines.join("\n");
}

export function buildLastFramePrompt(params: {
  shotPrompt: string;
  characterDescriptions: string;
  firstFramePath: string;
}): string {
  const lines: string[] = [];

  lines.push(`Create the CLOSING FRAME of this animated shot as a single, stunning illustration.`);
  lines.push(``);
  lines.push(`=== SHOT DESCRIPTION ===`);
  lines.push(params.shotPrompt);
  lines.push(``);
  lines.push(`=== CHARACTER VISUAL REFERENCES ===`);
  lines.push(params.characterDescriptions);
  lines.push(``);
  lines.push(`=== CONTINUITY WITH FIRST FRAME ===`);
  lines.push(`This is the ENDING STATE of the same shot. Between the first frame and this frame, the described action has unfolded:`);
  lines.push(`- Characters have completed their movements and actions described in the shot`);
  lines.push(`- Maintain the SAME environment, lighting setup, and color palette as the first frame`);
  lines.push(`- Character outfits, proportions, and visual features must remain identical`);
  lines.push(`- The camera may have moved per the shot direction, so framing can differ`);
  lines.push(``);
  lines.push(`=== ARTISTIC DIRECTION ===`);
  lines.push(`Style: High-end cinematic anime illustration — the quality of a theatrical film key frame`);
  lines.push(`Rendering: Rich color depth, detailed textures (fabric, skin, hair), volumetric atmospheric effects`);
  lines.push(`Lighting: Maintain the same lighting setup as the first frame. Any changes must be motivated (e.g., character moved to shadow).`);
  lines.push(`Backgrounds: Must match the first frame's environment with appropriate perspective shift if camera moved.`);
  lines.push(`Characters: On-model with reference descriptions. Show the emotional state at the END of the shot's action.`);
  lines.push(`Composition: This frame should feel like the natural conclusion of the shot, ready to cut to the next.`);

  return lines.join("\n");
}
