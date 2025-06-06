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

async function extractValues(html) {
  try {
    const webView = new WebView();
    await webView.loadHTML(html);
    
    const values = await webView.evaluateJavaScript(`
      (function() {
        var inners = document.getElementsByClassName('inner');
        var result = [];
        for (var i = 0; i < 3; i++) {
          if (inners[i]) {
            var h3 = inners[i].getElementsByTagName('h3')[0];
            result.push(h3 ? h3.textContent.trim() : '0');
          } else {
            result.push('0');
          }
        }
        return result;
      })()
    `);
    
    log(`Extracted values: ${values}`);
    return values.length === 3 ? values : ['0', '0', '0'];
  } catch (error) {
    log(`Value extraction failed: ${error.message}`);
    return ['0', '0', '0'];
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
    if (!pageData) return ["Connection Error", "Connection Error", "Connection Error"];
    
    let [currentPage, html, response] = pageData;
    
    const session = response.cookies.find(cookie => cookie.name === "PHPSESSID")?.value;
    if (!session) return ["No Session", "No Session", "No Session"];
    
    // Login if needed
    if (currentPage === 1) {
      log("Attempting login");
      const csrf = await getCSRF(html);
      if (!csrf) return ["No CSRF", "No CSRF", "No CSRF"];
      
      const loginResult = await login(session, csrf);
      if (!loginResult) return ["Login Failed", "Login Failed", "Login Failed"];
      
      [html] = loginResult;
    }
    
    // Extract values
    const rawValues = await extractValues(html);
    const processedValues = rawValues.map(val => {
      const parsed = parseValue(val);
      return parsed > 0 ? parsed.toString() : val;
    });
    
    log(`Final values: ${processedValues}`);
    return processedValues;
    
  } catch (error) {
    log(`Error in getCanteenData: ${error.message}`);
    return ["Error", "Error", "Error"];
  }
}

async function createWidget() {
  const listWidget = new ListWidget();
  listWidget.refreshAfterDate = new Date(Date.now() + 60000 * update_rate);
  
  const [balance, topUp, expense] = await getCanteenData();
  
  // Colors
  const headingColor = Color.dynamic(Color.black(), Color.white());
  const textColor = Color.dynamic(Color.darkGray(), Color.lightGray());
  const balColor = Color.dynamic(new Color("#10b981"), new Color("#34d399"));
  const topColor = Color.dynamic(new Color("#3b82f6"), new Color("#60a5fa"));
  const expColor = Color.dynamic(new Color("#ef4444"), new Color("#f87171"));
  
  // Header
  const heading = listWidget.addText("🍽️ YRC Canteen");
  heading.font = Font.boldSystemFont(24);
  heading.textColor = headingColor;
  
  listWidget.addSpacer();
  
  // Data stack
  const stack = listWidget.addStack();
  
  // Create data sections
  const sections = [
    { title: "💰 คงเหลือ", value: balance, color: balColor },
    { title: "📊 ยอดเติม", value: topUp, color: topColor },
    { title: "💸 ซื้ออาหาร", value: expense, color: expColor }
  ];
  
  sections.forEach((section, index) => {
    if (index > 0) stack.addSpacer();
    
    const sectionStack = stack.addStack();
    sectionStack.layoutVertically();
    sectionStack.centerAlignContent();
    
    const titleText = sectionStack.addText(section.title);
    titleText.centerAlignText();
    titleText.font = Font.lightSystemFont(18);
    titleText.textColor = textColor;
    
    sectionStack.addSpacer(4);
    
    const valueText = sectionStack.addText(section.value);
    valueText.centerAlignText();
    valueText.font = Font.lightSystemFont(24);
    valueText.textColor = section.color;
  });
  
  // Timestamp
  const timestamp = listWidget.addDate(new Date());
  timestamp.font = Font.lightSystemFont(14);
  timestamp.applyTimeStyle();
  timestamp.rightAlignText();
  timestamp.textColor = textColor;
  
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