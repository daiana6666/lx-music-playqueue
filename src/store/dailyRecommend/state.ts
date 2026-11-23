export interface InitState {
  dailyRecommendList: LX.Music.MusicInfoOnline[]
  isLoadingDailyRecommend: boolean
}

const state: InitState = {
  dailyRecommendList: [],
  isLoadingDailyRecommend: false,
}

export default state
