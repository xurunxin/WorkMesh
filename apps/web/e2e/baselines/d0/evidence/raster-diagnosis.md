# 详情原始帧诊断与复现

本诊断属于 D0 采集夹具，不改产品或 token。完整对照、原始 PNG 哈希及路径、布局与计算样式、旧新基线每个差异像素见 [raster-diagnosis.json](raster-diagnosis.json)。诊断只验证原始帧，不执行基线比较；通过不能代替正式 D0 验收。

原条件原始帧诊断为 8 通过、2 失败；仅加 `--disable-partial-raster` 后，两个独立启动轮各 10 通过，40 次原始 PNG 在各视口内哈希相同。显式去掉该参数的恢复原条件轮为 6 通过、4 失败。后面三轮两次上下文的布局、计算样式、焦点及动画状态完全相同，完整状态文件为本目录的 `raster-state-{partial,full}-{390,1440}.json`，各重复的状态哈希分别记录。

差异对应手机 `.wm-tab-select` 的右侧圆角，以及详情面板圆角边缘。选择框 bounds 为 `x=12,y=209.359375,width=366,height=44`；计算 border-radius 为 `7px`、border-color 为 `rgb(201,201,195)`。桌面执行头 bounds 为 `x=130,y=172.5625,width=1180,height=102.59375`、border-radius `18px`。采集对照没有改变这些布局或计算值。

[Chromium 参数定义](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/common/switches.cc)说明该开关禁用 renderer 部分栅格及持久 GPU buffer 条件。用途说明与本地 A/B 因果判断分开：实测支持把不稳定定位至部分栅格复用条件下的边缘渲染差异，尚未定位 Chromium 内部具体函数，也不声称上游 main 与所用浏览器源码版本相同。

正式 D0 仅在专用 launchOptions 增加该参数。比较参数仍为 `threshold=0.005,maxDiffPixels=0`；原始 PNG 对始终要求严格 SHA-256 一致，没有图像处理、产品遮罩、样式或 token 修改。

固定条件下旧基线实际比较为 12 通过、2 详情失败。旧 PNG 全部保留在 `../failures/pre-stabilization/`，旧清单为 [pre-stabilization-manifest.json](pre-stabilization-manifest.json)。仅四张因栅格条件改变的基线重新采集：桌面详情 134 像素/最大通道差 2、手机详情 65/2、桌面项目 36/1、桌面设置 44/2；另外十张字节不变。此变化不是用户产品视觉批准，正式全量验证见 [stabilized-verification.json](stabilized-verification.json)。

从仓库根目录执行以下命令；须保持记录的 Windows、字体和 Chromium。两个运行必须顺序进行，等待前一进程退出后再启动后一轮。生成器在 `.tmp` 写出诊断用例与配置，显式过滤掉继承配置的部分栅格参数，再从环境选择对照条件。当前生成器会在原始哈希断言前留下 `*-captures.json`，失败时也可复核。

```powershell
node apps/web/e2e/baselines/d0/evidence/diagnose-raster.mjs
$env:WORKMESH_PLAYWRIGHT_RUN_DIR = Join-Path (Get-Location) '.tmp/d0-diagnostic-control'
$env:D0_EXTRA_LAUNCH_ARGS = ''
pnpm exec playwright test --config .tmp/d0-diagnostic.config.ts --repeat-each=5

$env:WORKMESH_PLAYWRIGHT_RUN_DIR = Join-Path (Get-Location) '.tmp/d0-diagnostic-fixed'
$env:D0_EXTRA_LAUNCH_ARGS = '--disable-partial-raster'
pnpm exec playwright test --config .tmp/d0-diagnostic.config.ts --repeat-each=5
```

原诊断脚本在当前哈希证据增强前生成，成功记录及失败输出均已核对原始附件。当前脚本保留同一采集流程并增加失败哈希文件；生成器若检测到 D0 截图结构变化会报错，不会静默改变验收边界。

另有两类无效尝试保留而不参与因果判断：进行中修改继承配置的控制轮已立即中止，并以显式排除参数的完整控制轮替代；正式全量验证曾因前一服务未退出而端口冲突，未执行用例，后续等待退出后顺序执行。它们都不是通过证据。
