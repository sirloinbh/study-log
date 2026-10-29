# 앱 스킬의 낡은 설명 고치기 (sirloinbh/project-standards#313)

## 목적

앱 스킬 두 곳이 지금 상태와 다르게 적혀 있었다(sirloinbh/project-standards `docs/research/convention-survey.md` 3장).

## 변경

| 파일                                   | 전                                                | 후                                                                                 |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `skills/study-log-testing/SKILL.md`    | "아직 도입하지 않은 Vitest·Playwright"            | 프런트 Vitest·Testing Library, 백엔드 `node:test`가 설치돼 있음. Playwright는 없음 |
| `skills/study-log-foundation/SKILL.md` | 디자인 토큰은 `frontend/src/style.css`의 CSS 변수 | `@sirloinbh/design-tokens`와 공통 UI 컴포넌트(`frontend/src/components/ui/`)       |
| `.claude/skills/`                      | —                                                 | `npm run skills:sync`로 같은 내용 복제                                             |

리뷰·병합 절차(`study-log-implementation`, `AGENTS.project.md`)는 바꾸지 않았다.

## 검증

- `node scripts/claude-skills.mjs`: `.claude/skills matches skills/.`
