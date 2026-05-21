export interface ParsedMemory {
	/** Content under the "## User Profile" section. */
	userProfile: string;
	/** Content under the "## Key Facts" section. */
	keyFacts: string;
	/** Content under the "## Ongoing Context" section. */
	ongoingContext: string;
	/** Content between MANUAL:START and MANUAL:END markers. */
	manualNotes: string;
	/** The full raw markdown input, preserved for round-tripping. */
	raw: string;
}

/**
 * Parse a Signet memory markdown file into structured sections.
 *
 * Extracts content from well-known `## ` headings and the
 * `<!-- MANUAL:START -->` / `<!-- MANUAL:END -->` block. Any content
 * outside recognized sections is ignored — the `raw` field always
 * contains the original markdown for lossless round-tripping.
 */
export function parseMemory(markdown: string): ParsedMemory {
	const sections: Record<string, string> = {};
	let currentSection: string | null = null;
	const sectionLines: string[] = [];

	const lines = markdown.split("\n");
	for (const line of lines) {
		const headingMatch = line.match(/^##\s+(.+)/);
		if (headingMatch) {
			// Flush previous section
			if (currentSection !== null) {
				sections[currentSection] = sectionLines.join("\n").trim();
			}
			currentSection = headingMatch[1].trim();
			sectionLines.length = 0;
		} else if (currentSection !== null) {
			sectionLines.push(line);
		}
	}
	// Flush last section
	if (currentSection !== null) {
		sections[currentSection] = sectionLines.join("\n").trim();
	}

	// Extract manual notes block
	const manualMatch = markdown.match(
		/<!--\s*MANUAL:START\s*-->([\s\S]*?)<!--\s*MANUAL:END\s*-->/,
	);
	const manualNotes = manualMatch ? manualMatch[1].trim() : "";

	return {
		userProfile: sections["User Profile"] ?? "",
		keyFacts: sections["Key Facts"] ?? "",
		ongoingContext: sections["Ongoing Context"] ?? "",
		manualNotes,
		raw: markdown,
	};
}

export function generateMemory(): string {
	return `# Memory

## User Profile

*No user profile configured yet.*

## Key Facts

*No facts stored yet.*

## Ongoing Context

*No ongoing context.*

<!-- MANUAL:START -->
<!-- Add your own notes here - they will be preserved -->
<!-- MANUAL:END -->
`;
}
