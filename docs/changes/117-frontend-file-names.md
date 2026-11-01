# #117 프런트 파일 이름을 소문자-하이픈으로 바꾸기

- 이슈: [#117](https://github.com/sirloinbh/study-log/issues/117)
- 브랜치: `chore/117-frontend-file-names`

## 목적

다른 앱과 중앙 규칙처럼 `frontend/src`의 파일 이름을 소문자와 하이픈으로 맞춘다. 동작은 바뀌지 않는다.

## 변경

- 화면 파일 16개의 이름을 바꿨다. 이슈 등록 때는 15개였고, #52에서 추가한 `ReviewRateChart.tsx`를 함께 바꿨다. 컴포넌트 이름은 그대로이다.
- 화면 `StudyLogs.tsx`가 `study-logs.tsx`가 되면서 로직 파일 `study-logs.ts`와 import 경로가 겹치므로, 로직 파일을 `study-logs-data.ts`로 바꿨다. 이름이 겹치는 파일은 이것뿐이다. `exercise.ts`와 `exercises.tsx`처럼 단수와 복수로 다른 파일은 그대로 둔다.
- `frontend/src`와 `backend/test`의 import를 고쳤다. 지난 변경 기록(`docs/changes`, `docs/daily`)의 옛 이름은 당시 기록이므로 고치지 않았다.

- `frontend/src/stats-review.test.tsx`: 코드를 바꾼 직후 첫 전체 검사에서 제한 시간 5초를 넘겨 실패하는 일이 여러 번 있었다(다시 돌리면 통과). 폴링마다 역할 조회를 하지 않게 바꾸고 이 파일의 제한 시간을 20초로 늘렸다. 원인은 역할 조회의 비용으로 추정하며, 정확히 측정하지는 않았다.

## 검증

`TEST_DATABASE_URL`을 설정한 `npm run check`가 두 번 연속 통과했다. 백엔드 338건, 프런트 123건, 스킬 4건이 통과했다. 건너뜀은 프런트 2건으로, 중앙 표준에서 온 다크 전용 앱 테스트이다. `npm run standards:check`의 파일 이름 경고가 없어졌다.

headless Chrome으로 PC 1440×900과 모바일 390×844에서 통계와 학습 기록 화면 35개 항목을 확인했다. 다른 화면은 자동 테스트와 빌드로만 확인했다.

파일 이름의 대소문자는 Windows에서 구분되지 않으므로, 대소문자를 구분하는 Linux의 CI가 import를 실제로 확인한다.
