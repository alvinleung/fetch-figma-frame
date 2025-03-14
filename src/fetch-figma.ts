import axios from "axios";
import http from "http";

const CLIENT_ID = "U1gkArN0028eE5ptwMzrpW";
const CLIENT_SECRET = "ZVGIrhqyyTaDHos9dMVMoLdaskeZEo";
const REDIRECT_URI_PORT = 54321;
const REDIRECT_URI = `http://localhost:${REDIRECT_URI_PORT}/callback`;

let accessToken: string | null = null;

async function authenticateWithFigma(): Promise<string | null> {
  return new Promise((resolve) => {
    const server = http
      .createServer(async (req, res) => {
        const url = new URL(
          req.url || "",
          `http://localhost:${REDIRECT_URI_PORT}`
        );
        const code = url.searchParams.get("code");

        if (code) {
          try {
            console.log("fetching token response");
            const tokenResponse = await axios.post(
              "https://api.figma.com/v1/oauth/token",
              new URLSearchParams({
                redirect_uri: REDIRECT_URI,
                code: code,
                grant_type: "authorization_code",
                // Remove client_id/client_secret from body
              }).toString(),
              {
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Authorization: `Basic ${Buffer.from(
                    `${CLIENT_ID}:${CLIENT_SECRET}`
                  ).toString("base64")}`,
                },
              }
            );

            console.log("we got token response yay!");
            accessToken = tokenResponse.data.access_token;
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("Authentication successful! You can close this tab.");
            server.close();
            resolve(accessToken);
          } catch (e) {
            console.warn(e);
            return;
          }
        } else {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Invalid request");
        }
      })
      .listen(REDIRECT_URI_PORT);

    const authUrl = `https://www.figma.com/oauth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=file_read&state=123&response_type=code`;
    import("open").then((open) => open.default(authUrl));
  });
}

export async function fetchFigmaFrame(
  fileKey: string,
  frameId: string
): Promise<any | null> {
  if (!accessToken) {
    accessToken = await authenticateWithFigma();
    if (!accessToken) {
      return new Error("Authentication failed.");
    }
  }

  const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${frameId}`;
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  } catch (error: any) {
    return new Error(`Error fetching Figma frame: ${error.message}`);
  }
}
