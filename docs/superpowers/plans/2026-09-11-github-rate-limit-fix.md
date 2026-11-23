# GitHub 版本读取限流修复

用户截图确认 `https://api.github.com/repos/Macrohard0001/lx-ikun-music-sources/branches/main` 返回 HTTP 403，GitHub 配额恢复时间为 2026/9/11 16:09:26。此前的 raw、CDN、blob API 备用下载只覆盖脚本阶段，无法解决版本或目录 API 先行失败。

## 行为与校验

REST API 的版本或目录请求发生限流、403/404、暂时性 HTTP 错误、网络错误或超时后，自动尝试 GitHub 官方 Git Smart HTTP 服务。此服务不依赖 REST API 配额，也不需要用户配置 Token。正常 REST 路径继续使用原来的大小和 blob SHA 校验。

备用流程通过 `info/refs?service=git-upload-pack` 读取 main 的提交，以浅层 `blob:none` 请求取得该提交和树，再仅请求最新版本目录里的脚本 blob。若版本 API 已成功而目录 API 失败，继续使用已解析的提交，不重新追随 main。实测当前目录元数据约 23 KB，23 个脚本原始字节总计 921,806；不下载历史版本或仓库里的 APK。

Git pack 校验尾部 SHA-1，解包后计算对象 SHA-1，通过提交 → 根目录 → 最新版本目录 → 脚本的引用链验证归属。支持完整对象、引用 delta 和偏移 delta；不请求依赖外部基对象的 thin pack。限制压缩响应、对象数、单对象和累计展开大小、delta 深度和目录深度。脚本批次继续沿用 200 个文件、单文件 9 MB、总计 50 MB 的限制。协议、目录截断或大小校验错误不会被备用路线绕过。

备用取得的脚本仅在本次客户端实例中随快照暂存，随后继续走原有 UTF-8、脚本头和目录原子提交逻辑。没有持久化旧快照并把它冒充最新。全部路线失败时保留两条路线的错误和旧音源目录。

Android 验证发现 Buffer 的 `subarray` 可能返回普通 `Uint8Array`，其 `toString('hex')` 会得到逗号分隔的数字而非十六进制，造成错误的 checksum 拒绝。已显式创建 Buffer 视图进行整数与文本读取，字节哈希统一用 `bytesToHex`；新增普通字节数组切片的完整导入与 delta 回归测试。

## 自动化与真实网络

- 86 项逻辑测试通过，包括首次导入 REST 403、目录 API 403 保持已解析提交、504 重试后备用成功、错误对象/损坏 pack 拒绝、无 TextEncoder、Android Buffer 切片兼容，以及实际更新入口失败时不调用目录写入。
- 全量 `npm run lint` 和 `npx tsc --noEmit` 通过。
- 真实 REST 路线取得 `V260817`、提交 `d96e1df6738bc067abaee97bcc5d81b4a7bcf0ad`。强制 REST 返回截图形式的 403 后，备用路线通过三次真实 GitHub 请求下载成功，23 个文件的路径、大小、blob SHA 与 REST 快照完全相同；21 个音源可导入，2 个二进制 `.js` 跳过。
- 本机探测时也曾收到真实 REST API 配额 403，但测试不依赖其持续存在；上述稳定回归明确注入 403。

网络代理、测试证书、抓取的公开 Git 对象和模拟器数据库全部留在忽略的 `android/app/build/outputs/phase1-runtime/github-fallback/`，不包含在应用或 Git 提交中。应用的 TLS 信任策略没有改变。

## Android Release 验证

最终签名 Release APK 已在 Android 11 / API 30 的 `emulator-5556` 安装，使用 Hermes。清空隔离测试应用数据后从无音源状态开始，不依赖此前导入或快照缓存。没有修改 APK 加入故障开关；通过只作用于测试模拟器的 HTTPS 代理对 REST API 注入 403，Git 请求实时转发到 GitHub 并保留响应证据。初期代理证书和上游转发配置造成的失败不计入成功验收。

| 场景 | 结果与证据 |
| --- | --- |
| 首次导入即遇到 REST 403 | [成功截图](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/147-git-403-first-success.png)：保存 21 个、跳过 2 个；代理记录实际分支请求为注入的 403，后续 refs、metadata pack 和 scripts pack 均来自 GitHub 实时响应 |
| 重启恢复 | [重启后目录](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/150-git-sources-restored.png)；SQLite 核对 21 个音源、21 份脚本和完整来源字段 |
| 再次限流更新 | [重复更新成功](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/153-git-repeat-success.png)；提交了新一代目录，但 21 个 ID、来源资料和脚本内容哈希与首次导入一致，没有重复项 |
| REST 403 且备用服务不可达 | [失败提示](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/155-git-all-fail.png)同时包含限流和备用网络错误；失败后的 SQLite 目录指针、21 个 ID、全部资料及脚本哈希与失败前完全一致 |
| 清理测试网络后重启 | [最终目录仍在](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/158-git-final-persisted.png)；已撤销模拟器代理与临时证书挂载并关闭测试代理 |

本次固定版本为 `V260817`，提交为 `d96e1df6738bc067abaee97bcc5d81b4a7bcf0ad`，跳过 `V260817/未测试/野花音源_.js` 和 `V260817/未测试/野草音源.js`。抓取的目录 pack 为 23,527 字节，脚本 pack 为 315,077 字节。详细事件和数据库比对保存在 `github-fallback/proxy-events.jsonl`、`catalog-evidence.json`。

最终构建用时 2 分 27 秒，bundle 为 2,947,144 字节。arm64-v8a、x86_64、universal 均通过 APK v1/v2 签名校验。模拟器已安装的 x86_64 APK SHA-256 与本地文件一致：`07a17c9cfe7edef01cdc8f2d81616d71852b08fd65ed05929f2ef731bbe75573`。全部安装包的大小和哈希已更新到阶段交付记录。

## 边界

备用服务也可能因用户网络或 GitHub 自身故障不可达，不能保证所有 504 消失。此时明确报错并保留旧目录。音源导入成功仅表示下载、校验和保存完成，不表示这些第三方脚本都能实际取歌。本轮自行在模拟器验证，不要求用户下载后代测。
