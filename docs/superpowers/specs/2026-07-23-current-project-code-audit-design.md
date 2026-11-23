# Current Project Code Audit Design

Date: 2026-07-23
Project: `D:\projects\lx-music-mobile`

## Goal

Review the complete current project, including committed code and every modified or untracked source and test file in the working tree. Reproduce confirmed defects, fix their root causes, add regression coverage, and preserve unrelated user changes.

## Current Baseline

The repository is on `master`, four commits ahead of `origin/master`. The working tree contains 67 modified and 54 untracked source or test files. The changes implement or extend recommendation, Netease account access, playback fallback, private FM, recent play, listening statistics, WebDAV, party support, and user API synchronization.

The initial read-only checks produced these results:

- `npm run test:logic`: 32 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with one dependency-data age warning.
- `git diff --check`: no whitespace errors; Git reported expected LF-to-CRLF conversion warnings on Windows.
- The repository contains 652 JavaScript or TypeScript source files and 6 test files.

These checks establish a baseline. They do not prove that the new cross-module behavior is correct.

## Considered Approaches

### Risk-first, evidence-driven review

Run repository-wide automated checks, review every changed source and test file, and trace each changed boundary into the unchanged code that consumes it. Prioritize state, persistence, playback, synchronization, authentication, network, and navigation paths. Reproduce each suspected behavior before changing code.

This is the selected approach because it covers the current work without spending most review time on generated assets, vendored code, and stable leaf modules.

### File-by-file review

Read all 652 source files in sequence. This offers broad visual coverage but gives equal attention to low-risk and high-risk code, while providing little evidence about runtime behavior.

### Diff-only review

Review only modified and untracked files. This is faster but misses contract mismatches with unchanged callers, persistence formats, event handlers, and native boundaries.

## Scope

The audit combines three forms of coverage:

1. Run automated checks across the repository.
2. Deeply review all 121 changed or untracked source and test files.
3. Trace affected contracts through unchanged high-risk dependencies and callers.

The audit covers functional correctness, crashes, data loss, state consistency, asynchronous races, lifecycle cleanup, error handling, security, performance, compatibility, and missing regression coverage.

Generated bundles, image assets, minified files, and vendored libraries receive build, manifest, and integration checks. They do not receive manual line-by-line review unless evidence points to a defect inside them.

## Review Streams

### Account And Recommendation

Review Netease request construction, cookie handling, login polling, account expiry, response normalization, cache keys, section refresh behavior, virtual playlist IDs, and public versus authenticated recommendation behavior.

### Playback And Queue

Review project-source matching, direct URL fallback, stale asynchronous results, queue identity, private FM refill and exit behavior, preload behavior, recent-play updates, listening-time accounting, and player event cleanup.

### Lists And Persistence

Review list identity, loved-list synchronization, recent-play limits, settings defaults and migration, malformed stored data, write ordering, storage cleanup, and compatibility with existing user data.

### Synchronization, WebDAV, And Party

Review payload validation, path containment, snapshot overwrite rules, feature negotiation, queued events, reconnect behavior, failure propagation, and preservation of mobile-only data.

### Navigation And UI

Review route and pager indexes, portrait and horizontal navigation parity, modal lifecycle, loading and empty states, translated labels, list keys, rendering cost, and controls that can trigger duplicate requests or stale updates.

### Configuration, Types, And Build Boundaries

Review settings declarations, runtime defaults, event contracts, JavaScript and TypeScript boundary assumptions, package changes, Android configuration, generated bundle consistency, and dependency vulnerabilities.

## Defect Classification

- `P0`: data loss, security vulnerability, or reproducible crash. Fix immediately.
- `P1`: broken core workflow, corrupt state, race, resource leak, or material compatibility problem. Fix in this audit.
- `P2`: edge-case, performance, or maintainability defect with a concrete behavioral impact. Fix when the change stays focused and regression coverage can prove it.
- `P3`: style preference or refactor without an observable defect. Record it without changing production code.

## Root Cause And Change Policy

For each suspected defect:

1. Record the failing path and observable result.
2. Trace the value or event to its source.
3. Compare the broken path with a working repository pattern.
4. State one root-cause hypothesis and test it with the smallest useful reproduction.
5. Add a failing regression test before editing production behavior.
6. Apply one focused fix and run the targeted test.

The audit will preserve current product behavior unless a confirmed defect requires a change. It will not perform unrelated refactors, broad dependency upgrades, hand edits to generated bundles, or cleanup based only on style preference.

If an external service cannot provide a stable reproduction, the fix will validate its boundary, report a useful error, and retain diagnostic context. The code will not treat an uncertain external response as success.

## Testing Strategy

Pure logic defects use the existing Node test runner. Tests should exercise real helper behavior and avoid mock-only assertions. Cross-module defects should receive the smallest integration-style test that can run outside React Native.

For UI or native behavior without an established component harness, extract only reusable decision logic that has an independent purpose. Verify the remaining integration through TypeScript, ESLint, Android bundle or APK builds, and device smoke testing when a device or emulator is available.

Each behavior fix must demonstrate the red-green cycle: the regression test fails against the defective implementation and passes after the fix. Configuration-only or generated-file changes require an explicit user-approved exception from this rule.

## Verification Gates

The final verification will run:

- Targeted regression tests after each fix.
- `npm run test:logic`.
- `npx tsc --noEmit`.
- `npm run lint`.
- `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org`.
- `npm run build-test`.
- Android debug APK build when the local Android toolchain permits it.
- Device or emulator smoke checks when an Android target is available.
- `git diff --check` and a final diff review.

Baseline warnings may remain when they come from external tooling, but the audit will not introduce new warnings. Any unavailable check or environmental failure will appear in the final report with its exact cause.

## Deliverables

The completed audit will provide:

- Focused production fixes for confirmed `P0`, `P1`, and eligible `P2` defects.
- Regression tests for changed behavior.
- File and line references for each finding.
- Root-cause explanations and verification evidence.
- A list of unresolved risks, untestable device paths, and intentionally deferred `P3` items.
- Confirmation that unrelated user changes remain intact.

## Non-goals

This audit will not redesign the product, replace the existing state architecture, migrate the test framework, port desktop-only Electron behavior, or upgrade the React Native stack. A defect that requires one of those changes will be reported with evidence and separated into a future design.
