# 공부 기록 고유 지침

이 파일은 study-log에만 해당하는 규칙이다. 공통 지침은 [AGENTS.md](AGENTS.md)이며, 중앙 표준(`sirloinbh/project-standards`) 동기화 후에는 중앙 관리 파일이 된다. 두 파일이 다르면 이 파일이 우선한다.

## 작업 절차 (공통 절차에 더해)

- **PR을 올린 뒤 자동 코드 리뷰를 최대 2회 거치고, 최종 head의 필수 CI 검사가 모두 통과하면 에이전트(주 에이전트와 로컬 워커)가 묻지 않고 PR을 병합한다.** 리뷰에서 보완점이 나오면 추가 커밋으로 반영하고, 1차 보완 후에는 2차 리뷰를 한 번 더 받는다. 2차 보완 커밋 뒤에는 더 리뷰하지 않는다. 보완점이 없으면 바로 다음 단계로 간다. 이 PR에서 고치기에 큰 수정은 새 이슈카드로 분리한다. 상세 절차는 implementation 스킬을 따른다. 병합은 병합 커밋 방식으로 `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <검증한 head SHA>`를 쓰고, 연결 이슈(`Closes #N`)가 닫혔는지 확인한다. 연속 PR은 순서대로 병합한다. 앞 PR 병합 후 다음 PR 브랜치에 `origin/main`을 병합해 충돌을 풀고 관련 테스트를 다시 실행한 뒤 일반 푸시하고, CI 통과 후 병합한다. 실패·실행 중 검사가 있는 상태의 병합, `--admin` 등 브랜치 보호 우회, 자기 PR 승인으로 검토 대체, `main` 직접 푸시·커밋, 강제 푸시는 금지한다. 현재 `main` 병합은 배포를 트리거하지 않는다(AWS 배포 미연결).

## 고유 스킬

- [study-log-implementation](skills/study-log-implementation/SKILL.md), [study-log-testing](skills/study-log-testing/SKILL.md), [study-log-foundation](skills/study-log-foundation/SKILL.md): 이 프로젝트의 리뷰·병합 절차가 들어 있어 공통 스킬(std-*)이 들어온 뒤에도 유지한다.

## 서비스 규칙

- 학습 일정: [docs/decisions/schedule-rules.md](docs/decisions/schedule-rules.md)
- 복습 주기: [docs/decisions/review-rules.md](docs/decisions/review-rules.md)
