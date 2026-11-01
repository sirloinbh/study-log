# #134 배포 스크립트의 마이그레이션 단계 고치기

- 이슈: [#134](https://github.com/sirloinbh/study-log/issues/134)
- 브랜치: `fix/134-migrate-entry`

## 목적

중앙 관리 파일 `deploy/remote-deploy.sh`는 `node dist/migrate.js`를 실행하는데, 이 앱에는 그 소스가 없었다. 첫 배포부터 마이그레이션 단계에서 실패할 상태였다.

## 변경

- `backend/src/migrations.ts`, `backend/src/migrate.ts`: 아직 적용하지 않은 파일만 적용하는 도구. 같은 중앙 표준을 쓰는 `workout-memo`의 구현을 따랐다. 쓰지 않는 `--status` 기능은 빼고, 이 앱의 안내에 맞게 주석을 고쳤다.
- `backend/package.json`: `npm run db:migrate`.
- `database/README.md`: 적용 절차.

## 결정한 점

- 이력 표 `schema_migrations`와 체크섬을 쓴다. 적용한 파일이 바뀌면 거부한다.
- 이력 표가 없는 기존 DB는 첫 실행 때 모든 파일을 한 번 더 실행한다. 이 저장소의 마이그레이션 12개는 `IF NOT EXISTS` 등으로 재실행에 안전하고, 통합 테스트로 확인했다.

## 테스트

- `backend/test/migrations.test.ts`: 체크섬, 대기 파일 계산, 이력 불일치 거부, 파일 이름과 번호 검사.
- `backend/test/migrations.integration.test.ts`: 빈 스키마에 전체 적용, 재실행 시 변화 없음, 이력 없는 기존 DB의 데이터 보존, 바뀐 파일 거부, 실패한 파일만 되돌리기.

## 검증

- `TEST_DATABASE_URL`을 설정한 `npm run check`가 통과했다. 백엔드 325건, 프런트 100건, 스킬 4건이 통과했다. 건너뜀은 프런트 2건으로, 중앙 표준에서 온 다크 전용 앱 테스트이다.
- 빌드한 `backend/dist/migrate.js`를 기존 테스트 DB에 실행했다. 첫 실행은 12개를 적용했고, 두 번째는 "적용할 마이그레이션이 없습니다"로 끝났다. `DATABASE_URL`이 없으면 안내 후 실패한다.
- **실제 배포 흐름은 확인하지 못했다.** 이 PC에서 Docker가 실행되지 않아(BIOS의 SVM Mode 꺼짐) `docker compose run … api node dist/migrate.js`를 돌려 보지 못했다. 컨테이너의 경로는 `/app/dist`에서 `../../database/migrations`가 `/database/migrations` 마운트로 이어지는 것을 코드로만 확인했다. Docker를 켠 뒤 확인이 필요하다.
