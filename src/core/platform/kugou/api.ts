import { NativeModules } from 'react-native'
import { md5 } from '../crypto'
import { getDeviceProfile } from '../credentials'
import { platformFetch } from '../http'

// Endpoint and signature profiles ported from the desktop's pinned kugoumusicapi.
const appid = 1005
const clientver = 20489
const androidSalt = 'OIlwieks28dk2k092lksi2UIkp'
const webSalt = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
type Params = Record<string, any>
interface RequestOptions { url: string, baseURL?: string, method?: string, params?: Params, data?: Params, cookie?: string | Params, router?: string, web?: boolean, tid?: string }
export const parseCookie = (value: string | Params | undefined): Params => {
  if (typeof value == 'object') return value
  const result: Params = {}
  for (const part of (value ?? '').split(';')) {
    const split = part.indexOf('=')
    if (split > 0) result[part.slice(0, split).trim()] = part.slice(split + 1).trim()
  }
  return result
}
export const signKugouParams = (params: Params, body: string, web = false): string => {
  const salt = web ? webSalt : androidSalt
  const text = Object.keys(params).sort().map(key => `${key}=${typeof params[key] == 'object' ? JSON.stringify(params[key]) : String(params[key])}`).join('')
  return md5(`${salt}${text}${body}${salt}`)
}
const signKey = (time: number | string) => md5(`${appid}${androidSalt}${clientver}${time}`)

export const createKugouApiClient = ({ request = platformFetch, getDevice = getDeviceProfile }: { request?: typeof fetch, getDevice?: typeof getDeviceProfile } = {}) => {
  const call = async(options: RequestOptions) => {
    const cookie = { ...parseCookie(options.cookie), ...await getDevice() }
    const clienttime = Math.floor(Date.now() / 1000)
    const params: Params = {
      dfid: cookie.dfid || '-',
      mid: cookie.KUGOU_API_MID,
      uuid: '-',
      appid,
      clientver,
      clienttime,
      ...(cookie.token ? { token: cookie.token } : {}),
      ...(cookie.userid ? { userid: cookie.userid } : {}),
      ...options.params,
    }
    const body = options.data ? JSON.stringify(options.data) : ''
    params.signature = signKugouParams(params, body, options.web)
    const url = new URL(options.url, options.baseURL ?? 'https://gateway.kugou.com')
    for (const [name, value] of Object.entries(params)) if (value != null) url.searchParams.set(name, String(value))
    const headers: Record<string, string> = {
      'User-Agent': 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi',
      dfid: params.dfid,
      mid: String(cookie.KUGOU_API_MID),
      clienttime: String(clienttime),
      'kg-rc': '1',
      'kg-thash': '5d816a0',
      'kg-rec': '1',
      'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
      'Content-Type': 'application/json',
    }
    if (options.router) headers['x-router'] = options.router
    if (options.tid) headers['kg-tid'] = options.tid
    const response = await request(url.toString(), { method: options.method ?? (body ? 'POST' : 'GET'), headers, ...(body ? { body } : {}) })
    if (!response.ok) throw new Error(`酷狗请求失败（HTTP ${response.status}）`)
    return { status: response.status, body: await response.json(), cookie: [] as string[] }
  }
  const withDevice = async(params: Params, build: (cookie: Params) => RequestOptions) => call(build({ ...parseCookie(params.cookie as string | Params | undefined), ...await getDevice() }))
  return {
    loginQrKey: async(params: Params = {}) => call({ url: '/v2/qrcode', baseURL: 'https://login-user.kugou.com', web: true, params: { appid: 1001, type: 1, plat: 4, qrcode_txt: `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=${appid}&`, srcappid: 2919 }, cookie: params.cookie }),
    loginQrCheck: async(params: Params) => withDevice(params, cookie => ({ url: '/v2/get_userinfo_qrcode', baseURL: 'https://login-user.kugou.com', web: true, params: { plat: 4, appid, srcappid: 2919, qrcode: params.key, dev: cookie.KUGOU_API_DEV }, cookie })),
    userInfo: async(params: Params = {}) => withDevice(params, cookie => {
      const time = Math.floor(Date.now() / 1000)
      return { url: '/v3/get_my_info', router: 'usercenter.kugou.com', params: { plat: 1 }, data: { visit_time: time, usertype: 1, p: String(NativeModules.PlatformCredentials.kugouRsa(JSON.stringify({ token: cookie.token ?? '', clienttime: time }))).toUpperCase(), userid: Number(cookie.userid || 0) }, cookie }
    }),
    userPlaylist: async(params: Params = {}) => withDevice(params, cookie => ({ url: '/v7/get_all_list', router: 'cloudlist.service.kugou.com', params: { plat: 1, userid: Number(cookie.userid || 0), token: cookie.token || '' }, data: { userid: cookie.userid || 0, token: cookie.token || '', total_ver: 979, type: 2, page: params.page || 1, pagesize: params.pagesize || 100 }, cookie })),
    topPlaylist: async(params: Params = {}) => withDevice(params, cookie => {
      const time = (Date.now() / 1000).toFixed(0)
      return { url: '/v2/special_recommend', router: 'specialrec.service.kugou.com', cookie, data: { appid, mid: cookie.KUGOU_API_MID, clientver, platform: 'android', clienttime: time, userid: cookie.userid || 0, module_id: 1, page: params.page || 1, pagesize: params.pagesize || 30, key: signKey(time), special_recommend: { withtag: 1, withsong: 1, sort: 1, ugc: 1, is_selected: 0, withrecommend: 1, area_code: 1, categoryid: 0 }, req_multi: 1, retrun_min: 5, return_special_falg: 1 } }
    }),
    rankList: async(params: Params = {}) => call({ url: '/ocean/v6/rank/list', params: { plat: 2, withsong: 1, parentid: 0 }, cookie: params.cookie }),
    playlistTracks: async(params: Params) => call({ url: '/pubsongs/v2/get_other_list_file_nofilt', params: { area_code: 1, begin_idx: (Number(params.page || 1) - 1) * 100, plat: 1, type: 1, mode: 1, personal_switch: 1, extend_fields: 'abtags,hot_cmt,popularization', pagesize: 100, global_collection_id: params.id }, cookie: params.cookie }),
    rankAudio: async(params: Params) => call({ url: '/openapi/kmr/v2/rank/audio', tid: '369', data: { show_portrait_mv: 1, show_type_total: 1, filter_original_remarks: 1, area_code: 1, pagesize: params.pagesize || 30, rank_cid: 0, type: 1, page: params.page || 1, rank_id: params.rankid }, cookie: params.cookie }),
    recommendSongs: async(params: Params = {}) => withDevice(params, cookie => ({ url: '/everyday_song_recommend', router: 'everydayrec.service.kugou.com', data: { platform: 'android', userid: cookie.userid || '0' }, cookie })),
    everydayStyleRecommend: async(params: Params = {}) => call({ url: '/everydayrec.service/everyday_style_recommend', params: { tagids: params.tagids ?? '' }, data: {}, cookie: params.cookie }),
    fmRecommend: async(params: Params = {}) => withDevice(params, cookie => {
      const time = Date.now()
      return { url: '/v1/rcmd_list', router: 'fm.service.kugou.com', data: { appid, clientver, clienttime: time, mid: cookie.KUGOU_API_MID, key: signKey(time), rcmdsongcount: 1, level: 0, area_code: 1, get_tracker: 1, uid: 0 }, cookie }
    }),
    fmSongs: async(params: Params) => withDevice(params, cookie => {
      const time = Date.now()
      return { url: '/v1/app_song_list_offset', router: 'fm.service.kugou.com', data: { appid, area_code: 1, clienttime: time, clientver, data: String(params.fmid || '').split(',').map(fmid => ({ fmid, fmtype: params.type || 2, offset: params.offset ?? -1, size: params.size || 20, singername: '' })), get_tracker: 1, key: signKey(time), mid: cookie.KUGOU_API_MID, uid: cookie.userid }, cookie }
    }),
  }
}
export type KugouApi = ReturnType<typeof createKugouApiClient>
