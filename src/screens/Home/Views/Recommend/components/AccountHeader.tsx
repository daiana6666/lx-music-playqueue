import { memo, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import { useNeteaseAccountStatus } from '@/store/netease/hook'
import { setNavActiveId } from '@/core/common'
import LoginQrModal from './LoginQrModal'

export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const status = useNeteaseAccountStatus()
  const [loginVisible, setLoginVisible] = useState(false)
  const profile = status.profile

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={{ ...styles.avatarBtn, backgroundColor: theme['c-primary-light-900-alpha-200'] }}
        onPress={() => { if (!status.isLoggedIn) setLoginVisible(true) }}
      >
        {profile?.avatarUrl
          ? <Image url={profile.avatarUrl} style={styles.avatar} />
          : <Text size={15} color={theme['c-primary-font']}>LX</Text>}
      </TouchableOpacity>
      <View style={styles.texts}>
        <Text size={19} numberOfLines={1} style={styles.name}>
          {profile?.nickname ?? t('recommend_title')}
        </Text>
        <Text size={12} numberOfLines={1} color={theme['c-font-label']}>
          {status.isLoggedIn ? t('netease_logged_in') : t('netease_login_tip')}
        </Text>
      </View>
      <View style={styles.actions}>
        {!status.isLoggedIn
          ? <TouchableOpacity style={{ ...styles.loginBtn, borderColor: theme['c-border-background'] }} onPress={() => { setLoginVisible(true) }}>
              <Text size={12}>{t('netease_login')}</Text>
            </TouchableOpacity>
          : null}
        <TouchableOpacity
          style={{ ...styles.searchBtn, backgroundColor: theme['c-primary-light-900-alpha-200'] }}
          onPress={() => { setNavActiveId('nav_search') }}
        >
          <Icon name="search-2" size={18} color={theme['c-primary-font']} />
        </TouchableOpacity>
      </View>
      <LoginQrModal visible={loginVisible} onClose={() => { setLoginVisible(false) }} />
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  texts: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 8,
    paddingTop: 1,
  },
  name: {
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 0,
  },
  loginBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtn: {
    width: 36,
    height: 36,
    marginLeft: 8,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
