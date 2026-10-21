# #1 backend 하위 저장소 CI의 UI 테스트 실패 수정

- 이슈: [#1](https://github.com/sirloinbh/study-log/issues/1)
- 브랜치: `fix/1-backend-subrepo-ui-test`

## 문제

배포용 하위 저장소 `study-log-backend`는 `backend/` 폴더만 담고 있다. 그런데 `npm test`가 `test/app-ui.test.ts`에서 `../../frontend/src/main.tsx`를 읽어 UI 테스트 3건이 `ENOENT`로 실패했다(GitHub Actions `Backend checks`). 우산 저장소 CI는 정상이었다.

## 변경

- `backend/test/app-ui.test.ts`: `frontend/` 폴더가 없으면 UI 테스트를 `test.skip`으로 등록한다. 우산 저장소에서는 그대로 실행한다. (처음에는 `frontend/src/main.tsx` 기준이었고, 1차 리뷰에서 폴더 기준으로 바꿨다.)

## 검증

- 회귀 재현: `backend/`만 임시 폴더에 복사하고(같은 `node_modules` 연결) `tsx --test`를 실행했다.
  - 수정 전: 8 tests / **4 pass / 3 fail** / 1 skip(DB, URL 없음)
  - 수정 후: 8 tests / **4 pass / 0 fail** / 4 skip(UI 3 + DB 1)
- 우산 저장소 `npm run check`(전용 테스트 DB `study_log_test`): **exit 0**, 앱·DB 8 pass / 0 fail / **0 skip**(UI 테스트 실제 실행), 스킬 4 pass, 빌드 통과.
- 하위 저장소 반영은 PR 병합 후 `scripts/push-repositories.ps1`로 진행한다(요청 시).

## 자동 코드 리뷰 1차 (PR #2)

- 지적(low): `frontend/src/main.tsx` 존재 여부로 건너뛰면 우산 저장소에서 진입 파일 이름이 바뀔 때 UI 테스트가 실패 대신 조용히 skip된다.
  - 반영: 건너뛰기 조건을 `frontend/` 폴더 존재 여부로 바꿨다. 우산 저장소에서 `main.tsx`가 사라지면 `ENOENT`로 실패한다.
- 지적(low): backend 단독 배치는 수동 재현으로만 검증했다.
  - 반영하지 않음(기록만): 하위 저장소 `study-log-backend`의 CI가 동기화 후 지속 검증을 맡는다. 별도 이슈로 분리할 만한 범위는 아니다.
- 보완 후 검증(main 병합 반영 후):
  - 우산 저장소 `npm run check`: exit 0. 앱 테스트 8 tests / 7 pass / 0 fail / 1 skip(`TEST_DATABASE_URL` 미설정 DB 통합 테스트, 이번에는 DB 검증 미실행). UI 테스트 3건은 실행됨. 스킬 4 pass, 빌드 통과.
  - backend 단독 배치 재현(`backend/`만 임시 폴더로 복사, `node_modules` 연결): 8 tests / 4 pass / 0 fail / 4 skip(UI 3 + DB 1).

## 자동 코드 리뷰 2차 (PR #2)

- 1차 반영 확인: 폴더 기준 건너뛰기가 우산 저장소와 backend 단독 배치에서 의도대로 동작한다. 코드 결함은 없다.
- 지적(low): 위 "변경" 절이 이전 조건(`main.tsx`)을 그대로 적고 있었다.
  - 반영: 이 커밋에서 문서만 고쳤다.
- 리뷰는 최대 2회이므로 3차 리뷰는 하지 않는다. 코드 변경이 없으므로 직전 `npm run check` 결과(exit 0)가 그대로 유효하다. 최종 head의 CI로 병합 여부를 판단한다.
