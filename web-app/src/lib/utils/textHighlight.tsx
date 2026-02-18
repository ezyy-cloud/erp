import React from 'react';

/**
 * Highlights matching text in a string
 * @param text - The text to search in
 * @param searchQuery - The search term to highlight
 * @returns React element with highlighted matches
 */
export function highlightText(text: string | null | undefined, searchQuery: string | null | undefined): React.ReactNode {
  if (!text || !searchQuery || searchQuery.trim().length === 0) {
    return text ?? '';
  }

  const searchTerm = searchQuery.trim();
  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) => {
        if (regex.test(part)) {
          // Reset regex lastIndex for next test
          regex.lastIndex = 0;
          return (
            <mark key={index} className="bg-muted font-semibold">
              {part}
            </mark>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
