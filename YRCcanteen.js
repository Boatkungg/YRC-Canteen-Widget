// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: magic;
const username = "username"; // your username here
const password = "password"; // your password here
const update_rate = 5; // update rate in minutes
const DEBUG = false; // set to false to disable debug logs

function log(message) {
  if (DEBUG) console.log(`[DEBUG] ${message}`);
}

async function getCurrentPage() {
  const request = new Request("https://www.yupparaj.ac.th/canteen/login");
  request.headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };
  
  try {
    const response = await request.loadString();
    log(`Page loaded: ${request.response.url} (${response.length} chars)`);
    
    const currentURL = request.response.url;
    let currentPage = 0;
    
    if (currentURL.includes("dashboard")) {
      currentPage = 2; // already logged in
    } else if (currentURL.includes("login")) {
      currentPage = 1; // need to login
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

async function login(cookie, csrf_token) {
  const request = new Request("https://www.yupparaj.ac.th/canteen/login");
  request.method = "POST";
  request.headers = {
    "Cookie": `canteen_session=${cookie}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    "Referer": "https://www.yupparaj.ac.th/canteen/login"
  };
  request.body = `_csrf_token=${csrf_token}&user_type=student&username=${username}&password=${password}`;
  
  try {
    const response = await request.loadString();
    log(`Login response: ${request.response.statusCode}`);
    return request.response.statusCode === 200 ? [response, request.response] : null;
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
    return balance || '0.00';
  } catch (error) {
    log(`Balance extraction failed: ${error.message}`);
    return '0.00';
  }
}

function parseValue(value) {
  const parsed = parseFloat(value.replace(/[฿,]/g, ''));
  return isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
}

async function getCanteenData() {
  try {
    log("Starting canteen data retrieval");
    
    const pageData = await getCurrentPage();
    if (!pageData) return "Connection Error";
    
    let [currentPage, html, response] = pageData;
    
    const session = response.cookies.find(cookie => cookie.name === "canteen_session")?.value;
    if (!session) return "No Session";
    
    // Login if needed
    if (currentPage === 1) {
      log("Attempting login");
      const csrf = await getCSRF(html);
      if (!csrf) return "No CSRF";
      
      const loginResult = await login(session, csrf);
      if (!loginResult) return "Login Failed";
      
      [html] = loginResult;
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

async function createWidget() {
  const listWidget = new ListWidget();
  listWidget.refreshAfterDate = new Date(Date.now() + 60000 * update_rate);
  
  const balance = await getCanteenData();
  
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
(async () => {
  const widget = await createWidget();
  
  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    widget.presentMedium();
  }
  
  Script.complete();
})();
