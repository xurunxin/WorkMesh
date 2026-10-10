import { readFileSync } from 'node:fs';
import { modelPresetCatalogSchema } from '@workmesh/contracts';
import builtin from './data/model-presets.json' with { type: 'json' };
export function loadModelPresets(enabled, file, read = path => readFileSync(path, 'utf8')) {
    if (!enabled)
        return null;
    // 部署文件是完整目录；读取与校验失败必须阻止启动，不降级回内置目录。
    const catalog = modelPresetCatalogSchema.parse(file ? JSON.parse(read(file)) : builtin);
    if (catalog.disabledIds.some(id => !catalog.entries.some(entry => entry.id === id)))
        throw new Error('禁用 ID 必须存在于部署目录');
    const disabled = new Set(catalog.disabledIds);
    const entries = catalog.entries.filter(entry => !disabled.has(entry.id));
    for (const entry of entries)
        Object.freeze(entry);
    Object.freeze(entries);
    Object.freeze(catalog.disabledIds);
    return Object.freeze({ ...catalog, entries });
}
export function registerModelPresetRoutes(app, catalog) {
    // FEATURE_DISABLED 由服务器统一功能门禁处理；请求不访问文件、不合并或写回目录。
    app.get('/api/v1/workbench/model-presets', async () => catalog);
}
