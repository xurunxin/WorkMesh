import { z } from 'zod'

export const configurationReadinessQuerySchema = z.object({
  teamId: z.string().uuid(),
  workKind: z.enum(['repository', 'non_repository']),
  projectId: z.string().uuid().optional(),
  workItemId: z.string().uuid().optional(),
}).strict()

export const configurationReadinessStateSchema = z.enum(['ready', 'blocked', 'unknown'])

const applicableCheck = z.discriminatedUnion('state', [
  z.object({ applicability: z.literal('applicable'), state: z.literal('ready'), reasonCode: z.literal('configured') }).strict(),
  z.object({ applicability: z.literal('applicable'), state: z.literal('blocked'), reasonCode: z.literal('unmet') }).strict(),
  z.object({ applicability: z.literal('applicable'), state: z.literal('unknown'), reasonCode: z.literal('not_observable') }).strict(),
])

// 适用性与就绪状态分开；未知 Runner 不能被解释为缺少配置或运行许可。
export const configurationReadinessResponseSchema = z.object({
  checks: z.object({
    model: applicableCheck,
    agent: applicableCheck,
    repository: z.union([applicableCheck, z.object({
      applicability: z.literal('not_applicable'), state: z.null(), reasonCode: z.literal('non_repository_work'),
    }).strict()]),
    runner: z.object({
      applicability: z.literal('applicable'), state: z.literal('unknown'), reasonCode: z.literal('not_observable'),
    }).strict(),
  }).strict(),
}).strict()

export type ConfigurationReadinessQuery = z.infer<typeof configurationReadinessQuerySchema>
export type ConfigurationReadinessResponse = z.infer<typeof configurationReadinessResponseSchema>
