declare namespace LX {
  type PlatformPlaylistProvider = 'netease' | 'qq_music' | 'kugou'
  type PlatformPlaylistKind = 'created' | 'collected'
  interface PlatformPlaylistSummary {
    provider: PlatformPlaylistProvider
    kind: PlatformPlaylistKind
    id: string
    sourceListId: string
    name: string
    coverUrl: string
    accountKey: string
  }
}
