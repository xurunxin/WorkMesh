# 保留的失败证据

此前零颜色阈值重启重放的实际结果为 12 通过、1 失败、1 未执行（因 `--max-failures=1` 提前停止）。移动端工作项详情比较失败，原始 PNG 没有被处理或作为替代基线。

```text
Error: expect(page).toHaveScreenshot(expected) failed
  1 pixels (ratio 0.01 of all image pixels) are different.
  Snapshot: issue-detail.png

1 failed
  [mobile-390x844] D0 亮色视觉基线 › 工作项详情：覆盖、两次采集一致、D1 可直接比对
1 did not run
12 passed (1.2m)
```

对 [改动前 expected](../win32/mobile-390x844/issue-detail.png) 和 [当次 actual](strict-mobile-issue-detail-actual.png) 解码比较，13 个原始像素不同，坐标在右侧圆角边缘，RGB 每通道差值绝对值最大为 1；Playwright 排除抗锯齿后计数为 1。完整指标见 [strict-pixel-difference.json](strict-pixel-difference.json)。

当前配置记录 `threshold=0.005`、`maxDiffPixels=0`，但独立上下文的两次 PNG 仍必须 SHA-256 完全相同。最终服务重启重放 14 项通过，两轮 56 次采集均与对应基线哈希相同；本文件保留历史失败而不将它改写成通过。

![零颜色阈值重放 diff](strict-mobile-issue-detail-diff.png)
