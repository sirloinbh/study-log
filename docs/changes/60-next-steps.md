# #60 다음 작업 문서에 로컬 환경 확인 항목 기록

- 이슈: [#60](https://github.com/sirloinbh/study-log/issues/60)
- 브랜치: `docs/60-next-steps`

## 목적

2026-10-22 로컬 환경 정비 중 사용자가 직접 해야 하는 단계가 남았다(관리자 승인·재부팅·계정 로그인). 사용자가 이를 문서에 적고 다음에 다시 물어 달라고 요청했다.

## 변경

- `docs/next-steps/README.md`
  - 2026-10-19 기준의 끝난 항목(이슈 카드 등록, 마이그레이션 `002` 설계)을 지웠다.
  - "사용자 확인 필요" 절: WSL2·Docker Desktop 설치, Claude in Chrome 확장 계정 연결. 각각 현재 상태와 사용자 실행 명령을 적었다. 다음 세션에서 에이전트가 먼저 묻는다고 명시했다.
  - 확인 후 에이전트가 할 일: compose 앱 DB 기동, 확장 연결 확인.
  - 로컬 환경 현황: 네이티브 PostgreSQL 17 테스트 DB, `TEST_DATABASE_URL`, PATH. 비밀번호는 적지 않고 저장 위치만 적었다.
  - 다음 이슈 후보(#13, #58, #56, #14).

## 검증

- 문서만 바뀌어 앱 테스트는 추가하지 않았다.
- `npm run format:check`: 통과.
- 문서 안 상대 링크는 없다. 명령·경로는 이번 세션에서 실제로 쓴 값과 대조했다.

## 자동 코드 리뷰 1차

별도 읽기 전용 리뷰 에이전트가 이슈 완료 기준과 PR diff를 검토했다. 포트, 이슈 상태, Windows 명령, 비밀값 미기재에는 문제가 없었다.

- 지적(low): 테스트 DB 마이그레이션 명령이 POSIX 형식이라 PowerShell에 그대로 붙여 넣을 수 없었다.
  - 반영: PowerShell 형식(`$env:PGCLIENTENCODING='UTF8'; psql …`)으로 바꾸고, 저장소 루트에서 실행한다고 적었다.
- 지적(low): 사용자 확인 항목에 완료 확인 방법이 없었다.
  - 반영: Docker는 `wsl --status`·`docker version`, Chrome은 `/chrome` 화면의 연결 표시로 확인한다고 적었다.
- 메모: 검증 기록을 이슈 기준 명령인 `npm run format:check`로 바꿨다.
- 검증: `npm run format:check` 통과.

## 자동 코드 리뷰 2차

별도 읽기 전용 리뷰 에이전트가 1차 반영(f0178d3)과 전체 diff를 다시 확인했다.

- PowerShell 명령 문법, 저장소 루트 기준 경로, 완료 확인 명령(`wsl --status`, `docker version`, `/chrome`)이 맞다.
- 비밀값·계정명 미기재, 포트(compose.yaml)를 다시 대조했다.
- 보완점이 없다. 리뷰 최대 2회 정책에 따라 마친다.
- 검증: `npm run format:check` 통과.

## 한계·후속

- 다음 세션에 묻는 일은 이 문서와 에이전트 메모리(로컬, 저장소 밖)로 보장한다.
