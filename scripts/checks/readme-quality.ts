export function checkNoEmDash(text: string): boolean {
  return !text.includes("\u2014");
}

export function checkImagesHaveAlt(markdown: string): string[] {
  const bad: string[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const alt = m[1].trim();
    if (alt.length < 8 || alt.toLowerCase() === "image" || alt.toLowerCase() === "logo") {
      bad.push(m[0]);
    }
  }
  return bad;
}
