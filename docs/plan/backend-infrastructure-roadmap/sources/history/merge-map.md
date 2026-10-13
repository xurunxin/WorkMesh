# 逐卡合入定位复核

实际执行 git diff --no-renames <merge>^1 <merge> --name-only -z，核该卡产品/方案路径在合并差异中出现。
最初按相邻 PR 号拟列映射时，实际匹配拒绝多行；已按真实差异纠正，未把临时索引当来源。
准确主线与各原 report 的受测源分开；路径差异不代实际验收。

| 卡 | GitHub PR | 合并提交／第二 parent | 实际匹配路径数／样例 |
| --- | --- | --- | --- |
| #5 | [PR #221](https://github.com/xurunxin/WorkMesh/pull/221) | `f2591a3bebeca9640b0d828ac3ad07fb5daf8e3c`<br>`043e9600e65bb7f98b662c24dc342a299b5b3e42` | 1<br>`docs/plan/connector-recovery.md` |
| #9 | [PR #211](https://github.com/xurunxin/WorkMesh/pull/211) | `69085317c88d84b702af727dc0ac7152589626d8`<br>`328434d00268ce39222d677686dde3c64aba4e41` | 1<br>`docs/plan/a2-configuration-readiness.md` |
| #16 | [PR #210](https://github.com/xurunxin/WorkMesh/pull/210) | `add4340e9c52575c2fd9615b3b114ac9acd3e30e`<br>`d80f29ff9b87c387326cfda45eafdcfe6b182eee` | 29<br>`docs/plan/c2-wecom/.gitattributes` |
| #54 | [PR #212](https://github.com/xurunxin/WorkMesh/pull/212) | `e49eda142d61bdd248ddc42ec16f5563abd4bbc6`<br>`883d279d3b5978680672a6c1d7364d421d0afd10` | 460<br>`docs/plan/agent-mcp-m0/README.md` |
| #55 | [PR #213](https://github.com/xurunxin/WorkMesh/pull/213) | `cfce77546b64c2a8d7d12949261c38e2f666d5ae`<br>`3ff46eb20616dc5488ba46b77b27e1fb2d783a93` | 522<br>`docs/plan/agent-mcp-m1/README.md` |
| #56 | [PR #214](https://github.com/xurunxin/WorkMesh/pull/214) | `ef4cb5e1458d911d98433c443dba46e6c224caa0`<br>`fb770b62a926e7c27049c2795eafa6da4e0cb085` | 625<br>`docs/plan/agent-mcp-m2/README.md` |
| #57 | [PR #215](https://github.com/xurunxin/WorkMesh/pull/215) | `87f88b89297c5c1e346f7ef99118c410f4b4a905`<br>`d27cb9be3a19befeae431df08276c9ca94d7dbed` | 669<br>`docs/plan/agent-mcp-m3/.gitattributes` |
| #58 | [PR #218](https://github.com/xurunxin/WorkMesh/pull/218) | `c2b3d363c037157df13beb82799d99d07a9b7db8`<br>`4f435c8268500b8b0a7966362bcb156801a484bc` | 128<br>`docs/plan/agent-mcp-m5/.gitignore` |
| #59 | [PR #219](https://github.com/xurunxin/WorkMesh/pull/219) | `6a06ce338f90bf16ce27e3cca1a76771eba42e6e`<br>`f0ac551734ff56d9749d6e82a550c4321f6b9a29` | 2767<br>`docs/plan/agent-mcp-m4/README.md` |
| #61 | [PR #222](https://github.com/xurunxin/WorkMesh/pull/222) | `9dcc8c4c469997626ebb62fc12b8f8e7c1551dc0`<br>`faf29b510363cfbc74b03d5491549a5429380564` | 54<br>`docs/plan/backend-only.md` |
| #62 | [PR #223](https://github.com/xurunxin/WorkMesh/pull/223) | `abf6813a439feab4b17b0602cc9295216634586e`<br>`b36c1ca176f6f2791a6005e72d774bdae9be61a7` | 8<br>`docs/integration/README.md` |
| #7 | [PR #224](https://github.com/xurunxin/WorkMesh/pull/224) | `f6faf54f80850ecee9118d87401e6b5ce73216f1`<br>`d41b3cb0cf8243b14728feef23fbd9300402fb23` | 2<br>`docs/plan/b3-connection-error-recovery-active.md` |
| #20 | [PR #225](https://github.com/xurunxin/WorkMesh/pull/225) | `104f7afb8e89859549aa16af7a3114e90dea7f9b`<br>`fff06af6ccb99c24a62035f418e850914f37a712` | 7<br>`docs/plan/b-ship/acceptance.md` |
