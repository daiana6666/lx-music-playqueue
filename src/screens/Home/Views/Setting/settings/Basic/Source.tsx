import { updateSetting } from '@/core/common'
import { memo, useCallback, useMemo, useRef, useState } from 'react'

import { Alert, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import CheckBox from '@/components/common/CheckBox'
import { confirmDialog, createStyle, toast } from '@/utils/tools'
import { setApiSource } from '@/core/apiSource'
import { useI18n } from '@/lang'
import apiSourceInfo from '@/utils/musicSdk/api-source-info'
import { useSettingValue } from '@/store/setting/hook'
import { useStatus, useUserApiList } from '@/store/userApi'
import Button from '../../components/Button'
import UserApiEditModal, { type UserApiEditModalType } from './UserApiEditModal'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { pullUserApiFromServer, pushUserApiToServer } from '@/core/userApiSync'
import { updateGitHubUserApis } from '@/core/userApi'
// import { importUserApi, removeUserApi } from '@/core/userApi'

const apiSourceList = apiSourceInfo.map(api => ({
  id: api.id,
  name: api.name,
  disabled: api.disabled,
}))

const useActive = (id: string) => {
  const activeLangId = useSettingValue('common.apiSource')
  const isActive = useMemo(() => activeLangId == id, [activeLangId, id])
  return isActive
}

const Item = ({ id, name, desc, statusLabel, change }: {
  id: string
  name: string
  desc?: string
  statusLabel?: string
  change: (id: string) => void
}) => {
  const isActive = useActive(id)
  const theme = useTheme()
  // const [toggleCheckBox, setToggleCheckBox] = useState(false)
  return (
    <CheckBox marginBottom={5} check={isActive} onChange={() => { change(id) }} need>
      <Text style={styles.sourceLabel}>
        {name}
        {
          desc ? <Text style={styles.sourceDesc} color={theme['c-500']} size={13}>  {desc}</Text> : null
        }
        {
          statusLabel ? <Text style={styles.sourceStatus} size={13}>  {statusLabel}</Text> : null
        }
      </Text>
    </CheckBox>
  )
}

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const [syncMode, setSyncMode] = useState<LX.Sync.UserApi.SyncMode>('merge')
  const [syncing, setSyncing] = useState(false)
  const [githubRunning, setGithubRunning] = useState(false)
  const list = useMemo(() => apiSourceList.map(s => ({
    // @ts-expect-error
    name: t(`setting_basic_source_${s.id}`) || s.name,
    id: s.id,
  })), [t])
  const setApiSourceId = useCallback((id: string) => {
    setApiSource(id)
  }, [])
  const userApiListRaw = useUserApiList()
  const apiStatus = useStatus()
  const apiSourceSetting = useSettingValue('common.apiSource')
  const fallbackIds = useSettingValue('player.fallbackSources')
  const disabledFallbackIds = useSettingValue('player.disabledFallbackSources')
  const orderedFallbacks = [...fallbackIds, ...userApiListRaw.map(item => item.id).filter(id => !fallbackIds.includes(id))].filter(id => id != apiSourceSetting && userApiListRaw.some(item => item.id == id))
  const toggleFallback = (id: string) => {
    if (!fallbackIds.includes(id)) updateSetting({ 'player.fallbackSources': [...fallbackIds, id], 'player.disabledFallbackSources': disabledFallbackIds.filter(item => item != id) })
    else updateSetting({ 'player.disabledFallbackSources': disabledFallbackIds.includes(id) ? disabledFallbackIds.filter(item => item != id) : [...disabledFallbackIds, id] })
  }
  const moveFallback = (id: string, offset: number) => {
    const next = [...orderedFallbacks]
    const index = next.indexOf(id)
    const target = index + offset
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    updateSetting({ 'player.fallbackSources': next, 'player.disabledFallbackSources': [...new Set([...disabledFallbackIds, ...next.filter(item => !fallbackIds.includes(item))])] })
  }
  const userApiList = useMemo(() => {
    const getApiStatus = () => {
      let status
      if (apiStatus.status) status = t('setting_basic_source_status_success')
      else if (apiStatus.message == 'initing') status = t('setting_basic_source_status_initing')
      else status = t('setting_basic_source_status_failed')

      return status
    }
    return userApiListRaw.map(api => {
      const statusLabel = api.id == apiSourceSetting ? `[${getApiStatus()}]` : ''
      return {
        id: api.id,
        group: api.remote ? `${api.remote.version} / ${api.remote.group}` : t('phase1_github_local'),
        name: api.name,
        label: `${api.name}${statusLabel}`,
        desc: [/^\d/.test(api.version) ? `v${api.version}` : api.version].filter(Boolean).join(', '),
        statusLabel,
        // status: apiStatus.status,
        // message: apiStatus.message,
        // disabled: false,
      }
    })
  }, [userApiListRaw, apiStatus, apiSourceSetting, t])

  const sourceGroups = useMemo(() => {
    const groups = new Map<string, typeof userApiList>()
    for (const api of userApiList) {
      if (!groups.has(api.group)) groups.set(api.group, [])
      groups.get(api.group)!.push(api)
    }
    return [...groups]
  }, [userApiList])
  const updateGitHub = async() => {
    if (githubRunning) return
    setGithubRunning(true)
    try {
      const result = await updateGitHubUserApis()
      Alert.alert(result.version, [t('phase1_github_success', { count: result.count, skipped: result.skipped.length }), ...result.skipped].join('\n'))
    } catch (error: any) {
      const reasons = error.failures ?? [error]
      const messages = reasons.map((reason: any) => {
        const key = reason.code == 'GITHUB_RATE_LIMIT' ? 'phase1_github_rate_limit'
          : reason.code == 'GITHUB_FORBIDDEN' ? 'phase1_github_forbidden'
            : reason.code == 'GITHUB_NOT_FOUND' ? 'phase1_github_not_found'
              : reason.code == 'GITHUB_TIMEOUT' || reason.status == 504 ? 'phase1_github_timeout'
                : reason.code == 'GITHUB_NETWORK_ERROR' ? 'phase1_github_network' : null
        const reset = typeof reason.resetAt == 'number' ? `\n${t('phase1_github_retry_at')}: ${new Date(reason.resetAt as number).toLocaleString()}` : ''
        return `${key ? t(key) + '\n' : ''}${String(reason.message ?? reason)}${reset}`
      })
      Alert.alert(t('phase1_github_update'), [error.existingSourcesRetained ? t('phase1_github_retained') : '', error.path ?? '', ...messages].filter(Boolean).join('\n\n'))
    } finally { setGithubRunning(false) }
  }

  const modalRef = useRef<UserApiEditModalType>(null)
  const handleShow = () => {
    modalRef.current?.show()
  }
  const handleSetSyncMode = useCallback((mode: LX.Sync.UserApi.SyncMode) => {
    setSyncMode(mode)
  }, [])
  const confirmOverwrite = useCallback(async(action: 'pull' | 'push') => {
    if (syncMode != 'overwrite') return true
    return confirmDialog({
      message: t(action == 'pull' ? 'setting_basic_source_sync_pull_overwrite_confirm' : 'setting_basic_source_sync_push_overwrite_confirm'),
      confirmButtonText: t('confirm_button_text'),
    })
  }, [syncMode, t])
  const handlePull = useCallback(() => {
    void (async() => {
      if (!await confirmOverwrite('pull')) return
      setSyncing(true)
      try {
        const data = await pullUserApiFromServer(syncMode)
        toast(t('setting_basic_source_sync_pull_success', { count: data.apis.length }))
      } catch (err: any) {
        toast(t('setting_basic_source_sync_failed', { message: err.message ?? String(err) }), 'long')
      } finally {
        setSyncing(false)
      }
    })()
  }, [confirmOverwrite, syncMode, t])
  const handlePush = useCallback(() => {
    void (async() => {
      if (!await confirmOverwrite('push')) return
      setSyncing(true)
      try {
        const meta = await pushUserApiToServer(syncMode)
        toast(t('setting_basic_source_sync_push_success', { count: meta.count }))
      } catch (err: any) {
        toast(t('setting_basic_source_sync_failed', { message: err.message ?? String(err) }), 'long')
      } finally {
        setSyncing(false)
      }
    })()
  }, [confirmOverwrite, syncMode, t])

  return (
    <SubTitle title={t('setting_basic_source')}>
      <View style={styles.list}>
        {
          list.map(({ id, name }) => <Item name={name} id={id} key={id} change={setApiSourceId} />)
        }
        {
          sourceGroups.map(([group, apis]) => (
            <View key={group}>
              <Text size={13} color={theme['c-500']} style={{ paddingVertical: 8 }}>{group}</Text>
              {apis.map(({ id, name, desc, statusLabel }) => <Item name={name} desc={desc} statusLabel={statusLabel} id={id} key={id} change={setApiSourceId} />)}
            </View>
          ))
        }
      </View>
      <Text size={14} style={{ paddingTop: 12 }}>备用音源（按顺序尝试）</Text>
      <Text size={12} color={theme['c-500']}>主音源失败或返回无法播放的音频时，按下面顺序尝试已启用的音源。</Text>
      {orderedFallbacks.map((id, index) => (
        <View key={id} style={{ paddingVertical: 4 }}>
          <CheckBox check={fallbackIds.includes(id) && !disabledFallbackIds.includes(id)} label={`${index + 1}. ${userApiListRaw.find(item => item.id == id)?.name ?? id}`} onChange={() => { toggleFallback(id) }} />
          <View style={styles.btn}>
            <Button disabled={index == 0} onPress={() => { moveFallback(id, -1) }}>上移</Button>
            <Button disabled={index == orderedFallbacks.length - 1} onPress={() => { moveFallback(id, 1) }}>下移</Button>
          </View>
        </View>
      ))}
      <View style={styles.btn}>
        <Button onPress={handleShow}>{t('setting_basic_source_user_api_btn')}</Button>
        <Button disabled={githubRunning || syncing} onPress={() => { void updateGitHub() }}>{t(githubRunning ? 'phase1_github_working' : 'phase1_github_update')}</Button>
      </View>
      <View style={styles.sync}>
        <Text style={styles.syncTitle} size={13} color={theme['c-500']}>{t('setting_basic_source_sync_mode')}</Text>
        <View style={styles.syncModes}>
          <CheckBox marginBottom={5} check={syncMode == 'merge'} label={t('setting_basic_source_sync_mode_merge')} onChange={() => { handleSetSyncMode('merge') }} need />
          <CheckBox marginBottom={5} check={syncMode == 'overwrite'} label={t('setting_basic_source_sync_mode_overwrite')} onChange={() => { handleSetSyncMode('overwrite') }} need />
        </View>
        <View style={styles.btn}>
          <Button disabled={syncing || githubRunning} onPress={handlePull}>{syncing ? t('setting_basic_source_sync_running') : t('setting_basic_source_sync_pull_btn')}</Button>
          <Button disabled={syncing || githubRunning} onPress={handlePush}>{t('setting_basic_source_sync_push_btn')}</Button>
        </View>
      </View>
      <UserApiEditModal ref={modalRef} />
    </SubTitle>
  )
})

const styles = createStyle({
  list: {
    flexGrow: 0,
    flexShrink: 1,
    // flexDirection: 'row',
    // flexWrap: 'wrap',
  },
  btn: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sync: {
    marginTop: 12,
  },
  syncTitle: {
    marginBottom: 6,
  },
  syncModes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sourceLabel: {

  },
  sourceDesc: {

  },
  sourceStatus: {

  },
})
