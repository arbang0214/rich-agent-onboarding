// 공통 설정 — index.html, callback.html이 함께 사용.
// 여기 값은 "공개돼도 되는 것"만 둔다.
// ⚠️ client_secret·refresh_token 등 비밀은 절대 여기 두지 말 것 (3c 서버리스 함수 + 환경변수에서만).

// 카카오 REST API 키: 공개키라 프런트에 둬도 됨.
// 👉 카카오 개발자 콘솔 > 내 애플리케이션 > 앱 키 > REST API 키 값을 넣으세요.
const KAKAO_REST_API_KEY = "a78975b94235ba7ec70f005d4aa7829e";

// 카카오에 등록한 redirect_uri와 정확히 일치해야 함 (콘솔 > 카카오 로그인 > Redirect URI).
const REDIRECT_URI = "https://rich-agent-onboarding.vercel.app/callback";

// 종목 카탈로그 — rich-agent 카탈로그와 동일하게 유지.
// 나중에 카탈로그에서 자동 생성하기 좋게 배열로 정의 (지금은 하드코딩).
const CATALOG = [
  { ticker: "VOO",  leg: "S&P500",      mode: "strategy" },
  { ticker: "QQQ",  leg: "나스닥",      mode: "strategy" },
  { ticker: "SOXX", leg: "반도체",      mode: "strategy" },
  { ticker: "SMH",  leg: "반도체",      mode: "strategy" },
  { ticker: "MGK",  leg: "메가캡 성장", mode: "monitor"  },
];
