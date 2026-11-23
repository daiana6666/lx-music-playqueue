import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import { setNavActiveId } from '@/core/common'
import { normalizeRecommendHomeSectionOrder } from '@/core/netease/helpers'
import { initNeteaseAccount } from '@/store/netease/action'
import { loadRecommendHome, setRecommendHomeScrollPosition } from '@/store/recommend/action'
import { getRecommendHomeState, useRecommendHomeState } from '@/store/recommend/hook'
import { useRecentPlayList } from '@/store/recentPlay/hook'
import AccountHeader from './components/AccountHeader'
import SpecialCards from './components/SpecialCards'
import PlaylistRail from './components/PlaylistRail'
import SongSection from './components/SongSection'
import ChartRail from './components/ChartRail'
import RecentPlay from '@/screens/RecentPlay'
import { PlatformHub, PlatformSwitcher } from './components/PlatformHub'
import { type Provider } from '@/core/platform'

const SectionLoading = memo(({ title }: { title: string }) => {
  const theme = useTheme()
  const t = useI18n()
  return (
    <View style={styles.loadingSection}>
      <Text size={16} style={styles.loadingTitle}>{title}</Text>
      <Text size={12} color={theme['c-font-label']}>{t('recommend_loading')}</Text>
    </View>
  )
})

const NeteaseHome = memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const scrollRef = useRef<ScrollView>(null)
  const recommendState = useRecommendHomeState()
  const recentPlayList = useRecentPlayList()
  const home = recommendState.homeRecommendation
  const [specialRefreshKey, setSpecialRefreshKey] = useState(0)
  const [recentVisible, setRecentVisible] = useState(false)
  const sectionOrder = useSettingValue('recommend.homeSectionOrder')
  const normalizedOrder = useMemo(() => normalizeRecommendHomeSectionOrder(sectionOrder) as LX.RecommendHomeSectionId[], [sectionOrder])

  useEffect(() => {
    void initNeteaseAccount().catch(err => { console.log(err) })
    void loadRecommendHome().catch(err => { console.log(err) })
    requestAnimationFrame(() => {
      const position = getRecommendHomeState().scrollPosition
      if (position) scrollRef.current?.scrollTo({ y: position, animated: false })
    })
  }, [])

  const refresh = () => {
    setSpecialRefreshKey(value => value + 1)
    void loadRecommendHome(true).catch(err => { console.log(err) })
  }
  const openRecommendSettings = useCallback(() => {
    global.lx.settingActiveId = 'recommend'
    setNavActiveId('nav_setting')
  }, [])

  const renderSection = (sectionId: LX.RecommendHomeSectionId) => {
    if (!home) return null
    const isLoading = !!recommendState.loadingSections[sectionId]
    switch (sectionId) {
      case 'radarPlaylists':
        if (!home.radarPlaylists.length && isLoading) return <SectionLoading key={sectionId} title={t('recommend_radar')} />
        return <PlaylistRail key={sectionId} title={t('recommend_radar')} list={home.radarPlaylists} />
      case 'styleSongs':
        if (!home.styleSongs.length && isLoading) return <SectionLoading key={sectionId} title={home.styleSongsTitle || t('recommend_style_songs')} />
        return <SongSection key={sectionId} id={sectionId} title={home.styleSongsTitle || t('recommend_style_songs')} list={home.styleSongs} onRefresh={refresh} />
      case 'dailySongCategories':
        if (!home.dailySongCategoryPlaylists.length && isLoading) return <SectionLoading key={sectionId} title={t('recommend_daily_categories')} />
        return <PlaylistRail key={sectionId} title={t('recommend_daily_categories')} list={home.dailySongCategoryPlaylists} onSettingsPress={openRecommendSettings} />
      case 'similarSongs':
        if (!home.similarSongs.length && isLoading) return <SectionLoading key={sectionId} title={t('recommend_similar_songs')} />
        return <SongSection key={sectionId} id={sectionId} title={t('recommend_similar_songs')} list={home.similarSongs} onRefresh={refresh} />
      case 'recommendPlaylists':
        if (!home.recommendPlaylists.length && isLoading) return <SectionLoading key={sectionId} title={t('recommend_playlists')} />
        return <PlaylistRail key={sectionId} title={t('recommend_playlists')} list={home.recommendPlaylists} />
      case 'charts':
        if (!home.charts.length && isLoading) return <SectionLoading key={sectionId} title={t('recommend_charts')} />
        return <ChartRail key={sectionId} title={t('recommend_charts')} list={home.charts} />
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ ...styles.container, backgroundColor: theme['c-content-background'] }}
      refreshControl={<RefreshControl refreshing={recommendState.isLoadingHomeRecommendation} onRefresh={refresh} />}
      scrollEventThrottle={500}
      onScroll={event => { setRecommendHomeScrollPosition(event.nativeEvent.contentOffset.y) }}
    >
      <AccountHeader />
      <SpecialCards recommendPlaylists={home?.recommendPlaylists ?? []} refreshKey={specialRefreshKey} />
      <SongSection id="recent_play" title={t('recent_play')} list={recentPlayList} onViewAll={() => { setRecentVisible(true) }} />
      {recentVisible ? <RecentPlay visible={recentVisible} onClose={() => { setRecentVisible(false) }} /> : null}
      {home
        ? normalizedOrder.map(renderSection)
        : <View style={styles.empty}><Text size={13} color={theme['c-font-label']}>{t('recommend_loading')}</Text></View>}
    </ScrollView>
  )
})

export default memo(() => {
  const [provider, setProvider] = useState<Provider>('netease')
  return <View style={{ flex: 1 }}><PlatformSwitcher value={provider} onChange={setProvider} />{provider == 'netease' ? <NeteaseHome /> : <PlatformHub key={provider} provider={provider} />}</View>
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  empty: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingSection: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    minHeight: 64,
    justifyContent: 'center',
  },
  loadingTitle: {
    fontWeight: '700',
    paddingBottom: 6,
  },
})
