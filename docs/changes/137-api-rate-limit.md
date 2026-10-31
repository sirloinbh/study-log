# #137 API 서버에 요청 속도 제한 추가

- 이슈: [#137](https://github.com/sirloinbh/study-log/issues/137)
- 브랜치: `feat/137-api-rate-limit`

## 목적

CodeQL이 Express 미들웨어만 인식해 새 라우트마다 `js/missing-rate-limiting` 경고를 낸다. 지금까지 34건을 오탐으로 닫았고, PR #135도 같은 경고에 막혔다. 사용자가 오탐 처리 대신 Express 제한을 추가하기로 정했다(2026-10-31).

## 변경

- `backend/package.json`: `express-rate-limit` 8.7.2를 추가했다. 사용자가 `--ignore-scripts`로 설치했다.
- `backend/src/app.ts`: `/api` 전체를 분당 1200회로 제한한다. 넘으면 한국어 429로 답한다. 본문 파싱보다 앞에 두어 거절한 요청은 파싱하지 않는다.

## 결정한 점

- 한도는 nginx의 초당 10회(분당 600회)보다 넉넉하게 잡았다. 사용자별 제한은 nginx가 맡고, Express는 안전망이다.
- `frontend/nginx.conf`가 `X-Forwarded-For`를 보내지 않으므로, nginx를 거친 요청은 Express에서 모두 한 클라이언트로 센다. 사용자가 한 명이라 문제가 없다.
- `trust proxy`는 켜지 않았다. 전달받는 주소가 없으니 켜면 위조된 헤더만 믿게 된다.
- 서버를 재시작하면 카운터가 초기화된다. 메모리 저장소이며 API는 한 프로세스로 돈다.

## 테스트

`backend/test/rate-limit.test.ts`: 한도 초과 시 한국어 429와 DB 미접근, 잘못된 본문도 거절 우선, 기본 한도에서 동시 100건 통과.

## 알려진 문제

`npm audit`의 high 1건은 이번 패키지가 아니라 기존 `zod` 3.25.76이다(4.6.6 미만 영향). PR #115가 다루는 주 버전 올리기라 이 PR에서 고치지 않는다.

## 검증

- `TEST_DATABASE_URL`을 설정한 `npm run check`가 통과했다. 백엔드 283건, 스킬 4건이 모두 통과했다(건너뜀 0).
- 프런트는 52건 통과, 2건 건너뜀이다. 건너뛴 2건은 중앙 표준에서 온 다크 전용 앱 테스트로, 이 앱에는 해당하지 않는다.
- `npm run standards:check`와 `npm run lockfiles:sync`(변경 없음)를 확인했다.
- CodeQL이 이 미들웨어를 인식하는지는 새 라우트가 있는 PR #135에서 확인한다.
