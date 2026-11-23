import { memo } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { useI18n } from '@/lang'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useNavActiveId } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { setNavActiveId } from '@/core/common'
import { createStyle } from '@/utils/tools'
import { BorderWidths } from '@/theme'
import type { NAV_ID_Type } from '@/config/constant'

const navItems: Array<{ id: NAV_ID_Type, icon: string }> = [
  { id: 'nav_recommend', icon: 'music_time' },
  { id: 'nav_search', icon: 'search-2' },
  { id: 'nav_songlist', icon: 'album' },
  { id: 'nav_top', icon: 'leaderboard' },
  { id: 'nav_love', icon: 'love' },
]

const BottomNavItem = memo(({ id, icon, activeId }: {
  id: NAV_ID_Type
  icon: string
  activeId: NAV_ID_Type
}) => {
  const theme = useTheme()
  const t = useI18n()
  const active = activeId == id
  const color = active ? theme['c-primary-font'] : theme['c-font-label']
  const label = id == 'nav_love' ? '\u6211\u7684' : t(id)

  const handlePress = () => {
    setNavActiveId(id)
  }

  return active
    ? (
        <View style={styles.item}>
          <Icon name={icon} size={20} color={color} />
          <Text size={12} color={color} numberOfLines={1} style={styles.label}>{label}</Text>
        </View>
      )
    : (
        <TouchableOpacity style={styles.item} onPress={handlePress}>
          <Icon name={icon} size={20} color={color} />
          <Text size={12} color={color} numberOfLines={1} style={styles.label}>{label}</Text>
        </TouchableOpacity>
      )
})

export default memo(() => {
  const theme = useTheme()
  const activeId = useNavActiveId()

  return (
    <View style={{ ...styles.container, backgroundColor: theme['c-content-background'], borderTopColor: theme['c-border-background'] }}>
      {navItems.map(item => (
        <BottomNavItem
          key={item.id}
          id={item.id}
          icon={item.icon}
          activeId={activeId}
        />
      ))}
    </View>
  )
})

const styles = createStyle({
  container: {
    width: '100%',
    minHeight: 54,
    paddingTop: 4,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: BorderWidths.normal,
    elevation: 12,
  },
  item: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    paddingTop: 2,
  },
})
