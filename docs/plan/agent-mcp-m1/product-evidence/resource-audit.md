# M1 资源准备、恢复与收尾

服务准备与 ready、随机端口、镜像、tmpfs、专用数据库/桶在每轮 registry；完整日志和客户端事实在对应 ZIP。正常 finally 的 Docker stop/rm 经检查返回才记录 cleaned=true，但未保存逐条 stdout；中断收尾保存逐命令退出和 stdout。缺少的历史运行退出码不补造。

| 本轮资源 | 原记录 / 中断收尾 | 最终是否存在 |
| --- | --- | --- |
| m1-05e6bbc4f2f2-postgres | [m1-05e6bbc4f2f2-resources.json](m1-05e6bbc4f2f2-resources.json) | False |
| m1-05e6bbc4f2f2-redis | [m1-05e6bbc4f2f2-resources.json](m1-05e6bbc4f2f2-resources.json) | False |
| m1-05e6bbc4f2f2-rustfs | [m1-05e6bbc4f2f2-resources.json](m1-05e6bbc4f2f2-resources.json) | False |
| m1-2651090bce93-postgres | [m1-2651090bce93-resources.json](m1-2651090bce93-resources.json) | False |
| m1-2651090bce93-redis | [m1-2651090bce93-resources.json](m1-2651090bce93-resources.json) | False |
| m1-2651090bce93-rustfs | [m1-2651090bce93-resources.json](m1-2651090bce93-resources.json) | False |
| m1-32f1f4c4ba0f-postgres | [m1-32f1f4c4ba0f-resources.json](m1-32f1f4c4ba0f-resources.json) | False |
| m1-32f1f4c4ba0f-redis | [m1-32f1f4c4ba0f-resources.json](m1-32f1f4c4ba0f-resources.json) | False |
| m1-32f1f4c4ba0f-rustfs | [m1-32f1f4c4ba0f-resources.json](m1-32f1f4c4ba0f-resources.json) | False |
| m1-3dfa2f93ff11-postgres | [m1-3dfa2f93ff11-resources.json](m1-3dfa2f93ff11-resources.json) | False |
| m1-3dfa2f93ff11-redis | [m1-3dfa2f93ff11-resources.json](m1-3dfa2f93ff11-resources.json) | False |
| m1-3dfa2f93ff11-rustfs | [m1-3dfa2f93ff11-resources.json](m1-3dfa2f93ff11-resources.json) | False |
| m1-5d990a5cbf81-postgres | [m1-5d990a5cbf81-resources.json](m1-5d990a5cbf81-resources.json) | False |
| m1-5d990a5cbf81-redis | [m1-5d990a5cbf81-resources.json](m1-5d990a5cbf81-resources.json) | False |
| m1-5d990a5cbf81-rustfs | [m1-5d990a5cbf81-resources.json](m1-5d990a5cbf81-resources.json) | False |
| m1-610952fddbc1-postgres | [m1-610952fddbc1-resources.json](m1-610952fddbc1-resources.json) | False |
| m1-610952fddbc1-redis | [m1-610952fddbc1-resources.json](m1-610952fddbc1-resources.json) | False |
| m1-610952fddbc1-rustfs | [m1-610952fddbc1-resources.json](m1-610952fddbc1-resources.json) | False |
| m1-6e8e6f214790-postgres | [m1-6e8e6f214790-resources.json](m1-6e8e6f214790-resources.json) / [m1-6e8e6f214790-interrupted-cleanup.json](m1-6e8e6f214790-interrupted-cleanup.json) | False |
| m1-6e8e6f214790-redis | [m1-6e8e6f214790-resources.json](m1-6e8e6f214790-resources.json) / [m1-6e8e6f214790-interrupted-cleanup.json](m1-6e8e6f214790-interrupted-cleanup.json) | False |
| m1-6e8e6f214790-rustfs | [m1-6e8e6f214790-resources.json](m1-6e8e6f214790-resources.json) / [m1-6e8e6f214790-interrupted-cleanup.json](m1-6e8e6f214790-interrupted-cleanup.json) | False |
| m1-7ac935c9155c-postgres | [m1-7ac935c9155c-resources.json](m1-7ac935c9155c-resources.json) | False |
| m1-7ac935c9155c-redis | [m1-7ac935c9155c-resources.json](m1-7ac935c9155c-resources.json) | False |
| m1-7ac935c9155c-rustfs | [m1-7ac935c9155c-resources.json](m1-7ac935c9155c-resources.json) | False |
| m1-7e5e7375cc57-postgres | [m1-7e5e7375cc57-resources.json](m1-7e5e7375cc57-resources.json) | False |
| m1-7e5e7375cc57-redis | [m1-7e5e7375cc57-resources.json](m1-7e5e7375cc57-resources.json) | False |
| m1-7e5e7375cc57-rustfs | [m1-7e5e7375cc57-resources.json](m1-7e5e7375cc57-resources.json) | False |
| m1-86a5b73f4cbe-postgres | [m1-86a5b73f4cbe-resources.json](m1-86a5b73f4cbe-resources.json) | False |
| m1-86a5b73f4cbe-redis | [m1-86a5b73f4cbe-resources.json](m1-86a5b73f4cbe-resources.json) | False |
| m1-86a5b73f4cbe-rustfs | [m1-86a5b73f4cbe-resources.json](m1-86a5b73f4cbe-resources.json) | False |
| m1-895b1be30efd-postgres | [m1-895b1be30efd-resources.json](m1-895b1be30efd-resources.json) | False |
| m1-895b1be30efd-redis | [m1-895b1be30efd-resources.json](m1-895b1be30efd-resources.json) | False |
| m1-895b1be30efd-rustfs | [m1-895b1be30efd-resources.json](m1-895b1be30efd-resources.json) | False |
| m1-89d8c4db9e78-postgres | [m1-89d8c4db9e78-resources.json](m1-89d8c4db9e78-resources.json) | False |
| m1-89d8c4db9e78-redis | [m1-89d8c4db9e78-resources.json](m1-89d8c4db9e78-resources.json) | False |
| m1-89d8c4db9e78-rustfs | [m1-89d8c4db9e78-resources.json](m1-89d8c4db9e78-resources.json) | False |
| m1-8f919364cdd8-postgres | [m1-8f919364cdd8-resources.json](m1-8f919364cdd8-resources.json) / [m1-8f919364cdd8-interrupted-cleanup.json](m1-8f919364cdd8-interrupted-cleanup.json) | False |
| m1-8f919364cdd8-redis | [m1-8f919364cdd8-resources.json](m1-8f919364cdd8-resources.json) / [m1-8f919364cdd8-interrupted-cleanup.json](m1-8f919364cdd8-interrupted-cleanup.json) | False |
| m1-8f919364cdd8-rustfs | [m1-8f919364cdd8-resources.json](m1-8f919364cdd8-resources.json) / [m1-8f919364cdd8-interrupted-cleanup.json](m1-8f919364cdd8-interrupted-cleanup.json) | False |
| m1-951a400c74c6-postgres | [m1-951a400c74c6-resources.json](m1-951a400c74c6-resources.json) / [m1-951a400c74c6-interrupted-cleanup.json](m1-951a400c74c6-interrupted-cleanup.json) | False |
| m1-951a400c74c6-redis | [m1-951a400c74c6-resources.json](m1-951a400c74c6-resources.json) / [m1-951a400c74c6-interrupted-cleanup.json](m1-951a400c74c6-interrupted-cleanup.json) | False |
| m1-951a400c74c6-rustfs | [m1-951a400c74c6-resources.json](m1-951a400c74c6-resources.json) / [m1-951a400c74c6-interrupted-cleanup.json](m1-951a400c74c6-interrupted-cleanup.json) | False |
| m1-9ec8e3debf17-postgres | [m1-9ec8e3debf17-resources.json](m1-9ec8e3debf17-resources.json) | False |
| m1-9ec8e3debf17-redis | [m1-9ec8e3debf17-resources.json](m1-9ec8e3debf17-resources.json) | False |
| m1-9ec8e3debf17-rustfs | [m1-9ec8e3debf17-resources.json](m1-9ec8e3debf17-resources.json) | False |
| m1-a609b9b0f88c-postgres | [m1-a609b9b0f88c-resources.json](m1-a609b9b0f88c-resources.json) | False |
| m1-a609b9b0f88c-redis | [m1-a609b9b0f88c-resources.json](m1-a609b9b0f88c-resources.json) | False |
| m1-a609b9b0f88c-rustfs | [m1-a609b9b0f88c-resources.json](m1-a609b9b0f88c-resources.json) | False |
| m1-bb374da076b8-postgres | [m1-bb374da076b8-resources.json](m1-bb374da076b8-resources.json) | False |
| m1-bb374da076b8-redis | [m1-bb374da076b8-resources.json](m1-bb374da076b8-resources.json) | False |
| m1-bb374da076b8-rustfs | [m1-bb374da076b8-resources.json](m1-bb374da076b8-resources.json) | False |
| m1-ce05e55a9e95-postgres | [m1-ce05e55a9e95-resources.json](m1-ce05e55a9e95-resources.json) | False |
| m1-ce05e55a9e95-redis | [m1-ce05e55a9e95-resources.json](m1-ce05e55a9e95-resources.json) | False |
| m1-ce05e55a9e95-rustfs | [m1-ce05e55a9e95-resources.json](m1-ce05e55a9e95-resources.json) | False |
| m1-ceffa526f57a-postgres | [m1-ceffa526f57a-resources.json](m1-ceffa526f57a-resources.json) | False |
| m1-ceffa526f57a-redis | [m1-ceffa526f57a-resources.json](m1-ceffa526f57a-resources.json) | False |
| m1-ceffa526f57a-rustfs | [m1-ceffa526f57a-resources.json](m1-ceffa526f57a-resources.json) | False |
| m1-cfde65a2e9a4-postgres | [m1-cfde65a2e9a4-resources.json](m1-cfde65a2e9a4-resources.json) | False |
| m1-cfde65a2e9a4-redis | [m1-cfde65a2e9a4-resources.json](m1-cfde65a2e9a4-resources.json) | False |
| m1-cfde65a2e9a4-rustfs | [m1-cfde65a2e9a4-resources.json](m1-cfde65a2e9a4-resources.json) | False |
| m1-d31ae441e899-postgres | [m1-d31ae441e899-resources.json](m1-d31ae441e899-resources.json) | False |
| m1-d31ae441e899-redis | [m1-d31ae441e899-resources.json](m1-d31ae441e899-resources.json) | False |
| m1-d31ae441e899-rustfs | [m1-d31ae441e899-resources.json](m1-d31ae441e899-resources.json) | False |
| m1-d574abe7362b-postgres | [m1-d574abe7362b-resources.json](m1-d574abe7362b-resources.json) | False |
| m1-d574abe7362b-redis | [m1-d574abe7362b-resources.json](m1-d574abe7362b-resources.json) | False |
| m1-d574abe7362b-rustfs | [m1-d574abe7362b-resources.json](m1-d574abe7362b-resources.json) | False |
| m1-d9458452756e-postgres | [m1-d9458452756e-resources.json](m1-d9458452756e-resources.json) / [m1-d9458452756e-interrupted-cleanup.json](m1-d9458452756e-interrupted-cleanup.json) | False |
| m1-d9458452756e-redis | [m1-d9458452756e-resources.json](m1-d9458452756e-resources.json) / [m1-d9458452756e-interrupted-cleanup.json](m1-d9458452756e-interrupted-cleanup.json) | False |
| m1-d9458452756e-rustfs | [m1-d9458452756e-resources.json](m1-d9458452756e-resources.json) / [m1-d9458452756e-interrupted-cleanup.json](m1-d9458452756e-interrupted-cleanup.json) | False |
| m1-e3ae74575637-postgres | [m1-e3ae74575637-resources.json](m1-e3ae74575637-resources.json) | False |
| m1-e3ae74575637-redis | [m1-e3ae74575637-resources.json](m1-e3ae74575637-resources.json) | False |
| m1-e3ae74575637-rustfs | [m1-e3ae74575637-resources.json](m1-e3ae74575637-resources.json) | False |
| m1-eb4c5b46a8d1-postgres | [m1-eb4c5b46a8d1-resources.json](m1-eb4c5b46a8d1-resources.json) / [m1-eb4c5b46a8d1-interrupted-cleanup.json](m1-eb4c5b46a8d1-interrupted-cleanup.json) | False |
| m1-eb4c5b46a8d1-redis | [m1-eb4c5b46a8d1-resources.json](m1-eb4c5b46a8d1-resources.json) / [m1-eb4c5b46a8d1-interrupted-cleanup.json](m1-eb4c5b46a8d1-interrupted-cleanup.json) | False |
| m1-eb4c5b46a8d1-rustfs | [m1-eb4c5b46a8d1-resources.json](m1-eb4c5b46a8d1-resources.json) / [m1-eb4c5b46a8d1-interrupted-cleanup.json](m1-eb4c5b46a8d1-interrupted-cleanup.json) | False |

实际 ID、现存进程的 PID 重用核验、共享服务保留列表与逐 ZIP SHA-256/CRC 见 [JSON](resource-audit.json)。没有全局 prune、镜像/store/网络/卷清理；使用预存共享镜像、默认 bridge 和临时 tmpfs。

当前工作树、恢复目录及专用 Node 运行时保留；ignored 的 Runner 原日志已保存于 runner-legacy-logs.zip。scratch created/removed 的准确路径来自真实 Pi 客户端 JSON，正常路径已由断言确认不存在；未证明 idle 的故障路径应保留残留，不推测清理成功。Recovery 测试自身 finally 清理其随机 bundle 临时目录，未逐目录另外记录 Windows 链接/活动引用的独立回执，该证据缺口不补造。
