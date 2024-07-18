// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: magic;

const username = "username"; // your username here
const password = "password"; // your password here

// update rate in minutes
const update_rate = 5;


async function getCurrentPage() {
  const url = "https://www.yupparaj.ac.th/canteen/login.php"
  
  const request = new Request(url);
  
  const response = await request.loadString();
  
  if (request.response.statusCode === 200) {
    const currentURL = request.response.url;
    //throw new Error(currentURL);
    var currentPage = 0
    if (currentURL === "https://www.yupparaj.ac.th/canteen/index.php") {
      currentPage = 2;
    } else if (currentURL === "https://www.yupparaj.ac.th/canteen/login.php") {
      currentPage = 1;
    } else {
      return undefined;
    }
    
    return [currentPage, response, request.response];
  }
  
  return undefined;
}


async function getCSRF(html) {
  const webView = new WebView();
  
  await webView.loadHTML(html);
  
  const jsGetCSRF = `
  document
  	.getElementsByName('csrf_token')[0]
    .value
  `
  const CSRF = await webView.evaluateJavaScript(jsGetCSRF);
  
  return CSRF
}


async function Login(cookie, csrf_token) {
  const url = "https://www.yupparaj.ac.th/canteen/api/login.php"
  
  const request = new Request(url);
  
  request.method = "POST"
  
 // throw new Error(csrf_token);
  
  request.headers = {
    "Cookie": `PHPSESSID=${cookie}`,
  }
  
  request.body = `username=${username}&password=${password}&csrf_token=${csrf_token}&Login=`
  
	const response = await request.loadString();
  
  if (request.response.statusCode === 200) {
    return [response, request.response];
  }
  
  return undefined;
}


async function Logout(cookie) {
  const url = "https://www.yupparaj.ac.th/canteen/logout.php"
  
  const request = new Request(url);
  
  request.method = "POST"
  
  request.headers = {
    "Cookie": `PHPSESSID=${cookie}`,
  }
  
	var response = await request.loadString();
  
  log(response);
}


function getValueNumber(number) {
  return `
  document
  	.getElementsByClassName('inner')[${number}]
    .getElementsByTagName('h3')[0]
    .textContent
  `;
}


async function getValues(html) {
  const webView = new WebView();
  
  await webView.loadHTML(html);
  
  const jsGetBalance = getValueNumber(0);
  const balance = await webView.evaluateJavaScript(jsGetBalance);
  
  const jsGetTopUp = getValueNumber(1);
  const topUp = await webView.evaluateJavaScript(jsGetTopUp);
  
  const jsGetExpense = getValueNumber(2);
  const expense = await webView.evaluateJavaScript(jsGetExpense);
  
  return [balance, topUp, expense];
}

async function getInfo() {
	let [a, b, c] = await getCurrentPage();
	//log(b);

	const session = c.cookies.find(cookie => cookie.name === "PHPSESSID").value;
  
  //await Logout(session);
  //a = 1;

	log(session);

	if (a === 1) {
  	const csrf = await getCSRF(b);
  	[b, c] = await Login(session, csrf);
  	a = 2;
	}

	let [bal, top, exp] = ["0", "0", "0"];
	if (a === 2) {
  	[bal, top, exp] = await getValues(b);
    bal = Number(parseFloat(bal).toFixed(2)).toString();
    top = Number(parseFloat(top).toFixed(2)).toString();
    exp = Number(parseFloat(exp).toFixed(2)).toString();
  	log(bal);
  	log(top);
  	log(exp);
	}
  
  return [bal, top, exp];
}

async function createWidget() {
  let listWidget = new ListWidget();
  listWidget.refreshAfterDate = new Date(Date.now() + 60000 * update_rate);
  
  const [bal, top, exp] = await getInfo();
  
  const headingColor = Color.dynamic(Color.black(), Color.white());
  const textColor = Color.dynamic(Color.darkGray(), Color.lightGray());
  const balColor = Color.dynamic(new Color("#10b981"), new Color("34d399"));
  const topColor = Color.dynamic(new Color("#3b82f6"), new Color("#60a5fa"));
  const expColor = Color.dynamic(new Color("#ef4444"), new Color("#f87171"));
  
  var heading = listWidget.addText("🍽️ YRC Canteen");
  heading.font = Font.boldSystemFont(24);
  heading.textColor = headingColor;
  
  listWidget.addSpacer();
  
  const stack = listWidget.addStack();
  
  listWidget.addSpacer(12);

  
  const balStack = stack.addStack();
  balStack.layoutVertically();
  balStack.topAlignContent();
  
  stack.addSpacer();
  
  const topStack = stack.addStack();
  topStack.layoutVertically();
  topStack.centerAlignContent();
  
  stack.addSpacer();
  
  const expStack = stack.addStack();
  expStack.layoutVertically();
  expStack.centerAlignContent();
  
  
	var balanceHeading = balStack.addText("💰 คงเหลือ");
  balanceHeading.centerAlignText();
  balanceHeading.font = Font.lightSystemFont(18);
  balanceHeading.textColor = textColor;
  
  balStack.addSpacer(4);
  
  var balance = balStack.addText(bal);
  balance.centerAlignText();
  balance.font = Font.lightSystemFont(24);
  balance.textColor = balColor;
  
  
  var topUpHeading = topStack.addText("📊 ยอดเติม");
  topUpHeading.centerAlignText();
  topUpHeading.font = Font.lightSystemFont(18);
  topUpHeading.textColor = textColor;
  
  topStack.addSpacer(4);
  
  var topUp = topStack.addText(top);
  topUp.centerAlignText();
  topUp.font = Font.lightSystemFont(24);
  topUp.textColor = topColor;
  
  
  var expenseHeading = expStack.addText("💸 ซื้ออาหาร");
  expenseHeading.centerAlignText();
  expenseHeading.font = Font.lightSystemFont(18);
  expenseHeading.textColor = textColor;
  
  expStack.addSpacer(4);
  
  var expense = expStack.addText(exp);
  expense.centerAlignText();
  expense.font = Font.lightSystemFont(24);
  expense.textColor = expColor;
  
  return listWidget
}

let widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}
Script.complete();
