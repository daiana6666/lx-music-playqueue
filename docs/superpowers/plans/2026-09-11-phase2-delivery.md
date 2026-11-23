# 第二阶段实现与验收记录

日期：2026-09-11

项目：`D:/projects/lx-music-mobile`，直接修改原项目；分支 `codex/mobile-feature-sync-phase-2`。

起点：第一阶段及 GitHub 限流修复提交 `bdf7006`。桌面项目仅作协议参考，未修改。

状态：第二阶段功能代码已接入，自动化与 Android 公开流程验证已执行。三个平台的真人账号授权、私人推荐及远程收藏结果尚未完成实际账号验收；当前模拟器的既有音源解析未成功，不能据此宣称第二阶段全部验收通过。

## P2-00 公共接口、凭据与请求生命周期

- `src/core/platform` 提供统一账号状态、平台推荐、创建／收藏目录、完整歌单分页和反馈入口；推荐首页可切换平台，“我的”有平台歌单入口。
- QQ／酷狗凭据仅通过 `PlatformCredentials` 原生模块持久化。Android 6 及以上使用 Android Keystore AES-GCM；Android 5 的兼容路径使用 Keystore RSA 包装独立 AES-GCM 内容密钥。解密失败明确要求重新认证，无明文降级。设备标识也持久化，并与签名使用同一组参数。
- 新凭据不进入普通设置、歌单备份或同步。平台目录缓存仅包含账号标识及歌曲、歌单资料，按平台／账号隔离；它不赋予其他设备管理权限。用户主动复制到普通歌单的内容不随账号退出删除。
- 账号操作有世代标识，安全存储写入串行化。取消、退出、替换账号发生在读取、授权、请求或原生加密写入中时，旧结果不能重新登录、覆盖新账号或补入新播放队列。
- 新请求封装不输出 URL、请求体或凭据；显式 Cookie 使用 `credentials: omit`，不由 React Native 的持久化 CookieJar 管理。
- QQ WebView 采用官方 OAuth 页面，读取音乐域名的 Cookie 后，再经过音乐接口校验才提交账号。取消、成功、超时销毁 WebView，清理 Cookie、缓存、表单和 WebStorage；进程重新初始化也清理上次未完成的授权状态。

代码落点：[账号世代](D:/projects/lx-music-mobile/src/core/platform/session.ts)、[平台服务](D:/projects/lx-music-mobile/src/core/platform/index.ts)、[安全存储](D:/projects/lx-music-mobile/android/app/src/main/java/cn/kuwo/player/platform/PlatformCredentials.java)、[官方授权页面](D:/projects/lx-music-mobile/android/app/src/main/java/cn/kuwo/player/platform/PlatformLogin.java)。

## P2-01 网易云歌单增量

- 账号目录按 100 条分页，按创建者 ID 区分创建／收藏。稳定 ID 包含平台、账号、分类、远程歌单 ID，重复刷新合并相同条目。
- 完整歌曲按 200 首请求；目录与详情先展示该账号已有缓存，成功取得完整结果后原子更新。分类分别刷新，单类失败保留其旧内容。重复页、分页截断、超限和迟到结果都会明确失败。
- 网易云原有扫码新增服务层取消保护及二维码刷新。原有 PC EAPI 接口继续使用配套 PC UA、版本和加密头；设备 ID 改为从设备安全存储中的稳定随机标识派生，不仅修改 UA。
- 网易云原有 Cookie 的全面安全存储迁移仍属于第三阶段；本阶段没有扩大旧凭据的导出或同步范围。

验证：逻辑测试覆盖创建／收藏分类、分页、重复页失败、关闭二维码时迟到的授权结果不写入账号。1,207 首跨页去重及账号隔离通过行为测试。真人账号的实际目录数量仍待授权验收。

## P2-02 QQ 增量

- 同机入口打开 QQ 官方移动授权页面，可由账号本人在官方页面登录；另提供桌面授权页面的“快捷登录”二维码入口。两种页面均已在 Android Release 中打开并验证取消返回。
- 移植猜你喜欢、每日 30 首、连续推荐、推荐歌曲和推荐歌单；猜你喜欢／连续推荐可进入手机连续队列，在接近队尾时续取，退出账号或播放模式后旧结果失效。
- 移植创建／收藏目录、歌单详情、凭据按需续期和失效重登。
- 推荐歌曲可加入本地收藏并同步 QQ 收藏，或提交“不感兴趣”。只在服务端操作码确认成功后显示平台成功；本地已收藏但平台失败时分别提示。
- QQ 的 RPC 使用桌面已实现的 `ct/cv/guid/sign` 协议及对应 UA、Referer、Origin。官方授权移动页使用 WebView 移动 UA，二维码页使用配套桌面 UA，没有随机轮换客户端身份。

已验证：官方移动授权表单、官方扫码页面、取消返回，目录分页及账号切换、反馈失败分类、凭据存储与退出等自动化行为。**未使用个人 QQ 凭据；实际登录成功、重启恢复真实会话、真实推荐／续期、服务端收藏和负反馈结果仍待账号本人授权后验收。**

## P2-03 酷狗增量

- 根据桌面使用的 `kugoumusicapi@1.6.2` 移植必要 HTTPS 端点与签名，不把 Node 服务端包嵌入手机。保留对应 MIT 许可及 APK 内第三方许可文件。
- 支持扫码 key／轮询／过期刷新／退出，成功授权后校验用户资料再写入安全存储。当前提供另一设备扫码；本机酷狗授权未完成验证，因此没有提供未经确认的应用跳转。
- 支持公开精选、完整榜单、私人日推／风格推荐／FM、账号创建／收藏歌单。公开内容与私人内容、各推荐模块分别处理错误和刷新。
- 公开精选优先使用 `global_collection_id` 和现代官方分页接口，避免把 `specialid` 当成分享码；榜单保留必需的 `kg-tid` 请求头。
- 平台屏蔽歌曲只返回 `fileid/shield` 时保留独立占位和明确说明，播放、复制会跳过；不生成空白歌曲或尝试绕过屏蔽。没有合法标识的异常条目会让刷新失败并保留旧缓存。
- FM 按已移植接口返回当前歌曲批次并接入手机播放，本次未把未经验证的 FM 偏移参数声明为无限续歌。

真实联网记录：35 个精选歌单、56 个榜单；TOP500 分 5 页各 100 首、共 500 个唯一歌曲 ID；样例公开歌单返回 22／22 首；二维码 key 获取成功。真人酷狗扫码授权及私人内容仍待授权验收。

## 自动化与设备验证

- `npm run test:logic`：108 项通过，其中第二阶段新增 22 项。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- Android 原生 instrumentation 在正式 Release 的应用 UID 下使用明确标记的合成凭据，8 项检查通过：密文存储、加密往返、重建模块恢复、随机数更新、RSA 包装兼容格式、篡改拒绝及退出删除等。若设备已有 QQ 凭据，测试会拒绝覆盖。
- 测试只操作隔离模拟器 `emulator-5556 / LX_Phase1_API30`，没有操作实体手机，也没有读取个人账号凭据。
- Android 5 的 RSA 包装格式在 API 30 上执行兼容加密／解密测试；尚未在 Android 5 设备运行。

模拟器实际操作记录：

- 酷狗 TOP500 展示完整 500 首；公开样例歌单加载 23 个条目（22 首有资料、1 个平台屏蔽占位），可滚动、复制到本地。复制后的封面、名称、描述及 Mine 分组在进程重启后仍在。
- 隔离模拟器关闭 Wi-Fi 和移动数据后刷新，明确报网络失败且旧歌单仍显示；随后恢复网络。
- 网易云／酷狗二维码获取、刷新、关闭；QQ 官方移动授权表单、桌面“快捷登录”二维码和取消返回。修复扫码窗口关闭时先清理旧请求、再刷新账号状态的顺序。
- “我的平台歌单”入口和三平台切换可用，未授权时保持未登录状态。
- 最终安装包复查：154 首公开歌单跨页加载、复制 154 首；网易云／酷狗关闭扫码窗口正常回到未登录页，没有迟到的账号变更错误。屏蔽占位的独立 ID 和不可播放属性由针对实际响应格式的回归测试覆盖。
- TOP500 点击播放后，歌曲进入现有播放器／队列；实际解析返回“换源失败”，时长停在 00:00，未确认在线音频成功播放。此项保留未通过状态，不以进入队列替代播放验收。

运行截图、日志和联网摘要保存在忽略目录 `android/app/build/outputs/phase1-runtime/`，本次文件以 `p2-` 或 `phase2-` 为前缀。

## 最终构建与证据

`assembleRelease assembleReleaseAndroidTest -PreactNativeArchitectures=arm64-v8a,x86_64` 成功；两种架构 APK 的 v1、v2 签名校验通过。最终 x86_64 APK 已覆盖安装到模拟器，拉回设备 `base.apk` 后 SHA-256 与构建产物相同。

| APK | 字节 | SHA-256 |
| --- | ---: | --- |
| arm64-v8a | 14290199 | `944EB42D3BB03897A44BDFA03E909B73E6ED740366559D880E4D0F0CF613F742` |
| x86_64 | 14614343 | `BFDA75118202B63493FD30341A2880EEB56180B5824F4DFC4E1B7492F9BDD0DC` |

- [ARM64 安装包](D:/projects/lx-music-mobile/android/app/build/outputs/apk/release/lx-music-mobile-v2.0.0-arm64-v8a.apk)
- [TOP500 完整 500 首](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/p2-final-13-top500-loaded.png)
- [最终包公开歌单 154 首](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/p2-final-38-new-public.png)
- [QQ 官方扫码页面](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/p2-final-27-qq-qr.png)
- [最终网易云关闭二维码状态](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/p2-final-34-wy-close-fixed.png)
- [108 项逻辑测试](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/phase2-logic.log)、[8 项原生凭据检查](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/phase2-keystore.txt)、[签名校验](D:/projects/lx-music-mobile/android/app/build/outputs/phase1-runtime/phase2-artifacts.json)

## 仍需的真实授权验收

账号本人正常完成网易云、QQ、酷狗授权后，需继续验证真实创建／收藏目录、私人推荐、真实会话重启／续期、QQ 收藏及负反馈的服务端结果。自动化使用合成账号，不能替代这些服务端证据；没有要求用户下载并代为执行功能测试。

第三、第四阶段尚未开始。
