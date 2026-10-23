# #68 롤백 실패 시 DB 연결을 풀에서 폐기

- 이슈: [#68](https://github.com/sirloinbh/study-log/issues/68) (PR #66 리뷰에서 분리)
- 브랜치: `fix/68-rollback-release`

## 문제

트랜잭션 오류 처리에서 `ROLLBACK`까지 실패하면(연결 끊김 등) 그 오류를 무시하고 `client.release()`를 인자 없이 호출했다. 그러면 망가진 연결이 풀로 돌아가 다음 요청이 그 연결을 받아 실패할 수 있었다.

## 점검

- 백엔드의 `pool.connect()` 사용처는 `backend/src/textbook-contents.ts`의 `writeContents` 한 곳뿐이다.
- 나머지 API는 `pool.query()`만 쓴다. 이 경우 pg가 연결을 직접 관리하므로 해당 없다.
- 사용처가 하나라 공통 트랜잭션 도우미로 빼지 않았다. 다음에 트랜잭션이 필요한 모듈이 생기면 그때 `writeContents`를 공통 도우미로 옮긴다.

## 변경

- `backend/src/textbook-contents.ts`(`writeContents`)
  - `ROLLBACK`이 실패하면 그 오류를 기억했다가 `client.release(오류)`로 반환한다. pg는 인자로 오류를 받으면 그 연결을 풀에 돌려놓지 않고 폐기한다.
  - `ROLLBACK`이 성공하면 이전처럼 `release()`로 풀에 돌려준다.
  - 원래 오류는 그대로 다시 던져 공통 오류 처리기로 간다.

## 테스트

- `backend/test/textbook-contents.test.ts`: 가짜 클라이언트로 목차 추가 중 오류를 낸다.
  - ROLLBACK도 실패하면 `release`가 한 번, 그 오류를 인자로 호출되는지
  - ROLLBACK이 성공하면 `release`가 인자 없이 호출되는지
- 수정 전 코드에서 실패하고 수정 후 통과하는 것을 확인했다.

## 검증

| 명령                   | 환경                                                        | 결과                                                        |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `npm run check`        | 로컬, `TEST_DATABASE_URL` 미설정                            | exit 0. backend tests 156, pass 145, fail 0, skipped 11(DB) |
| `npm test` (기본 병렬) | 로컬 Docker `postgres:17-alpine`, 마이그레이션 001~009 적용 | exit 0. tests 156, pass 156, fail 0, skipped 0              |

- 화면 변경이 없어 브라우저 확인은 하지 않았다.

## 자동 코드 리뷰 1차

별도 읽기 전용 리뷰 에이전트가 검토했다. 지적이 없어 2차 리뷰는 하지 않는다. 분리할 이슈도 없다.

- 확인된 사항
  - `pool.connect()` 사용처는 한 곳이다.
  - pg의 `release(오류)`는 인자가 있으면 연결을 폐기하고, `release(undefined)`는 풀에 돌려준다.
  - `connect` 실패는 try 전에 던져져 해제할 연결이 없다.
  - BEGIN이나 마지막 COMMIT이 실패하면 catch에서 ROLLBACK을 시도한다. 연결이 끊겼으면 폐기하고, 살아 있으면 풀에 돌려준다.
  - `release`는 한 번만 호출된다.
- 참고(유지): 테스트는 쓰기 도중 오류가 난 경우만 다룬다. BEGIN·COMMIT 실패 경로도 같은 catch를 지나는 것을 코드로 확인했다.

## 한계·후속

- 실제로 연결을 끊어 확인하지는 않았다. pg의 `release(err)` 동작(오류를 받으면 연결 폐기)을 가짜 클라이언트 호출 인자로 검증했다.
