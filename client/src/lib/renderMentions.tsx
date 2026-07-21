import type { ReactNode } from 'react';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Render a chat/comment body, bolding + coloring any "@username" token that
 * matches a real lobby member (same matching rules as extractMentionedUsernames:
 * case-insensitive, word-boundary so "@Kevin" doesn't match "Kevin2").
 */
export function renderMentionText(body: string, usernames: string[]): ReactNode {
  if (usernames.length === 0) return body;
  const pattern = [...usernames]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  const re = new RegExp(`@(${pattern})(?![\\w])`, 'gi');
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <strong key={key++} className="mention">
        @{m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}
