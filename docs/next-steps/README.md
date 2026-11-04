# 다음 작업

최종 갱신일: **2026-11-04 (Asia/Seoul)**.

## 다음 할 일

에이전트는 다음 순서로 진행한다.

1. 아래 "사용자가 직접 할 일"의 완료 여부를 묻는다.
2. API 키(#129)가 준비되면 #33의 실제 응답을 먼저 확인하고, 실제 공휴일로 일정을 만들어 본다(아래 "확인 후 에이전트가 할 일"). 앱 DB가 준비되지 않아도 테스트 DB로 할 수 있다. 키가 없으면 실제 서버의 일정 생성은 503으로 거부되고 화면에 이유가 표시된다.
3. 앱 DB 비밀번호가 정해지면(아래 1번) 앱 DB에 마이그레이션을 적용한다. #28(P2)은 저장 위치와 패키지 설치를 사용자가 정해야 한다. #29, #30(P3)은 #28에 묶여 있다.
4. 사용자에게 아래 "사용자가 정할 것"을 묻는다.
5. 위가 모두 막혀 있으면 "다음 이슈 후보"의 "API 키와 앱 DB 없이 할 수 있는 일"을 적힌 순서대로 한다.

## 사용자가 직접 할 일

관리자 승인·재부팅·계정 로그인이 필요해 에이전트가 끝내지 못한 단계다. 다음 세션을 시작하면 에이전트는 다른 작업보다 먼저 아래 항목의 완료 여부를 사용자에게 묻는다.

| 순서 | 할 일                                                                                 | 상태                                                                                                                                                                 | 사용자가 할 일                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 앱 DB 비밀번호 정하기                                                                 | Docker는 #146 작업 때 실행됐으나, 같은 날 #165 작업 때는 엔진 API 500 오류를 냈다(2026-11-03). 로컬 `.env`의 `POSTGRES_PASSWORD`가 아직 `.env.example`의 예시 값이다 | `.env`의 `POSTGRES_PASSWORD`와 `DATABASE_URL`의 비밀번호를 같은 새 값으로 바꾼다. 앱 DB 볼륨을 처음 만들 때의 값이 그대로 남으므로 띄우기 전에 정한다 |
| 2    | Claude in Chrome 확장 계정 연결                                                       | 미완료. 확장(Chrome "Profile 1")과 네이티브 호스트는 동작하지만, Claude Code의 연결된 브라우저 목록이 비어 있다                                                      | "Profile 1" 창의 Claude 확장에서 claude.ai에 Claude Code와 같은 계정으로 로그인했는지 확인한 뒤 Claude Code에서 `/chrome`으로 다시 연결한다           |
| 3    | [공공데이터포털 API 키 발급(#129)](https://github.com/sirloinbh/study-log/issues/129) | 사용자가 나중에 직접 하기로 했다. 일정 생성과 #33의 실제 응답 확인에 필요하다                                                                                        | 한국천문연구원 특일 정보 API 활용을 신청하고 키를 로컬 `.env`의 `HOLIDAY_API_KEY`에 넣는다. 배포하면 서버 `.env`에도 넣는다                           |

### 사용자가 정할 것

지금은 없다. 2026-11-03에 사용자가 정한 것:

- #165: 원래 날짜를 기억했다가 되돌린다.
- 일정 통계의 기준(`docs/decisions/schedule-rules.md` 7장): 그대로 둔다.
- 일정 이름 수정 화면(#179)과 학습 시간 통계의 교재 필터(#180)를 만든다. #179는 2026-11-04에 병합했고, #180은 이 문장을 고친 PR #184로 만든다. 캘린더 뷰는 만들지 않는다.

2026-11-04에 사용자가 정한 것:

- 테스트 DB는 관리자 권한이 필요 없는 Docker 컨테이너로 준비한다([#177 댓글](https://github.com/sirloinbh/study-log/issues/177#issuecomment-6620502022)). #178에서 이 방식으로 `study_test`를 만든다. 위 1번(앱 DB 비밀번호)과 Docker Desktop 실행이 먼저 필요하다.

### 확인 후 에이전트가 할 일

- 1번 완료 후:
  - `docker compose up -d db`로 앱 DB(호스트 15402)를 띄우고, 배포와 같은 `docker compose run --rm --no-deps -v "$PWD/database/migrations:/database/migrations:ro" api node dist/migrate.js`로 마이그레이션을 적용한다. 이 명령은 #146에서 임시 compose 프로젝트로 동작을 확인했다. Git Bash에서는 `MSYS_NO_PATHCONV=1`과 `$(pwd -W)`를 써야 컨테이너 경로가 바뀌지 않는다
  - 필요하면 `docker compose up -d`로 웹(8102)·API 동작 확인. 이미지 빌드에는 `NODE_AUTH_TOKEN`이 필요하다. 로컬에서는 `read:packages` 권한이 있는 `sirloinbh`의 `gh auth token`을 셸 환경변수로만 넘겨 빌드했다
- 2번 완료 후:
  - Claude in Chrome 도구로 탭 조회(`tabs_context_mcp`)가 되는지 확인
  - 화면 변경 검증을 확장으로 할 수 있게 됐다고 기록한다. 그전까지는 headless Chrome(DevTools 프로토콜)으로 검증했다
- 3번 완료 후:
  - 실제 키로 한 해를 조회해, 응답이 `backend/src/holidays.ts`의 해석과 맞는지 확인한다. 대체공휴일과 임시공휴일이 `isHoliday: Y`로 오는지, 빈 달의 `items` 모양과 키 오류 응답도 본다. 고정 공휴일이 주말일 때도 응답에 오는지 본다. `_type=json`은 공식 문서에 없어 이때 처음 확인된다.
  - 실제 공휴일로 일정을 만들어 설날이나 추석이 있는 기간의 분량을 브라우저에서 확인한다. 지금까지는 테스트 DB에 넣은 공휴일로만 확인했다.
  - 앱 DB(위 1번)가 준비되지 않았으면 테스트 DB를 쓴다. `.env`에는 키만 있으면 되고, PowerShell에서 `$env:DATABASE_URL=[Environment]::GetEnvironmentVariable('TEST_DATABASE_URL','User'); $env:PGPASSFILE="$env:APPDATA\postgresql\pgpass.conf"; npm run dev`로 띄운다. 2026-11-01 브라우저 확인과 같은 방법이다. 이렇게 하면 `npm test`가 지우지 않는 행이 테스트 DB에 남으므로 끝나면 `schedules`, `holidays`, `holiday_years`에서 지운다. `holiday_years`만 남으면 7일 동안 API를 부르지 않아 공휴일 없는 일정이 만들어진다.
- 끝난 항목은 이 표에서 지우고 일일 기록에 남긴다.

## 로컬 환경 현황

- 2026-11-03 #175 작업에서는 아래 테스트 DB 설정(환경변수, `pgpass.conf`, `postgresql-17` 서비스)이 조회되지 않아 DB 통합 테스트 32개가 건너뛰어졌다. 같은 날 #165 작업에서는 셋 다 있었고, DB 통합 테스트가 건너뜀 없이 실행됐다. 실행 환경마다 다르게 보일 수 있으니, 건너뜀이 생기면 셋을 먼저 확인한다.
- 같은 날 #165 작업에서는 `docker version`이 엔진 API 500 오류를 냈다. Docker Desktop이 실행 중인지 확인한다.

- 네이티브 PostgreSQL 17.11: Windows 서비스 `postgresql-17`, 포트 5432, 자동 시작.
- 테스트 전용 DB `study_test`(소유자 `study_test`)에 마이그레이션 001~019를 적용했다(019는 2026-11-03에 `DATABASE_URL`을 테스트 DB로 지정한 `npm run db:migrate -w backend`로 적용). 새 마이그레이션을 적용하기 전에는 그 테이블을 쓰는 통합 테스트가 실패한다.
- 사용자 환경변수 `TEST_DATABASE_URL=postgres://study_test@localhost:5432/study_test`로 `npm test`의 DB 통합 테스트가 건너뜀 없이 실행된다. 비밀번호는 `%APPDATA%\postgresql\pgpass.conf`에만 있다.
- 사용자 PATH에 `C:\Program Files\PostgreSQL\17\bin`(`psql`)을 추가했다.
- 새 마이그레이션을 테스트 DB에 적용할 때(저장소 루트, PowerShell): `$env:PGCLIENTENCODING='UTF8'; psql -h localhost -U study_test -d study_test -v ON_ERROR_STOP=1 -f database/migrations/NNN_<설명>.sql`. 클라이언트 인코딩을 UTF8로 지정하지 않으면 콘솔 코드 페이지로 읽어 한글이 깨진다.
- 앱 DB(15402)는 Docker Compose 기준이다(`compose.yaml`). 위 1번 이후에 쓴다.

## 다음 이슈 후보

규칙은 [학습 일정](../decisions/schedule-rules.md)과 [복습 주기](../decisions/review-rules.md) 문서를 따른다.

| 이슈 | 내용                        | 우선순위 | 비고                            |
| ---- | --------------------------- | -------- | ------------------------------- |
| #28  | PDF·이미지 파일 업로드 기반 | P2       | 저장 위치·패키지 설치 확인 필요 |

API 키와 앱 DB 없이 할 수 있는 일: 지금은 없다. 새 요구사항을 이슈로 등록하거나 위 사용자 단계를 기다린다.

상위 이슈 #5는 #28, #29, #30이 끝나면 닫는다.

## 실행 경계

배포, 하위 저장소 동기화, AWS 리소스 생성은 별도 요청 시에만 한다. 공유 인프라의 ECR 저장소는 첫 배포 때 `shared-aws-infrastructure`의 목록에 추가한다.
