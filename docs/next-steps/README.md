# 다음 작업

최종 갱신일: **2026-10-22 (Asia/Seoul)**.

## 사용자 확인 필요 (다음 작업 시작 전에 에이전트가 먼저 묻는다)

관리자 승인·재부팅·계정 로그인이 필요해 에이전트가 끝내지 못한 단계다. 다음 세션을 시작하면 에이전트는 다른 작업보다 먼저 아래 항목의 완료 여부를 사용자에게 묻는다.

| 순서 | 할 일                           | 상태                                                                                                            | 사용자가 할 일                                                                                                                                                                                                                                          |
| ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | WSL2·Docker Desktop 설치        | 미완료. 2026-10-22 `winget` 설치가 관리자 승인 단계에서 종료 코드 -5로 실패했다. WSL은 설치되어 있지 않다       | `wsl --install --no-distribution` 실행 → 재부팅 → `winget install -e --id Docker.DockerDesktop`. 관리자 승인(UAC) 창에서 "예". 확인: 재부팅 후 `wsl --status`, Docker Desktop 실행 후 `docker version`                                                  |
| 2    | Claude in Chrome 확장 계정 연결 | 미완료. 확장(Chrome "Profile 1")과 네이티브 호스트는 동작하지만, Claude Code의 연결된 브라우저 목록이 비어 있다 | "Profile 1" 창에서 Claude 확장을 열어 claude.ai에 Claude Code와 같은 계정으로 로그인됐는지 확인 → Claude Code에서 `/chrome` → 다시 연결. 확인: `/chrome` 화면에서 브라우저가 연결됨으로 표시. 전역 설정 `claudeInChromeDefaultEnabled`는 이미 켜져 있다 |

### 확인 후 에이전트가 할 일

- 1번 완료 후:
  - `docker version`, `docker compose version` 확인
  - `.env` 준비 여부를 사용자에게 확인. `.env.example`을 복사해 비밀번호를 정한다
  - `docker compose up -d db`로 앱 DB(호스트 55442)를 띄우고 마이그레이션 적용 확인
  - 필요하면 `docker compose up -d`로 웹(8092)·API 동작 확인
- 2번 완료 후:
  - Claude in Chrome 도구로 탭 조회(`tabs_context_mcp`)가 되는지 확인
  - 화면 변경 검증을 확장으로 할 수 있게 됐다고 기록한다. 그전까지는 headless Chrome(DevTools 프로토콜)으로 검증했다
- 두 항목이 끝나면 이 절을 지우고 일일 기록에 남긴다.

## 로컬 환경 현황

- 네이티브 PostgreSQL 17.11: Windows 서비스 `postgresql-17`, 포트 5432, 자동 시작.
- 테스트 전용 DB `study_test`(소유자 `study_test`)에 마이그레이션을 적용했다. 재실행 안전성도 확인했다.
- 사용자 환경변수 `TEST_DATABASE_URL=postgres://study_test@localhost:5432/study_test`로 `npm test`의 DB 통합 테스트가 건너뜀 없이 실행된다. 비밀번호는 `%APPDATA%\postgresql\pgpass.conf`에만 있다.
- 사용자 PATH에 `C:\Program Files\PostgreSQL\17\bin`(`psql`)을 추가했다.
- 새 마이그레이션을 테스트 DB에 적용할 때(저장소 루트, PowerShell): `$env:PGCLIENTENCODING='UTF8'; psql -h localhost -U study_test -d study_test -v ON_ERROR_STOP=1 -f database/migrations/NNN_<설명>.sql`. 클라이언트 인코딩을 UTF8로 지정하지 않으면 콘솔 코드 페이지로 읽어 한글이 깨진다.
- 앱 DB(55442)는 Docker Compose 기준이다(`compose.yaml`). 위 1번 이후에 쓴다.

## 다음 이슈 후보

| 이슈 | 내용                                      | 우선순위 | 비고                                   |
| ---- | ----------------------------------------- | -------- | -------------------------------------- |
| #13  | 교재 목차(장·절 계층) DB·API              | P1       | 선행 #12 병합 완료                     |
| #58  | 문자열 본문의 NUL 문자가 500으로 응답     | -        | 교재·학습 기록 공통. #57 리뷰에서 분리 |
| #56  | 테스트 helper의 fetch 금지 포트 간헐 실패 | P2       | 개발환경                               |
| #14  | 학습 기록에 교재·챕터 연결                | P1       | 선행 #13                               |

## 실행 경계

배포, 하위 저장소 동기화, AWS 리소스 생성은 별도 요청 시에만 한다. 공유 인프라의 ECR 저장소는 첫 배포 때 `shared-aws-infrastructure`의 목록에 추가한다.
