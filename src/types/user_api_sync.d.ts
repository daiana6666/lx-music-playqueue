declare namespace LX {
  namespace Sync {
    namespace UserApi {
      type SyncMode = 'merge' | 'overwrite'

      interface ApiInfo {
        id: string
        name: string
        description: string
        author: string
        homepage: string
        version: string
        allowShowUpdateAlert?: boolean
        script: string
        scriptEncoding: 'plain'
        remote?: LX.UserApi.GitHubRemote
      }

      interface Data {
        source: 'desktop'
        updatedAt: number
        apis: ApiInfo[]
      }

      interface Meta {
        md5: string
        updatedAt: number
        count: number
      }

      interface SyncActionBase<A> {
        action: A
      }
      interface SyncActionData<A, D> extends SyncActionBase<A> {
        data: D
      }
      type SyncAction<A, D = undefined> = D extends undefined ? SyncActionBase<A> : SyncActionData<A, D>
      type ActionList = SyncAction<'user_api_data_changed', Meta>
    }
  }
}
