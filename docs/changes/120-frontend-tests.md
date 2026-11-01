# #120 주요 화면과 로직 파일에 프런트 테스트 더하기

- 이슈: [#120](https://github.com/sirloinbh/study-log/issues/120)
- 브랜치: `chore/120-frontend-tests`

## 목적

주요 흐름을 실제 React와 DOM으로 검사한다. `backend/test/*-ui.test.ts`도 같은 화면을 검사하지만, 가짜 React로 요소 트리만 본다.

## 변경

앱 코드는 바꾸지 않았다.

- `frontend/src/logic.test.ts`: `month-calendar.ts`, `toc.ts`, `study-stats.ts`, `pdf-toc.ts`.
- `frontend/src/screens.test.tsx`: 학습 기록(목록, 추가, 삭제, 저장 실패, 불러오기 실패), 교재(목록, 추가), 목차(순서 바꾸기, 거절된 이동), 연습문제(추가, 삭제).
- `frontend/src/test/fake-api.ts`: 서버 없이 `fetch`를 대신한다.

## 구현 판단

- 이슈의 파일 이름은 #117 이전 이름이다. `study-logs.ts`는 `study-logs-data.ts`로 바뀌었고, 이 파일과 나머지 이름 변경은 #117 기록에 있다.
- 이슈는 날짜 경계를 `Asia/Seoul`로 검사하라고 적었지만, 이 로직 파일들은 시계를 읽지 않는다. 날짜 문자열을 UTC로 계산하므로 시계를 고정할 곳이 없다. 대신 달의 시작 요일과 연말 이동을 검사한다.

## 검증

`TEST_DATABASE_URL`을 설정한 `npm run check`가 통과했다. 백엔드 341건, 프런트 154건, 스킬 4건이 통과했다. 건너뜀은 프런트 2건으로, 중앙 표준에서 온 다크 전용 앱 테스트이다.

테스트가 결함을 잡는지 보려고 앱 코드에 결함을 하나씩 넣어 돌리고 되돌렸다. 7건 중 6건을 잡았고, 놓친 1건은 입력한 학습일이 오늘과 같아서 "날짜 유지"를 구별하지 못한 것이다. 다른 날짜를 쓰도록 고쳐 다시 확인했다. 이 작업은 테스트만 더해 브라우저 확인은 하지 않았다.
