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
- `frontend/nginx.conf`가 클라이언트 주소를 `X-Forwarded-For`에 넣지 않으므로, nginx를 거친 요청은 Express에서 모두 한 클라이언트로 센다. 이슈의 "IP별 제한"과 다르지만, 사용자가 한 명이고 IP별 제한은 nginx가 이미 하므로 이대로 둔다.
- `trust proxy`는 켜지 않았다. nginx는 클라이언트가 보낸 헤더를 그대로 넘기므로, 켜면 위조된 헤더를 믿게 된다. 끈 상태에서는 헤더를 무시한다. 다만 라이브러리가 이 헤더를 보면 오류 로그를 남기므로 해당 검증 2개를 껐다.
- `/api/health`는 제한에서 뺐다. 배포와 감시가 이 응답을 보므로, 다른 요청이 많다고 정상 API를 장애로 판단하면 안 된다.
- 서버를 재시작하면 카운터가 초기화된다. 메모리 저장소이며 API는 한 프로세스로 돈다.

## 테스트

`backend/test/rate-limit.test.ts`: 한도 초과 시 한국어 429와 DB 미접근, 잘못된 본문도 거절 우선, 상태 확인 제외, 위조 헤더로 우회 불가와 로그 없음, 기본 한도에서 동시 100건 통과.

## 리뷰

1차 리뷰에서 3건이 나왔다.

- nginx가 클라이언트의 `X-Forwarded-For`를 그대로 넘겨 오류 로그가 남고, 문서의 설명도 틀렸다. 검증을 끄고 문서를 고쳤다.
- `/api/health`가 다른 요청과 한도를 나눠 쓰고 있었다. 제한에서 뺐다.
- `frontend/nginx.conf`의 "API 자체에는 제한이 없다"는 주석이 이 앱에서 맞지 않게 됐다. 중앙 관리 파일이라 `sirloinbh/project-standards`에 이슈를 남긴다.

## 알려진 문제

`npm audit`의 high 1건은 이번 패키지가 아니라 기존 `zod` 3.25.76이다(4.6.6 미만 영향). PR #115가 다루는 주 버전 올리기라 이 PR에서 고치지 않는다.

## 검증

- `TEST_DATABASE_URL`을 설정한 `npm run check`가 통과했다. 백엔드 285건, 스킬 4건이 모두 통과했다(건너뜀 0).
- 프런트는 52건 통과, 2건 건너뜀이다. 건너뛴 2건은 중앙 표준에서 온 다크 전용 앱 테스트로, 이 앱에는 해당하지 않는다.
- `npm run standards:check`와 `npm run lockfiles:sync`(변경 없음)를 확인했다.
- CodeQL이 이 미들웨어를 인식하는지는 새 라우트가 있는 PR #135에서 확인한다.
