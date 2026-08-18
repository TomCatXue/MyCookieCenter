/*
------------------------------------------
@Name: GitHub 星标推送时间
@Version: 1.0.7
@Desc: 在 GitHub App 星标列表星标数/语言行后显示推送日期
@Author: TomCatXue
@Date: 2026-08-18
------------------------------------------
*/
console.log("[GitHub 推送时间] 脚本已加载");

const NAME_MARKER = " · 最近推送 · ";
const TIME_SUFFIX_RE = / · (\d{4}-\d{2}-\d{2}|刚刚|\d+(分钟前|小时前|天前))$/;

function isStarredQuery(rawBody) {
  try {
    const body = JSON.parse(rawBody);
    return body.operationName === "StarredRepositoriesForUser" ||
      (typeof body.query === "string" && body.query.indexOf("RepositoryListItemFragment") !== -1);
  } catch (e) {
    return false;
  }
}

function injectPushedAt(rawBody) {
  try {
    const body = JSON.parse(rawBody);
    if (!body || typeof body.query !== "string") return null;
    if (body.query.indexOf("pushedAt") !== -1) return null;
    const anchor = "fragment RepositoryListItemFragment on Repository {";
    if (body.query.indexOf(anchor) === -1) return null;
    body.query = body.query.replace(anchor, anchor + " pushedAt updatedAt");
    return JSON.stringify(body);
  } catch (e) {
    return null;
  }
}

function stripPushSuffix(name) {
  const index = name.indexOf(NAME_MARKER);
  if (index === -1) return name;
  return name.substring(0, index);
}

function sanitizeRepoName(rawBody) {
  try {
    const body = JSON.parse(rawBody);
    const name = body && body.variables && body.variables.name;
    if (typeof name !== "string" || name.indexOf(NAME_MARKER) === -1) return null;
    body.variables.name = stripPushSuffix(name);
    return JSON.stringify(body);
  } catch (e) {
    return null;
  }
}

function handleRequest() {
  const rawBody = typeof $request !== "undefined" ? $request.body : "";
  if (!rawBody) {
    $done({});
    return;
  }
  let nextBody = sanitizeRepoName(rawBody);
  if (!nextBody && isStarredQuery(rawBody)) nextBody = injectPushedAt(rawBody);
  if (!nextBody) {
    $done({});
    return;
  }
  $done({ body: nextBody });
}

function pad2(value) {
  return value < 10 ? "0" + value : "" + value;
}

function formatPushDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.getUTCFullYear() + "-" + pad2(date.getUTCMonth() + 1) + "-" + pad2(date.getUTCDate());
}

function decorateRepo(repo) {
  if (!repo || repo.__typename !== "Repository") return false;
  const timeValue = repo.pushedAt || repo.updatedAt;
  if (!timeValue) return false;
  const label = formatPushDate(timeValue);
  if (!label) return false;
  const language = repo.primaryLanguage;
  if (!language || typeof language.name !== "string") return false;
  if (language.name.indexOf(NAME_MARKER) !== -1 || TIME_SUFFIX_RE.test(language.name)) return false;
  language.name = language.name + " · " + label;
  return true;
}

function handleResponse() {
  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    $done({});
    return;
  }
  const nodes = body && body.data && body.data.user && body.data.user.starredRepositories && body.data.user.starredRepositories.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    $done({});
    return;
  }
  let changed = false;
  for (let i = 0; i < nodes.length; i++) {
    if (decorateRepo(nodes[i])) changed = true;
  }
  if (changed) $done({ body: JSON.stringify(body) });
  else $done({});
}

function main() {
  if (typeof $response !== "undefined") handleResponse();
  else handleRequest();
}

main();