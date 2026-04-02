const MD_ESCAPE_CHARS = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdown(text: string): string {
  return text.replace(MD_ESCAPE_CHARS, "\\$&");
}

export function truncate(text: string, max = 3000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n... (truncated)";
}

export function codeBlock(text: string, lang = ""): string {
  const escaped = text.replace(/```/g, "\\`\\`\\`");
  return `\`\`\`${lang}\n${escaped}\n\`\`\``;
}
