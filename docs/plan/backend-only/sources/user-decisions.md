Q: 现有 Web Push 已有独立 REST 合同：/api/v1/browser-push/config、订阅注册／撤销，以及 worker 投递。退役自带 WebUI 后，这组服务端能力如何处理？
A: 保留服务端合同（推荐）

Q: 企业微信通知及 Web Push 当前携带 /?view=inbox… 的 WebUI 深链接。移除页面后，新通知应使用哪种定位方式？
A: 改为鉴权 API 链接（推荐）
