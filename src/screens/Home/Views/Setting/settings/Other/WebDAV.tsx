import { memo, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import InputItem, { type InputItemProps } from '../../components/InputItem'
import CheckBoxItem from '../../components/CheckBoxItem'
import Button from '../../components/Button'
import { updateSetting } from '@/core/common'
import { refreshWebDAVList } from '@/core/list'
import { testWebDAV } from '@/core/webdav'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { log } from '@/utils/log'
import { toast } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const url = useSettingValue('webdav.url')
  const username = useSettingValue('webdav.username')
  const password = useSettingValue('webdav.password')
  const autoRefresh = useSettingValue('webdav.autoRefresh')
  const [testing, setTesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleUrlChange: InputItemProps['onChanged'] = (value, callback) => {
    const newValue = value.trim()
    updateSetting({ 'webdav.url': newValue })
    callback(newValue)
  }
  const handleUsernameChange: InputItemProps['onChanged'] = (value, callback) => {
    const newValue = value.trim()
    updateSetting({ 'webdav.username': newValue })
    callback(newValue)
  }
  const handlePasswordChange: InputItemProps['onChanged'] = (value, callback) => {
    updateSetting({ 'webdav.password': value })
    callback(value)
  }
  const handleAutoRefreshChange = (enabled: boolean) => {
    updateSetting({ 'webdav.autoRefresh': enabled })
  }
  const handleTest = () => {
    if (testing) return
    setTesting(true)
    void testWebDAV({ url, username, password }).then(() => {
      toast(t('setting_webdav_test_success'))
    }).catch((err: any) => {
      log.error(err)
      toast(`${t('setting_webdav_test_failed')}: ${err.message as string}`)
    }).finally(() => {
      setTesting(false)
    })
  }
  const handleRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    void refreshWebDAVList().then(() => {
      toast(t('list_webdav_refresh_success'))
    }).catch((err: any) => {
      log.error(err)
      toast(`${t('list_webdav_refresh_failed')}: ${err.message as string}`)
    }).finally(() => {
      setRefreshing(false)
    })
  }

  return (
    <SubTitle title={t('setting_webdav')}>
      <InputItem
        value={url}
        label={t('setting_webdav_url')}
        placeholder={t('setting_webdav_url_placeholder')}
        onChanged={handleUrlChange}
      />
      <InputItem
        value={username}
        label={t('setting_webdav_username')}
        placeholder={t('setting_webdav_username_placeholder')}
        onChanged={handleUsernameChange}
      />
      <InputItem
        value={password}
        label={t('setting_webdav_password')}
        placeholder={t('setting_webdav_password_placeholder')}
        secureTextEntry
        onChanged={handlePasswordChange}
      />
      <View style={styles.checkBox}>
        <CheckBoxItem check={autoRefresh} label={t('setting_webdav_auto_refresh')} onChange={handleAutoRefreshChange} />
      </View>
      <View style={styles.buttons}>
        <Button disabled={testing} onPress={handleTest}>{t('setting_webdav_test')}</Button>
        <Button disabled={refreshing} onPress={handleRefresh}>{t('setting_webdav_refresh')}</Button>
      </View>
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  checkBox: {
    marginLeft: -25,
    marginBottom: 10,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
})
