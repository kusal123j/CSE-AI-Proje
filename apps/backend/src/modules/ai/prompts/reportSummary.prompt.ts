export const reportSummaryPrompt = `
Create a source-backed research summary of this CSE company document.
Separate factual findings from interpretation.
Do not provide investment advice or buy/sell recommendations.
Include: executive summary, performance points, risks, positives, negatives, and source references.

Document context:
{context}
`;
