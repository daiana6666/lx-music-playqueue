# Mobile User API Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the mobile side of desktop-authoritative custom source sync.

**Architecture:** Add a `userApi` sync module beside list/dislike/party. Keep data conversion and overwrite rules in a pure helper for tests, and let `utils/data.ts` handle AsyncStorage writes and in-memory user API list refresh.

**Tech Stack:** React Native, TypeScript declarations, message2call sync RPC, Node `node:test` logic tests.

---

### Task 1: Pure User API Sync Rules

**Files:**
- Create: `src/core/userApiSync/helpers.js`
- Create: `test/core/userApiSync/helpers.test.cjs`

- [ ] Write failing tests for desktop overwrite preserving mobile-only APIs, clearing only desktop-managed APIs, rejecting non-desktop payloads, rejecting non-plain scripts, and excluding `updatedAt` from stable hash input.
- [ ] Implement helper functions: `normalizeSyncApiInfo`, `buildUserApiOverwrite`, `getUserApiSyncComparableData`, `validateUserApiSyncData`.
- [ ] Run `node --test test/core/userApiSync/helpers.test.cjs`.

### Task 2: Mobile Storage Integration

**Files:**
- Modify: `src/utils/data.ts`
- Modify: `src/core/userApi.ts`
- Modify: `src/types/user_api.d.ts`

- [ ] Add `remoteId` and `remoteSource` metadata to `LX.UserApi.UserApiInfo`.
- [ ] Add storage helpers to overwrite only `remoteSource: "desktop"` APIs, remove stale desktop script keys, and save new scripts.
- [ ] Update store state after sync overwrite via core userApi facade.

### Task 3: Sync Module Wiring

**Files:**
- Create: `src/types/user_api_sync.d.ts`
- Create: `src/plugins/sync/userApiEvent.ts`
- Create: `src/plugins/sync/client/modules/userApi/index.ts`
- Create: `src/plugins/sync/client/modules/userApi/handler.ts`
- Modify: `src/plugins/sync/client/modules/index.ts`
- Modify: `src/plugins/sync/client/sync/handler.ts`
- Modify: `src/plugins/sync/client/client.ts`
- Modify: `src/types/sync.d.ts`
- Modify: `src/types/sync_common.d.ts`

- [ ] Add sync payload/action/RPC types.
- [ ] Add `userApi` feature version 1 and advertise `{ skipSnapshot: true }`.
- [ ] Add queue and readiness fields to the client socket.
- [ ] Implement RPC handlers for md5, get data, set data, realtime overwrite action, and finished.

### Task 4: Verification

**Files:**
- Existing files only

- [ ] Run `npm run test:logic`.
- [ ] Run `npx tsc --noEmit` if feasible.
- [ ] Inspect changed files with `git diff -- src/core/userApiSync src/plugins/sync src/types src/utils/data.ts src/core/userApi.ts`.
