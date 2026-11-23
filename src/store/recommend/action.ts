import { getHomeRecommendation } from '@/core/netease'
import { RECOMMEND_HOME_SECTION_IDS } from '@/config/constant'
import state from './state'

const emitRecommendHome = () => {
  global.state_event.recommendHomeUpdated(state.homeRecommendation)
}

const createEmptyHomeRecommendation = (): LX.Netease.HomeRecommendation => ({
  radarPlaylists: [],
  styleSongsTitle: '',
  styleSongs: [],
  dailySongCategoryPlaylists: [],
  similarSongs: [],
  recommendPlaylists: [],
  charts: [],
  updatedAt: Date.now(),
})

const hasHomeContent = (home: LX.Netease.HomeRecommendation | null) => {
  if (!home) return false
  return [
    home.radarPlaylists,
    home.styleSongs,
    home.dailySongCategoryPlaylists,
    home.similarSongs,
    home.recommendPlaylists,
    home.charts,
  ].some(list => list.length > 0)
}

const getSectionPatch = (
  section: LX.RecommendHomeSectionId,
  data: LX.Netease.HomeRecommendation,
): Partial<LX.Netease.HomeRecommendation> => {
  switch (section) {
    case 'radarPlaylists':
      return { radarPlaylists: data.radarPlaylists }
    case 'styleSongs':
      return { styleSongsTitle: data.styleSongsTitle, styleSongs: data.styleSongs }
    case 'dailySongCategories':
      return { dailySongCategoryPlaylists: data.dailySongCategoryPlaylists }
    case 'similarSongs':
      return { similarSongs: data.similarSongs }
    case 'recommendPlaylists':
      return { recommendPlaylists: data.recommendPlaylists }
    case 'charts':
      return { charts: data.charts }
  }
}

const mergeRecommendHome = (partial: Partial<LX.Netease.HomeRecommendation>) => {
  state.homeRecommendation = {
    ...(state.homeRecommendation ?? createEmptyHomeRecommendation()),
    ...partial,
    updatedAt: Date.now(),
  }
  emitRecommendHome()
}

const setSectionLoading = (section: LX.RecommendHomeSectionId, loading: boolean) => {
  state.loadingSections = {
    ...state.loadingSections,
    [section]: loading,
  }
  emitRecommendHome()
}

const waitLazyTick = async() => new Promise<void>(resolve => {
  setTimeout(resolve, 0)
})

export const setRecommendHome = (homeRecommendation: LX.Netease.HomeRecommendation | null) => {
  state.homeRecommendation = homeRecommendation
  emitRecommendHome()
}

export const setRecommendHomeScrollPosition = (position: number) => {
  state.scrollPosition = Math.max(0, position)
}

const loadRecommendHomeSection = async(section: LX.RecommendHomeSectionId, forceRefresh: boolean, requestId: number) => {
  setSectionLoading(section, true)
  try {
    const data = await getHomeRecommendation({ forceRefresh, sections: [section] })
    if (requestId != state.requestId) return
    state.loadedSections = {
      ...state.loadedSections,
      [section]: true,
    }
    mergeRecommendHome(getSectionPatch(section, data))
  } catch (err: any) {
    if (requestId != state.requestId) return
    state.homeRecommendationError ||= err.message ?? String(err)
  } finally {
    if (requestId == state.requestId) setSectionLoading(section, false)
  }
}

const loadRecommendHomeSectionsLazy = async(sections: LX.RecommendHomeSectionId[], forceRefresh: boolean, requestId: number) => {
  for (const section of sections) {
    if (requestId != state.requestId) return
    await waitLazyTick()
    await loadRecommendHomeSection(section, forceRefresh, requestId)
  }
}

export const loadRecommendHome = async(forceRefresh = false) => {
  if (state.isLoadingHomeRecommendation && !forceRefresh) return state.homeRecommendation
  const sections = forceRefresh
    ? [...RECOMMEND_HOME_SECTION_IDS]
    : RECOMMEND_HOME_SECTION_IDS.filter(section => !state.loadedSections[section])
  if (state.homeRecommendation && !sections.length && !forceRefresh) return state.homeRecommendation

  state.requestId += 1
  const requestId = state.requestId
  state.isLoadingHomeRecommendation = true
  state.homeRecommendationError = null
  state.loadedSections = forceRefresh ? {} : { ...state.loadedSections }
  if (!state.homeRecommendation) state.homeRecommendation = createEmptyHomeRecommendation()
  emitRecommendHome()

  void loadRecommendHomeSectionsLazy(sections, forceRefresh, requestId).finally(() => {
    if (requestId != state.requestId) return
    state.isLoadingHomeRecommendation = false
    if (!hasHomeContent(state.homeRecommendation) && state.homeRecommendationError == null) {
      state.homeRecommendationError = 'Failed to load recommendations'
    }
    emitRecommendHome()
  })

  return state.homeRecommendation
}

export default {
  loadRecommendHome,
  setRecommendHome,
  setRecommendHomeScrollPosition,
}
