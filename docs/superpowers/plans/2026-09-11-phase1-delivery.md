# 第一阶段试用版交付记录

日期：2026-09-11。状态：P1-01 至 P1-07 已实现，自动化验证及 Android 模拟器、两端实际联网验证已完成。实体手机差异尚未覆盖。

手机端基线为 `379106c`，桌面端基线为 `130a4190`。两端工作分支均为 `codex/mobile-feature-sync-phase-1`。本阶段没有进入账号、备用源或下载功能迁移。

## 试用入口

| 功能 | 手机端操作 |
| --- | --- |
| 完整最近播放 | 推荐页 → 最近播放 → 查看全部；支持点击播放、加入歌单，返回后恢复浏览位置 |
| 播放队列 | 播放器 → 队列；查看当前、稍后、待播放及历史，点击切歌，删除或清空稍后播放 |
| 歌单分组与资料 | 我的列表 → 歌单菜单 → 编辑资料；编辑封面链接、简介、我的／外部分组，组内上移或下移 |
| 备份 | 设置 → 备份；导出 `.slxmc`，从应用内或 Android 文件打开入口导入 |
| GitHub 源 | 设置 → 自定义源 → GitHub 更新；显示版本、来源分组和跳过原因 |
| 双端资料同步 | 使用本分支桌面端作为同步服务，手机连接；双方支持时自动启用 `listProfile:1` |

队列随播放器状态更新。随机模式展示已确定的下一项或已有播放历史，不额外生成随机顺序。一起听使用房间队列条目 ID，重复歌曲也能定位到对应条目，参与者权限沿用房间设置。

## 兼容范围

- 最近播放沿用每台设备最多 520 首、按 `source:id` 去重的本地记录，不合并两台设备的听歌历史或统计。
- 备份读取 `.slxmc`、`.lxmc`、JSON 和旧 `.bin` 入口；内容支持 JSON、gzip、zlib及旧双层 JSON。校验内部备份类型，压缩前后上限均为 64 MiB。单个歌单最多 100,000 首、单个集合最多 10,000 个歌单。
- 读取桌面全量备份时，本阶段只导入歌单及支持的资料；导入前会提示。解析失败或用户取消时不写入数据。写入失败会报告错误；歌单与资料属于不同存储域，不能承诺整份备份的跨域事务回滚，可修复存储问题后重新导入。
- 备份和资料同步携带 HTTP(S) 封面链接、简介、分组及创建时间。空字符串可以清空封面或简介；旧数据缺少字段时保留已有值。本地文件封面留在原设备，本阶段不传图片文件。
- 可选资料能力为 `listProfile:1`，依赖 `list:1`。原有列表协议保持不变。旧客户端不协商该能力，也不发送新增资料 RPC。
- 资料同步使用共同快照逐字段合并，冲突方向沿用列表同步选择；处理资料先到、重连、同步途中编辑、删除和重复交换。共同快照在对端确认后持久化，失败不推进确认状态。
- `managed`、`provider`、`kind`、`accountKey` 等账号管理字段不进入可移植资料，手机资料不能赋予桌面账号操作权限。
- 两种深链前缀均可用：`starkylx://`、`lxmusic://`。支持 `music/play`、`music/searchPlay`、`songlist/play`，以及 `player/play`、`pause`、`skipNext`、`skipPrev`、`togglePlay`、`collect`、`uncollect`、`dislike`；未知动作报错。
- 源更新固定使用 `Macrohard0001/lx-ikun-music-sources` 的版本目录和提交；每批最多 200 个文件、每文件 9 MB、整批 50 MB、并发 4。原始文件经过大小与 Git blob SHA-1 校验后再识别脚本。有效条目以源文件头为导入条件，不代表脚本运行或取歌已经成功。
- 版本或目录 REST API 被限流时，自动尝试 GitHub 官方 Git 服务，验证提交、目录和脚本的对象哈希；首次导入无需旧快照或 Token。详见 [GitHub 限流修复记录](D:/projects/lx-music-mobile/docs/superpowers/plans/2026-09-11-github-rate-limit-fix.md)。
- 源目录和脚本采用分代写入，全部写好后提交目录指针。网络批次不完整、整批无效或提交失败时保留旧源。旧存储保留作迁移回退依据，后续清理属于第三阶段。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| 手机 `npm run test:logic` | 86 项通过，包括历史上限、队列身份及权限、备份、源来源往返、限流备用下载、Android 字节数组兼容、快照失败恢复和深链协商 |
| 手机 `npx tsc --noEmit` | 通过 |
| 手机 `npm run lint` | 全量通过 |
| 桌面同步、分组、备份和存储契约／IPC | 82 项通过，包含能力切换顺序与资料同步文件的 7 项测试 |
| 桌面 Electron／SQLite 存储与重试 | 25 项通过，包括数据库内并发资料保存、显式清空封面和重启持久化 |
| 桌面检查 | 修改文件 lint、82 项相关回归和生产构建通过；本轮全量 Vue 类型检查在已有 Recommend ref 回调处报错，详见运行记录 |
| 双端协议测试 | 使用实际手机资料存储、手机 RPC handlers、`message2call` 与桌面 `createSyncRpc`；磁盘／数据库和传输以测试适配器代替真实设备 |
| GitHub 实际网络下载 | `V260817`，提交 `d96e1df6738bc067abaee97bcc5d81b4a7bcf0ad`，下载 23 个文件，21 个符合导入条件，2 个二进制 `.js` 跳过 |

GitHub 实测跳过的文件为 `V260817/未测试/野花音源_.js` 和 `V260817/未测试/野草音源.js`。实测只下载、校验与解析文件头，没有在本机执行这些脚本。

构建环境：Node.js 22.19.0、JDK 21、Android SDK 位于 `D:/env/android`。Android 构建命令：

```powershell
$env:JAVA_HOME = 'D:/env/java/jdk21'
Set-Location 'D:/projects/lx-music-mobile/android'
./gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --console=plain
```

项目版本保持 2.0.0／基础 versionCode 200；架构包的实际 versionCode 由既有 Gradle 规则派生，arm64-v8a 为 200003。本批输出 arm64-v8a、x86_64，以及包含这两个架构的 universal APK；不包含 armeabi-v7a。使用项目已有 Release 签名配置，三个 APK 均通过 v1、v2 签名校验。

桌面端四个生产模块使用项目 Webpack 配置构建，最终主模块也重新构建通过。`npm run build` 的清理步骤遇到旧 `build/win-unpacked` 文件占用，因此改用直接构建模块；本次未生成新桌面安装程序。测试新增资料同步时，关闭旧桌面程序，在 `D:/projects/lx-music-desktop` 运行 `npx electron .` 使用本次 `dist` 构建，旧桌面安装程序不会自动获得新能力。

## 运行验收

本轮由开发代理安装 Android 11 / API 30 模拟器，实际安装签名 Release 包，并连接独立的桌面端生产实例。播放、110 首队列、520 条测试历史、资料编辑、重启保留、外部备份打开、GitHub 整批导入及双端首次同步／重连均已运行验证。

运行中发现并修复 GitHub 导入缺少 TextEncoder、下载错误重试与诊断、桌面默认分组覆盖手机选择、最近播放影响状态栏及滚动恢复的问题。HTTP 504、403、404、429 另有故障模拟测试。完整结果、截图路径、测试范围见 [运行验证与修复记录](D:/projects/lx-music-mobile/docs/superpowers/plans/2026-09-11-phase1-runtime-validation.md)。未覆盖的实体设备与账号场景已如实标明，不要求用户代做本轮测试。

## 构建产物

最终限流修正版 Android 构建成功，用时 2 分 27 秒。APK 内包含 2,947,144 字节的应用 bundle；应用标识为 `cn.kuwo.player`。首次导入、重复更新、全部通道失败及重启持久化已在最终 x86_64 Release 包上验证，详见 GitHub 限流修复记录。

| 安装包 | 字节数 | SHA-256 |
| --- | ---: | --- |
| [arm64-v8a，普通 64 位安卓手机](D:/projects/lx-music-mobile/android/app/build/outputs/apk/release/lx-music-mobile-v2.0.0-arm64-v8a.apk) | 14,196,891 | `1651175AF950D745298BFD459AADA9EC3C7DE8127C2A7B2AB63D6525D31A7E93` |
| [universal，本批两个架构](D:/projects/lx-music-mobile/android/app/build/outputs/apk/release/lx-music-mobile-v2.0.0-universal.apk) | 29,167,444 | `55EDF7C1B154816409DEE35B9A4452D3797529D8F213D23AF96596730654D86E` |
| [x86_64](D:/projects/lx-music-mobile/android/app/build/outputs/apk/release/lx-music-mobile-v2.0.0-x86_64.apk) | 14,521,036 | `07A17C9CFE7EDEF01CDC8F2D81616D71852B08FD65ED05929F2EF731BBE75573` |

构建对应本分支的本次源代码变更，阶段提交号见交付消息。日志保存在手机端 `android/app/build/outputs/phase1-validation` 和桌面端 `build/phase1-validation`，不纳入源代码提交。
