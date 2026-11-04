# #160 프런트 테스트의 간헐적 시간 초과 원인 찾기

- 이슈: [#160](https://github.com/sirloinbh/study-log/issues/160)
- 브랜치: `chore/160-flaky-frontend-tests`

## 목적

`frontend/src/stats-review.test.tsx`와 `frontend/src/app.test.tsx`가 전체 검사에서 가끔 실패하고 다시 돌리면 통과했다(#34, #36, #117, #175, #179 기록). 원인을 재고, 원인에 맞게 고친다.

## 원인 측정

- 이 PC(논리 코어 8개)에서 두 파일만 실행하면 오래 걸리는 테스트도 짧다. `picking a period asks for its reviews too` 0.66초, `saving a log and completing a review update the badge, and the pages stay mounted` 1.5초, `each page has its own address and is marked in the main menu` 1.5초.
- 프런트 테스트 전체(32개 파일)를 한 번 돌리면 같은 테스트가 3.5초, 3.7초, 3.4초가 된다. vitest가 jsdom 워커를 여러 개 동시에 돌리기 때문이다.
- 다른 작업이 PC를 함께 쓰는 상황을 만들려고 전체 실행 3개를 동시에 돌렸다. **3회 모두 `app.test.tsx`의 `saving a log ...`가 `Unable to find role="link" and name "오늘 복습 2개"`로 실패했다**(#175에서 본 실패와 같다). 기록 저장 뒤 배지가 다시 세어지기까지 단계마다 1초를 넘겼는데, 이 파일은 `findBy`의 기본 대기 1초를 그대로 쓰고 있었다. 같은 실행에서 `each page ...`는 7.9~9.5초 걸려 테스트 제한 15초에 가까웠다.
- `stats-review.test.tsx`의 `picking a period ...`를 단계별로 쟀다. 혼자 실행하면 단계마다 0.01~0.12초였다. 전체 실행 2개와 함께 돌리면 같은 단계가 0.1초에서 3.6초까지 들쭉날쭉했다(`findByText('75%')` 0.1초와 3.6초, `getByRole('group')` 0.09초와 1.2초). 특정 조회나 차트 로딩이 느린 것이 아니라, CPU가 모자라 아무 단계나 멈추는 것이다. `recharts`는 이 파일에서 이미 모의로 바꿔 두었다(#52).
- 결론: 테스트 코드나 화면의 결함이 아니다. PC가 바쁘면 단계가 5~25배 느려지는데, 일부 파일은 기본 대기 1초와 기본 제한 15초를 그대로 써서 그 안에 끝나지 못했다. 다른 화면 테스트 5개 파일은 파일마다 대기 10초, 제한 20초로 늘려 두어 덜 실패했다.

## 변경

- `frontend/src/test/setup.ts`: `configure({ asyncUtilTimeout: 10_000 })`로 모든 테스트의 `findBy`·`waitFor` 대기를 10초로 늘렸다. 기다리던 요소가 나오면 바로 넘어가므로 통과하는 테스트는 느려지지 않는다. 실패하는 테스트만 더 늦게 실패하고, 테스트 제한 시간은 그대로 적용된다. 일부러 대기가 끝나기를 기다리는 테스트(`rejects`로 `findBy` 실패를 확인하는 등)는 없다.
- 파일마다 두었던 같은 설정을 지웠다: `schedules.test.tsx`, `screens.test.tsx`, `stats-review.test.tsx`, `stats-textbook-filter.test.tsx`, `textbook-stats.test.tsx`. 테스트 제한 20초는 그대로 둔다. `screens.test.tsx`의 주석은 대기 설정이 `setup.ts`로 옮겨졌다고 고쳤다.
- `frontend/src/app.test.tsx`: 앱 전체를 그리고 한 테스트에서 일곱 화면을 여는 파일이라 다른 화면 테스트처럼 제한을 20초로 늘렸다. `frontend/vitest.config.ts`(제한 15초)는 중앙 관리 파일이라 고치지 않았다.
- `docs/next-steps/README.md`: 끝난 #160을 후보에서 지웠다.

## 검증

- 고치기 전: 전체 실행 3개 동시 → 3회 모두 실패 1건(`app.test.tsx`의 `saving a log ...`, 위 원인 측정).
- 고친 뒤, vitest 캐시(`frontend/node_modules/.vite`)를 지우고 같은 조건(전체 실행 3개 동시) → 3회 모두 통과(파일 32개, 통과 214, 건너뜀 2, 실패 0). 오래 걸린 테스트: `saving a log ...` 8.4~11.7초, `each page ...` 10.4~11.1초, `picking a period ...` 0.8~17.9초.
- 고친 뒤, 전체 실행 2개와 단계별 측정 파일을 동시에 실행 → 전체 실행 2회 모두 통과(통과 214, 건너뜀 2).
- `npm run check`(캐시를 지운 뒤, 문서를 쓰기 전): 통과(exit 0). 백엔드 323개 중 통과 290, 실패 0, 건너뜀 33. 프런트 파일 32개, 통과 214, 건너뜀 2(중앙 표준의 다크 전용 앱 테스트). 스킬 테스트 4개 통과. 문서를 쓴 뒤 `npm run format:check` 통과.
- 백엔드에서 건너뛴 33개는 DB 통합 테스트다. `TEST_DATABASE_URL`이 없어 실행하지 못했다(#177, #178). 이번 변경은 프런트 테스트 설정만 바꾼다.

## 제한·후속 작업

- 전체 실행 3개를 동시에 돌린 극단적인 부하에서 `picking a period ...`가 17.9초까지 걸렸다(제한 20초). 그보다 더 바쁘면 여전히 실패할 수 있다. 부하 자체를 줄이려면 vitest 워커 수를 줄여야 하는데, 이는 중앙 관리 파일 `frontend/vitest.config.ts`의 일이다. 지금은 일반 전체 검사에서 이 테스트가 4초 안팎이라 여유가 크다.
- 측정에 쓴 임시 테스트 파일(`frontend/src/zz-timing.test.tsx`)은 지웠다.
