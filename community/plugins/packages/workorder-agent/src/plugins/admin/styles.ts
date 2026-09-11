/** 返回 Ticket Hub 控制面样式。 */
export function adminStyles(): string {
  return `
:root{--bg:#f4f6fa;--panel:#fff;--line:#e4e7ec;--line-soft:#eef1f5;--ink:#182230;--ink2:#475467;--ink3:#667085;--brand:#175cd3;--brand-soft:#eaf2ff;--ok:#027a48;--ok-bg:#ecfdf3;--warn:#b54708;--warn-bg:#fffaeb;--err:#b42318;--err-bg:#fef3f2;font-family:Inter,"Microsoft YaHei",system-ui,sans-serif;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-size:14px;line-height:1.55}
.shell{min-height:100vh}
.topbar{height:60px;position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:12px;padding:0 26px;background:#fff;border-bottom:1px solid var(--line)}
.brand{font-size:17px;font-weight:700;letter-spacing:.01em}
.subtitle{color:var(--ink3);font-size:13px}
.back{margin-left:auto;padding:7px 12px;border-radius:8px;color:var(--brand);text-decoration:none;font-size:13px}
.back:hover{background:var(--brand-soft)}
.layout{display:grid;grid-template-columns:206px minmax(0,1fr);max-width:1520px;margin:0 auto}
.nav{display:flex;flex-direction:column;gap:2px;min-height:calc(100vh - 60px);padding:18px 12px;background:#fbfcfe;border-right:1px solid var(--line)}
.nav button{border:0;background:transparent;color:var(--ink2);text-align:left;padding:9px 12px;border-radius:8px;cursor:pointer;font:inherit;font-size:13.5px}
.nav button:hover{background:#f1f5fb;color:var(--ink)}
.nav button.active{background:var(--brand-soft);color:var(--brand);font-weight:600}
.main{min-width:0;padding:22px 26px 40px}
.page{display:none}
.page.active{display:flex;flex-direction:column;gap:14px}
.heading{display:flex;gap:16px;justify-content:space-between;align-items:flex-start}
.heading h1{margin:0;font-size:21px;line-height:1.3}
.heading p{margin:4px 0 0;color:var(--ink3);font-size:13px}
.status{display:inline-flex;align-items:center;height:26px;padding:0 11px;border-radius:99px;background:var(--ok-bg);color:var(--ok);font-size:12.5px;white-space:nowrap}
.status.warn{background:var(--warn-bg);color:var(--warn)}
.status.muted{background:#f2f4f7;color:var(--ink2)}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;box-shadow:0 1px 2px #1018280a}
.wide{grid-column:1/-1}
.card h2{margin:0 0 6px;font-size:15px}
.card > p{margin:0 0 12px;color:var(--ink3);font-size:12.5px;line-height:1.6}
.label{color:var(--ink3);font-size:12.5px}
.metric{margin-top:6px;font-size:24px;font-weight:700;letter-spacing:-.01em}
.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.primary,.secondary,.ghost{height:34px;padding:0 14px;border:0;border-radius:8px;font:inherit;font-size:13px;cursor:pointer}
.primary{background:var(--brand);color:#fff}
.primary:hover{background:#124cae}
.secondary{background:#eef2f7;color:var(--ink2)}
.secondary:hover{background:#e3e9f1}
.primary:disabled,.secondary:disabled,.ghost:disabled{opacity:.55;cursor:not-allowed}
.field{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--ink3)}
.field input,.field textarea,.field select{height:34px;padding:0 10px;border:1px solid #d6dde6;border-radius:8px;background:#fff;color:var(--ink);font:inherit;font-size:13px}
.field textarea{height:120px;padding:9px 10px;line-height:1.6;resize:vertical}
.field input:focus,.field textarea:focus{outline:2px solid #bcd3ff;border-color:var(--brand)}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px}
.hint{color:var(--ink3);font-size:12.5px;line-height:1.6}
.message{margin-top:10px;color:var(--brand);font-size:13px;white-space:pre-wrap}
.message.error,.error{color:var(--err)}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
thead th{position:sticky;top:0;z-index:1;padding:9px 12px;background:#f7f9fc;border-bottom:1px solid var(--line);color:var(--ink3);font-size:12px;font-weight:600;text-align:left;white-space:nowrap}
tbody td{padding:9px 12px;border-bottom:1px solid var(--line-soft);color:var(--ink2);vertical-align:middle}
tbody tr:last-child td{border-bottom:0}
tbody tr:nth-child(even){background:#fcfdff}
tbody tr:hover{background:#f5f9ff}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
.truncate{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{padding:22px;color:var(--ink3);text-align:center}
.row-action{cursor:pointer}
.pill{display:inline-flex;align-items:center;height:21px;padding:0 9px;border-radius:99px;background:#f2f4f7;color:var(--ink2);font-size:12px;white-space:nowrap}
.pill.ok{background:var(--ok-bg);color:var(--ok)}
.pill.warn{background:var(--warn-bg);color:var(--warn)}
.pill.err{background:var(--err-bg);color:var(--err)}
.pill.info{background:var(--brand-soft);color:var(--brand)}
.table-scroll{overflow:auto}
.detail-panel{padding:0;overflow:hidden}
.detail-panel .preview-header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:13px 18px;background:#fbfcfe;border-bottom:1px solid var(--line)}
.detail-panel .preview-header h2{margin:0}
.detail-panel .preview-header span{color:var(--ink3);font-size:12.5px}
.detail-panel pre{max-height:330px;margin:0;padding:14px 18px;overflow:auto;color:var(--ink2);font:12.5px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.issue-fields{display:grid;grid-template-columns:150px minmax(0,1fr);margin:0}
.issue-fields dt{padding:9px 18px;background:#fcfdff;border-bottom:1px solid var(--line-soft);color:var(--ink3);font-size:12.5px}
.issue-fields dd{margin:0;padding:9px 18px;border-bottom:1px solid var(--line-soft);word-break:break-word}
.issue-fields dt:last-of-type,.issue-fields dd:last-of-type{border-bottom:0}
table a,.issue-fields a{color:var(--brand);text-decoration:none}
table a:hover,.issue-fields a:hover{text-decoration:underline}
.review-actions{display:flex;gap:8px;flex-wrap:wrap}
.detail-button,.resend-button,.resume-button{height:28px;padding:0 11px;border:0;border-radius:7px;font:inherit;font-size:12.5px;cursor:pointer}
.detail-button{background:#eef2f7;color:var(--brand)}
.detail-button:hover{background:var(--brand-soft)}
.resend-button,.resume-button{background:var(--brand);color:#fff}
.detail-button:disabled,.resend-button:disabled,.resume-button:disabled{opacity:.6;cursor:wait}
.chunk-list{display:grid;gap:10px;padding:14px 18px;border-top:1px solid var(--line)}
.chunk-item{padding:12px 14px;background:#fcfdff;border:1px solid var(--line);border-radius:10px}
.chunk-item header{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.chunk-item pre{max-height:180px;padding:8px 0 0}
.chunk-meta{color:var(--ink3);font-size:12px}
.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.switch-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:11px 0;border-bottom:1px solid var(--line-soft);cursor:pointer}
.switch-row span{display:grid;gap:2px}
.switch-row small{color:var(--ink3);font-size:12px}
.switch-row input{width:18px;height:18px;accent-color:var(--brand)}
.spaced{margin-top:14px}
.config-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}
.config-grid > div{display:grid;gap:6px;padding:12px 14px;background:#fcfdff;border:1px solid var(--line);border-radius:10px}
.config-grid span{color:var(--ink3);font-size:12.5px}
.ok{color:var(--ok)}
.warn{color:var(--warn)}
.readonly{margin-top:12px;color:var(--ink3);font-size:12.5px}
#statsResult{display:flex;flex-direction:column;gap:14px}
.shot-pane{min-height:140px;padding:14px 18px;color:var(--ink3);font-size:13px}
.shot-pane img{display:block;max-width:100%;max-height:460px;background:#fff;border:1px solid var(--line);border-radius:10px}
.desktop-bar{position:fixed;top:0;left:0;right:0;height:36px;display:none;align-items:stretch;background:#16181d;color:#e8eaed;z-index:30;user-select:none}
body.has-desktop-bar .desktop-bar{display:flex}
.desktop-drag{flex:1;display:flex;align-items:center;padding:0 12px;color:#cdd3db;font-size:12px}
.desktop-controls{display:flex}
.desktop-controls button{width:46px;border:0;background:transparent;color:#e8eaed;display:inline-flex;align-items:center;justify-content:center;cursor:default}
.desktop-controls button:hover{background:#34373d}
.desktop-controls .close:hover{background:#e81123}
.desktop-controls svg{width:10px;height:10px;fill:currentColor}
body.has-desktop-bar{padding-top:36px}
body.has-desktop-bar .topbar{top:36px}
body.has-desktop-bar .nav{min-height:calc(100vh - 96px)}
@media(max-width:980px){.layout{grid-template-columns:1fr}.nav{flex-direction:row;min-height:0;padding:8px;overflow:auto;border-right:0;border-bottom:1px solid var(--line)}.nav button{white-space:nowrap}.main{padding:16px}.grid,.settings-grid,.config-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.grid,.settings-grid,.config-grid{grid-template-columns:1fr}.subtitle{display:none}}
`
}
