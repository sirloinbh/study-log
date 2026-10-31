# 다음 작업

최종 갱신일: **2026-10-31 (Asia/Seoul)**.

## 사용자가 직접 할 일

관리자 승인·재부팅·계정 로그인이 필요해 에이전트가 끝내지 못한 단계다. 다음 세션을 시작하면 에이전트는 다른 작업보다 먼저 아래 항목의 완료 여부를 사용자에게 묻는다.

| 순서 | 할 일                                                                                 | 상태                                                                                                                                                                                                                             | 사용자가 할 일                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Windows 재부팅                                                                        | WSL 3.0.3과 Docker Desktop을 2026-10-31에 설치했다. 재부팅이 대기 중이고, Docker는 아직 실행해 보지 못했다                                                                                                                       | 재부팅 후 Docker Desktop을 한 번 실행한다. 확인: `docker version`                                                                                                                               |
| 2    | 패키지 설치                                                                           | 로컬 `node_modules`에 `@sirloinbh/*` 공유 패키지가 없다. 에이전트의 설치 명령은 프로젝트 훅이 막는다. 이 패키지는 GitHub Packages에서 받으므로 `read:packages` 권한 토큰이 필요한데, 이 PC의 환경변수에 `NODE_AUTH_TOKEN`이 없다 | `$env:NODE_AUTH_TOKEN = (gh auth token --user sirloinbh); npm ci --ignore-scripts`. 권한이 없다고 나오면 먼저 `gh auth refresh -h github.com -s read:packages`. 확인: `npm run standards:check` |
| 3    | Claude in Chrome 확장 계정 연결                                                       | 미완료. 확장(Chrome "Profile 1")과 네이티브 호스트는 동작하지만, Claude Code의 연결된 브라우저 목록이 비어 있다                                                                                                                  | "Profile 1" 창의 Claude 확장에서 claude.ai에 Claude Code와 같은 계정으로 로그인했는지 확인한 뒤 Claude Code에서 `/chrome`으로 다시 연결한다                                                     |
| 4    | [공공데이터포털 API 키 발급(#129)](https://github.com/sirloinbh/study-log/issues/129) | 사용자가 나중에 직접 하기로 했다. #33의 실제 호출 확인에 필요하다                                                                                                                                                                | 한국천문연구원 특일 정보 API 활용을 신청하고 키를 로컬 `.env`에 넣는다                                                                                                                          |

### 확인 후 에이전트가 할 일

- 1번 완료 후:
  - `docker version`, `docker compose version` 확인
  - `.env` 준비 여부를 사용자에게 확인. `.env.example`을 복사해 비밀번호를 정한다
  - `docker compose up -d db`로 앱 DB(호스트 15402)를 띄우고 마이그레이션 적용 확인
  - 필요하면 `docker compose up -d`로 웹(8102)·API 동작 확인. 이미지 빌드에도 `NODE_AUTH_TOKEN`이 필요하다
- 3번 완료 후:
  - Claude in Chrome 도구로 탭 조회(`tabs_context_mcp`)가 되는지 확인
  - 화면 변경 검증을 확장으로 할 수 있게 됐다고 기록한다. 그전까지는 headless Chrome(DevTools 프로토콜)으로 검증했다
- 끝난 항목은 이 표에서 지우고 일일 기록에 남긴다.

## 로컬 환경 현황

- 네이티브 PostgreSQL 17.11: Windows 서비스 `postgresql-17`, 포트 5432, 자동 시작.
- 테스트 전용 DB `study_test`(소유자 `study_test`)에 마이그레이션 001~011을 적용했다(2026-10-31 확인). 새 마이그레이션을 적용하기 전에는 그 테이블을 쓰는 통합 테스트가 실패한다.
- 사용자 환경변수 `TEST_DATABASE_URL=postgres://study_test@localhost:5432/study_test`로 `npm test`의 DB 통합 테스트가 건너뜀 없이 실행된다. 비밀번호는 `%APPDATA%\postgresql\pgpass.conf`에만 있다.
- 사용자 PATH에 `C:\Program Files\PostgreSQL\17\bin`(`psql`)을 추가했다.
- 새 마이그레이션을 테스트 DB에 적용할 때(저장소 루트, PowerShell): `$env:PGCLIENTENCODING='UTF8'; psql -h localhost -U study_test -d study_test -v ON_ERROR_STOP=1 -f database/migrations/NNN_<설명>.sql`. 클라이언트 인코딩을 UTF8로 지정하지 않으면 콘솔 코드 페이지로 읽어 한글이 깨진다.
- 앱 DB(15402)는 Docker Compose 기준이다(`compose.yaml`). 위 1번 이후에 쓴다.

## 다음 이슈 후보

규칙은 [학습 일정](../decisions/schedule-rules.md)과 [복습 주기](../decisions/review-rules.md) 문서를 따른다.

| 이슈 | 내용                                  | 우선순위 | 비고                            |
| ---- | ------------------------------------- | -------- | ------------------------------- |
| #42  | 복습 일정 DB와 학습 완료 시 자동 생성 | P1       | 위 2번 패키지 설치 후 시작      |
| #43  | 오늘의 복습 목록과 완료 체크          | P1       | 선행 #42                        |
| #33  | 한국 공휴일 데이터와 평일/휴일 판정   | P1       | 선행 #129                       |
| #34  | 학습 일정 DB·API                      | P1       | 선행 #33                        |
| #28  | PDF·이미지 파일 업로드 기반           | P2       | 저장 위치·패키지 설치 확인 필요 |

## 실행 경계

배포, 하위 저장소 동기화, AWS 리소스 생성은 별도 요청 시에만 한다. 공유 인프라의 ECR 저장소는 첫 배포 때 `shared-aws-infrastructure`의 목록에 추가한다.
