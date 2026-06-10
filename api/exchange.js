// 서버리스 함수: 인가코드 → 카카오 토큰 교환.
// ⚠️ 여기서만 client_secret을 다룬다. 토큰 값은 프런트로 돌려주지 않는다.
// ⚠️ 이번 단계: 받기만 한다. friend.json 저장·repo 커밋은 다음 단계(3d).

const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
// redirect_uri는 비밀이 아니지만, 카카오에 등록한 값과 정확히 일치해야 한다.
const REDIRECT_URI = "https://rich-agent-onboarding.vercel.app/callback";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST만 허용됩니다." });
  }

  // 프런트가 보낸 code + 포트폴리오
  const { code, portfolio } = req.body || {};
  if (!code) {
    return res.status(400).json({ ok: false, error: "인가코드(code)가 없습니다." });
  }

  // 비밀·키는 환경변수에서만 읽는다 (Vercel Environment Variables). 하드코딩 금지.
  const clientId = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("환경변수 누락: KAKAO_REST_API_KEY / KAKAO_CLIENT_SECRET");
    return res.status(500).json({ ok: false, error: "서버 설정 오류입니다. 잠시 후 다시 시도해주세요." });
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    code: code,
  });

  try {
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: params.toString(),
    });

    const data = await resp.json();

    if (!resp.ok) {
      // 카카오 에러 (invalid_grant 등) — 토큰 값이 아닌 에러 코드만 로그
      console.error("토큰 교환 실패:", data.error, data.error_code);
      return res.status(400).json({
        ok: false,
        error: kakaoErrorMessage(data),
      });
    }

    // 성공: 토큰 "존재 여부"만 로그. 값 자체는 절대 로그/응답에 넣지 않는다.
    console.log("토큰 교환 성공", {
      access_token: Boolean(data.access_token),
      refresh_token: Boolean(data.refresh_token),
      expires_in: data.expires_in,
      scope: data.scope,
    });

    // 프런트에는 성공 여부 + 포트폴리오만. 토큰은 돌려주지 않는다.
    return res.status(200).json({
      ok: true,
      portfolio: Array.isArray(portfolio) ? portfolio : [],
    });
  } catch (e) {
    console.error("토큰 교환 중 예외:", e.message);
    return res.status(502).json({ ok: false, error: "카카오 서버와 통신 중 문제가 발생했습니다." });
  }
}

// 카카오 에러를 사용자 친화적 한국어로
function kakaoErrorMessage(data) {
  switch (data.error) {
    case "invalid_grant":
      return "인가코드가 만료되었거나 이미 사용됐어요. 처음부터 다시 시도해주세요.";
    case "invalid_client":
      return "앱 설정(키/시크릿)에 문제가 있어요. 관리자에게 알려주세요.";
    case "invalid_request":
      return "요청 형식에 문제가 있어요. 다시 시도해주세요.";
    default:
      return data.error_description || "토큰 교환에 실패했어요. 다시 시도해주세요.";
  }
}
