import { memo } from 'react'
import { FlatList, type FlatListProps } from 'react-native'

import Basic from '../settings/Basic'
import Source from '../settings/Source'
import Player from '../settings/Player'
import PlayBar from '../settings/PlayBar'
import LyricDesktop from '../settings/LyricDesktop'
import Search from '../settings/Search'
import Recommend from '../settings/Recommend'
import List from '../settings/List'
import Sync from '../settings/Sync'
import ListeningTime from '../settings/ListeningTime'
import Backup from '../settings/Backup'
import Other from '../settings/Other'
import Version from '../settings/Version'
import About from '../settings/About'
import { createStyle } from '@/utils/tools'
import { SETTING_SCREENS, type SettingScreenIds } from '../Main'

type FlatListType = FlatListProps<SettingScreenIds>


const styles = createStyle({
  content: {
    paddingLeft: 15,
    paddingRight: 15,
    paddingTop: 15,
    paddingBottom: 15,
    flex: 0,
  },
})

const ListItem = memo(({
  id,
}: { id: SettingScreenIds }) => {
  switch (id) {
    case 'source': return <Source />
    case 'player': return <Player />
    case 'play_bar': return <PlayBar />
    case 'lyric_desktop': return <LyricDesktop />
    case 'search': return <Search />
    case 'recommend': return <Recommend />
    case 'list': return <List />
    case 'sync': return <Sync />
    case 'listening_time': return <ListeningTime />
    case 'backup': return <Backup />
    case 'other': return <Other />
    case 'version': return <Version />
    case 'about': return <About />
    case 'basic': return <Basic />
  }
}, () => true)

export default () => {
  const renderItem: FlatListType['renderItem'] = ({ item }) => <ListItem id={item} />
  const getkey: FlatListType['keyExtractor'] = item => item

  return (
    <FlatList
      data={SETTING_SCREENS}
      keyboardShouldPersistTaps={'always'}
      renderItem={renderItem}
      keyExtractor={getkey}
      contentContainerStyle={styles.content}
      maxToRenderPerBatch={2}
      // updateCellsBatchingPeriod={80}
      windowSize={2}
      // removeClippedSubviews={true}
      initialNumToRender={1}
    />
  )
}
