# #42 복습 일정 DB와 학습 완료 시 자동 생성

- 이슈: [#42](https://github.com/sirloinbh/study-log/issues/42)
- 브랜치: `feat/42-review-schedule`
- 규칙: [복습 주기 규칙](../decisions/review-rules.md)

## 목적

학습 기록을 완료하면 복습 1회차가 자동으로 등록되게 한다. 2회차부터는 #43의 완료 처리가 만든다.

## 변경

- `database/migrations/012_reviews.sql`: 회차별 복습 표 `reviews`. 기록과 회차 조합이 유일하고, 기록을 지우면 함께 지워진다. `completed_on`이 완료 기록이고, `original_due_date`는 미뤄도 바뀌지 않는 지연 집계 기준이다(#46).
- `backend/src/reviews.ts`: 간격 1·2·4·7·16일의 예정일 계산과 1회차 동기화.
- `backend/src/study-logs.ts`: 등록과 수정을 트랜잭션으로 묶었다. 수정은 행을 잠그고 이전 상태와 비교한다.
- `backend/src/sql.ts`: 트랜잭션 함수 `inTransaction`을 `textbook-contents.ts`에서 옮겨 함께 쓴다. 롤백 실패 시 연결을 폐기하는 동작(#68)은 그대로이다.

## 동작

| 저장 전 → 저장 후        | 결과                                                   |
| ------------------------ | ------------------------------------------------------ |
| 없음·미완료 → 완료       | 1회차 생성. 이미 있으면 그대로                         |
| 완료 → 미완료            | 완료하지 않은 1회차 삭제. 완료한 회차가 있으면 그대로  |
| 완료 → 완료, 학습일 변경 | 완료하지 않은 1회차의 예정일과 원래 예정일을 다시 계산 |
| 완료 → 완료, 그 외 수정  | 변화 없음. 기능 도입 전 완료 기록에도 소급하지 않음    |

## 결정한 점

학습일은 9999-12-31까지 받으므로, 예정일이 그 뒤로 넘어가면 9999-12-31로 둔다. 이 경계를 처리하지 않으면 날짜가 `YYYY-MM-DD` 형식을 벗어나 저장에 실패한다.

## 테스트

- `backend/test/reviews.test.ts`: 회차 날짜, 늦은 완료, 월·연·윤일 경계, 마지막 날짜.
- `backend/test/reviews.integration.test.ts`: 생성, 중복 방지(동시 저장 포함), 완료 해제, 학습일 변경, 소급 없음, 삭제, 실패 시 롤백, 404.
- `backend/test/study-logs.test.ts`, `backend/test/study-log-reflection.test.ts`: 가짜 DB가 트랜잭션 연결을 쓰도록 고쳤다.

## 검증

- 마이그레이션 012를 테스트 DB에 두 번 적용했고 두 번 모두 성공했다.
- `TEST_DATABASE_URL`을 설정하고 `npm run check`의 포맷, 린트, 타입 검사, 테스트를 실행했다. 백엔드 276건, 프런트 52건, 스킬 4건이 모두 통과했다(건너뜀 0).
- `npm run build`와 `npm run standards:check`가 통과했다.
- 화면 변경이 없어 브라우저 확인은 하지 않았다.
