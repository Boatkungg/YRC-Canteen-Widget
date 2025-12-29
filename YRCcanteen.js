// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: magic;

// For debugging purposes
const USERNAME = "username";
const PASSWORD = "password";
const UPDATE_RATE = 5; // update rate in minutes
const DEBUG = false; // set to true to enable debugging mode

function log(message) {
  if (DEBUG) console.log(`[DEBUG] ${message}`);
}

async function debugHTML(html) {
  const webView = new WebView();
  await webView.loadHTML(html);
  await webView.present(true);
}

async function getCurrentPage(session) {
  const request = new Request("https://www.yupparaj.ac.th/canteen/login");
  const headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
  };

  if (session) {
    headers["Cookie"] = `canteen_session=${session}`;
  }

  request.headers = headers;

  try {
    const response = await request.loadString();
    log(`Page loaded: ${request.response.url} (${response.length} chars)`);

    const currentURL = request.response.url;
    let currentPage = "unknown";

    if (currentURL.includes("dashboard")) {
      currentPage = "dashboard"; // already logged in
    } else if (currentURL.includes("login")) {
      currentPage = "login"; // need to login
    }

    return [currentPage, response, request.response];
  } catch (error) {
    log(`Error loading page: ${error.message}`);
    return null;
  }
}

async function getCSRF(html) {
  // Try regex extraction first (faster)
  const patterns = [
    /name=['"]_csrf_token"[^>]*value=['"]([^'"]+)['"]/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      log(`CSRF token found: ${match[1].substring(0, 10)}...`);
      return match[1];
    }
  }

  // Fallback to WebView
  try {
    const webView = new WebView();
    await webView.loadHTML(html);

    const csrf = await webView.evaluateJavaScript(`
      (function() {
        var input = document.querySelector('input[name="_csrf_token"]');
        return input?.value || null;
      })()
    `);

    log(csrf ? `CSRF via WebView: ${csrf.substring(0, 10)}...` : "No CSRF token found");
    return csrf;
  } catch (error) {
    log(`CSRF extraction failed: ${error.message}`);
    return null;
  }
}

async function login(cookie, csrf_token, username, password) {
  const request = new Request("https://www.yupparaj.ac.th/canteen/login");
  request.method = "POST";
  request.headers = {
    "Cookie": `canteen_session=${cookie}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    "Referer": "https://www.yupparaj.ac.th/canteen/login"
  };
  request.body = `_csrf_token=${encodeURIComponent(csrf_token)}&user_type=student&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  // Will not follow redirects
  request.onRedirect = (response) => {
    log(`Redirected to: ${response.url}`);
    return null;
  }

  try {
    const response = await request.loadString();
    log(`Login response: ${request.response.statusCode}`);
    return request.response.statusCode === 302 ? [response, request.response] : null;
  } catch (error) {
    log(`Login failed: ${error.message}`);
    return null;
  }
}

async function logout(cookie) {
  const request = new Request("https://www.yupparaj.ac.th/canteen/student/logout");
  request.method = "GET";
  request.headers = {
    "Cookie": `canteen_session=${cookie}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    "Referer": "https://www.yupparaj.ac.th/canteen/student/dashboard"
  };

  try {
    const response = await request.loadString();
    log(`Logout response: ${request.response.statusCode}`);
  } catch (error) {
    log(`Logout failed: ${error.message}`);
  }
}

async function extractBalance(html) {
  try {
    const webView = new WebView();
    await webView.loadHTML(html);

    const balance = await webView.evaluateJavaScript(`
      (function() {
        // Primary selector
        var balanceElement = document.querySelector('body > main > div > div.bg-gradient-to-r.from-blue-500.to-indigo-600.rounded-2xl.p-8.text-white.shadow-xl > div.flex.items-center.justify-between > div:nth-child(1) > p.text-4xl.font-bold.mt-1');
        
        if (balanceElement) {
          return balanceElement.textContent.trim();
        }
        
        return '0';
      })()
    `);

    log(`Extracted balance: ${balance}`);
    return balance || '0';
  } catch (error) {
    log(`Balance extraction failed: ${error.message}`);
    return '0';
  }
}

function parseValue(value) {
  const parsed = parseFloat(value.replace(/[฿,]/g, ''));
  return isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
}

async function getCanteenData(username, password) {
  try {
    log("Starting canteen data retrieval");

    const pageData = await getCurrentPage();
    if (!pageData) return "Connection Error";

    let [currentPage, html, response] = pageData;

    let session = response.cookies.find(cookie => cookie.name === "canteen_session")?.value;
    if (!session) return "No Session";

    log(`Session ID: ${session.substring(0, 10)}...`);

    // Login if needed
    if (currentPage === "login") {
      log("Attempting login");
      const csrf = await getCSRF(html);
      if (!csrf) return "No CSRF";

      const loginResult = await login(session, csrf, username, password);
      if (!loginResult) return "Login Failed";

      // Update session from login response
      session = loginResult[1].cookies.find(cookie => cookie.name === "canteen_session")?.value;
      if (!session) return "No Session After Login";

      log(`New session ID: ${session.substring(0, 10)}...`);
    }

    // Verify logged in
    const verifyData = await getCurrentPage(session);
    if (!verifyData) return "Connection Error";
    [currentPage, html, response] = verifyData;
    if (currentPage !== "dashboard") {
      return "Not Logged In";
    }

    // Extract balance
    const rawBalance = await extractBalance(html);
    const parsed = parseValue(rawBalance);
    const balance = parsed > 0 ? parsed.toString() : rawBalance;

    // Logout
    await logout(session);

    log(`Final balance: ${balance}`);
    return balance;

  } catch (error) {
    log(`Error in getCanteenData: ${error.message}`);
    return "Error";
  }
}

async function createWidget(username, password, update_rate) {
  const listWidget = new ListWidget();
  listWidget.refreshAfterDate = new Date(Date.now() + 60000 * update_rate);

  const balance = await getCanteenData(username, password);
  // Colors
  const headingColor = Color.dynamic(Color.black(), Color.white());
  const textColor = Color.dynamic(Color.darkGray(), Color.lightGray());
  const balanceColor = Color.dynamic(new Color("#10b981"), new Color("#34d399"));

  // Header with title and timestamp
  const headerStack = listWidget.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();

  const heading = headerStack.addText("🍽️ YRC Canteen");
  heading.font = Font.boldSystemFont(24);
  heading.textColor = headingColor;

  headerStack.addSpacer();

  const timestamp = headerStack.addDate(new Date());
  timestamp.font = Font.lightSystemFont(14);
  timestamp.applyTimeStyle();
  timestamp.textColor = textColor;

  listWidget.addSpacer();

  // Main content with balance and label
  const mainStack = listWidget.addStack();
  mainStack.layoutHorizontally();
  mainStack.bottomAlignContent();

  mainStack.addSpacer();

  const balanceText = mainStack.addText(balance);
  balanceText.font = Font.boldSystemFont(72);
  balanceText.textColor = balanceColor;
  balanceText.minimumScaleFactor = 0.5;

  mainStack.addSpacer(12);

  const labelStack = mainStack.addStack();
  labelStack.layoutVertically();
  labelStack.bottomAlignContent();

  const labelText = labelStack.addText("คงเหลือ");
  labelText.font = Font.systemFont(18);
  labelText.textColor = textColor;

  labelStack.addSpacer(12);

  mainStack.addSpacer();

  listWidget.addSpacer();

  return listWidget;
}

// Main execution
async function main() {
  // Load settings
  const fm = FileManager.local();
  const scriptPath = module.filename;
  const settingsPath = scriptPath.replace(fm.fileName(scriptPath, true), "YRCcanteen-settings.json");
  let settings = {}
  if (fm.fileExists(settingsPath)) {
    try {
      const settingsRaw = fm.readString(settingsPath);
      settings = JSON.parse(settingsRaw);
    } catch (e) {
      log(`Failed to parse settings: ${e.message}`);
    }
  }

  // Override settings in debug mode
  if (DEBUG) {
    settings.username = USERNAME;
    settings.password = PASSWORD;
    settings.update_rate = UPDATE_RATE;
  }

  if (config.runsInWidget) {
    let widget;
    // If credentials are set in settings, use them
    if (settings.username && settings.password) {
      widget = await createWidget(settings.username, settings.password, settings.update_rate || UPDATE_RATE);
    } else {
      widget = new ListWidget();
      const errorText = widget.addText("⚠️ Please set your credentials in the app.");
      errorText.font = Font.systemFont(16);
      errorText.textColor = Color.red();
      widget.centerAlignContent();
    }
    Script.setWidget(widget);
  } else {
    // Edit the settings if run in app and not in debug mode
    while (!DEBUG) {
      const alert = new Alert();
      alert.title = "YRC Canteen Widget Settings";
      alert.message = "What would you like to do?";
      alert.addAction("Edit Credentials");
      alert.addAction("Edit Update Rate");
      alert.addAction("Done");

      const choice = await alert.presentSheet();

      if (choice === 0) {
        const credAlert = new Alert();
        credAlert.title = "Edit Credentials";
        credAlert.addTextField("Username", settings.username || "");
        credAlert.addSecureTextField("Password", settings.password || "");
        credAlert.addAction("Save");
        credAlert.addAction("Cancel");

        const credChoice = await credAlert.present();
        if (credChoice === 0) {
          settings.username = credAlert.textFieldValue(0);
          settings.password = credAlert.textFieldValue(1);
          fm.writeString(settingsPath, JSON.stringify(settings));
          log("Credentials updated");
        }

      } else if (choice === 1) {
        const rateAlert = new Alert();
        rateAlert.title = "Edit Update Rate";
        rateAlert.message = "Set the update rate in minutes:";
        rateAlert.addTextField("Update Rate", settings.update_rate ? settings.update_rate.toString() : UPDATE_RATE.toString());
        rateAlert.addAction("Save");
        rateAlert.addAction("Cancel");

        const rateChoice = await rateAlert.present();
        if (rateChoice === 0) {
          const rateValue = parseInt(rateAlert.textFieldValue(0));
          if (!isNaN(rateValue) && rateValue > 0) {
            settings.update_rate = rateValue;
            fm.writeString(settingsPath, JSON.stringify(settings));
            log("Update rate updated");
          }
        }

      } else {
        break;
      }

    }

    if (settings.username && settings.password) {
      const widget = await createWidget(settings.username, settings.password, settings.update_rate || UPDATE_RATE);
      await widget.presentMedium();
    } else {
      const alert = new Alert();
      alert.title = "No Credentials";
      alert.message = "Please set your credentials first.";
      alert.addAction("OK");
      await alert.present();
    }
  }

  Script.complete();
}

// Uncomment to run main directly for testing
// await main();

module.exports = { main };
