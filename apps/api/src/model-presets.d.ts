import type { FastifyInstance } from 'fastify';
import { type ModelPresetCatalog } from '@workmesh/contracts';
export declare function loadModelPresets(enabled: boolean, file?: string, read?: (path: string) => string): ModelPresetCatalog | null;
export declare function registerModelPresetRoutes(app: FastifyInstance, catalog: ModelPresetCatalog | null): void;
