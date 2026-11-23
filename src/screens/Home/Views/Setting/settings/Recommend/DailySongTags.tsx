import { memo, useEffect, useState, type ReactNode } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import Button from '../../components/Button'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { getDailySongCategories } from '@/core/netease'
import { getDailySongCategoryTagKey, resolveDailySongCategoryTagKeys } from '@/core/netease/helpers'
import { createStyle } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const selectedKeys = useSettingValue('recommend.dailySongCategoryTagKeys')
  const [categories, setCategories] = useState<LX.Netease.DailySongCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const selected = resolveDailySongCategoryTagKeys(categories, selectedKeys) as string[]
  const defaultSelected = resolveDailySongCategoryTagKeys(categories, null) as string[]
  const tagMap = new Map<string, LX.Netease.DailySongTag>()

  for (const category of categories) {
    for (const tag of category.tags) {
      tagMap.set(getDailySongCategoryTagKey(tag.categoryId, tag.tagId), tag)
    }
  }

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setLoadFailed(false)
    void getDailySongCategories()
      .then((list) => {
        if (!mounted) return
        setCategories(list)
      })
      .catch((err) => {
        console.log(err)
        if (mounted) setLoadFailed(true)
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const toggle = (key: string) => {
    const base = selectedKeys == null ? defaultSelected : selected
    const next = base.includes(key)
      ? base.filter(item => item != key)
      : [...base, key]
    updateSetting({ 'recommend.dailySongCategoryTagKeys': next })
  }
  const move = (index: number, direction: number) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= selected.length) return
    const next = [...selected]
    const target = next[targetIndex]
    next[targetIndex] = next[index]
    next[index] = target
    updateSetting({ 'recommend.dailySongCategoryTagKeys': next })
  }

  let content: ReactNode
  if (isLoading) {
    content = <Text size={12} color={theme['c-font-label']} style={styles.status}>{t('recommend_daily_tag_loading')}</Text>
  } else if (loadFailed) {
    content = <Text size={12} color={theme['c-font-label']} style={styles.status}>{t('recommend_daily_tag_failed')}</Text>
  } else if (!categories.length) {
    content = <Text size={12} color={theme['c-font-label']} style={styles.status}>{t('recommend_daily_tag_empty')}</Text>
  } else {
    content = (
      <>
        <View style={styles.toolbar}>
          <Button onPress={() => { updateSetting({ 'recommend.dailySongCategoryTagKeys': null }) }}>{t('recommend_reset')}</Button>
          <Button disabled={!selected.length} onPress={() => { updateSetting({ 'recommend.dailySongCategoryTagKeys': [] }) }}>{t('recommend_clear')}</Button>
        </View>
        {selected.length
          ? (
              <View style={styles.selectedBox}>
                <Text size={13} color={theme['c-font-label']} style={styles.groupTitle}>{t('recommend_selected_tags')}</Text>
                {selected.map((key, index) => {
                  const tag = tagMap.get(key)
                  if (!tag) return null
                  return (
                    <View key={key} style={styles.selectedRow}>
                      <Text style={styles.selectedName} numberOfLines={1}>{tag.tagName}</Text>
                      <Button disabled={index == 0} onPress={() => { move(index, -1) }}>{t('recommend_move_up')}</Button>
                      <Button disabled={index == selected.length - 1} onPress={() => { move(index, 1) }}>{t('recommend_move_down')}</Button>
                    </View>
                  )
                })}
              </View>
            )
          : null}
        {categories.map(category => (
          <View key={category.categoryId} style={styles.group}>
            <Text size={13} color={theme['c-font-label']} style={styles.groupTitle}>{category.categoryName}</Text>
            <View style={styles.chips}>
              {category.tags.map(tag => {
                const key = getDailySongCategoryTagKey(tag.categoryId, tag.tagId)
                const active = selected.includes(key)
                return (
                  <TouchableOpacity
                    key={key}
                    style={{
                      ...styles.chip,
                      backgroundColor: active ? theme['c-primary-background-active'] : theme['c-button-background'],
                    }}
                    onPress={() => { toggle(key) }}
                  >
                    <Text size={12} color={active ? theme['c-primary-font'] : theme['c-button-font']}>{tag.tagName}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ))}
      </>
    )
  }

  return (
    <View style={styles.container}>
      <Text size={12} color={theme['c-font-label']} style={styles.tip}>{t('recommend_daily_tag_tip')}</Text>
      {content}
    </View>
  )
})

const styles = createStyle({
  container: {
    paddingHorizontal: 12,
  },
  tip: {
    paddingTop: 4,
    paddingBottom: 6,
    lineHeight: 18,
  },
  status: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  toolbar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 4,
  },
  selectedBox: {
    paddingTop: 8,
  },
  selectedRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedName: {
    flex: 1,
    paddingRight: 10,
  },
  group: {
    paddingTop: 8,
  },
  groupTitle: {
    paddingBottom: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
