const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.resolve(__dirname,'..');
const {MISSIONS}=require('../game-core.js');
test('all integrated HTML scripts parse and each has a genuine completion hook', () => {
  for (const m of MISSIONS) {
    const html=fs.readFileSync(path.join(root,'missions',m.file),'utf8');
    assert.ok(html.includes('VillageBridge?.report('),m.id);
    assert.ok(html.includes('../mission-bridge.js'),m.id);
    const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    for (const [i,match] of scripts.entries()) new vm.Script(match[1],{filename:m.id+':'+i});
  }
});
test('all local page resources exist and no runtime asset requires a remote CDN', () => {
  const pages=[path.join(root,'index.html'),...MISSIONS.map(m=>path.join(root,'missions',m.file))];
  for (const file of pages) {
    const html=fs.readFileSync(file,'utf8');
    for (const [,reference] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      if (/^(?:https?:|data:|about:|#|javascript:)/.test(reference)) continue;
      if (reference==='./') continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file),reference)),path.basename(file)+': '+reference);
    }
    assert.doesNotMatch(html,/<script[^>]*src=["']https?:/);
    assert.doesNotMatch(html,/https:\/\/(?:fonts\.googleapis\.com|cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com)/);
  }
  for (const file of ['game.js','game-core.js','mission-bridge.js','score-config.js','score-sync.js','google-apps-script/Code.gs']) new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
});
