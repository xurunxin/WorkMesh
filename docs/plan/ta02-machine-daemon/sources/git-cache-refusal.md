# 平台 Git 原调用与实际拒绝

读取日期：2026-10-21。以下 JSON 行数组按 LF 拼接，可还原实际工具字符串。正文未 trim；截断与选段边界按标题保留。此页是来源，不是新授权或产品验收。

```json
[
  "{",
  "  \"arguments\": {",
  "    \"projectId\": \"DzkLDn6UW-IbfoTJzN9Ro\",",
  "    \"args\": [",
  "      \"ls-remote\",",
  "      \"origin\",",
  "      \"refs/heads/main\"",
  "    ]",
  "  },",
  "  \"result\": {",
  "    \"content\": [",
  "      {",
  "        \"type\": \"text\",",
  "        \"text\": \"git reset failed (exit 128): fatal: Unable to create 'I:/tds_workspace/workspaces/DzkLDn6UW-IbfoTJzN9Ro/repo/.git/index.lock': File exists.\\n\\nAnother git process seems to be running in this repository, e.g.\\nan editor opened by 'git commit'. Please make sure all processes\\nare terminated then try again. If it still fails, a git process\\nmay have crashed in this repository earlier:\\nremove the file manually to continue.\"",
  "      }",
  "    ]",
  "  }",
  "}"
]
```
