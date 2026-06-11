import http from "node:http";
import type { AppConfig } from "../../support-mcpd/src/config.js";
import { readAuditEntries } from "./audit_reader.js";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage(entries: Array<Record<string, unknown>>) {
  const rows = entries
    .map(
      (entry) => `<tr>
        <td>${escapeHtml(entry.at)}</td>
        <td>${escapeHtml(entry.tool)}</td>
        <td><span class="status ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span></td>
        <td>${escapeHtml(entry.elapsedMs)}ms</td>
        <td><pre>${escapeHtml(JSON.stringify(entry.args, null, 2))}</pre></td>
        <td><pre>${escapeHtml(entry.error ?? entry.responsePreview ?? "")}</pre></td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ReadShield Audit</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f8fa; color: #172033; }
    header { padding: 20px 28px; background: #162033; color: white; }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
    main { padding: 22px 28px; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9dee8; }
    th, td { border-bottom: 1px solid #e5e8ef; padding: 10px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #eef2f7; color: #344054; position: sticky; top: 0; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; max-width: 520px; }
    .status { display: inline-block; padding: 2px 7px; border-radius: 999px; font-weight: 600; }
    .status.ok { background: #d9f8e6; color: #0b6b35; }
    .status.error { background: #ffe1df; color: #9f1d18; }
    @media (prefers-color-scheme: dark) {
      body { background: #111827; color: #e5e7eb; }
      table { background: #172033; border-color: #344054; }
      th { background: #202b3d; color: #d0d5dd; }
      th, td { border-color: #344054; }
    }
  </style>
</head>
<body>
  <header><h1>ReadShield Audit</h1></header>
  <main>
    <table>
      <thead><tr><th>时间</th><th>工具</th><th>状态</th><th>耗时</th><th>参数摘要</th><th>返回预览 / 错误</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=\"6\">暂无审计日志</td></tr>"}</tbody>
    </table>
  </main>
</body>
</html>`;
}

export function createAuditAdminServer(config: AppConfig) {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? config.audit_admin.max_entries),
      config.audit_admin.max_entries
    );
    const entries = readAuditEntries(config.server.audit_log, limit);

    if (url.pathname === "/api/audit") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ entries }));
      return;
    }

    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderPage(entries));
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });
}
