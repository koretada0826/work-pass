/* 共通レイアウト（サイドバー＋トップバー）を注入 */
(function(){
  const IC = {
    home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M17 8a3 3 0 010 6"/>',
    building:'<rect x="4" y="3" width="14" height="18" rx="1"/><path d="M8 7h2M8 11h2M8 15h2M14 7h0M14 11h0M14 15h0"/>',
    spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    chat:'<path d="M4 5h16v11H8l-4 4z"/>',
    doc:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    clip:'<rect x="6" y="4" width="12" height="17" rx="1"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h4"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4 12H1M23 12h-3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="M20 20l-5-5"/>',
    bell:'<path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 004 0"/>',
    star:'<path d="M12 3l2.7 6.3L21 10l-5 4.3L17.5 21 12 17.5 6.5 21 8 14.3 3 10l6.3-.7z"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
    bag:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    life:'<circle cx="12" cy="12" r="9"/><path d="M12 3a4 4 0 00-4 4v3H6M12 21a4 4 0 004-4v-3h2"/>',
    bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 00-4-10z"/>',
  };
  const NAV = {
    admin:{ items:[
      ['dashboard','ダッシュボード','home','/admin.html'],
      ['seekers','求職者データベース','users','/admin.html'],
      ['jobs','企業・求人の登録','bag','/jobs.html'],
      ['matching','AIマッチング','spark','/matching.html'],
      ['preview','適性診断の確認','doc','/preview.html'],
      ['settings','設定','gear','/settings.html'],
    ], card:['bulb','ご活用のヒント','求人を登録すると、AIが求職者との相性を自動で分析します。'],
      user:['Ever 採用担当','株式会社Everエフォート'] },
    seeker:{ items:[
      ['home','ホーム','home','/home.html'],
      ['jobs','おすすめ求人','search','#'],
      ['matching','マッチング結果','users','#'],
      ['aptitude','適性診断','doc','#'],
      ['status','選考状況','clip','#'],
      ['message','メッセージ','chat','#'],
      ['saved','保存した求人','bag','#'],
      ['profile','プロフィール','users','#'],
      ['settings','設定','gear','#'],
    ], card:['life','キャリアサポート','面談や使い方の相談はこちら'],
      user:['佐藤 美咲','プロフィール充足率 88%'] },
  };
  function svg(name){ return '<span class="ic"><svg viewBox="0 0 24 24" width="20" height="20">'+(IC[name]||'')+'</svg></span>'; }

  // 5ステップの登録ウィザードのヘッダー（step: 1-5）
  window.wizHeader = function(step){
    const labels = ['プロフィール入力','適性診断・テスト','希望条件の入力','確認','完了'];
    const steps = labels.map((l,i)=>{
      const n=i+1; const cls = n<step?'done':(n===step?'on':'');
      return `<div class="s5 ${cls}"><div class="cn"></div><div class="n">${n<step?'✓':n}</div><div class="l">${l}</div></div>`;
    }).join('');
    return `<div class="wizhead">
      <span class="steppill">STEP ${step}/5</span><span class="wztitle">新規登録のステップ</span>
      <div class="steps5">${steps}</div></div>`;
  };

  window.renderLayout = function(opt){
    const role = opt.role||'admin';
    const cfg = NAV[role];
    const q = new URLSearchParams(location.search);
    // ?id= を各ナビへ引き継ぐ（求職者ホーム用）
    const idq = q.get('id') ? ('?id='+q.get('id')) : '';
    const nav = cfg.items.map(([key,label,icon,href])=>{
      const active = key===opt.active ? ' active':'';
      let h = href;
      if(role==='seeker' && href==='/home.html' && idq) h = '/home.html'+idq;
      return `<a class="${active.trim()}" href="${h}">${svg(icon)}<span>${label}</span></a>`;
    }).join('');
    const [un,us] = opt.user || cfg.user;
    const uav = opt.userAvatar || '';
    const side = `
      <aside class="side">
        <div class="brand"><div class="logo">WORK <b>PASS</b></div><div class="tag">人ではなく、相性で採用する。</div></div>
        <nav class="nav">${nav}</nav>
        <div class="side-card"><div class="t">${svg(cfg.card[0])}${cfg.card[1]}</div><div class="d">${cfg.card[2]}</div></div>
      </aside>`;
    const searchPh = role==='admin' ? '検索（求職者、企業、求人など）' : '職種・勤務地・企業名で検索';
    const av = uav ? `<img class="av" src="${uav}">` : `<span class="av"></span>`;
    const top = `
      <div class="top">
        <h1>${opt.title||''}</h1>
        <div class="sp"></div>
        <div class="search"><input placeholder="${searchPh}"><span class="si"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">${IC.search}</svg></span></div>
        <div class="bell"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">${IC.bell}</svg><span class="dot">3</span></div>
        <div class="userchip">${av}<div><div class="nm">${un}</div><div class="sub">${us}</div></div></div>
      </div>`;
    const root = document.getElementById('app');
    root.className='app';
    root.innerHTML = side + `<main><div id="top">${top}</div><div class="content" id="content">${opt.content||''}</div></main>`;

    // 求職者ヘッダー：?id= があれば本人の氏名・プロフィール充足率を反映
    if (role === 'seeker' && q.get('id')) {
      fetch('/api/candidates/' + q.get('id')).then(r=>r.json()).then(c=>{
        if (!c || c.error || !c.name) return;
        const nm = root.querySelector('.userchip .nm'); if (nm) nm.textContent = c.name;
        const keys = ['name','age','nearest_station','contact','pref_location','pref_employment','career_job','career_industry','goal_3y','future_work','qualifications','val_growth'];
        const fill = Math.round(keys.filter(k=>c[k]!=null&&c[k]!=='').length/keys.length*100);
        const sub = root.querySelector('.userchip .sub'); if (sub) sub.textContent = 'プロフィール充足率 ' + fill + '%';
      }).catch(()=>{});
    }
  };
})();
