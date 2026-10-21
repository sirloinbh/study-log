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
