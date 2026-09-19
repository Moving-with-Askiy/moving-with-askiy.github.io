/**
 * Moving with Askiy — mailing list sign-up backend (Google Apps Script).
 *
 * What it does
 *   - Receives the website sign-up form (first name, email, consent).
 *   - Validates everything again on the server; the browser check is only a courtesy.
 *   - Hands the signup to a PROVIDER, which stores it and makes sure the person
 *     gets a confirmation email. Only confirmed people should ever be emailed.
 *
 * Providers (where signups go) — this is the part you swap when you outgrow Sheets
 *   "sheet"      Default. Saves rows in this Google Sheet and sends the
 *                confirmation email itself (about 100 emails/day on free Gmail).
 *   "mailchimp"  Example of a hosted service. Mailchimp stores the contact and
 *                sends its own confirmation email, so no daily limit of ours applies.
 *   Anything else: copy MailchimpProvider, change the API calls, add it to
 *   getProvider(). The website form never changes.
 *
 * Switching providers (the whole migration)
 *   1. Sheet menu > Mailing list > "Export confirmed subscribers" and
 *      "Export unsubscribed". Download each tab as CSV (File > Download) and import
 *      them into the new service. Import the unsubscribed list as "suppressed"
 *      or "do not contact" so those people are never emailed again.
 *   2. Set PROVIDER_NAME below to the new provider, save, and redeploy
 *      (Deploy > Manage deployments > pencil > New version > Deploy).
 *   The website, the form, and the /exec URL stay exactly as they are.
 *
 * Sending a newsletter, and unsubscribing
 *   - Email only rows whose Status is "Confirmed". Sheet menu > Mailing list >
 *     "Export confirmed subscribers" builds a tab of exactly those people.
 *   - That tab has an "Unsubscribe Link" column, unique to each person. Put each
 *     person's link in their copy of the email (mail merge), e.g. "Unsubscribe: <link>".
 *     Opening it sets their Status to "Unsubscribed" right away. Canadian
 *     anti-spam law expects a working unsubscribe in every marketing email.
 *   - If someone asks by email instead, change their Status to "Unsubscribed"
 *     by hand (spell it exactly like that). Never delete their row; the row is
 *     what keeps you from emailing them again by mistake.
 *
 * Setup (about 10 minutes)
 *   1. Create a new Google Sheet. Keep it private: share it only with the
 *      people who manage the list. Never use "Anyone with the link".
 *   2. In the Sheet choose Extensions > Apps Script, delete the sample code,
 *      and paste this whole file in.
 *   3. Check the settings just below.
 *   4. Deploy > New deployment > type "Web app".
 *        Execute as: Me
 *        Who has access: Anyone
 *      Approve the permission prompts (Sheets + sending email as you).
 *   5. Copy the Web app URL (ends in /exec) into MAILING_LIST_ENDPOINT in
 *      js/main.js on the website.
 *
 * The web app URL is public, but all it can do is add a signup or confirm a
 * token. It cannot read the Sheet. Keep secrets (API keys) out of this file,
 * because it is public once the site is published: put them in Project Settings >
 * Script properties instead.
 */

// ---- Settings ---------------------------------------------------------------

var ORG_NAME = "Moving with Askiy";
var REPLY_TO = "info@movingwithaskiy.com";
var PROVIDER_NAME = "sheet"; // "sheet" or "mailchimp"

var SHEET_NAME = "Subscribers";
var RESEND_AFTER_MS = 60 * 60 * 1000; // sheet provider: re-send a confirmation at most once an hour

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;


// ---- Web endpoints (provider-agnostic) --------------------------------------

function doPost(e) {
  var p = (e && e.parameter) || {};
  rememberWebAppUrl();

  // Honeypot: real visitors never see this field, so anything in it is a bot.
  // Answer "ok" so the bot learns nothing.
  if (p.website) return respond({ ok: true });

  var name = clean(p.firstName, 60);
  var email = clean(p.email, 254).toLowerCase();
  if (!name) return respond({ ok: false, error: "Please enter your first name." });
  if (!EMAIL_RE.test(email)) return respond({ ok: false, error: "Please enter a valid email address." });
  if (p.consent !== "yes") return respond({ ok: false, error: "Please tick the box so we know you'd like to hear from us." });

  var record = {
    firstName: name,
    email: email,
    consentText: clean(p.consentText, 300),
    page: clean(p.page, 60)
  };

  try {
    getProvider().subscribe(record);
  } catch (err) {
    console.error(err);
    return respond({ ok: false, error: "Sorry, something went wrong. Please try again in a moment." });
  }
  return respond({ ok: true });
}

// Links in our emails land here (sheet provider): ?confirm=TOKEN from the
// confirmation email, ?unsubscribe=TOKEN from the link in every newsletter.
function doGet(e) {
  var p = (e && e.parameter) || {};
  rememberWebAppUrl();
  var provider = getProvider();
  var html;

  if (p.unsubscribe) {
    html = provider.unsubscribe(String(p.unsubscribe))
      ? "<h2>You've been unsubscribed</h2><p>You won't receive any more emails from " + ORG_NAME + ". " +
        "If this was a mistake, you can sign up again any time on our website.</p>"
      : "<h2>That link didn't work</h2><p>Please email " + REPLY_TO + " and we'll remove you from the list by hand.</p>";
  } else {
    html = p.confirm && provider.confirm(String(p.confirm))
      ? "<h2>You're subscribed</h2><p>Thank you for confirming. We'll be in touch about " + ORG_NAME + " programs and events.</p>"
      : "<h2>That link didn't work</h2><p>It may be out of date. Please sign up again on our website, or email " + REPLY_TO + ".</p>";
  }

  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;max-width:480px;margin:3rem auto;padding:0 1rem;line-height:1.5">' + html + "</div>"
  ).setTitle(ORG_NAME);
}


// ---- Provider contract ------------------------------------------------------
//
// A provider is an object with three functions:
//
//   subscribe(record)  record = { firstName, email, consentText, page }.
//                      Store the signup and make sure the person receives a
//                      confirmation email. Must be safe to call twice for the
//                      same email. Throw if it fails.
//   confirm(token)     Only for providers where WE send the confirmation link.
//                      Return true if the person is now (or already) confirmed.
//   unsubscribe(token) Only for providers where WE put unsubscribe links in
//                      emails. Return true if the person is now unsubscribed.
//                      Providers that handle confirming and unsubscribing on
//                      their own side just return false from both.

function getProvider() {
  var providers = { sheet: SheetProvider, mailchimp: MailchimpProvider };
  var provider = providers[PROVIDER_NAME];
  if (!provider) throw new Error('Unknown PROVIDER_NAME "' + PROVIDER_NAME + '"');
  return provider;
}


// ---- Provider: Google Sheet -------------------------------------------------

var HEADERS = ["Signed up", "First name", "Email", "Status", "Confirmed at", "Consent text", "Page", "Token"];
var COL = { SIGNED_UP: 0, NAME: 1, EMAIL: 2, STATUS: 3, CONFIRMED: 4, CONSENT: 5, PAGE: 6, TOKEN: 7 };

var SheetProvider = {
  subscribe: function (record) {
    // One request at a time, so two quick submissions can't create duplicate rows.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getSheet();
      var rows = sheet.getDataRange().getValues();
      var now = new Date();
      var existing = -1;
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][COL.EMAIL]).toLowerCase() === record.email) { existing = i; break; }
      }
      // A returning person keeps their token, so the unsubscribe link in any
      // earlier newsletter keeps working.
      var token = existing !== -1 && rows[existing][COL.TOKEN] ? String(rows[existing][COL.TOKEN]) : Utilities.getUuid();

      var newRow = [now, record.firstName, record.email, "Pending", "", record.consentText, record.page, token];
      if (existing === -1) {
        sheet.appendRow(newRow);
      } else {
        var status = rows[existing][COL.STATUS];
        var lastSent = new Date(rows[existing][COL.SIGNED_UP]);
        // Already subscribed, or asked very recently: do nothing, and say nothing
        // different, so the form can't be used to find out who is on the list.
        if (status === "Confirmed") return;
        if (status === "Pending" && now - lastSent < RESEND_AFTER_MS) return;
        // Pending for a while, or previously unsubscribed and now asking to rejoin:
        // start a fresh confirmation with the new consent (they are Pending
        // again until they click the new link).
        sheet.getRange(existing + 1, 1, 1, HEADERS.length).setValues([newRow]);
      }

      sendConfirmationEmail(record.firstName, record.email, token);
    } finally {
      lock.releaseLock();
    }
  },

  confirm: function (token) {
    return withTokenRow(token, function (sheet, row, status) {
      if (status === "Unsubscribed") return false; // an old email must not resubscribe someone who left
      if (status === "Pending") sheet.getRange(row, COL.STATUS + 1, 1, 2).setValues([["Confirmed", new Date()]]);
      return true;
    });
  },

  unsubscribe: function (token) {
    return withTokenRow(token, function (sheet, row, status) {
      if (status !== "Unsubscribed") sheet.getRange(row, COL.STATUS + 1).setValue("Unsubscribed");
      return true; // opening the link twice is fine
    });
  }
};

// Find the row for a token (under the lock) and run action(sheet, sheetRowNumber, status).
// Returns whatever action returns, or false when no row has that token.
function withTokenRow(token, action) {
  if (token.length < 20) return false;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][COL.TOKEN]) === token) return action(sheet, i + 1, rows[i][COL.STATUS]);
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

// The public /exec address of this web app.
// ScriptApp.getService().getUrl() is only right while serving a web request.
// Run from the Sheet menu it returns a different, test-only address that visitors
// can't open. So every real web request saves the true address, and menu code
// (the export) reads the saved copy.
function rememberWebAppUrl() {
  var url = ScriptApp.getService().getUrl();
  if (!url || !/\/exec$/.test(url)) return; // ignore test (/dev) runs
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("WEB_APP_URL") !== url) props.setProperty("WEB_APP_URL", url);
}

function webAppUrl() {
  var url = PropertiesService.getScriptProperties().getProperty("WEB_APP_URL");
  if (!url) {
    throw new Error("Open your web app address (the .../exec link) in a browser once, then try again.");
  }
  return url;
}

function sendConfirmationEmail(name, email, token) {
  var link = webAppUrl() + "?confirm=" + encodeURIComponent(token);
  MailApp.sendEmail({
    to: email,
    name: ORG_NAME,
    replyTo: REPLY_TO,
    subject: "Please confirm your subscription to " + ORG_NAME,
    body:
      "Hi " + name + ",\n\n" +
      "Thanks for joining the " + ORG_NAME + " mailing list. Please confirm your email address by opening this link:\n\n" +
      link + "\n\n" +
      "If you didn't sign up, ignore this email and you won't be added.\n\n" +
      ORG_NAME + "\n" + REPLY_TO
  });
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    // Text columns: a name or email like "=HYPERLINK(...)" is stored as plain
    // text and never runs as a spreadsheet formula. The two date columns
    // (A and E) stay real dates.
    sheet.getRange("B:D").setNumberFormat("@");
    sheet.getRange("F:H").setNumberFormat("@");
    sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd hh:mm:ss");
    sheet.getRange("E:E").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  }
  return sheet;
}


// ---- Provider: Mailchimp (template for a hosted service) --------------------
//
// NOT TESTED against a live account. Treat it as a starting point.
// Needs two Script properties (Project Settings > Script properties):
//   MAILCHIMP_API_KEY   e.g. abc123...-us21   (the part after "-" is the data centre)
//   MAILCHIMP_LIST_ID   the "Audience ID" from Audience > Settings
// Mailchimp's "pending" status makes it send its own double opt-in email, and
// it handles unsubscribes and bounces from then on. It won't re-subscribe
// someone who already unsubscribed; they have to do that themselves.

var MailchimpProvider = {
  subscribe: function (record) {
    var props = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty("MAILCHIMP_API_KEY");
    var listId = props.getProperty("MAILCHIMP_LIST_ID");
    if (!apiKey || !listId) throw new Error("Mailchimp script properties are not set.");

    var dataCentre = apiKey.split("-").pop();
    var url = "https://" + dataCentre + ".api.mailchimp.com/3.0/lists/" + listId + "/members/" + md5Hex(record.email);
    var response = UrlFetchApp.fetch(url, {
      method: "put", // create-or-update, so repeat signups are harmless
      contentType: "application/json",
      headers: { Authorization: "Basic " + Utilities.base64Encode("anystring:" + apiKey) },
      payload: JSON.stringify({
        email_address: record.email,
        status_if_new: "pending",
        merge_fields: { FNAME: record.firstName }
      }),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error("Mailchimp responded " + code + ": " + response.getContentText());
    }
  },

  // Mailchimp sends and handles its own confirmation and unsubscribe links
  // (it puts an unsubscribe link in every campaign it sends).
  confirm: function () { return false; },
  unsubscribe: function () { return false; }
};

function md5Hex(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text);
  return bytes.map(function (b) { return ((b & 0xff) + 0x100).toString(16).slice(1); }).join("");
}


// ---- Export (for migrating to another service) -------------------------------
// Adds a "Mailing list" menu to the Sheet. Each item writes a clean tab
// (Email, First Name, dates) you can download as CSV: File > Download > CSV.
// These read the Sheet, so they work no matter which provider is active.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Mailing list")
    .addItem("Export confirmed subscribers", "exportConfirmed")
    .addItem("Export unsubscribed (suppression list)", "exportUnsubscribed")
    .addToUi();
}

function exportConfirmed() { writeExport("Confirmed", "Export - confirmed"); }
function exportUnsubscribed() { writeExport("Unsubscribed", "Export - unsubscribed"); }

function writeExport(status, tabName) {
  // The send list also carries each person's own unsubscribe link, for mail merge.
  var withLinks = status === "Confirmed";
  var base = withLinks ? webAppUrl() : "";

  var rows = getSheet().getDataRange().getValues().slice(1)
    .filter(function (r) { return r[COL.STATUS] === status; })
    .map(function (r) {
      var row = [r[COL.EMAIL], r[COL.NAME], isoDate(r[COL.SIGNED_UP]), isoDate(r[COL.CONFIRMED])];
      if (withLinks) row.push(base + "?unsubscribe=" + encodeURIComponent(r[COL.TOKEN]));
      return row;
    });

  var header = ["Email", "First Name", "Signed up", "Confirmed at"];
  if (withLinks) header.push("Unsubscribe Link");

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  tab.clear();
  tab.getRange("A:E").setNumberFormat("@");
  var out = [header].concat(rows);
  tab.getRange(1, 1, out.length, header.length).setValues(out);
  tab.setFrozenRows(1);
  ss.setActiveSheet(tab);
  SpreadsheetApp.getUi().alert(
    rows.length + " " + status.toLowerCase() + " subscriber(s) written to the \"" + tabName + "\" tab.\n\n" +
    "To get a file for the new service: File > Download > Comma-separated values (.csv)."
  );
}

function isoDate(value) {
  if (value instanceof Date) return Utilities.formatDate(value, "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'");
  return String(value || "");
}


// ---- Helpers ----------------------------------------------------------------

// Trim, drop control characters, and cap the length.
function clean(value, maxLength) {
  return String(value || "").replace(/[ -]/g, " ").trim().slice(0, maxLength);
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
