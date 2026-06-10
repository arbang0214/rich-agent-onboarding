// 서버리스 함수: 인가코드 → 카카오 토큰 교환 → friend.json을 rich-agent repo에 저장.
// ⚠️ 여기서만 client_secret·GITHUB_TOKEN을 다룬다. 토큰 값은 프런트로 돌려주지 않는다.
// ⚠️ friend.json(refresh_token 포함)은 별도 private repo(rich-agent)에만 저장. 이 public repo엔 절대 X.

const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
// redirect_uri는 비밀이 아니지만, 카카오에 등록한 값과 정확히 일치해야 한다.
const REDIRECT_URI = "https://rich-agent-onboarding.vercel.app/callback";

// friend.json을 저장할 private repo. agent 코드(agent.py·rules.py 등)는 건드리지 않고 users/만 만진다.
const GH_OWNER = "arbang0214";
const GH_REPO = "rich-agent";
const GH_BRANCH = "main";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST만 허용됩니다." });
  }

  // 프런트가 보낸 code + 이름 + 포트폴리오
  const { code, portfolio, name } = req.body || {};
  if (!code) {
    return res.status(400).json({ ok: false, error: "인가코드(code)가 없습니다." });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ ok: false, error: "이름이 없습니다." });
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

    if (!data.refresh_token) {
      console.error("refresh_token 없음 — 동의 범위 확인 필요");
      return res.status(400).json({ ok: false, error: "알림 권한을 받지 못했어요. 동의 후 다시 시도해주세요." });
    }

    // 친구 정보 JSON 구성 (refresh_token 포함 — 절대 프런트로 안 보냄)
    const watchlist = Array.isArray(portfolio) ? portfolio : [];
    const friend = {
      name: String(name).trim(),
      watchlist: watchlist,
      kakao_refresh_token: data.refresh_token,
      created_at: new Date().toISOString(),
    };

    // rich-agent repo의 users/{name}.json 에 커밋 (저장)
    try {
      await saveFriend(friend);
    } catch (e) {
      console.error("friend.json 저장 실패:", e.message);
      return res.status(502).json({ ok: false, error: "저장에 실패했어요. 잠시 후 다시 시도해주세요." });
    }

    // 가입 성공 직후 환영 카톡 1회 전송 (부가 기능: 실패해도 가입은 성공 처리).
    // access_token은 여기서만 쓰고 저장하지 않는다 (저장은 refresh_token, 이미 friend.json에).
    try {
      await sendWelcome(data.access_token, friend.name, watchlist);
    } catch (e) {
      console.error("환영 메시지 전송 실패(가입은 성공 처리):", e.message);
    }

    // 프런트에는 성공 여부 + 포트폴리오만. 토큰은 돌려주지 않는다.
    return res.status(200).json({
      ok: true,
      portfolio: watchlist,
    });
  } catch (e) {
    console.error("토큰 교환 중 예외:", e.message);
    return res.status(502).json({ ok: false, error: "카카오 서버와 통신 중 문제가 발생했습니다." });
  }
}

// friend.json을 rich-agent repo의 users/{안전한이름}.json 에 생성/갱신한다.
async function saveFriend(friend) {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    throw new Error("환경변수 누락: GITHUB_TOKEN");
  }

  const safeName = safeFileName(friend.name);
  const path = `users/${safeName}.json`;
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`;
  const headers = {
    Authorization: `Bearer ${ghToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "rich-agent-onboarding",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // 이미 있으면 덮어쓰기 위해 기존 파일의 sha를 먼저 조회
  let sha = undefined;
  const getResp = await fetch(`${url}?ref=${GH_BRANCH}`, { headers });
  if (getResp.ok) {
    const existing = await getResp.json();
    sha = existing.sha;
  } else if (getResp.status !== 404) {
    throw new Error(`기존 파일 조회 실패 (${getResp.status})`);
  }

  const contentB64 = Buffer.from(JSON.stringify(friend, null, 2), "utf-8").toString("base64");
  const body = {
    message: `친구 가입/갱신: ${safeName}`,
    content: contentB64,
    branch: GH_BRANCH,
  };
  if (sha) body.sha = sha;

  const putResp = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!putResp.ok) {
    const err = await putResp.text();
    // 토큰 값이 아닌 상태코드/메시지만 로그
    console.error("GitHub 커밋 실패:", putResp.status, err.slice(0, 200));
    throw new Error(`GitHub 커밋 실패 (${putResp.status})`);
  }
  console.log(`friend.json 저장 완료: ${path} (${sha ? "갱신" : "신규"})`);
}

// 방금 발급된 access_token으로 "나에게 보내기" 환영 메시지 1회 전송.
// access_token은 전송에만 쓰고 저장하지 않는다. 토큰 값은 로그에 찍지 않는다.
async function sendWelcome(accessToken, name, watchlist) {
  const stocks = watchlist.length ? watchlist.join(", ") : "선택한 종목";
  const text =
    `🎉 rich-agent 가입 완료!\n${name}님, 이제 매일 미국 장 마감 후 보유 ETF 구간을 확인해서 알려드려요. ` +
    `떨어질 때 알림이 오고, 살지 말지는 직접 결정하면 돼요. 📊 ${stocks}`;

  const templateObject = {
    object_type: "text",
    text: text,
    link: {
      web_url: "https://rich-agent-onboarding.vercel.app",
      mobile_web_url: "https://rich-agent-onboarding.vercel.app",
    },
  };

  const body = new URLSearchParams({ template_object: JSON.stringify(templateObject) });

  const resp = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    // 카카오 API 에러 응답만 로그 (토큰 값 아님)
    throw new Error(`카카오 메시지 API ${resp.status}: ${err.slice(0, 150)}`);
  }
  console.log("환영 메시지 전송 성공");
}

// 파일명에 안전한 이름만: 공백→_, 한글·영숫자·_- 외 제거. 비면 친구로.
function safeFileName(name) {
  const cleaned = String(name)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^0-9a-zA-Z가-힣_-]/g, "");
  return cleaned || "friend";
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
