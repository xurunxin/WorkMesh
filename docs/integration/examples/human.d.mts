export function runHuman(input: { origin: string; email: string; password: string }): Promise<{
  actorId: string;
  teamIds: string[];
  logout: boolean;
}>;
