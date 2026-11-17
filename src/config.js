// 定制配置：URL hash 携带压缩配置，读取两份样片配置是样片的第一公民需求。
// 格式：#c=<base64url(JSON)>；#demo=a|b 选择内置样片配置；无 hash 用默认 A。

const DEFAULTS = {
  toName: '你',
  fromName: '我',
  note: '我托这只小狐狸来接你。它第一次送这么重要的礼物，可能比我还紧张。',
  starText: '今晚的星星，只为你一个人亮。',
  walkLine: '本来想让它表现得稳重一点。不过，能让你笑一下也好。',
  activity: '一起去吃火锅',
  letter:
    '嘿，终于等到你走到这里。\n' +
    '这只小狐狸一路跑得有点快，后来总算记得回头等你了。\n' +
    '其实我也一样。攒了一整年的勇气，绕了很长的路，想把这些话好好送到你面前。\n' +
    '世界那么大，灯火那么多，可我每次抬头，最想看到的那颗星星，还是你。\n' +
    '以后开心的时候，我想陪你多走一段；累的时候，也想在你身边停一会儿。\n' +
    '这个圣诞，愿意和{from}{activity}吗？\n' +
    '这次，换我来接你，好吗？\n' +
    '——{from}',
  theme: 'snow-night',
};

// 样片配置 A：默认告白语气
export const DEMO_A = {
  ...DEFAULTS,
  toName: '阿棠',
  fromName: '小拾',
  activity: '一起去看跨年的灯',
};

// 样片配置 B：换称呼、换短句、整封信重写，验证"可整体重写"
export const DEMO_B = {
  ...DEFAULTS,
  toName: '老周',
  fromName: '阿岚',
  note: '路有点滑，跟着它慢慢走。我在灯下等你。',
  starText: '第三年，还是想和你一起过冬天。',
  walkLine: '它小时候就这样，一高兴就跑丢，还好记得回来。',
  activity: '去河边放一次灯',
  letter:
    '老周：\n' +
    '见字如面。\n' +
    '这条雪路我让它先走了一遍，确认每一盏灯都亮了，才敢把链接发给你。\n' +
    '这一年我们都挺忙的，忙到很多话只在心里过了一遍。\n' +
    '但有些事没变：看到好看的雪，第一个想拍给你；走到亮着灯的路口，还是会想起你。\n' +
    '这个圣诞，愿意和我去河边放一次灯吗？\n' +
    '这次，换我来接你，好吗？\n' +
    '——阿岚',
};

function b64urlDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 默认信件里的占位符用配置值填充；买家整封重写时原文使用。
function interpolate(cfg) {
  const out = { ...cfg };
  for (const key of ['letter', 'note', 'starText', 'walkLine']) {
    if (typeof out[key] === 'string') {
      out[key] = out[key]
        .replaceAll('{to}', out.toName)
        .replaceAll('{from}', out.fromName)
        .replaceAll('{activity}', out.activity);
    }
  }
  return out;
}

export function loadConfig() {
  const hash = location.hash || '';
  let cfg = { ...DEMO_A };
  let source = 'demo-a';
  const mc = hash.match(/[#&]c=([A-Za-z0-9\-_]+)/);
  const md = hash.match(/[#&]demo=([ab])/i);
  try {
    if (mc) {
      const parsed = JSON.parse(b64urlDecode(mc[1]));
      cfg = { ...DEFAULTS, ...parsed };
      source = 'custom';
    } else if (md && md[1].toLowerCase() === 'b') {
      cfg = { ...DEMO_B };
      source = 'demo-b';
    }
  } catch (e) {
    console.warn('配置解析失败，使用默认配置', e);
  }
  // 留空字段回落默认，绝不能把占位括号留在界面上
  for (const k of Object.keys(DEFAULTS)) {
    if (cfg[k] === undefined || cfg[k] === null || String(cfg[k]).trim() === '') cfg[k] = DEFAULTS[k];
  }
  return { config: interpolate(cfg), source };
}

export function makeShareUrl(cfg) {
  return `${location.origin}${location.pathname}#c=${b64urlEncode(JSON.stringify(cfg))}`;
}
