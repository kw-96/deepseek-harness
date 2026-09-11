import { Hono } from 'hono'
import { PRODUCT_NAME } from '../brand.js'
import type { PluginConfig } from './pluginConfig.js'

/** 写入工单设置并等待运行时重载。 */
export type BootstrapWrite = (patch: Record<string, unknown>) => Promise<void>

/** HTML 属性转义，防止表单默认值破坏标记。 */
function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** 生成 Ticket Hub 首次配置页。 */
function bootstrapPage(config: PluginConfig): string {
  const field = (label: string, id: string, value: string, type = 'text', required = false): string => `
    <label class="field">
      <span>${label}${required ? '（必填）' : ''}</span>
      <input id="${id}" type="${type}" ${required ? 'required' : ''} autocomplete="off" value="${escape(value)}">
    </label>`
  const textarea = (label: string, id: string, value: string): string => `
    <label class="field"><span>${label}</span><textarea id="${id}" autocomplete="off">${escape(value)}</textarea></label>`
  const checkbox = (label: string, id: string, checked: boolean): string => `
    <label class="check"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''}><span>${label}</span></label>`
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${PRODUCT_NAME} 配置</title>
<style>
:root{color-scheme:light dark}
body{margin:0;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;background:#f6f8fb;color:#1f2329}
.wrap{max-width:640px;margin:40px auto;padding:0 16px}
h1{font-size:20px;margin:0 0 8px}
p.sub{margin:0 0 24px;color:#5f6672}
form{display:grid;gap:14px;background:#fff;border:1px solid #e3e8ef;border-radius:12px;padding:20px}
.field{display:grid;gap:6px}
.field span{font-size:12px;color:#5f6672}
input,textarea{box-sizing:border-box;width:100%;height:36px;border:1px solid #d6dde6;border-radius:7px;padding:0 10px;font:inherit;background:#fff;color:#1f2329}
textarea{height:140px;padding:8px 10px;resize:vertical;line-height:1.6}.check{display:flex;gap:8px;align-items:center;color:#1f2329}.check input{width:18px}
input:focus,textarea:focus{outline:2px solid #2f6fed;outline-offset:1px}
.actions{display:flex;align-items:center;gap:12px;margin-top:4px}
button{height:36px;padding:0 18px;border:0;border-radius:7px;background:#2f6fed;color:#fff;font:inherit;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
#msg{font-size:12px;color:#5f6672;white-space:pre-wrap}
#msg.error{color:#c0392b}
@media (prefers-color-scheme:dark){body{background:#17191d;color:#e8eaed}form,input{background:#202329;border-color:#3a4048;color:#e8eaed}}
</style></head><body><div class="wrap">
<h1>${PRODUCT_NAME}</h1>
<p class="sub">首次使用请填写连接与鉴权配置，保存后会自动加载控制面。</p>
<form id="form">
  ${field('Webhook 令牌', 'webhookToken', '', 'password', true)}
  ${field('易协作 GCP 用户 Key', 'gcpUserKey', '', 'password', true)}
  ${field('POPO 群机器人地址', 'popoWebhookUrl', '', 'text', true)}
  ${field('易协作 MCP 地址', 'gcpUrl', config.gcpUrl)}
  ${field('易协作 Host', 'gcpHost', config.gcpHost)}
  ${field('POPO 群机器人签名', 'popoWebhookSecret', '', 'password')}
  ${field('数据目录', 'dataDir', config.dataDir)}
  ${field('美术完成状态 ID', 'completedStatusId', String(config.completedStatusId))}
  ${field('渠道美术项目 ID', 'projectIdChannelArt', String(config.projectIdChannelArt))}
  ${field('回流业务项目 ID', 'projectIdReturnBusiness', String(config.projectIdReturnBusiness))}
  ${field('AI 运营活动项目 ID', 'projectIdAiOperations', String(config.projectIdAiOperations))}
  ${field('审核模型服务商', 'reviewProvider', config.reviewProvider)}
  ${field('审核模型 ID', 'reviewModel', config.reviewModel)}
  ${field('审核模型最大输出 token', 'reviewMaxTokens', String(config.reviewMaxTokens), 'number')}
  ${textarea('提单规范知识库', 'reviewKnowledgeBase', config.reviewKnowledgeBase)}
  ${checkbox('启用模型提单审核', 'reviewEnabled', config.reviewEnabled)}
  ${checkbox('审核发现缺项时发送 POPO 提醒', 'reviewNotificationEnabled', config.reviewNotificationEnabled)}
  <div class="actions"><button id="save" type="submit">保存并加载</button><span id="msg"></span></div>
</form>
</div><script>
const numbers=['completedStatusId','projectIdChannelArt','projectIdReturnBusiness','projectIdAiOperations','reviewMaxTokens'];
const checks=['reviewEnabled','reviewNotificationEnabled'];
document.getElementById('form').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const button=document.getElementById('save');
  const msg=document.getElementById('msg');
  button.disabled=true;msg.className='';msg.textContent='正在保存…';
  const patch={};
  for(const id of ['webhookToken','gcpUserKey','popoWebhookUrl','gcpUrl','gcpHost','popoWebhookSecret','dataDir','reviewProvider','reviewModel','reviewKnowledgeBase',...numbers]){
    const value=document.getElementById(id).value;
    patch[id]=numbers.includes(id)?Number(value):value.trim();
  }
  checks.forEach(id=>{patch[id]=document.getElementById(id).checked;});
  try{
    const response=await fetch('/workorder-agent/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error||'保存失败');
    msg.textContent='配置已保存，正在加载控制面…';
    setTimeout(()=>location.reload(),400);
  }catch(error){msg.className='error';msg.textContent=error instanceof Error?error.message:String(error);button.disabled=false;}
});
</script></body></html>`
}

/** 构建未配置时的引导路由，接收表单并写入设置。 */
export function bootstrapRoute(config: PluginConfig, write: BootstrapWrite): Hono {
  const app = new Hono()
  app.get('/', (context) => context.html(bootstrapPage(config)))
  app.post('/bootstrap', async (context) => {
    const body = await context.req.json().catch(() => null)
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return context.json({ ok: false, error: '请求内容无效' }, 400)
    }
    const required = ['webhookToken', 'gcpUserKey', 'popoWebhookUrl']
    const missing = required.filter((key) => typeof body[key] !== 'string' || body[key].trim() === '')
    if (missing.length > 0) {
      return context.json({ ok: false, error: `缺少必填项：${missing.join('、')}` }, 400)
    }
    try {
      await write(body as Record<string, unknown>)
    } catch (error) {
      return context.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400)
    }
    return context.json({ ok: true })
  })
  return app
}
