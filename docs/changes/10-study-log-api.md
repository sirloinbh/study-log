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

| 명령                    | 환경                             | 결과                                                                                      |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run check`         | 로컬, `TEST_DATABASE_URL` 미설정 | exit 0. backend tests 14, pass 12, fail 0, skipped 2(DB 통합 2건), 스킬 4 pass, 빌드 통과 |
| GitHub Actions `verify` | Postgres 17 + 마이그레이션 적용  | PR에서 확인(DB 통합 테스트 실제 실행)                                                     |

## 한계·후속

- 로컬에 Docker·PostgreSQL이 없어 DB 통합 테스트와 마이그레이션 적용은 CI에서만 확인한다.
- 화면은 #11, 교재·챕터 연결은 #14, 자가 평가 필드는 #15에서 추가한다.
