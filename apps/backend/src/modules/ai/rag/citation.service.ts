export function formatCitation(input: { documentTitle?: string; pageNumber?: number; sourceUrl?: string }) {
  const parts = [];
  if (input.documentTitle) parts.push(input.documentTitle);
  if (input.pageNumber) parts.push(`page ${input.pageNumber}`);
  if (input.sourceUrl) parts.push(input.sourceUrl);
  return parts.join(' | ');
}
