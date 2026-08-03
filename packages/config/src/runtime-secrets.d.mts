export const runtimeSecretEnvironmentNames: readonly string[];

export function decodeCanonicalBase64Url(value: string): Buffer | undefined;

export function isRepeatedSecretMaterial(value: Buffer): boolean;

export function secretMaterialCandidates(value: string | undefined): Buffer[];

export function runtimeSecretValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined;

export function assertRuntimeSecretSeparation(
  environment: NodeJS.ProcessEnv,
  comparisonEnvironment?: NodeJS.ProcessEnv,
): void;

export function validateRuntimeEnvironment(
  environment: NodeJS.ProcessEnv,
  comparisonEnvironment?: NodeJS.ProcessEnv,
): void;
