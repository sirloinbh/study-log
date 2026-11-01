# #133 DB 연결이 끊겨도 API 프로세스가 죽지 않게 하기

- 이슈: [#133](https://github.com/sirloinbh/study-log/issues/133)
- 브랜치: `fix/133-db-connection-errors`

## 재현

고치기 전에 테스트 DB에서 `pg_terminate_backend`로 연결을 끊어 확인했다. 유휴 연결과 트랜잭션 중 연결 모두 `Unhandled 'error' event`로 프로세스가 종료 코드 1로 끝났다.

## 원인

`pg`는 끊긴 연결을 `error` 이벤트로 알리고, 받는 쪽이 없으면 Node가 프로세스를 끝낸다. `backend/src`에는 처리기가 없었다.

## 변경

- `backend/src/sql.ts`: `createPool`을 추가했다. 풀이 만드는 모든 연결과 풀 자체에 처리기를 단다.
- `backend/src/server.ts`: `createPool`을 쓴다.

## 동작

- 연결이 끊기면 `db_connection_error`와 오류 메시지만 로그에 남긴다. 접속 정보는 남기지 않는다.
- 그 연결로 진행 중이던 요청은 기존처럼 한국어 500으로 끝나고, 트랜잭션은 반영되지 않는다.
- 풀이 끊긴 연결을 버리고 다음 요청은 새 연결로 처리한다.

## 테스트

`backend/test/db-connection.integration.test.ts`: 실제 연결을 끊어 확인한다.

- 유휴 연결: 로그 1건, 접속 정보 없음, 다음 쿼리 정상.
- 트랜잭션의 쿼리 사이: 거부되고 다음 쿼리 정상.
- 요청 처리 중: 한국어 500, 저장되지 않음, 다음 요청 정상.

## 검증

`TEST_DATABASE_URL`을 설정한 `npm run check`가 통과했다. 백엔드 314건, 프런트 100건, 스킬 4건이 통과했다. 건너뜀은 프런트 2건으로, 중앙 표준에서 온 다크 전용 앱 테스트이다. 화면 변경이 없어 브라우저 확인은 하지 않았다.

실행 중인 서버에서 DB 서비스 자체를 재시작해 보지는 않았다. 개별 연결을 끊는 방식으로 같은 이벤트를 확인했다.
