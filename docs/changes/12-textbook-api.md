# #12 교재 기본 정보 DB·API (제목·저자·판본)

- 이슈: [#12](https://github.com/sirloinbh/study-log/issues/12) (상위 #5)
- 브랜치: `feat/12-textbook-api`
- 마이그레이션 번호: `003` 예약·사용 (`002`는 #10)

## 목적

교재 기반 학습 관리의 기준 데이터를 만든다.

## 결정 (사용자 확인, [이슈 코멘트](https://github.com/sirloinbh/study-log/issues/12#issuecomment-6315556399))

- 연결된 학습 기록이 있는 교재는 삭제를 거부한다(409). 목차·연습문제·정답은 교재와 함께 삭제한다.
- 이 이슈 시점에는 연결 테이블이 없어 삭제가 그대로 성공한다. 거부는 #14(`ON DELETE RESTRICT`), 함께 삭제는 #13·#24·#26(`ON DELETE CASCADE`)에서 적용한다.

## 변경

- `database/migrations/003_textbooks.sql`: `textbooks`(제목 1~200자 필수, 저자·판본 기본값 `''`). `IF NOT EXISTS`로 재실행 안전.
- `backend/src/textbooks.ts`: `GET /api/textbooks`(제목순), `GET/PUT/DELETE /api/textbooks/:id`, `POST /api/textbooks`(201). 앞뒤 공백 제거, 한국어 검증 메시지, 없는 ID는 404 `교재를 찾을 수 없습니다`.
- `backend/src/app.ts`: `/api/textbooks` 라우터 등록.
- `backend/test/helpers.ts`: `call(path, { method, body })`와 204 응답 지원. #10(PR #55)과 같은 변경이라 병합 시 충돌하지 않는다.

## 테스트

- `backend/test/textbooks.test.ts`(단위·가짜 풀): 제목 누락·공백만·길이 초과, 저자 형식, 판본 길이, 잘못된 ID가 DB 조회 전 한국어 400. 없는 교재의 조회·수정·삭제 404.
- `backend/test/textbooks.integration.test.ts`(실제 DB): 생성(공백 제거), 저자·판본 기본값, 제목순 목록, 수정, 삭제 후 404. 전용 제목 접두어 행만 정리한다.

## 검증

| 명령                    | 환경                             | 결과                                                                                                                                           |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` 1회차   | 로컬, `TEST_DATABASE_URL` 미설정 | exit 1 — `textbooks.test.ts` 404 테스트가 `fetch failed: bad port`로 실패. 임의 포트가 fetch 금지 포트로 배정된 기존 helper 문제로, #56에 등록 |
| `npm run check` 2회차   | 같은 환경                        | exit 0. backend tests 11, pass 9, fail 0, skipped 2(DB 통합), 스킬 4 pass, 빌드 통과                                                           |
| GitHub Actions `verify` | Postgres 17 + 마이그레이션 적용  | PR에서 확인                                                                                                                                    |

## 한계·후속

- 로컬에 PostgreSQL이 없어 DB 통합 테스트는 CI에서만 확인한다.
- 화면은 #21, 목차는 #13에서 추가한다. 테스트 포트 간헐 실패는 #56.
