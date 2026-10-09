import { createRequire } from 'node:module'

// 早期分类使用独立锁文件；完成全仓安装的检查也可解析父目录的同一 parser。
const parser = createRequire(new URL('./package.json', import.meta.url))('yaml')
export const { parse, parseDocument } = parser
