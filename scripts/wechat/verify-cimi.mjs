import { CimiClient } from './cimidata/client.mjs'

async function outboundIp() {
  for (const u of ['https://api.ipify.org?format=json', 'https://ifconfig.me/all.json']) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) })
      const j = await r.json()
      return j.ip || j.ip_addr || JSON.stringify(j).slice(0, 80)
    } catch {}
  }
  return '(未取到)'
}

console.log('=== 次幂 cimidata 出口 IP 可用性验证 ===')
console.log('出口 IP:', await outboundIp())

const cimi = new CimiClient()
try {
  await cimi.authenticate()
  console.log('✅ 换 token 成功')
} catch (e) {
  console.log('❌ 换 token 失败:', e.message)
  process.exit(2)
}
try {
  const items = await cimi.searchArticlesDb('旅游攻略')
  console.log('✅ 数据接口成功：返回 ' + items.length + ' 条，余额 ' + cimi.balance)
  console.log('结论：该 IP 可正常采集')
} catch (e) {
  console.log('❌ 数据接口失败:', e.message, '(code=' + (e.code ?? '?') + ')')
  console.log('结论：疑似按 IP 风控/封禁')
  process.exit(3)
}
