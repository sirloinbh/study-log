# #1 backend 하위 저장소 CI의 UI 테스트 실패 수정

- 이슈: [#1](https://github.com/sirloinbh/study-log/issues/1)
- 브랜치: `fix/1-backend-subrepo-ui-test`

## 문제

배포용 하위 저장소 `study-log-backend`는 `backend/` 폴더만 담고 있다. 그런데 `npm test`가 `test/app-ui.test.ts`에서 `../../frontend/src/main.tsx`를 읽어 UI 테스트 3건이 `ENOENT`로 실패했다(GitHub Actions `Backend checks`). 우산 저장소 CI는 정상이었다.

## 변경

- `backend/test/app-ui.test.ts`: `frontend/src/main.tsx`가 없으면 UI 테스트를 `test.skip`으로 등록한다. 우산 저장소에서는 그대로 실행한다.

## 검증

- 회귀 재현: `backend/`만 임시 폴더에 복사하고(같은 `node_modules` 연결) `tsx --test`를 실행했다.
  - 수정 전: 8 tests / **4 pass / 3 fail** / 1 skip(DB, URL 없음)
  - 수정 후: 8 tests / **4 pass / 0 fail** / 4 skip(UI 3 + DB 1)
- 우산 저장소 `npm run check`(전용 테스트 DB `study_log_test`): **exit 0**, 앱·DB 8 pass / 0 fail / **0 skip**(UI 테스트 실제 실행), 스킬 4 pass, 빌드 통과.
- 하위 저장소 반영은 PR 병합 후 `scripts/push-repositories.ps1`로 진행한다(요청 시).
