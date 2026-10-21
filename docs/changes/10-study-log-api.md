# #10 학습 기록 DB·API (시간 자동 계산)

- 이슈: [#10](https://github.com/sirloinbh/study-log/issues/10) (상위 #9)
- 브랜치: `feat/10-study-log-api`
- 마이그레이션 번호: `002` 예약·사용

## 목적

공부한 내용과 시간을 저장하는 핵심 데이터 구조를 만든다. 통계·복습·일정 기능이 이 기록을 기준으로 한다.

## 결정 (사용자 확인, [이슈 코멘트](https://github.com/sirloinbh/study-log/issues/10#issuecomment-6315555771))

- 자정을 넘긴 기록(23:00~01:00)은 시작한 날짜의 학습으로 보고 전체 시간(120분)을 그 날짜에 귀속한다.
- 입력은 학습일 + 시작·종료 시각(HH:MM). 종료가 시작보다 이르면 다음 날로 계산하고, 같으면 거부한다.

## 변경

- `database/migrations/002_study_logs.sql`: `study_logs`(학습일, 시작·종료 시각, 학습 시간(분) 1~1439, 메모, 상태 `planned`/`in_progress`/`done`/`stopped`). `IF NOT EXISTS`로 재실행 안전. 상태 값은 영문 코드라 한글 리터럴이 없다.
- `backend/src/study-logs.ts`: `studyMinutes()` 계산과 라우터.
  - `GET /api/study-logs?date=YYYY-MM-DD` — 그날 기록을 시작 시각 순으로. `date`가 없으면 최근 기록(`limit` 기본 20, 최대 100).
  - `GET /api/study-logs/:id`, `POST /api/study-logs`(201), `PUT /api/study-logs/:id`(전체 수정), `DELETE /api/study-logs/:id`(204). 없는 ID는 404 `학습 기록을 찾을 수 없습니다`.
  - Zod 검증 메시지는 모두 한국어(형식·존재하지 않는 날짜·HH:MM·시작=종료·상태·메모 10000자).
- `backend/src/app.ts`: `/api/study-logs` 라우터 등록.
- `backend/test/helpers.ts`: `call(path, { method, body })`로 GET 외 요청과 204 응답을 지원(기존 호출 방식 유지).

## 테스트

- `backend/test/study-logs.test.ts`(단위·가짜 풀): 시간 계산, 자정 넘김 120분·1분, 잘못된 입력 8종이 DB 조회 전에 한국어 400, 잘못된 조회 조건·ID, 없는 기록의 조회·수정·삭제 404.
- `backend/test/study-logs.integration.test.ts`(실제 DB): 생성(자정 넘김 120분, 기본 상태·메모), 날짜별 시간순 조회, 최근 목록, 수정 후 시간 재계산, 삭제 후 404. 전용 날짜(2099-01-15) 행만 정리한다.

## 검증

| 명령                                              | 환경                             | 결과                                                                                                  |
| ------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run check`                                   | 로컬, `TEST_DATABASE_URL` 미설정 | exit 0. backend tests 14, pass 12, fail 0, skipped 2(DB 통합 2건), 스킬 4 pass, 빌드 통과             |
| GitHub Actions `verify` (PR #55, run 39600302004) | Postgres 17 + 마이그레이션 적용  | pass — backend tests 14, pass 14, skipped 0 (DB 통합 2건 실제 실행), 스킬 4 pass. `docker-build` pass |

## 한계·후속

- 로컬에 Docker·PostgreSQL이 없어 DB 통합 테스트와 마이그레이션 적용은 CI에서만 확인했다.
- 테스트 helper가 fetch 금지 포트를 받으면 간헐적으로 실패하는 문제를 #12 작업 중 발견해 #56으로 등록했다.
- 화면은 #11, 교재·챕터 연결은 #14, 자가 평가 필드는 #15에서 추가한다.

## 자동 코드 리뷰 1차 (PR #55)

이 브랜치에 `origin/main`(#54, #2, #4)을 병합한 뒤 별도 읽기 전용 리뷰 에이전트가 PR 전체 diff를 검토했다. 시간 계산·자정 넘김·SQL 파라미터화·마이그레이션 SQL에는 결함이 없다. 아래 지적은 모두 이 PR에서 반영했고 분리한 이슈는 없다.

- 지적(medium): 본문이 없거나 배열인 POST·PUT 요청이 Zod 기본 영어 메시지("Required", "Expected object, received array")로 400 응답했다.
  - 반영: `studyLogInput` 객체 스키마에 한국어 `required_error`·`invalid_type_error`("학습 기록 내용을 JSON 객체로 보내세요")를 지정했다.
- 지적(low): ID 검증이 `z.coerce.number()`라 `1e3`·`0x10`·20자리 숫자를 받았다. 20자리 숫자는 Postgres bigint 범위 오류로 500이 됐다.
  - 반영: 앞자리 0 없는 1~15자리 양의 정수만 받도록 바꿨다.
- 지적(low): 깨진 JSON이나 256kb를 넘는 본문이 500 "서버 오류"로 응답했다.
  - 반영: `app.ts` 오류 처리에서 `entity.parse.failed`는 400 "요청 본문의 JSON 형식이 올바르지 않습니다", `entity.too.large`는 413 "요청 본문이 너무 큽니다"로 응답한다.
- 지적(low): "재실행해도 안전한 마이그레이션" 완료 기준을 실제로 검증하지 않았다.
  - 반영: CI가 `database/migrations/*.sql`을 두 번 연속 적용한다.
- 테스트(`backend/test/study-logs.test.ts`): 객체가 아닌 본문·깨진 JSON·JSON 문자열·초과 크기 본문 테스트와, 비정상 ID 7종 × 조회·수정·삭제 테스트를 추가했다. `backend/test/helpers.ts`에 원문 본문 전송용 `rawBody`를 추가했다.
  - 수정 전 소스로 실행하면 새 테스트 2건이 실패하고, 수정 후에는 통과한다.
- 보완 후 검증: 로컬 `npm run check` exit 0. backend tests 16, pass 14, fail 0, skipped 2(DB 통합 2건, `TEST_DATABASE_URL` 미설정). 스킬 4 pass, 빌드 통과. DB 통합 테스트와 마이그레이션 2회 적용은 CI에서 확인한다.
