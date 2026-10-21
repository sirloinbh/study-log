# CI 통과 PR 에이전트 병합 정책 (#53)

- 이슈: https://github.com/sirloinbh/study-log/issues/53
- 일자: 2026-10-21 (Asia/Seoul)

## 목적

저장소 소유자가 2026-10-21 PR 병합 정책 변경을 명시적으로 지시했다. "PR 병합은 사용자만 수행한다" 규칙 때문에 프로젝트마다 병합을 따로 요청해야 했으므로, 필수 CI가 통과한 PR은 에이전트가 병합하도록 지침을 바꾼다.

## 변경 내용

- 새 정책: 필수 CI 검사가 모두 통과하면 에이전트(주 에이전트와 로컬 워커)가 묻지 않고 `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <검증한 head SHA>`(병합 커밋)로 병합하고 연결 이슈가 닫혔는지 확인한다.
- 연속 PR: 순서대로 병합한다. 앞 PR 병합 후 다음 PR 브랜치에 `origin/main`을 병합해 충돌을 풀고 관련 테스트를 다시 실행한 뒤 일반 푸시, CI 통과 후 병합한다.
- 계속 금지: 실패·실행 중 검사 상태의 병합, `--admin` 등 브랜치 보호 우회, 자기 PR 승인으로 검토 대체, `main` 직접 푸시·커밋, 강제 푸시.
- 배포: 현재 `main` 병합은 배포를 트리거하지 않는다(CI는 검증·Docker 빌드만 수행, AWS 배포 미연결). 문서에 그 점을 적었다.
- 수정 파일: `AGENTS.md`, `README.md`, `docs/project-setup.md`(절대 규칙·Git 전략·파일 역할 표·AGENTS 템플릿), `skills/study-log-{implementation,foundation,testing}/SKILL.md`(implementation 머리말 description 포함)와 `npm run skills:sync`로 갱신한 `.claude/skills/` 복제본.
- 과거 기록(`docs/changes/bootstrap.md`, `docs/daily/`)은 수정하지 않았다. 병합 제한을 강제하는 스크립트·테스트는 없었다(`scripts/test/claude-skills.test.mjs`는 동기화만 검사).

## 검증

문서·스킬만 변경했고 앱 동작 변경이 없어 앱 테스트는 추가하지 않았다.

- `npm run skills:sync`: `.claude/skills/`를 `skills/`에서 다시 복사.
- `npm run skills:check`: pass (`.claude/skills matches skills/.`).
- `npm run test:skills`: **4 pass / 0 fail / 0 skip**.
- `npm run format:check`: pass.
- skill-creator `quick_validate.py`(`PYTHONUTF8=1`) 3개 스킬: 모두 `Skill is valid!`.
- 전체 `npm run check`(lint·타입·앱 테스트·빌드)는 로컬에서 생략했다. 실행 코드 변경이 없으며 PR CI의 `verify` 작업이 전체 검사를 실행한다.
- 첫 커밋에서 이 기록 파일의 빈 줄 하나가 Prettier 규칙에 어긋나 후속 커밋으로 고쳤다. 수정 후 `npm run format:check`: pass.
