# #51 교재별 진행률과 일정 달성률·준수율

- 이슈: [#51](https://github.com/sirloinbh/study-log/issues/51)
- 브랜치: `feat/51-textbook-stats`
- 규칙: [학습 일정 규칙](../decisions/schedule-rules.md) 7장

## 목적

교재와 일정 기준의 진행 상황을 통계로 보여 준다.

## 변경

- `database/migrations/018_schedule_item_original_date.sql`: `schedule_items.original_date`. 이미 있는 항목은 현재 날짜로 채운다.
- `backend/src/stats.ts`: `GET /api/stats/textbooks?textbookId=`. 교재별 완료 장과 전체 장, 일정 달성률과 준수율.
- `backend/src/schedules.ts`: 항목을 만들 때 원래 날짜를 저장한다.
- `frontend/src/textbook-stats.tsx`: 통계 화면의 "교재와 일정" 카드와 교재 필터.

## 구현 판단

이슈가 정의하지 않은 기준은 규칙 7장에 적었다.

- 완료 장은 그 장이나 아래 절에 완료한 학습 기록이 하나라도 있는 장이다. 일정의 완료 체크와 학습 기록은 연결되어 있지 않아, 교재의 진도는 학습 기록으로 센다.
- 달성률은 목표 시간 기준, 준수율은 항목 수 기준이다. 준수는 날짜를 지켰는지의 문제여서 시간으로 가중하지 않는다.
- 자동 밀기가 현재 날짜를 바꾸므로, 준수율을 세려면 원래 날짜가 필요해 컬럼을 더했다.
- 오늘 항목을 아직 안 끝낸 것은 늦은 것이 아니어서 세지 않는다. 복습 통계와 같은 방식이다.
