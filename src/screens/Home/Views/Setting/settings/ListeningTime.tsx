import { memo, useState } from 'react'
import Button from '../components/Button'
import { View } from 'react-native'
import Text from '@/components/common/Text'
import Section from '../components/Section'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useListeningTimeStats } from '@/store/listeningTime/hook'
import { getLocalDateKey } from '@/core/netease/helpers'
import { createStyle } from '@/utils/tools'

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return `${hours}h ${restMinutes}m`
}

const getDateByOffset = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date
}

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const stats = useListeningTimeStats()
  const [rankByCount, setRankByCount] = useState(true)
  const today = stats.daily[getLocalDateKey()] ?? 0
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = getDateByOffset(index - 6)
    const key = getLocalDateKey(date)
    return {
      key,
      label: key.slice(5),
      seconds: stats.daily[key] ?? 0,
    }
  })
  const week = days.reduce((total, day) => total + day.seconds, 0)
  const maxDaySeconds = Math.max(1, ...days.map(day => day.seconds))
  const topSongs = Object.values(stats.songs).filter(song => !rankByCount || song.playCount > 0).sort((a, b) => rankByCount ? b.playCount - a.playCount || b.seconds - a.seconds : b.seconds - a.seconds).slice(0, 100)
  const songCount = Object.keys(stats.songs).length

  return (
    <Section title={t('setting_listening_time')}>
      <View style={styles.summary}>
        <View style={{ ...styles.metric, backgroundColor: theme['c-primary-light-900-alpha-200'] }}>
          <Text size={11} color={theme['c-font-label']}>{t('listening_time_total')}</Text>
          <Text size={18} style={styles.metricValue}>{formatDuration(stats.totalSeconds)}</Text>
        </View>
        <View style={{ ...styles.metric, backgroundColor: theme['c-primary-light-900-alpha-200'] }}>
          <Text size={11} color={theme['c-font-label']}>{t('listening_time_today')}</Text>
          <Text size={18} style={styles.metricValue}>{formatDuration(today)}</Text>
        </View>
        <View style={{ ...styles.metric, backgroundColor: theme['c-primary-light-900-alpha-200'] }}>
          <Text size={11} color={theme['c-font-label']}>{t('listening_time_week')}</Text>
          <Text size={18} style={styles.metricValue}>{formatDuration(week)}</Text>
        </View>
        <View style={{ ...styles.metric, backgroundColor: theme['c-primary-light-900-alpha-200'] }}>
          <Text size={11} color={theme['c-font-label']}>{t('listening_time_song_count')}</Text>
          <Text size={18} style={styles.metricValue}>{songCount}</Text>
        </View>
      </View>
      <View style={styles.chart}>
        {days.map(day => (
          <View key={day.key} style={styles.dayRow}>
            <Text size={11} color={theme['c-font-label']} style={styles.dayLabel}>{day.label}</Text>
            <View style={{ ...styles.barTrack, backgroundColor: theme['c-button-background'] }}>
              <View
                style={{
                  ...styles.barFill,
                  width: `${Math.max(day.seconds ? 8 : 0, Math.round(day.seconds / maxDaySeconds * 100))}%`,
                  backgroundColor: theme['c-primary-background-active'],
                }}
              />
            </View>
            <Text size={11} color={theme['c-font-label']} style={styles.dayValue}>{formatDuration(day.seconds)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.songs}>
        <Text size={12}>播放次数：{stats.totalPlayCount} · 从 {new Date(stats.countStartedAt).toLocaleDateString()} 开始记录</Text>
        <Button onPress={() => { setRankByCount(!rankByCount) }}>{rankByCount ? '按次数 · 前 100 首（点击切换时长）' : '按时长 · 前 100 首（点击切换次数）'}</Button>
        <Text size={13} color={theme['c-font-label']} style={styles.songsTitle}>{t('listening_time_top_songs')}</Text>
        {topSongs.length
          ? topSongs.map(song => (
              <View key={`${song.source}:${song.id}`} style={styles.songRow}>
                <Text style={styles.songName} numberOfLines={1}>{song.name}</Text>
                <Text size={12} color={theme['c-font-label']}>{rankByCount ? `${song.playCount} 次` : formatDuration(song.seconds)}</Text>
              </View>
          ))
          : <Text size={12} color={theme['c-font-label']} style={styles.empty}>{t('listening_time_empty')}</Text>}
      </View>
    </Section>
  )
})

const styles = createStyle({
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 12,
  },
  metric: {
    width: '48%',
    borderRadius: 8,
    padding: 12,
  },
  metricValue: {
    fontWeight: '700',
    marginTop: 4,
  },
  chart: {
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  dayRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayLabel: {
    width: 42,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  dayValue: {
    width: 58,
    textAlign: 'right',
  },
  songs: {
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  songsTitle: {
    paddingBottom: 4,
  },
  songRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
  },
  songName: {
    flex: 1,
    paddingRight: 10,
  },
  empty: {
    paddingTop: 8,
    paddingBottom: 8,
  },
})
