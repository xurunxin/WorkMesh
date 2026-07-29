export type ComposeRow = Readonly<{
  ID?: string;
  Project?: string;
  Service?: string;
  State?: string;
  Health?: string;
}>;

export const parseComposeRows = (output: string): ComposeRow[] => {
  if (!output) return [];
  try {
    const parsed = JSON.parse(output) as ComposeRow | ComposeRow[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    try {
      return output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ComposeRow);
    } catch {
      throw new Error("RETENTION_ACCEPTANCE_COMPOSE_JSON_INVALID");
    }
  }
};
