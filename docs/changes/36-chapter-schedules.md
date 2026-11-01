# #36 교재 장 단위 일정 생성

- 이슈: [#36](https://github.com/sirloinbh/study-log/issues/36)
- 브랜치: `feat/36-chapter-schedules`
- 규칙: [학습 일정 규칙](../decisions/schedule-rules.md) 2장

## 목적

교재 목차를 기준으로 장별 학습 날짜를 배정한다. 학습 시간이 긴 날에 장을 더 많이 배정한다.

## 변경

- `database/migrations/016_schedule_chapters.sql`: `schedules.textbook_id`, `schedule_item_contents`.
- `backend/src/schedules.ts`:
  - `chapterDays`: 규칙 2장의 배분 계산. 소수 오차를 피하려고 정수로 비교한다.
  - `POST /api/schedules`의 `chapters`(교재, 첫 장, 마지막 장)를 받아 항목에 장을 배정한다.
  - 조회 응답에 교재와 항목별 장을 더했다.
- `backend/src/textbooks.ts`, `backend/src/textbook-contents.ts`: 삭제 거부 문구에 일정을 더했다.

## 구현 판단

- 일정이 연결된 교재와 장은 삭제를 막는다. 학습 기록과 같은 방식이고, 지우면 일정의 배정이 말없이 사라지기 때문이다. 일정을 지우면 다시 삭제할 수 있다.
- 범위는 공휴일 조회 전에 먼저 검사해, 잘못된 입력으로 API를 부르지 않는다. 트랜잭션 안에서 교재 행을 잠그고 다시 읽어, 그사이의 목차 변경도 반영한다.
- 이미 만든 일정의 배정은 목차가 바뀌어도 다시 계산하지 않는다.
