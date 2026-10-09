// 仅文档生成入口；旧生成器完整字节保存在history/previous-1bcf.zip。
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const directory = dirname(fileURLToPath(import.meta.url))
execFileSync('python', ['-X', 'utf8', '-B', resolve(directory, 'audit-generate.py')], { cwd: resolve(directory, '../../..'), stdio: 'inherit', windowsHide: true })
