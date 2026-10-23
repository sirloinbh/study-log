# #56 테스트 helper가 fetch 금지 포트를 받으면 간헐적으로 실패

- 이슈: [#56](https://github.com/sirloinbh/study-log/issues/56)
- 브랜치: `fix/56-test-bad-port`

## 문제

`backend/test/helpers.ts`의 `withApi`는 `listen(0)`으로 임의 포트를 받은 뒤 `fetch`로 호출한다. 운영체제가 fetch 표준의 금지 포트(6000, 6665~6669, 10080 등)를 주면 `TypeError: fetch failed — bad port`로 테스트가 가끔 실패했다(2026-10-21 로컬에서 관찰).

## 변경

- `backend/test/helpers.ts`
  - `fetchBlockedPorts`: fetch가 거부하는 포트 82개.
  - `openFetchablePort(open, tries = 10)`: 포트를 열어 보고, 금지 포트면 닫은 뒤 다시 연다. 10번 모두 금지 포트면 오류를 낸다.
  - `withApi`가 이 함수로 서버를 연다. 호출 방식(`fetch`)과 테스트 API는 그대로다.
- 앱 코드는 바꾸지 않았다. 테스트 도우미만 바뀐다.

## 목록 확인

로컬 Node 24.21.0의 `fetch`로 직접 확인했다.

- 목록의 82개 포트는 모두 연결 전에 "bad port"로 거부된다.
- 1~11000번 포트 중 목록에 없는데 거부되는 포트는 없다. 목록의 가장 큰 포트는 10080이다.

## 테스트

- `backend/test/helpers.test.ts`(새 파일, 가짜 리스너)
  - 금지 포트(6666, 10080) 다음 허용 포트를 주면 허용 포트를 쓰고, 앞의 둘을 닫는지
  - 첫 포트가 허용되면 한 번만 여는지
  - 정한 횟수만큼 모두 금지 포트면 오류를 내고 모두 닫는지
  - 목록 포트(6666)를 실제 `fetch`가 "bad port"로 거부하는지
- 기존 API·화면 테스트는 모두 바뀐 `withApi`를 거쳐 그대로 통과한다.

## 검증

| 명령                   | 환경                                                        | 결과                                                        |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `npm run check`        | 로컬, `TEST_DATABASE_URL` 미설정                            | exit 0. backend tests 161, pass 149, fail 0, skipped 12(DB) |
| `npm test` (기본 병렬) | 로컬 Docker `postgres:17-alpine`, 마이그레이션 001~009 적용 | exit 0. tests 161, pass 161, fail 0, skipped 0              |

- 원래 실패는 운영체제가 금지 포트를 줄 때만 나서 재현할 수 없다. 대신 포트 선택 로직을 가짜 포트 순서로 검증했다.
- 화면 변경이 없어 브라우저 확인은 하지 않았다.

## 한계·후속

- 금지 포트 목록은 fetch 표준을 따른다. Node가 목록을 바꾸면 함께 고쳐야 한다. 이 경우 "목록 포트를 실제 fetch가 거부하는지" 테스트가 일부 변화를 잡는다.
