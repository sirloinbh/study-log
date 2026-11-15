# 공부 기록 고유 지침

이 파일은 study-log에만 해당하는 규칙이다. 공통 지침은 [AGENTS.md](AGENTS.md)이며, 중앙 표준(`sirloinbh/project-standards`) 동기화 후에는 중앙 관리 파일이 된다. 두 파일이 다르면 이 파일이 우선한다.

## 작업 절차 (공통 절차에 더해)

- **After you open a PR, review it yourself 1 or 2 times (more only while blocking findings remain, per std-code-review section 8). When the review passes and every required CI check on the final head passes, the agent (the main agent or a local worker) merges the PR without asking.** Fix findings on the same branch in additional commits between rounds, and post each round as a PR comment. If there are no findings, go straight to the next step. File a new issue card for a big problem outside this PR's scope instead of growing the PR. 상세 절차는 implementation 스킬을 따른다. 병합은 병합 커밋 방식으로 `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <검증한 head SHA>`를 쓰고, 연결 이슈(`Closes #N`)가 닫혔는지 확인한다. 연속 PR은 순서대로 병합한다. 앞 PR 병합 후 다음 PR 브랜치에 `origin/main`을 병합해 충돌을 풀고 관련 테스트를 다시 실행한 뒤 일반 푸시하고, CI 통과 후 병합한다. 실패·실행 중 검사가 있는 상태의 병합, `--admin` 등 브랜치 보호 우회, 자기 PR 승인으로 검토 대체, `main` 직접 푸시·커밋, 강제 푸시는 금지한다. 현재 `main` 병합은 배포를 트리거하지 않는다(AWS 배포 미연결).
- **Merge guards (project-standards ADR-0016):** if the PR's "Check before merging" lists an item that needs the user's own decision, ask the user and do not merge. Merging is not applying: real production or AWS changes (for example `terraform apply` or a manual deploy action) still need the user's OK.

## 고유 스킬

- [study-log-implementation](skills/study-log-implementation/SKILL.md), [study-log-testing](skills/study-log-testing/SKILL.md), [study-log-foundation](skills/study-log-foundation/SKILL.md): 이 프로젝트의 리뷰·병합 절차가 들어 있어 공통 스킬(std-*)이 들어온 뒤에도 유지한다.

## 서비스 규칙

- 학습 일정: [docs/decisions/schedule-rules.md](docs/decisions/schedule-rules.md)
- 복습 주기: [docs/decisions/review-rules.md](docs/decisions/review-rules.md)
- Text extraction from files: [docs/decisions/extraction-rules.md](docs/decisions/extraction-rules.md)
