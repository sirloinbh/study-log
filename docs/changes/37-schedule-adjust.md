# #37 일정 완료 체크와 지연·앞당김 조정

- 이슈: [#37](https://github.com/sirloinbh/study-log/issues/37)
- 브랜치: `feat/37-schedule-adjust`
- 규칙: [학습 일정 규칙](../decisions/schedule-rules.md) 4장

## 목적

진행 상황에 맞춰 일정을 고친다. 밀린 일정은 조회할 때 자동으로 민다.

## 변경

- `database/migrations/017_schedule_item_completion.sql`: `schedule_items.completed_on`.
- `backend/src/schedules.ts`:
  - `moveOverdue`, `catchUp`: 오늘보다 앞선 미완료 항목이 있으면 미완료 항목 전체를 같은 일수만큼 민다. 목록과 상세를 조회할 때 일정별 트랜잭션으로 적용한다.
  - `POST /api/schedules/:id/items/:itemId/complete`, `.../reopen`: 완료와 완료 취소.
  - `PUT /api/schedules/:id/items/:itemId/date`: 항목 이동. `withLater`면 그 날짜 이후의 미완료 항목도 함께 옮긴다.
  - 응답에 `currentEndDate`, `delayDays`, 항목의 `completedOn`을 더했다.

## 구현 판단

- 밀 항목이 없으면 잠금과 쓰기 없이 읽는다. 밀 항목이 있을 때만 일정 행을 잠그고 다시 계산해, 동시에 읽어도 한 번만 민다.
- 항목 변경은 일정 행을 잠근 뒤 먼저 밀고 나서 적용한다. 화면에 보이는 날짜를 기준으로 동작하기 위해서이다.
- 항목을 옮길 수 있는 날짜는 오늘부터 730일 안이다(규칙 4장).
