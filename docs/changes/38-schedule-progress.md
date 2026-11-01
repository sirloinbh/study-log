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
