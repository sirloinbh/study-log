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
- `backend/test/helpers.ts`: 처음에는 `call(path, { method, body })`와 204 응답 지원을 추가했다. #10(PR #55)이 같은 변경에 `rawBody`·`contentType`을 더해 먼저 병합됐으므로, main 병합 후 이 PR의 순변경은 없다.

## 테스트

- `backend/test/textbooks.test.ts`(단위·가짜 풀): 제목 누락·공백만·길이 초과, 저자 형식, 판본 길이, 잘못된 ID가 DB 조회 전 한국어 400. 없는 교재의 조회·수정·삭제 404.
- `backend/test/textbooks.test.ts`(1차 리뷰 반영): 검증 사례를 POST·PUT 모두에 실행. 객체가 아닌 본문·깨진 JSON의 한국어 400, ID 7종(`0`, `-1`, `1.5`, `1e3`, `0x10`, `01`, 20자리)×GET·PUT·DELETE의 400.
- `backend/test/textbooks.integration.test.ts`(실제 DB): 생성(공백 제거), 저자·판본 기본값, 제목순 목록, 수정, 삭제 후 404. 전용 제목 접두어 행만 정리한다.

## 검증

| 명령                                              | 환경                             | 결과                                                                                                                                           |
| ------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` 1회차                             | 로컬, `TEST_DATABASE_URL` 미설정 | exit 1 — `textbooks.test.ts` 404 테스트가 `fetch failed: bad port`로 실패. 임의 포트가 fetch 금지 포트로 배정된 기존 helper 문제로, #56에 등록 |
| `npm run check` 2회차                             | 같은 환경                        | exit 0. backend tests 11, pass 9, fail 0, skipped 2(DB 통합), 스킬 4 pass, 빌드 통과                                                           |
| GitHub Actions `verify` (PR #57, run 39601039827) | Postgres 17 + 마이그레이션 적용  | pass — backend tests 11, pass 11, skipped 0 (DB 통합 실제 실행), 스킬 4 pass. `docker-build` pass                                              |

## origin/main 병합 (#10 PR #55 병합 후)

- PR #55 병합(d3561fc) 뒤 이 브랜치에 `origin/main`을 병합했다.
- 충돌: `backend/test/helpers.ts`. main 쪽이 이 브랜치 변경에 `rawBody`·`contentType` 옵션을 더한 상위 집합이라 main 쪽을 그대로 택했다.
- `backend/src/app.ts`: 자동 병합된 import와 라우터 등록 순서를 정리했다(`/api/study-logs` 다음 `/api/textbooks`). 동작 변화는 없다.
- 마이그레이션 번호는 `002`(#10)·`003`(#12)로 겹치지 않는다.
- 검증: 로컬 `npm run check` exit 0. backend tests 19, pass 16, fail 0, skipped 3(DB 통합), 스킬 4 pass, 빌드 통과.
- CI(48f2095, run 39687749020): `verify` pass. backend tests 19, pass 19, skipped 0(DB 통합 실제 실행), 스킬 4 pass.

## 자동 코드 리뷰 1차

별도 읽기 전용 리뷰 에이전트가 이슈 #12 완료 기준과 PR 전체 diff(48f2095 기준)를 검토했다. 마이그레이션 재실행 안전성, 삭제 정책, SQL 파라미터화, 라우터 등록 순서에는 결함이 없다.

- 지적(high): ID 검증이 `z.coerce.number()`라 `1e3`·`0x10`·`01`을 받았다. 20자리 숫자는 Postgres bigint 범위 오류로 500이 됐고, `9007199254740993`은 다른 행으로 바뀌었다.
  - 반영: #10과 같이 앞자리 0 없는 1~15자리 양의 정수만 받는다.
- 지적(medium): 배열 본문이 Zod 영어 메시지 `Expected object, received array`로 400 응답했다.
  - 반영: 객체 스키마에 한국어 메시지 "교재 내용을 JSON 객체로 보내세요"를 지정했다. `req.body ?? {}`를 없애 본문이 없는 요청도 같은 메시지를 받는다.
- 지적(low): 검증 테스트가 POST와 `/0`만 다뤘다.
  - 반영: `textbooks.test.ts`의 검증 사례를 POST와 PUT 모두에 실행한다.
  - 객체가 아닌 본문과 깨진 JSON 테스트를 추가했다.
  - ID 7종을 GET·PUT·DELETE에 보내는 테스트를 추가했다.
  - 수정 전 `textbooks.ts`로 실행하면 새 테스트 2개가 실패하는 것을 확인했다.
- 지적(low): 이 문서의 `helpers.ts` 설명이 순변경 없음과 맞지 않았고, 병합 후 CI 결과가 빠져 있었다. 반영: 위 변경·병합 절을 고쳤다.
- 분리: NUL 문자가 포함된 문자열이 500으로 응답하는 문제는 학습 기록에도 해당하는 공통 문제다. [#58](https://github.com/sirloinbh/study-log/issues/58)로 분리했다.
- 검증: 로컬 `npm run check` exit 0. backend tests 21, pass 18, fail 0, skipped 3(DB 통합), 스킬 4 pass, 빌드 통과.

## 자동 코드 리뷰 2차

별도 읽기 전용 리뷰 에이전트가 1차 반영(d61bee9), 추가 diff(48f2095..d61bee9), 최종 전체 diff를 다시 확인했다.

- 1차 지적 4건이 모두 정확하고 완전하게 반영됐다. 추가 diff에 회귀가 없다.
- 남은 보완점이 없다. 리뷰 최대 2회 정책에 따라 3차 리뷰는 하지 않는다.
- 비차단 메모: 테스트 절에 1차 반영 테스트가 빠져 있었다. 이 문서에 반영했다.
- 검증: CI(d61bee9, run 39688320714) `verify` pass. backend tests 21, pass 21, skipped 0(DB 통합 실제 실행). 최종 head의 CI 통과를 확인한 뒤 병합한다.

## 한계·후속

- 로컬에 PostgreSQL이 없어 DB 통합 테스트는 CI에서만 확인했다.
- 화면은 #21, 목차는 #13에서 추가한다. 테스트 포트 간헐 실패는 #56, 문자열 NUL 처리는 #58.
