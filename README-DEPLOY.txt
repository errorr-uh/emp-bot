EMPÍRE BOT CONTROL PORTAL — EDGEONE DEPLOYMENT
================================================

IMPORTANT CHANGE IN THIS BUILD
-----------------------------
The main bot service controls do NOT require signing in as Admin or Staff.
Paste a bot token you own or are authorized to use, enter the server ID, and
select a supported service. The backend uses that token for that request only.
It does not save the token or return it to the browser.

The Admin and Staff buttons/panels remain part of the original dashboard and
still use the existing Firebase sign-in for those separate management panels.
That sign-in is not a prerequisite for Validate Token or running bot services.

FILES
-----
index.html                         Original EMPÍRE UI with service API fix
cloud-functions/api/discord.js     EdgeOne API function: POST /api/discord
package.json                       Node.js ES module metadata
CHANGELOG.txt                      Changes in this build
ENVIRONMENT.example.txt            Configuration notes
TEST-REPORT.txt                    Local checks and limitations

DEPLOYMENT
----------
1. Extract this ZIP.
2. Open your Tencent Cloud EdgeOne project and choose the same Node.js Cloud
   Function / Makers deployment workflow used for the previous API build.
3. Upload the project folder with the directory structure preserved.
4. Ensure the function route is /api/discord and the frontend is served from
   the same site origin. The frontend calls the relative path /api/discord. The API now returns
CORS headers for the requesting portal origin instead of comparing the
browser origin to EdgeOne's internal request URL. This handles custom-domain
and EdgeOne function-host routing differences. No cookies or credentialed
CORS are used.
5. Deploy the project.
6. Open https://YOUR-DOMAIN/api/discord. A JSON health response should appear.
7. Open the dashboard, paste your bot token, click Validate Token, then enter
   the server ID and use a supported service.

ENVIRONMENT VARIABLES
---------------------
No BOT_TOKEN, ADMIN_UIDS, STAFF_UIDS, FIREBASE_PROJECT_ID, or ALLOWED_GUILD_IDS
variables are required for the main bot-service API in this build.

The bot token is entered in the dashboard for each request. It is sent over
HTTPS to /api/discord and used in memory for the Discord REST request. Do not
paste tokens into public/shared computers. Never commit tokens to GitHub.

Firebase web configuration already present in index.html is used only for the
existing optional audit / Admin-Staff panel experience. It is not used to
authorize main service requests. If Firebase is not configured, bot services
can still run; optional audit records will not be written.

USAGE
-----
- Token validation: POST action validate-token; no server ID required.
- Other actions: require a valid numeric Discord Server ID.
- The bot must already be in that server and have the relevant Discord
  permissions. Discord itself enforces the permissions and role hierarchy.
- Use the Bot Token from Discord Developer Portal > your application > Bot.
  Do not use the OAuth Client Secret or an account/user token.
- The endpoint accepts only the explicit action list in the backend. It is
  not an unrestricted Discord API proxy.
- Create operations are capped at 10 per request. Destructive actions operate
  on the single target supplied by the form.

SECURITY NOTE
-------------
Removing portal login means the endpoint is publicly reachable. A request can
only act using the bot token supplied by its caller, but anyone who obtains a
bot token can use that bot's permissions through this endpoint. Keep the site
private or add a separate access layer if you need to restrict who can submit
requests. Do not share bot tokens. CORS is not an authentication mechanism.

TROUBLESHOOTING
---------------
401 Unauthorized: token is invalid, regenerated, copied incorrectly, or is
not a Bot Token.
403 Forbidden: bot is not permitted to perform that action, is missing a
permission, or its role is below the target role.
404 Not Found: wrong server / target ID, or bot cannot access the resource.
429: Discord rate limit; backend retries once after a short wait.
404 on /api/discord: the EdgeOne function route or upload folder structure is
not configured correctly.

This package cannot deploy itself into your Tencent account. Confirm the
function runtime and route in your EdgeOne console before using it live.

CORS NOTE
---------
This build echoes the Origin header for browser compatibility because the
portal uses per-request bot tokens and does not use cookie-based API login.
CORS is not authentication. Keep bot tokens private, use HTTPS, and do not
embed tokens in source code or GitHub. The API still accepts only the listed
actions and validates the supplied token with Discord.
