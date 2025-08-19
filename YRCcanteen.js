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
  const request = new Request("https://www.yupparaj.ac.th/canteen/login.php");
  request.headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };
  
  try {
    const response = await request.loadString();
    log(`Page loaded: ${request.response.url} (${response.length} chars)`);
    
    const currentURL = request.response.url;
    let currentPage = 0;
    
    if (currentURL.includes("index.php")) {
      currentPage = 2; // already logged in
    } else if (currentURL.includes("login.php")) {
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
    /name=['"]csrf_token['"][^>]*value=['"]([^'"]+)['"]/i,
    /value=['"]([^'"]+)['"][^>]*name=['"]csrf_token['"]/i,
    /<meta[^>]*name=['"]csrf-token['"][^>]*content=['"]([^'"]+)['"]/i
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
        var input = document.querySelector('input[name="csrf_token"]');
        var meta = document.querySelector('meta[name="csrf-token"]');
        return input?.value || meta?.getAttribute('content') || null;
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
  const request = new Request("https://www.yupparaj.ac.th/canteen/api/login.php");
  request.method = "POST";
  request.headers = {
    "Cookie": `PHPSESSID=${cookie}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    "Referer": "https://www.yupparaj.ac.th/canteen/login.php"
  };
  request.body = `username=${username}&password=${password}&csrf_token=${csrf_token}&Login=`;
  
  try {
    const response = await request.loadString();
    log(`Login response: ${request.response.statusCode}`);
    return request.response.statusCode === 200 ? [response, request.response] : null;
  } catch (error) {
    log(`Login failed: ${error.message}`);
    return null;
  }
}

async function extractBalance(html) {
  try {
    const webView = new WebView();
    await webView.loadHTML(html);
    
    const balance = await webView.evaluateJavaScript(`
      (function() {
        // Primary selector
        var balanceElement = document.querySelector('html > body.sidebar-closed.sidebar-collapse > div.wrapper > div.content-wrapper > section.content > div.container-fluid > div.row.mb-4 > div.col-12 > div.card.card-primary.card-outline > div.card-body.text-center > h1.display-3.font-weight-bold.text-success');
        
        if (balanceElement) {
          return balanceElement.textContent.trim();
        }
        
        // Fallback selectors
        var fallbacks = [
          'h1.display-3.font-weight-bold.text-success',
          '.text-success',
          '.display-3'
        ];
        
        for (var selector of fallbacks) {
          var element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            return element.textContent.trim();
          }
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
  const parsed = parseFloat(value.replace(/,/g, ''));
  return isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
}

async function getCanteenData() {
  try {
    log("Starting canteen data retrieval");
    
    const pageData = await getCurrentPage();
    if (!pageData) return "Connection Error";
    
    let [currentPage, html, response] = pageData;
    
    const session = response.cookies.find(cookie => cookie.name === "PHPSESSID")?.value;
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