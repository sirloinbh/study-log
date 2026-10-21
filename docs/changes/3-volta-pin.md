# Volta로 Node·npm 버전 고정 (#3)

- 이슈: https://github.com/sirloinbh/study-log/issues/3
- 일자: 2026-10-21 (Asia/Seoul)

## 목적

Volta를 쓰는 개발 PC에서는 `.node-version`·`.nvmrc`를 읽지 않아 기본 툴체인(Node 22.17.0 / npm 10.9.2)이 쓰였다. 저장소 안에서 자동으로 Node 24.21.0 / npm 11.19.0이 선택되게 한다.

## 변경

- `volta pin node@24.21.0 npm@11.19.0`: 루트 `package.json`에 `volta` 필드 추가. 버전 값은 기존 `engines`·`.node-version`과 같다.
- README 개발 기준에 Volta 고정 사실을 추가했다.
- 패키지 설치·삭제 없음. 앱 동작 변경이 없어 새 테스트는 추가하지 않았다.

## 검증

- 저장소 안에서 `node -v` → `v24.21.0`, `npm -v` → `11.19.0` (Volta 기본값 22.17.0 대신 고정값 적용 확인).
- 전용 테스트 DB `study_test`(로컬 Compose DB, 마이그레이션 `psql -f` 적용)로 `TEST_DATABASE_URL`을 설정하고 `npm run check` 실행: 결과는 아래에 기록.
  - `npm run check`: **exit 0**. 앱·DB 테스트 8 pass / 0 fail / 0 skip(DB 통합 테스트 실제 실행), 스킬 검사 4 pass / 0 fail / 0 skip, 포맷·lint·타입·빌드 통과.
- 로컬 `docker compose up --build -d`(사용자 확인 후 실행): db·api·web 기동, `http://localhost:8092/` 200, `/api/health` → `{"ok":true,"service":"study-log","today":"2026-10-21"}`.

## 한계

- Volta를 쓰지 않는 환경(nvm 등)은 기존처럼 `.node-version`·`.nvmrc`를 따른다.
- 화면 변경이 없어 브라우저 확인은 하지 않았다.

## 자동 코드 리뷰 1차 (PR #4)

이 브랜치에 `origin/main`(#54, #2)을 병합한 뒤 별도 읽기 전용 리뷰 에이전트가 검토했다.

- 지적(medium): Volta는 가장 가까운 `package.json`의 `volta` 필드만 읽고 상위 폴더로 올라가지 않는다. 그래서 `frontend/`·`backend/` 폴더 안이나 하위 배포 저장소에서는 루트 고정값이 적용되지 않는다.
  - 재현: 임시 폴더에 루트 `volta.node=22.17.0`, 하위 폴더에 `volta` 없는 `package.json`을 두었다. 루트에서는 `v22.17.0`, 하위 폴더에서는 Volta 기본값 `v24.21.0`이 선택됐다. 하위에도 `volta`를 넣으면 `v22.17.0`이 선택됐다.
  - 반영: `frontend/package.json`·`backend/package.json`에 같은 `volta` 값을 직접 넣었다. 하위 저장소에는 `../package.json`이 없으므로 `extends`는 쓰지 않는다.
- 지적(low): 개발 환경 설정 기준 `docs/project-setup.md`에 Volta 고정이 빠져 있었다.
  - 반영: 루트 `package.json` 예시, 5.6 워크스페이스 기준, 부트스트랩 3단계에 `volta` 필드를 추가했다.
- 버전 고정값이 서로 일치하는지 검사하는 테스트는 없다. 이번 범위에서는 추가하지 않았다.
- 보완 후 검증:
  - `npm run check`: exit 0. 앱 테스트 8 tests / 7 pass / 0 fail / 1 skip(`TEST_DATABASE_URL` 미설정 DB 통합 테스트, 이번에는 DB 검증 미실행). 스킬 4 pass, 포맷·lint·타입·빌드 통과.
  - 루트, `frontend/`, `backend/`에서 `volta which node`가 모두 24.21.0을 가리킨다. 이 PC는 Volta 기본값도 24.21.0이라 하위 폴더 결과만으로는 차이를 보이지 않는다. 동작 차이는 위 임시 폴더 재현으로 확인했다.
  - npm은 `volta` 필드를 무시하므로 `npm ci`·잠금 파일·Docker 빌드에는 영향이 없다.
