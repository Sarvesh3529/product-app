export function augmentPrompt(userPrompt) {
  const modifiers = [
    "highly detailed",
    "orthographic multi-view",
    "front, side, and back perspective",
    "complex organic topology",
    "3D printable manifold contours",
    "sharp industrial design",
    "isolated white background"
  ];
  return `${userPrompt}, ${modifiers.join(", ")}`;
}
