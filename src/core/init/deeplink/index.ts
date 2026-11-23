import { Linking } from 'react-native'
import { errorDialog } from './utils'
import { handleMusicAction } from './musicAction'
import { handlePlayerAction, type PlayerAction } from './playerAction'
import { handleSonglistAction } from './songlistAction'
import { extname, stat } from '@/utils/fs'
import { handleFileMusicAction, handleFileJSAction, handleFileLXMCAction } from './fileAction'


const handleLinkAction = async(link: string) => {
  // console.log(link)
  const index = link.indexOf('?')
  const url = index < 0 ? link : link.slice(0, index)
  const search = index < 0 ? '' : link.slice(index + 1)
  const [type, action, ...paths] = url.replace(/^(?:lxmusic|starkylx):\/\//i, '').split('/')
  const actions: Record<string, string[]> = {
    music: ['play', 'searchPlay'],
    songlist: ['play'],
    player: ['play', 'pause', 'skipNext', 'skipPrev', 'togglePlay', 'collect', 'uncollect', 'dislike'],
  }
  if (!actions[type]?.includes(action)) throw new Error(`Unsupported link action: ${type}/${action ?? ''}`)
  const params: {
    paths: string[]
    data?: string
    [key: string]: any
  } = {
    paths: [],
  }
  if (search) {
    for (const param of search.split('&')) {
      const index = param.indexOf('=')
      if (index < 0) continue
      const key = decodeURIComponent(param.slice(0, index))
      if (key == '__proto__' || key == 'constructor' || key == 'prototype') continue
      params[key] = param.slice(index + 1)
    }
    if (params.data) params.data = JSON.parse(decodeURIComponent(params.data))
  }
  params.paths = paths.map(p => decodeURIComponent(p))
  switch (type) {
    case 'music':
      await handleMusicAction(action, params)
      break
    case 'songlist':
      await handleSonglistAction(action, params)
      break
    case 'player':
      await handlePlayerAction(action as PlayerAction)
      break
    default: throw new Error('Unsupported link route: ' + type)
  }
}

const handleFileAction = async(link: string) => {
  const file = await stat(link)
  // console.log(file)
  switch (extname(file.name).toLowerCase()) {
    case 'json':
    case 'lxmc':
    case 'slxmc':
    case 'bin':
      await handleFileLXMCAction(file)
      break
    case 'js':
      await handleFileJSAction(file)
      break
    case 'ogg':
    case 'flac':
    case 'wav':
    case 'mp3':
      await handleFileMusicAction(file)
      break
    default:
      if (!file.mimeType?.startsWith('audio/')) throw new Error('Unknown file type')
      await handleFileMusicAction(file)
      break
  }
}

// const handleHttpAction = async(link: string) => {
// }


const runLinkAction = async(link: string) => {
  if (/^(?:lxmusic|starkylx):\/\//i.test(link)) {
    try {
      await handleLinkAction(link)
    } catch (err: any) {
      errorDialog(err.message)
      // focusWindow()
    }
  } else if (link.startsWith('file://') || link.startsWith('content://')) {
    try {
      await handleFileAction(link)
    } catch (err: any) {
      errorDialog(err.message)
      // focusWindow()
    }
  }
  //  else if (/^https?:\/\//.test(link)) {
  //   try {
  //     await handleHttpAction(link)
  //   } catch (err: any) {
  //     errorDialog(err.message)
  //     // focusWindow()
  //   }
  // }
}

export const initDeeplink = async() => {
  Linking.addEventListener('url', ({ url }) => {
    void runLinkAction(url)
    console.log('deeplink', url)
  })
  const initialUrl = await Linking.getInitialURL()
  if (initialUrl == null) return
  console.log('deeplink', initialUrl)
  void runLinkAction(initialUrl)
}
