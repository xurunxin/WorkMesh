# 运行证据索引

原始日志、回执和采样各自可逆保存。原文件 SHA-256 按原字节计算，编码文件哈希另列。

| 原件 | 原文件 SHA-256 | 归档文件 SHA-256 |
| --- | --- | --- |
| [build-receipt.json](evidence-build-receipt-json.md) | `ef8780dfcd43e35b63ecd8934e44111523e206322c517b3dd64f996d1a25984b` | `16dac3e33a3a3d26842326d3f2b7517396a08a9620f4aec6b0d73993dbcf63e8` |
| [build.log](evidence-build-log.md) | `534c95d31f30a59fa29e08ca61e98a0a4a7a0eb6c0949a277e2c009848bd3c95` | `e8cf835b9f212a517f64a1c7daf17f5c7f442c1b0aaadd3d0a7403fff5337d50` |
| [build-receipt-environment-recheck.json](evidence-build-receipt-environment-recheck-json.md) | `f49e52ce5b48fb5bfd3f0bd87cf6a7d211d148ab1675ce673cab3e763ab9d72d` | `56e646f32d78a06d009157b23a4b279923c331e52eca3232d8764f2df83a93f3` |
| [build-environment-recheck.log](evidence-build-environment-recheck-log.md) | `d55177db6d142619144f0547012145dce9f967475656e5837b1c5d5de9b28ad1` | `90e4739962a6ef3f9bf40998429a5f174fea5acf4d138b1951fa162dfe5720ce` |
| [measurement.json](evidence-measurement-json.md) | `77601bcea23bfb3c45e6d11f4a43884154245fcf0d5a37d0c58b22528446503f` | `1d795bb78811fe6e650893eede177b0f19dda7d91c44824bfd4131b74f9d12f0` |
| [samples.json](evidence-samples-json.md) | `3546f7416f731a4cbbdfd54026665c4418675708fe8c3cd16049be73065b7319` | `21f56b0d380f76e2e79ca2d0c55a5e57379613deadbca482e3e41e05c9b46f44` |
| [startup.log](evidence-startup-log.md) | `c992706068ecd6e8368dd908b9e187ea48460d466f911c2c12ee4121284f7e09` | `be8e3dc8e65b9b3c66a171517100eb4c82d1a5be8c09248744e38068ee56a26a` |
| [measurement-fixture-recheck.json](evidence-measurement-fixture-recheck-json.md) | `8c025406d06ed77b05421bb9685aa74f35d407ace1528091658f3ad4094f46e0` | `b8e4c03ed9c63383228b6925aed74d4d3b54e2ee5580c9c717686e259769987a` |
| [samples-fixture-recheck.json](evidence-samples-fixture-recheck-json.md) | `9e7381fc9a83d254217271ac71da89a9f4455b31d7466d555970fa2662e9c0ec` | `58aa3864dee84d6dcffa28eaac7e59f358928891b91d903543d1b32610bb6f5f` |
| [startup-fixture-recheck.log](evidence-startup-fixture-recheck-log.md) | `27b2e826d574d48996067b3d1e93d03cbdd62d7a8c2d06f6e71fd711e136045d` | `89b3f5af775427c51837f19307560ca82cdc6b9871a8bd17f364c26460643d1e` |
| [integration-docs.log](evidence-integration-docs-log.md) | `212fa872ce1005ebb0b23b85572ea77fab6e01c7c95d55293c1180b8c5aa3127` | `86c9edf7e73fe61a65becad0abd35df09ad9e523e0e651e078dcc2e6b0b17d0f` |
| [ci-policy.log](evidence-ci-policy-log.md) | `42af5584bb07d13128f727272c96946beb5bf5d6a4702767236b48bc10860974` | `ef956297aa7a147108f875a4540b46ad941656bc5541be2c46c7e5005859e00e` |

复现脚本见 [measurement-tools.md](measurement-tools.md)。工具文件哈希对应实际复核轮；首败日志和原命令保留，不伪造首败脚本哈希。
