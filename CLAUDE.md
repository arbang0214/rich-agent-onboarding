# CLAUDE.md — rich-agent-onboarding (친구 가입 페이지)

## 이 프로젝트가 뭔가
rich-agent 서비스에 친구를 가입시키는 웹 페이지. rich-agent(파이썬 agent)와는 **별도 프로젝트**다.
친구가 이 페이지에서: (1) 카카오 로그인 → 카톡 알림 권한 부여, (2) 포트폴리오(보유 ETF) 선택 → 그 결과로 `friend.json` 하나가 만들어지고, rich-agent가 그걸 읽어 매일 알림을 보낸다.

두 프로젝트의 유일한 접점: **이 페이지가 만든 friend.json을 rich-agent가 읽는다.** 그 외엔 독립.

## 친구가 거치는 흐름
1. 링크 접속 (모바일에서 카톡으로 받음)
2. 포트폴리오 체크박스에서 본인 종목 선택
3. "카카오로 시작하기" 버튼 → 카카오 로그인 + 동의(talk_message)
4. 카카오가 이 페이지로 콜백(인가코드)
5. 서버리스 함수: 인가코드 → 토큰 교환 + 선택 포트폴리오 → friend.json 생성·저장
6. "완료" 표시

## 작업 원칙 (지킬 것)
- **학습 모드로 진행한다.** 한 번에 다 만들지 말 것. 작은 단위로, 왜 이렇게 하는지 설명하면서 쌓는다.
- **순수 HTML/JS + Vercel 서버리스(`/api`)로 간다. Next.js 등 프레임워크 도입 금지** (명시적으로 정하기 전엔).
- **모바일 우선(mobile-first)으로 디자인.** 친구는 폰에서 연다. 체크박스·버튼 크게, 세로 한 줄 레이아웃.
- **client_secret·토큰은 서버리스 함수에서만 다룬다. 프런트(브라우저)에 절대 노출 금지.** 토큰 교환은 반드시 서버 함수에서.
- 과대포장 금지. 정직하고 짧게.

## 보안 (이 프로젝트의 핵심 리스크)
- **카카오 client_secret, refresh_token을 클라이언트 코드(HTML/JS)에 넣지 말 것.** 반드시 서버리스 함수 + 환경변수(Vercel Environment Variables).
- **friend.json(친구 토큰 포함)은 이 public repo가 아니라 별도 private repo(rich-agent)에 저장한다. 이 repo엔 어떤 비밀도 커밋하지 않는다.**
- 친구의 refresh_token은 민감정보다. 그래서 위처럼 별도 private repo(rich-agent)에만 둔다.
- 키·토큰을 로그에 찍지 말 것.

## 종목 카탈로그 (체크박스 목록의 출처)
rich-agent의 카탈로그와 동일하게 유지한다. 현재:
- strategy(1.5배 풀 로직): VOO(S&P500) · QQQ(나스닥) · SOXX(반도체) · SMH(반도체)
- monitor(하락 알림만): MGK(메가캡 성장)
체크박스 목록은 이 카탈로그에서 생성한다. 종목 추가는 카탈로그 수정으로.

## 기술 스택
- 프런트: 순수 HTML/CSS/JS (모바일 우선)
- 서버: Vercel 서버리스 함수 (`/api/*.js`)
- 인증: 카카오 OAuth (scope: talk_message), redirect_uri = 이 페이지의 Vercel 콜백 주소
- 저장: friend.json을 별도 private repo(rich-agent)에 커밋 (이 repo 아님, 친구 소수 규모)
- 환경변수(Vercel): KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET 등. 코드에 박지 말 것.

## 빌드 순서
- 3a. 포트폴리오 체크박스 UI (프런트만, 서버·OAuth 없이)
- 3b. 카카오 로그인 버튼 + redirect/콜백 왕복
- 3c. 서버리스 함수: 인가코드 → 토큰 교환
- 3d. friend.json 저장 (토큰 + 포트폴리오 → repo 커밋)
- 3e. (rich-agent 쪽) agent가 friend.json을 읽도록 연결

## 협업 구조
- 설계·리뷰는 별도 논의에서 결정되고 이 파일에 반영된다.
- Claude Code: 이 폴더(rich-agent-onboarding) 안에서만 작업. rich-agent 폴더는 건드리지 말 것.
- git이 단일 진실. Vercel은 이 repo에 연결되어 push 시 자동 배포된다.
