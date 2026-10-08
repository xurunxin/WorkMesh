import { launchClient } from '../src/client-process.js'
import { finishClientProcess } from '../src/cli.js'
// 单元夹具不触碰系统秘密存储；环境注入/真实配置另由平台 CLI 套件覆盖。
const code = await launchClient(process.execPath, ['-e', process.argv[2]!], 'wmi_' + 'z'.repeat(43))
await finishClientProcess(code)
