# 第一阶段运行验证与 GitHub 导入修复

本轮由开发代理在本机安装 Android 模拟器并执行测试，不要求用户下载后代测。手机测试对象为签名 Release x86_64 APK，Android 11 / API 30；桌面为同分支生产构建的独立 Electron 实例，测试资料放在 `build/phase1-runtime/desktop-fixed/portable/profile`。没有使用用户原有桌面账号或歌单。

## GitHub 导入

用户最初反馈手机出现 HTTP 504 和一个记不清数字的 40× 错误。后续截图已确认后者为 `/branches/main` 返回 HTTP 403，提示 GitHub 请求额度耗尽，额度恢复时间为 2026/9/11 16:09:26。下面记录第一轮修复；针对版本和目录读取限流的后续修复见 [GitHub 限流修复记录](D:/projects/lx-music-mobile/docs/superpowers/plans/2026-09-11-github-rate-limit-fix.md)。

在旧 Release APK 中，模拟器实际复现 `Property 'TextEncoder' doesn't exist`。GitHub 校验和 ID 生成调用了依赖浏览器 `TextEncoder` 的工具函数，而 Hermes 没有该全局变量。现在改用项目已有的 UTF-8 Buffer 转换，仍对原始字节校验文件大小和 Git blob SHA-1。

同时修正了请求处理：

- 504 等暂时性错误使用有限次数、带间隔的重试；连接和读取都有 20 秒超时，即使底层忽略 abort 也能结束等待。
- 403、404 不再立即连续请求；403 配额耗尽和 429 单独报告限流，响应提供额度恢复时间时一并显示。
- raw 与 CDN 都失败时，增加按快照 blob SHA 下载的 GitHub 官方 API 备用通道。备用数据仍需通过原始字节校验。
- 全部通道失败时保留各次状态码、地址和文件路径，不再让最后一次错误盖掉前面的错误。下载失败发生在目录提交之前，保留原音源。
- 修正成功提示多余的大括号。

修复后，模拟器真实完成 `V260817` 整批导入：23 个文件中保存 21 个音源、跳过 2 个二进制 `.js`。版本固定在提交 `d96e1df6738bc067abaee97bcc5d81b4a7bcf0ad`。随后从关闭后的 Android SQLite 数据库核对到 21 个目录项、21 份脚本及完整中文来源路径、分组、提交和 blob SHA；重启后目录仍存在。

跳过项为 `V260817/未测试/野花音源_.js`、`V260817/未测试/野草音源.js`。导入成功表示文件下载、校验和保存完成，不表示这 21 个第三方脚本都能实际取歌。

新增故障测试覆盖无 TextEncoder、504 退避重试、403/404/429 分类、底层忽略 abort、超限不重试、官方 blob 备用下载，以及全通道失败保留旧目录。手机共 76 项逻辑测试、全量 lint 和 TypeScript 检查通过。

## 第一阶段实际运行结果

| 项目 | 本轮证据 |
| --- | --- |
| Release 安装、覆盖安装和重启 | adb 安装成功；重启后歌单、资料、历史和音源仍在 |
| 备份外部打开 | Android VIEW intent 打开 gzip `.slxmc`，导入两个歌单及 110 首本地歌曲，简介和分组可见 |
| 播放与深链 | 实际播放生成的静音 WAV；Android 媒体会话为播放状态；`starkylx://player/play`、`lxmusic://player/pause` 可调用；后台与熄屏期间发生正常播放与切歌 |
| 播放队列 | 当前 1 首、待播 109 首；点击切歌、稍后播放添加与移除实际通过 |
| 最近播放 | 实际播放产生记录；查看全部及从记录加入收藏通过；另注入 520 条明确标为 Fixture 的记录验证大列表，这不代表真实播放了 520 次 |
| 歌单资料 | 手机编辑简介与分组，保存后可见并持久化 |
| 首次真实联网同步 | 模拟器通过 `10.0.2.2:24432` 与生产 Electron 服务建立加密连接；桌面收到歌单和手机简介、分组 |
| 双向修改与重连 | 桌面通过实际 IPC 写入资料，手机实时显示 `Desktop live edit`；服务离线期间修改后，手机重启重新连接显示 `Desktop offline edit` |
| 非法备份 | 无效 `.slxmc` 无法导入，测试歌单仍为 110 首 |

真实联调发现桌面会把新收到的歌单推导为默认分组并写入资料，抢在显式资料到达前制造冲突，使手机“外部”被改回“我的”。已改为只在内存推导显示分组；用户主动创建、移动分组仍持久化。全新桌面资料重新配对后，手机“外部”正确保留。桌面相关 82 项回归测试和修改文件 lint 通过，renderer 生产构建通过。

最近播放原来复用 `PageContent`，其中的 `SizeView` 会按 Modal 尺寸修改全局状态栏高度，返回首页后出现标题与系统时间重叠。已使用 Modal 自己的容器，避免改变首页测量。长列表增加确定的行高与布局索引，读取保存位置后再创建列表，以防首次渲染内容较短时恢复位置被截断。最终 APK 中滚动到 `History Fixture 015`，返回再打开仍定位该条目；首页标题顶部保持在系统状态栏下方。

## 证据与边界

Android 截图、UI XML、构建和测试日志：`D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/`。桌面联网快照与回归日志：`D:/projects/lx-music-desktop/build/phase1-runtime/`。测试数据库包含测试配对密钥，留在忽略的构建目录中，不纳入 Git。

关键截图：[GitHub 整批导入成功](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/82-github-finished.png)、[重启后来源分组](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/103-sources-after-restart.png)、[520 条记录滚动恢复](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/100-recent-restore.png)、[重连收到离线修改](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/93-restart-sync.png)。第一张截图记录的是导入修复后的首次成功，计数多余括号随后已在最终构建修正。

最终三架构输出通过 v1/v2 签名校验。模拟器已安装最终 x86_64 包，设备内 APK 的 SHA-256 与本地文件一致：`598c6e58c026eaad50ed47f278a559772e8855c776fdfd53fedffe1189b24576`。构建和安装包清单见交付记录。

本轮以 Android 模拟器覆盖安装、UI、媒体服务和两端真实网络；没有覆盖实体手机厂商省电策略、蓝牙耳机、系统网络切换，也没有登录平台账号验证私人 FM 或多人一起听。双端完整备份往返与旧版设备联网仍主要由逻辑测试覆盖。上述范围不作为要求用户代测的交接清单。

桌面全量 Vue 类型复查在未修改的 `src/renderer/views/Recommend/index.vue:115` 报已有 ref 回调类型不兼容；本轮改动文件的 lint、分组和协议测试及生产构建通过。未把全量 Vue 类型检查报告为通过。
