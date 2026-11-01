# #38 일정 진행률 조회와 표시

- 이슈: [#38](https://github.com/sirloinbh/study-log/issues/38)
- 브랜치: `feat/38-schedule-progress`
- 규칙: [학습 일정 규칙](../decisions/schedule-rules.md) 5장

## 목적

계획 대비 얼마나 진행했는지 보여 준다.

## 변경

- `backend/src/schedules.ts`: 일정 요약에 `completedCount`, `completedMinutes`, `progressPercent`를 더했다.
- `frontend/src/schedules.tsx`, `frontend/src/style.css`: 날짜별 일정의 진행률 막대와 수치, 목록의 진행률.
- `docs/decisions/schedule-rules.md`: 5장 진행률을 더하고, 생성 입력과 수정을 6장으로 옮겼다.

## 구현 판단

이슈는 기준을 착수할 때 정하라고 했다. 완료한 항목의 목표 시간 ÷ 전체 목표 시간으로 정했다.

- 일정과 학습 기록은 연결되어 있지 않아, 실제로 공부한 시간은 기준이 될 수 없다.
- 항목 수가 아니라 시간을 쓰는 것은 일정이 시간 비례로 짜이기 때문이다. 항목 수는 함께 보여 준다.
- 백분율은 내림해, 전부 끝내야 100%이다.

## 확인하지 못한 것

API 키가 없어(#129) 실제 공휴일 API로 일정을 만들어 보지 못했다. 브라우저 확인은 테스트 DB에 2026년 공휴일을 임시로 넣어 진행했고, 끝난 뒤 지웠다.

## 검증

`TEST_DATABASE_URL`을 설정한 `npm run check`가 통과했다. 백엔드 414건, 프런트 194건, 스킬 4건이 통과했다. 건너뜀은 프런트 2건으로, 중앙 표준에서 온 다크 전용 앱 테스트이다. 스키마 변경은 없다.

headless Chrome으로 PC 1440×900과 모바일 390×844에서 확인했다. 40개 항목이 통과했고 스크린샷을 직접 봤다. 처음 0%, 15시간 중 2시간 완료하면 13%(내림), 막대 폭, 목록의 진행률을 봤다.

## 테스트

- `backend/test/schedule-adjust.integration.test.ts`: 목표 시간 기준 계산, 이동해도 그대로, 완료 취소로 내려감, 전부 끝내야 100%, 내림, 목록과 상세가 같음.
- `frontend/src/schedules.test.tsx`: 막대와 수치, 목록의 진행률, 완료하면 올라감.
