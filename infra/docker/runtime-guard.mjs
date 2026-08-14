import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
const runtimeSecrets = await import('./runtime-secrets.mjs').catch((error) => {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
  return import('../../packages/config/src/runtime-secrets.mjs')
})
const { validateRuntimeEnvironment } = runtimeSecrets

const importAuthoritativeConfig = () =>
  import('@workmesh/config').catch((error) => {
    if (
      error?.code !== 'ERR_MODULE_NOT_FOUND' ||
      !String(error.message).includes("Cannot find package '@workmesh/config'")
    )
      throw error
    return import('../../packages/config/src/index.ts')
  })

export const validateAuthoritativeRuntimeEnvironment = async (environment) => {
  validateRuntimeEnvironment(environment)
  const service = environment.WORKMESH_SERVICE
  if (service !== 'api' && service !== 'worker') return
  const config = await importAuthoritativeConfig()
  if (service === 'api') {
    config.loadConfig(environment)
    config.loadFeatureConfig(environment)
    return
  }
  config.loadFeatureConfig(environment)
  config.loadRealtimeRedisHintConfig(environment)
  config.loadRetentionConfig(environment)
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) await validateAuthoritativeRuntimeEnvironment(process.env)
