export interface InitState {
  homeRecommendation: LX.Netease.HomeRecommendation | null
  isLoadingHomeRecommendation: boolean
  loadingSections: Partial<Record<LX.RecommendHomeSectionId, boolean>>
  loadedSections: Partial<Record<LX.RecommendHomeSectionId, boolean>>
  homeRecommendationError: string | null
  scrollPosition: number
  requestId: number
}

const state: InitState = {
  homeRecommendation: null,
  isLoadingHomeRecommendation: false,
  loadingSections: {},
  loadedSections: {},
  homeRecommendationError: null,
  scrollPosition: 0,
  requestId: 0,
}

export default state
