import { useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { View } from 'react-native'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import Input from '@/components/common/Input'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { applyListProfiles, getListProfiles } from '@/core/listProfile'
import { isPortableCover, moveWithinGroup, resolveGroup } from '@/core/listProfile/helpers'
import { updateUserListPosition } from '@/core/list'
import listState from '@/store/list/state'
import { toast } from '@/utils/tools'

export interface ListProfileEditType { show: (list: LX.List.UserListInfo) => void }

export default forwardRef<ListProfileEditType, {}>((_, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const alertRef = useRef<ConfirmAlertType>(null)
  const selected = useRef<LX.List.UserListInfo | null>(null)
  const [profile, setProfile] = useState<LX.List.UserListProfile>({})
  const [busy, setBusy] = useState(false)

  useImperativeHandle(ref, () => ({
    show(list) {
      selected.current = list
      void getListProfiles().then(profiles => {
        if (selected.current !== list) return
        setProfile({ ...profiles[list.id], group: resolveGroup(list, profiles[list.id]) })
        alertRef.current?.setVisible(true)
      }).catch(error => { toast(String(error.message ?? error)) })
    },
  }))

  const save = async(offset?: number) => {
    const list = selected.current
    if (!list || busy) return
    if (!listState.userList.some(item => item.id == list.id)) { toast(t('phase1_queue_changed')); return }
    if (!isPortableCover(profile.coverUrl ?? '')) { toast(t('phase1_cover_invalid')); return }
    setBusy(true)
    try {
      await applyListProfiles({ [list.id]: profile })
      if (offset != null) {
        const profiles = await getListProfiles()
        await updateUserListPosition(0, moveWithinGroup(listState.userList, profiles, list.id, offset))
      } else alertRef.current?.setVisible(false)
    } catch (error: any) { toast(String(error.message ?? error)) } finally { setBusy(false) }
  }

  return (
    <ConfirmAlert ref={alertRef} title={t('phase1_profile_edit')} disabledConfirm={busy} onConfirm={() => { void save() }}>
      <View style={{ gap: 12 }}>
        <Text>{selected.current?.name}</Text>
        <Text size={12}>{t('phase1_cover_url')}</Text>
        <Input value={profile.coverUrl ?? ''} maxLength={2048} autoCapitalize="none" onChangeText={coverUrl => { setProfile({ ...profile, coverUrl: coverUrl.trim() }) }} style={{ backgroundColor: theme['c-primary-input-background'] }} />
        <Text size={12}>{t('phase1_description')}</Text>
        <Input value={profile.description ?? ''} multiline maxLength={4000} onChangeText={description => { setProfile({ ...profile, description }) }} style={{ minHeight: 80, backgroundColor: theme['c-primary-input-background'] }} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {(['mine', 'external'] as const).map(group => (
            <Button key={group} onPress={() => { setProfile({ ...profile, group }) }} style={{ padding: 12, backgroundColor: profile.group == group ? theme['c-primary-background'] : 'transparent' }}>
              <Text>{t(group == 'mine' ? 'phase1_group_mine' : 'phase1_group_external')}</Text>
            </Button>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button disabled={busy} onPress={() => { void save(-1) }} style={{ padding: 12 }}><Text>{t('phase1_move_up')}</Text></Button>
          <Button disabled={busy} onPress={() => { void save(1) }} style={{ padding: 12 }}><Text>{t('phase1_move_down')}</Text></Button>
        </View>
      </View>
    </ConfirmAlert>
  )
})
