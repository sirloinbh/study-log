# #146 배포 실패 때 이전 버전으로 되돌아가게 compose 고치기

- 이슈: [#146](https://github.com/sirloinbh/study-log/issues/146)
- 브랜치: `fix/146-compose-rollback`

## 목적

중앙 관리 파일 `deploy/remote-deploy.sh`는 `compose.yaml`이 이미지를 `study-backend:${IMAGE_TAG}`, `study-frontend:${IMAGE_TAG}`로 태그하고 웹 포트를 `${WEB_BIND}:${WEB_PORT}`로 게시한다고 전제한다. 지금 `compose.yaml`에는 `image:`가 없고 포트가 `127.0.0.1:8102:80`으로 고정이라, 헬스체크 실패 뒤 `start "$current"`나 `rollback`이 방금 빌드한 이미지를 다시 띄울 수 있었다. 서버 `.env`의 `WEB_PORT`를 바꾸면 헬스체크가 다른 포트를 보게 되는 문제도 있었다.

## 변경

- `compose.yaml`: `api`에 `image: study-backend:${IMAGE_TAG:-local}`, `web`에 `image: study-frontend:${IMAGE_TAG:-local}`를 달았다. 웹 포트를 `'${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8102}:80'`으로 바꿨다. 중앙 배포 런북(`project-standards/docs/runbooks/deploy.md` 4장)의 조건과 같고, 같은 표준을 쓰는 `workout-memo`, `plan-routine`과 같은 형식이다.
- `.env.example`: `WEB_BIND=127.0.0.1`, `WEB_PORT=8102`를 적었다. `IMAGE_TAG`는 배포 스크립트가 커밋으로 정하므로 적지 않는다.
- `docs/next-steps/README.md`: Docker가 실행되므로 SVM 항목을 지우고, 남은 사용자 단계(앱 DB 비밀번호)와 끝난 #146을 반영했다.

`deploy/backup.sh`와 `deploy/report.sh`는 이미 설정된 `IMAGE_TAG`를 쓰고, 없으면 `.deployed` 값이나 `none`으로 채워 compose를 실행하고, 서비스 이름 `db`와 `docker compose ps -q`만 쓴다. 새 이미지 이름과 충돌하지 않아 고칠 것이 없었다. `${IMAGE_TAG:-local}`의 기본값은 서버에서는 쓰이지 않고, 로컬에서 `IMAGE_TAG` 없이 `docker compose`를 실행할 때를 위한 것이다.

## 검증

Docker Desktop(Client 29.9.2)에서 실제 앱 볼륨과 섞이지 않게 임시 compose 프로젝트 `-p study146`으로 확인했다. 이미지 빌드의 `NODE_AUTH_TOKEN`은 `sirloinbh` 계정의 `gh auth token`(`read:packages`)을 셸 환경변수로만 넘겼다. 확인이 끝난 뒤 컨테이너, 볼륨, 이미지를 모두 지웠다.

- `IMAGE_TAG=t1 docker compose -p study146 build`: `study-backend:t1`, `study-frontend:t1`로 태그되어 만들어졌다.
- 배포 실패 흉내: `t1`을 바탕으로 시작하자마자 종료하는 `study-backend:t2`와 라벨만 다른 `study-frontend:t2`를 만들었다. `remote-deploy.sh`의 순서를 따라 `t1` 배포 → `t2` 배포 → `start t1`을 실행했다(git checkout 단계는 빼고).
  - `t1`: `/api/health` 통과, `api`·`web` 컨테이너가 `t1` 이미지 ID로 떴다.
  - `t2`: 헬스체크 실패(의도한 결과), 컨테이너가 `t2` 이미지 ID로 바뀌었다.
  - `IMAGE_TAG=t1`로 다시 시작: 헬스체크 통과, 컨테이너가 다시 `t1` 이미지 ID(`d3b15dcece8b`, `c0e693f39536`)로 떴다. 고치기 전 `compose.yaml`은 `image:`가 없어 `IMAGE_TAG`를 쓰지 않으므로, 이 단계에서 마지막으로 빌드한 이미지가 다시 뜬다(코드로 확인, 고치기 전 상태는 실행하지 않았다).
- `WEB_PORT=8199 IMAGE_TAG=t1 docker compose -p study146 up -d`: 웹이 `127.0.0.1:8199->80/tcp`로 게시되고 `http://127.0.0.1:8199/api/health`가 통과했다.
- 배포와 같은 마이그레이션 명령 `docker compose run --rm --no-deps -v .../database/migrations:/database/migrations:ro api node dist/migrate.js`: 001~018을 적용했고, 다시 실행하면 "적용할 마이그레이션이 없습니다."가 나왔다. #134에서 Docker가 없어 확인하지 못한 단계다. Git Bash에서는 경로 변환 때문에 처음에 `ENOENT ... /database/migrations/`가 났고, `MSYS_NO_PATHCONV=1`과 `$(pwd -W)`로 실행해 통과했다. 서버(리눅스)에서는 해당하지 않는다.
- `IMAGE_TAG` 없이 `docker compose exec -T db sh -c 'pg_dump ...'`가 동작하고, `docker compose config --images`가 `study-backend:local`, `study-frontend:local`을 보여 준다(`deploy/backup.sh`의 전제).
- `npm run standards:check`: 통과. 경고 1건(`backend/src/holidays.ts:48` 배열 길이 제한, `GHSA-mrhx-c7xc-m3w5`)은 이 변경과 무관한 기존 항목으로 다음 작업 후보에 있다.
- `npm run check`: 통과(exit 0). 백엔드 테스트 321개 중 통과 289, 실패 0, 건너뜀 32. 건너뛴 32개는 이 셸에 `TEST_DATABASE_URL`이 없어 생략된 DB 통합 테스트로, 이번 변경은 앱 코드를 바꾸지 않는다.

## 제한·후속 작업

- 예전 compose가 기본 이름으로 만든 이미지(`study-log-api`, `study-log-web`)는 배포 스크립트의 정리 대상(`study-backend`, `study-frontend`)이 아니다. 이 변경 전에 배포한 서버가 생기면 한 번 직접 지운다. 지금은 배포한 서버가 없다.

- 실제 운영 서버 배포는 연결되어 있지 않아 서버에서는 확인하지 않았다.
- 로컬 앱 DB는 `.env`의 비밀번호가 예시 값이라 아직 만들지 않았다. 사용자가 비밀번호를 정한 뒤 띄운다(`docs/next-steps/README.md`).

## 리뷰

1차 리뷰에서 병합을 막는 결함은 없었다. 이미지 이름, 빌드·마이그레이션·정리 단계, 헬스체크 포트, `backup.sh`·`report.sh`, `.standards/check.mjs`의 포트 검사, 로컬 개발 절차 모두 새 compose와 맞는다고 확인했다. 다음 문서 지적을 이 PR에서 고쳤다.

- 전제 확인에 `deploy/report.sh`가 빠졌고, `IMAGE_TAG` 기본값의 쓰임새 설명이 정확하지 않았다. 둘 다 바로잡았다.
- 예전 기본 이름 이미지가 서버 정리 대상이 아니라는 점을 제한 항목에 적었다.
- `docs/next-steps/README.md`에 남은 "Docker가 없으면" 표현을 앱 DB 기준으로 바꿨다.
- `.env.example`의 `WEB_BIND=127.0.0.1`을 서버에 그대로 복사하면 헬스체크는 통과하지만 외부 접속이 안 된다는 지적은, 주석에 `0.0.0.0` 안내가 있고 런북상 서버 user-data가 값을 넣으므로 고치지 않았다.

2차 리뷰에서도 병합을 막는 결함은 없었다. 1차 지적 세 가지가 반영된 것을 확인했고, 남은 문구 두 곳을 고쳤다. 리뷰는 최대 2회이므로 3차 리뷰는 하지 않았다.

- `docs/next-steps/README.md` 10행의 "Docker가 없어도"를 앱 DB 기준으로 바꿨다.
- `backup.sh`·`report.sh`는 이미 설정된 `IMAGE_TAG`를 먼저 쓰고, 없을 때만 `.deployed`나 `none`으로 채운다고 바로잡았다.
