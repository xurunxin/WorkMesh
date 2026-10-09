# M0 PR212分类bootstrap依赖修正与CI增量交付

## 失败、来源与最小修正

本轮开始HEAD为 `67c924b3d8837d81e6b3314e9c3cec7693f3ff34`，工作树干净；沿同todo/同分支执行，不重写已审方案和产品历史。平台 `git ls-remote origin refs/heads/main` 实读主线仍为 `69085317c88d84b702af727dc0ac7152589626d8`，不是FETCH_HEAD。原反馈全文见 [platform-ci407-feedback-original.md](platform-ci407-feedback-original.md)。旧成果独审已批准；本次增量尚须另一Agent平台CI定向独审。

[CI407](https://github.com/xurunxin/WorkMesh/actions/runs/37912036301) 的PR候选为67c924b，GitHub实际checkout是合成merge `4bb2af1f11c1d892453f0911904a257686fe09be`，不能当成main已合入。changes job113759229826在准确Node22.19.0之后导入缺失的yaml，pass0/fail1/exit1；required job113759395287正确连带拒绝，其余七类检查全部skip，未运行产品验收。与末尾Action Node警告无关。

根因是 `ci-policy.test.mjs` 新的真实YAML接线测试依赖根devDependency；changes刻意在全仓安装前运行，已安装本机掩盖了依赖缺失。本轮仅补齐既定执行条件：

- `.github/workflows/ci.yml` 的现有验证step在policy测试之前运行 `npm ci --prefix scripts/ci-bootstrap --ignore-scripts --no-audit --no-fund`，沿原pipefail与tee保存 `ci-bootstrap.log`，原always上传保持。
- `scripts/ci-bootstrap/package.json`、`package-lock.json` 独立锁定唯一依赖yaml2.9.0，与当前pnpm锁内根yaml完全一致，含registry地址与SHA512 integrity；该小包不属于apps/packages workspace，无生命周期脚本。根package.json/pnpm锁不变。
- `scripts/ci-bootstrap/yaml.mjs` 用Node `createRequire`从该包位置加载真实yaml parser；早期CI解析独立安装，本机全仓安装仍可从父目录解析。测试与完整validator共用同一parser，继续精确解析mapping、boolean、alias和多行run；不以文本猜测代替YAML语义。
- `scripts/ci-policy.mjs` 仅增加纯bootstrap接线验证函数；原classify/aggregate/checkIds和所有scope决定不变。`ci-policy.test.mjs` 保留原14项，再加bootstrap及YAML语义两项，并扩充真实suite/root/pipefail入口负例。`validate-ci.mjs` 复用同一bootstrap校验，并核pnpm当前yaml版本。
- `scripts/m0-ci-bootstrap-check.py` 是本轮Windows精确Node的干净夹具回归入口，不进入业务产品，也不新增CI job。它记录准备、每次实际输出/退出/runtime、源码ZIP和失败路径finally清理。

API/SDK/MCP/Runner、角色权限、ADR、领域恢复入口和真实conformance产品代码均不变；没有迁移或新事件。现有Required `api-integration` 的服务准备、真实MCP/Pi执行、非空套件、失败传播及always证据上传保持。没有continue-on-error、强制skip或聚合放宽。

## 无预装依赖的真实回归与性能边界

执行 `python -X utf8 scripts/m0-ci-bootstrap-check.py`：在系统Temp下创建独有目录，清除NODE_PATH，仅复制必要配置/脚本及18个workspace manifest；无根node_modules，也没有业务源文件或预装yaml。通过portable Node22.19.0和其npm10.9.3执行11条命令，命令全文、真实runtime、退出码、输入与日志SHA见 [干净夹具回执](product-evidence/ci407-clean-receipt.json)。

| 场景 | 实际判定 |
| --- | --- |
| 旧67测试、无依赖 | exit1，真实ERR_MODULE_NOT_FOUND，保留原首败 |
| 新测试、未bootstrap | exit1，找不到yaml，证明不会借本机根node_modules假绿 |
| 锁定小包npm ci | exit0，仅added 1 package；夹具根node_modules仍不存在 |
| 安装后policy | 16/16通过，0skip，原14项语义保留 |
| 干净夹具完整CI validator | exit0，9个job/37个固定Action引用 |
| 删除bootstrap安装步骤 | validator及policy都exit1 |
| 删除Required API真实conformance执行命令 | validator及policy都exit1 |
| 恢复配置后policy | 16/16再次通过 |

新测试另外覆盖10个bootstrap变异（跳过/continue-on-error/pipefail、Node/分类顺序、上传缺失、浮动版本、缺integrity、额外依赖）及原有分类/聚合失败与取消/误skip。真实suite接线变异包含根入口/环境与DB reset缺失、包入口错误、空include、passWithNoTests、pipefail、continue-on-error及always上传缺失。YAML正对照含flow mapping、alias、多行literal内的井号和冒号，重复key必须抛错。

分类阶段新增成本仅一个yaml tarball与npm ci，不启动pnpm/Corepack、workspace构建、数据库、浏览器或服务。实际干净项目安装1.051214秒（复用本机npm缓存，不声称冷网络性能）；本机无夹具的首次小包安装工具runtime1.660681秒。不是全仓安装，不增加新的分类后产品job；docs分类仍跳过全部安装/服务/产品测试job，但早期安全验证现在安装这个单包。网络或integrity失败会令changes失败并always上传，RequiredCI如原规则拒绝。

## 检查、历史与字节绑定

本机最终 `node --test scripts/ci-policy.test.mjs` 16/16、exit0、0.474770秒；`pnpm ci:validate` exit0、2.672026秒，包含CI/Release/Lite配置校验、15项原始证据测试及280条/61成员完整性核验。实际输入ZIP和输出见 `product-evidence/ci407-policy-final*`、`ci407-ci-final*`。PR真实merge-base至暂存候选的全diffcheck和本轮增量diffcheck单独记录，不以只查工作树代替。

一次开发期 `npm install --prefix ... --package-lock-only` 从根目录执行意外加入 `workmesh: file:../..`；本轮新policy和validator均退出1，分别保全 `ci407-policy*`、`ci407-validator*` 的原输入ZIP与日志。已删除该根包引用，`npm ci`实测仅安装yaml。没有把这些首败覆盖成通过；修正后另用-final名称。干净夹具恢复前两次入口删除也保留真实失败输出，期望非零是负例通过，未冒作产品成功。

首败工具返回完整payload在 `ci407-tool-*.json`。以下原服务端artifact的名称、ID、URL和工具所见上传SHA保持原义，未下载到本机，不伪填本地原件：

- [changes-raw-37912036301-1](https://github.com/xurunxin/WorkMesh/actions/runs/37912036301/artifacts/11607436370)，ID11607436370，720字节，上传声明SHA256 `502de8f5ceebf97d97bab45a92a27e9ef1143d29d2bfa6bc6cc25c6dd45601f1`。
- [required-ci-raw-37912036301-1](https://github.com/xurunxin/WorkMesh/actions/runs/37912036301/artifacts/11607132504)，ID11607132504，485字节，上传声明SHA256 `f028a283ade3e45a8bd99501c14590ce44d960a2632b1d4d680f0dc10d908c35`。平台即使指定jobId仍返回日志tail，未取得完整job开头；本地回执明确这一访问缺口，不声称有完整job原件。

旧 `review3-source-manifest.json`、96文件源码ZIP、旧CI及归档索引全部保持。新增 `ci407-source-binding.json` 与 `ci407-source.zip` 保存本轮工作树/Git暂存/旧67blob及准确换行映射，并比较产品源码不变；日志先保留无损 `ci407-raw-outputs.zip` 再规范可读副本，不放宽whitespace属性或改旧索引。input ZIP为各命令实际启动字节，后加报告仅是回执说明，不冒作受测产品源码。

## 准备、恢复、清理与交付门禁

唯一干净夹具 `C:\Users\xurx\AppData\Local\Temp\workmesh-m0-ci407-96yyo7lf`：所有同步子进程结束后核真实绝对路径/Temp父目录/本轮前缀/no links，再用PowerShell `Remove-Item -LiteralPath`清理；exit0、实读不存在。未创建容器、镜像、卷、网络、数据库或外部模型请求。首次工作树独立安装目录 `scripts/ci-bootstrap/node_modules` 的闲置清理由单独资源回执记录。共享npm缓存/旧工作区/运行恢复目录保留；G1/D0/C3已拒目标完全未触碰。

本轮提交精确head由平台提交回执给出，不预填自身SHA。停review供另一Agent定向复审CI增量；之后仍须PR212最新候选RequiredCI全成功，才能标准合入。旧产品本机检查与67独审仅是历史产品证据，不能代新PR CI；未merge、未宣告M0已done/main。
