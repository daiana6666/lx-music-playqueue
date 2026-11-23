import { useRef, useState } from 'react'
import { View } from 'react-native'
import ChoosePath, { type ChoosePathType } from '@/components/common/ChoosePath'
import Text from '@/components/common/Text'
import Button from '../../components/Button'
import SubTitle from '../../components/SubTitle'
import { confirmDialog, handleReadFile, handleSaveFile, tipDialog, toast } from '@/utils/tools'
import { createFullBackup, restoreFullBackup } from '@/core/backup/full'
import { recoverData } from '@/plugins/storage'
import { exitApp } from '@/core/common'

export default () => {
  const chooser = useRef<ChoosePathType>(null)
  const action = useRef('')
  const [busy, setBusy] = useState(false)
  const choose = (next: string) => {
    action.current = next
    chooser.current?.show({ title: next == 'import' ? '恢复完整备份或设置' : '保存备份', dirOnly: next != 'import', filter: ['slxmc', 'lxmc', 'json'] })
  }
  const restart = async() => {
    await tipDialog({ message: '恢复完成。应用将关闭，请重新打开。账号凭据未从备份导入；在新设备需重新登录或配置 WebDAV 与同步认证。', btnText: '关闭应用', bgClose: false })
    exitApp('backup restored')
  }
  const run = async(path: string) => {
    if (busy) return
    setBusy(true)
    try {
      if (action.current == 'import') {
        const value = await handleReadFile(path)
        if (!await confirmDialog({ message: '替换备份中包含的歌单、资料、脚本、历史、统计和可兼容设置？恢复前会保留可回退副本，完成后需重新打开应用。', bgClose: false })) return
        await restoreFullBackup(value)
        await restart()
      } else {
        const settingsOnly = action.current == 'setting'
        const backup = await createFullBackup(settingsOnly)
        await handleSaveFile(`${path}/lx_${settingsOnly ? 'setting' : 'all_data'}_${Date.now()}.slxmc`, backup)
        toast('备份已保存')
      }
    } catch (error: any) { toast(String(error.message), 'long') } finally { setBusy(false) }
  }
  const recover = async() => {
    if (!await confirmDialog({ message: '回到上次升级或完整恢复前的用户数据？操作后需重新打开应用。', bgClose: false })) return
    setBusy(true)
    try { await recoverData(); await restart() } catch (error: any) { toast(String(error.message), 'long') } finally { setBusy(false) }
  }
  return (
    <SubTitle title="完整备份与恢复">
      <Text size={12}>包含歌单、资料、源脚本、最近播放、统计和兼容设置；不包含平台登录、WebDAV 密码、同步密钥、本地音频及缓存。</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingTop: 10 }}>
        <Button disabled={busy} onPress={() => { choose('all') }}>导出完整备份</Button>
        <Button disabled={busy} onPress={() => { choose('setting') }}>导出设置</Button>
        <Button disabled={busy} onPress={() => { choose('import') }}>恢复备份或设置</Button>
        <Button disabled={busy} onPress={() => { void recover() }}>回退上次恢复／升级</Button>
      </View>
      <ChoosePath ref={chooser} onConfirm={path => { void run(path) }} />
    </SubTitle>
  )
}
