import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FlatList, Modal, ScrollView, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import {
  assertGeneration, cancelPlatformLogin, checkKugouLoginQr, createKugouLoginQr, generation,
  getAccountRevision, getPlatformRecommendation, getPlatformStatus, initPlatformAccount,
  loginQQ, logoutPlatform, platformFeedback, providers, recommendationModules, subscribeAccounts,
  type Provider, type Recommendation,
} from '@/core/platform'
import { cachedPlatformPlaylists, cachedPlatformSongs, refreshPlatformPlaylists, refreshPlatformSongs } from '@/core/platform/catalog'
import { playlistIdentity } from '@/core/platform/session'
import { addListMusics, createList, setTempList } from '@/core/list'
import { applyListProfiles } from '@/core/listProfile'
import { playList } from '@/core/player/player'
import { enterPlatformRadio, exitPlatformRadio } from '@/store/privateFm/action'
import { LIST_IDS } from '@/config/constant'
import settingState from '@/store/setting/state'
import LoginQrModal, { QrCodeMatrix } from './LoginQrModal'

const errorText = (error: unknown) => error instanceof Error ? error.message : '请求失败，请重试'
const isPlayable = (song: LX.Music.MusicInfo) => song.source != 'kg' || !!song.meta.hash
const Action = ({ label, onPress, disabled = false }: { label: string, onPress: () => void, disabled?: boolean }) => {
  const theme = useTheme()
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.action, { borderColor: theme['c-border-background'], opacity: disabled ? 0.5 : 1 }]}><Text size={13}>{label}</Text></TouchableOpacity>
}
export const PlatformSwitcher = ({ value, onChange }: { value: Provider, onChange: (provider: Provider) => void }) => {
  const theme = useTheme()
  return <View style={styles.tabs}>{providers.map(provider => <TouchableOpacity key={provider.id} onPress={() => { onChange(provider.id) }} style={[styles.tab, value == provider.id && { backgroundColor: theme['c-primary-light-900-alpha-200'] }]}><Text size={14} color={value == provider.id ? theme['c-primary-font'] : theme['c-font-label']}>{provider.name}</Text></TouchableOpacity>)}</View>
}

const PlatformLogin = ({ provider, onDone }: { provider: Provider, onDone: () => void }) => {
  const theme = useTheme()
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [qr, setQr] = useState<{ url: string, image: string } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  const done = useRef(onDone)
  const wasVisible = useRef(false)
  done.current = onDone
  useEffect(() => () => { mounted.current = false; if (provider != 'netease') void cancelPlatformLogin(provider) }, [provider])
  useEffect(() => {
    // Refresh account status after the QR child's cancellation cleanup has completed.
    if (!visible && wasVisible.current) done.current()
    wasVisible.current = visible
  }, [visible])
  useEffect(() => {
    if (!visible || provider != 'kugou') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async() => {
      try {
        const result = await checkKugouLoginQr()
        if (cancelled) return
        if (result == 'success') { setVisible(false); return }
        setMessage(result == 'scanned' ? '已扫码，请在酷狗确认授权' : result == 'expired' ? '二维码已过期，请刷新' : '使用酷狗音乐扫描二维码')
        if (result == 'expired') return
      } catch (error) { if (cancelled) return; setMessage(errorText(error)) }
      timer = setTimeout(() => { void poll() }, 2500)
    }
    setQr(null)
    setMessage('正在获取二维码…')
    void createKugouLoginQr().then(next => { if (!cancelled) { setQr(next); setMessage('使用酷狗音乐扫描二维码'); timer = setTimeout(() => { void poll() }, 2000) } }).catch(error => { if (!cancelled) setMessage(errorText(error)) })
    return () => { cancelled = true; if (timer) clearTimeout(timer); void cancelPlatformLogin('kugou') }
  }, [provider, visible, refresh])
  const openQQ = async(desktop: boolean) => {
    setBusy(true)
    setMessage('正在打开 QQ 音乐官方授权页…')
    try { await loginQQ(desktop); if (mounted.current) { setMessage('登录成功'); done.current() } } catch (error) { if (mounted.current) setMessage(errorText(error)) } finally { if (mounted.current) setBusy(false) }
  }
  const close = useCallback(() => { setVisible(false) }, [])
  return <View>
    <View style={styles.actions}>
      {provider == 'qq_music' ? <>
        <Action label="本机 QQ 授权" disabled={busy} onPress={() => { void openQQ(false) }} />
        <Action label="其他设备扫码" disabled={busy} onPress={() => { void openQQ(true) }} />
      </> : <Action label={provider == 'netease' ? '登录网易云音乐' : '登录酷狗音乐'} onPress={() => { setVisible(true) }} />}
    </View>
    {message && provider == 'qq_music' ? <Text size={12} style={styles.message}>{message}</Text> : null}
    {provider == 'netease' ? <LoginQrModal visible={visible} onClose={close} /> : null}
    {provider == 'kugou' ? <Modal transparent visible={visible} onRequestClose={close} animationType="fade"><View style={styles.mask}><View style={[styles.loginPanel, { backgroundColor: theme['c-content-background'] }]}>
      <Text size={17}>酷狗音乐扫码登录</Text>
      <View style={styles.qr}><QrCodeMatrix value={qr?.url ?? ''} /></View>
      <Text size={13} style={styles.message}>{message}</Text>
      <Text size={12} style={styles.message} color={theme['c-font-label']}>请使用另一台设备上的酷狗音乐扫描二维码。</Text>
      <View style={styles.actions}><Action label="刷新二维码" onPress={() => { setRefresh(value => value + 1) }} /><Action label="取消" onPress={close} /></View>
    </View></View></Modal> : null}
  </View>
}

export const PlatformPlaylistDetail = ({ provider, playlist, onClose }: { provider: Provider, playlist: { id: string, name: string, img?: string }, onClose: () => void }) => {
  const theme = useTheme()
  const [list, setList] = useState<LX.Music.MusicInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setMessage('')
    void (async() => {
      const cached = await cachedPlatformSongs(provider, playlist.id)
      if (!cancelled && cached.length) setList(cached)
      const next = await refreshPlatformSongs(provider, playlist.id)
      if (!cancelled) { setList(next); setMessage(next.length ? `已加载完整歌单：${next.length} 首` : '歌单暂无可用歌曲') }
    })().catch(error => { if (!cancelled) setMessage(errorText(error)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [provider, playlist.id, refresh])
  const playable = list.filter(isPlayable)
  const play = async(index: number) => {
    const target = list[index]
    if (!target || !isPlayable(target)) throw new Error('这首歌曲的资料暂不可用')
    await setTempList(`platform_${provider}_${playlist.id}`, playable)
    await playList(LIST_IDS.TEMP, playable.findIndex(song => song.id == target.id))
  }
  const copy = async() => {
    if (!playable.length) return
    const id = `userlist_${Date.now()}`
    await createList({ id, name: playlist.name, list: playable })
    await applyListProfiles({ [id]: { coverUrl: playlist.img, group: 'mine', description: `复制自${providers.find(item => item.id == provider)?.name ?? ''}：${playlist.name}` } })
    setMessage(`已复制 ${playable.length} 首到本地歌单，退出平台账号后仍会保留`)
  }
  return <Modal visible onRequestClose={onClose} animationType="slide"><View style={[styles.full, { backgroundColor: theme['c-content-background'] }]}>
    <View style={styles.heading}><Text size={18} style={styles.flex} numberOfLines={1}>{playlist.name}</Text><Action label="返回" onPress={onClose} /></View>
    <View style={styles.actions}><Action label={loading ? '正在加载…' : '刷新完整歌单'} disabled={loading} onPress={() => { setRefresh(value => value + 1) }} /><Action label="播放全部" disabled={!playable.length} onPress={() => { void play(list.findIndex(isPlayable)).catch(error => { setMessage(errorText(error)) }) }} /><Action label="复制到本地" disabled={!playable.length || loading} onPress={() => { void copy().catch(error => { setMessage(errorText(error)) }) }} /></View>
    <Text size={12} style={styles.message}>{message || `已缓存 ${list.length} 首`}</Text>
    {playable.length < list.length ? <Text size={12} style={styles.message}>{list.length - playable.length} 首资料不可用，播放和复制时会跳过。</Text> : null}
    <FlatList data={list} keyExtractor={item => `${item.source}:${item.id}`} initialNumToRender={14} renderItem={({ item, index }) => <TouchableOpacity disabled={!isPlayable(item)} style={styles.song} onPress={() => { void play(index).catch(error => { setMessage(errorText(error)) }) }}><Image url={item.meta.picUrl} style={styles.cover} /><View style={styles.flex}><Text size={14} numberOfLines={1}>{item.name || '歌曲资料不可用'}</Text><Text size={12} numberOfLines={1} color={theme['c-font-label']}>{item.singer}</Text></View></TouchableOpacity>} />
  </View></Modal>
}

const CatalogSection = ({ provider, kind, onOpen }: { provider: Provider, kind: LX.PlatformPlaylistKind, onOpen: (playlist: { id: string, name: string, img?: string }) => void }) => {
  const theme = useTheme()
  const [items, setItems] = useState<LX.PlatformPlaylistSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void (async() => {
      const cached = await cachedPlatformPlaylists(provider, kind)
      if (!cancelled) setItems(cached)
      const next = await refreshPlatformPlaylists(provider, kind)
      if (!cancelled) setItems(next)
    })().catch(reason => { if (!cancelled) setError(errorText(reason)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [provider, kind, refresh])
  return <View style={styles.section}>
    <View style={styles.heading}><Text size={16} style={styles.flex}>{kind == 'created' ? '创建的歌单' : '收藏的歌单'} · {items.length}</Text><Action label={loading ? '读取中' : '刷新'} disabled={loading} onPress={() => { setRefresh(value => value + 1) }} /></View>
    {error ? <Text size={12} style={styles.message}>{error}。已有内容保留。</Text> : null}
    {!loading && !items.length && !error ? <Text size={13} style={styles.message} color={theme['c-font-label']}>暂无歌单</Text> : null}
    {items.map(item => <TouchableOpacity key={playlistIdentity(item)} style={styles.song} onPress={() => { onOpen({ id: item.sourceListId, name: item.name, img: item.coverUrl }) }}><Image url={item.coverUrl} style={styles.cover} /><Text size={14} style={styles.flex} numberOfLines={2}>{item.name}</Text></TouchableOpacity>)}
  </View>
}

const RecommendSection = ({ provider, module, onOpen }: { provider: Provider, module: ReturnType<typeof recommendationModules>[number], onOpen: (playlist: { id: string, name: string, img?: string }) => void }) => {
  const theme = useTheme()
  const [data, setData] = useState<Recommendation>({ songs: [], playlists: [] })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    void getPlatformRecommendation(provider, module.id).then(value => { if (!cancelled) { setData(value); setMessage(value.songs.length || value.playlists.length ? '' : '暂无内容') } }).catch(error => { if (!cancelled) setMessage(errorText(error)) }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [provider, module.id, refresh])
  const play = async(index: number, radio = false) => {
    if (radio) {
      const expected = generation(provider)
      await enterPlatformRadio({
        provider,
        current: () => generation(provider) == expected,
        load: async() => {
          assertGeneration(provider, expected)
          const next = await getPlatformRecommendation(provider, module.id, true)
          return next.songs as LX.Music.MusicInfoOnline[]
        },
        dislike: async song => platformFeedback(provider, song, true),
      }, data.songs as LX.Music.MusicInfoOnline[])
    } else { await setTempList(`platform_${provider}_${module.id}`, data.songs); await playList(LIST_IDS.TEMP, index) }
  }
  const feedback = async(song: LX.Music.MusicInfo, dislike: boolean) => {
    if (!dislike) await addListMusics(LIST_IDS.LOVE, [song], settingState.setting['list.addMusicLocationType'])
    try { await platformFeedback(provider, song, dislike); setMessage(dislike ? '已提交不感兴趣' : '已收藏并同步到 QQ 音乐'); if (dislike) setData(value => ({ ...value, songs: value.songs.filter(item => item.id != song.id) })) } catch (error) { setMessage(`${dislike ? '' : '本地收藏已保存；平台同步失败：'}${errorText(error)}`) }
  }
  return <View style={styles.section}>
    <View style={styles.heading}><Text size={16} style={styles.flex}>{module.title}</Text><Action label={busy ? '加载中' : '刷新'} disabled={busy} onPress={() => { setRefresh(value => value + 1) }} /></View>
    {message ? <Text size={12} style={styles.message}>{message}</Text> : null}
    {data.songs.length ? <View style={styles.actions}><Action label="播放全部" onPress={() => { void play(0).catch(error => { setMessage(errorText(error)) }) }} />{module.continuous ? <Action label="连续播放" onPress={() => { void play(0, true).catch(error => { setMessage(errorText(error)) }) }} /> : null}<Action label={expanded ? '收起' : `查看 ${data.songs.length} 首`} onPress={() => { setExpanded(value => !value) }} /></View> : null}
    {data.songs.slice(0, expanded ? data.songs.length : 6).map((song, index) => <View key={song.id} style={styles.song}>
      <TouchableOpacity style={styles.songMain} onPress={() => { void play(index).catch(error => { setMessage(errorText(error)) }) }}><Image url={song.meta.picUrl} style={styles.cover} /><View style={styles.flex}><Text size={14} numberOfLines={1}>{song.name}</Text><Text size={12} color={theme['c-font-label']} numberOfLines={1}>{song.singer}</Text></View></TouchableOpacity>
      {provider == 'qq_music' ? <><Action label="收藏" onPress={() => { void feedback(song, false) }} /><Action label="不感兴趣" onPress={() => { void feedback(song, true) }} /></> : null}
    </View>)}
    {data.playlists.slice(0, expanded ? data.playlists.length : 6).map(playlist => <TouchableOpacity key={playlist.id} style={styles.song} onPress={() => { onOpen(playlist) }}><Image url={playlist.img} style={styles.cover} /><Text size={14} style={styles.flex} numberOfLines={2}>{playlist.name}</Text></TouchableOpacity>)}
    {data.playlists.length > 6 ? <Action label={expanded ? '收起歌单' : `查看全部 ${data.playlists.length} 个歌单`} onPress={() => { setExpanded(value => !value) }} /> : null}
  </View>
}

export const PlatformHub = memo(({ provider, playlistsOnly = false }: { provider: Provider, playlistsOnly?: boolean }) => {
  const theme = useTheme()
  const revision = useSyncExternalStore(subscribeAccounts, getAccountRevision)
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState<{ id: string, name: string, img?: string } | null>(null)
  const status = getPlatformStatus(provider)
  const reload = useCallback(() => {
    const expected = generation(provider)
    setMessage('')
    void initPlatformAccount(provider).catch(error => { if (expected == generation(provider)) setMessage(errorText(error)) })
  }, [provider])
  useEffect(() => { reload() }, [reload])
  useEffect(() => { if (!status.loggedIn) setDetail(null) }, [status.loggedIn])
  const accountId = status.profile?.id ?? 'public'
  void revision
  const logout = async() => { exitPlatformRadio(provider); await logoutPlatform(provider); setDetail(null); setMessage('已退出，本地复制的歌单继续保留') }
  return <ScrollView style={[styles.full, { backgroundColor: theme['c-content-background'] }]}>
    <View style={styles.section}>
      <Text size={20}>{status.profile?.nickname ?? providers.find(item => item.id == provider)?.name}</Text>
      {status.loggedIn ? <View style={styles.actions}><Text size={12} style={styles.flex} color={theme['c-font-label']}>已登录 · {status.profile?.id}</Text><Action label="退出账号" onPress={() => { void logout().catch(error => { setMessage(errorText(error)) }) }} /></View> : <PlatformLogin provider={provider} onDone={reload} />}
      {status.unavailable ? <Text size={12}>此设备无法解密旧凭据，请重新登录。</Text> : null}
      {message ? <Text size={12} style={styles.message}>{message}</Text> : null}
    </View>
    {!playlistsOnly ? recommendationModules(provider).filter(module => !module.private || status.loggedIn).map(module => <RecommendSection key={`${accountId}:${module.id}`} provider={provider} module={module} onOpen={setDetail} />) : null}
    {status.loggedIn ? <><CatalogSection key={`${accountId}:created`} provider={provider} kind="created" onOpen={setDetail} /><CatalogSection key={`${accountId}:collected`} provider={provider} kind="collected" onOpen={setDetail} /></> : <Text size={13} style={styles.message} color={theme['c-font-label']}>登录后可读取创建和收藏的歌单。</Text>}
    {detail ? <PlatformPlaylistDetail provider={provider} playlist={detail} onClose={() => { setDetail(null) }} /> : null}
  </ScrollView>
})

export const PlatformPlaylistsEntry = () => {
  const theme = useTheme()
  const [visible, setVisible] = useState(false)
  const [provider, setProvider] = useState<Provider>('netease')
  return <View><Action label="平台歌单 · 网易云 / QQ / 酷狗" onPress={() => { setVisible(true) }} /><Modal visible={visible} animationType="slide" onRequestClose={() => { setVisible(false) }}><View style={[styles.full, { backgroundColor: theme['c-content-background'] }]}><View style={styles.heading}><Text size={18} style={styles.flex}>我的平台歌单</Text><Action label="返回" onPress={() => { setVisible(false) }} /></View><PlatformSwitcher value={provider} onChange={setProvider} />{visible ? <PlatformHub key={provider} provider={provider} playlistsOnly /> : null}</View></Modal></View>
}

const styles = createStyle({
  full: { flex: 1 },
  flex: { flex: 1 },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  section: { padding: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 4 },
  action: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 6, margin: 3 },
  message: { marginHorizontal: 12, marginVertical: 6 },
  song: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 5, paddingHorizontal: 6 },
  songMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cover: { width: 44, height: 44, borderRadius: 5, marginRight: 10 },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loginPanel: { width: '100%', maxWidth: 380, padding: 16, borderRadius: 12, alignItems: 'center' },
  qr: { paddingVertical: 16 },
})
