'use strict';
// WORK PASS 診断・テストエンジン（5種）
// type: 'mc'=選択式(自動採点) / 'likert'=5段階1次元 / 'likert-multi'=5段階多次元(性格)
// ※ mc の correct はサーバー側のみ保持しクライアントへ送らない

const TESTS = [
  {
    key:'general', label:'一般常識テスト', sub:'国語・計算・ITリテラシーなど',
    icon:'book', color:'#6b8cff', minutes:5, type:'mc',
    questions:[
      { q:'「煮え湯を飲まされる」の意味として正しいのはどれか。', choices:['熱い思いをして苦労する','信頼していた相手に裏切られてひどい目に遭う','我慢を強いられる','手ひどい失敗をする'], correct:1 },
      { q:'次のうち敬語として誤っている（謙譲語の誤用）ものはどれか。', choices:['お客様がお越しになりました','お客様が申されました','お客様がご覧になりました','お客様がお帰りになりました'], correct:1 },
      { q:'ある月の売上は目標比115%で690万円だった。目標額はいくらか。', choices:['600万円','620万円','650万円','660万円'], correct:0 },
      { q:'売価1,500円、粗利率40%の商品の原価はいくらか。', choices:['600円','750円','900円','1,050円'], correct:2 },
      { q:'取引先へ「（自分が）そちらへ行く」と伝えるときの適切な言い方はどれか。', choices:['いらっしゃいます','伺います','参られます','行かれます'], correct:1 },
      { q:'「SaaS」の説明として最も適切なのはどれか。', choices:['自社サーバーに導入して使う買い切り型ソフト','インストール不要でインターネット経由で利用するソフト','無料の体験版ソフト','社内だけで使う専用端末'], correct:1 },
      { q:'会員1,000人。今月の解約率が3%、新規入会が80人のとき、翌月の会員数はどれか。', choices:['1,020人','1,050人','1,080人','1,110人'], correct:1 },
      { q:'「他山の石」の正しい使い方はどれか。', choices:['他人の立派な行いを手本にする','他人の誤りを自分の教訓とする','自分とは無関係だと切り捨てる','価値のある石として扱う'], correct:1 },
    ],
  },
  {
    key:'sales', label:'営業適性診断', sub:'営業職との相性をチェック',
    icon:'target', color:'#5bbf6a', minutes:4, type:'likert', dim:'営業適性',
    items:[
      '初対面の人にも臆せず話しかけられる',
      '断られても気持ちを切り替えて次に進める',
      '達成すべき目標数字があるとやる気が出る',
      '相手のニーズを引き出す会話が得意だ',
      '人に提案したり説得したりするのが好きだ',
      '成果が数字で見えるとやる気が高まる',
    ],
  },
  {
    key:'communication', label:'コミュニケーション診断', sub:'対人傾向や伝え方を分析',
    icon:'chat', color:'#a06bf0', minutes:3, type:'likert', dim:'コミュニケーション力',
    items:[
      '相手の話を最後まで丁寧に聞ける',
      '自分の考えを分かりやすく伝えられる',
      '立場や価値観の違う人とも良い関係を築ける',
      '相手の表情や様子の変化に気づく方だ',
      '意見が対立したとき間に入って調整できる',
      'チームで協力して物事を進めるのが好きだ',
    ],
  },
  {
    key:'personality', label:'性格診断', sub:'価値観・行動特性を可視化',
    icon:'user', color:'#f0a23a', minutes:3, type:'likert-multi',
    dims:[
      { key:'val_growth', label:'成長重視', items:['新しい挑戦にワクワクする','スキルアップのために時間を使いたい'] },
      { key:'val_stability', label:'安定重視', items:['変化より安定した環境で働きたい','ひとつの場所で長く働きたい'] },
      { key:'val_relationship', label:'人間関係重視', items:['職場の人間関係をとても大切にする','チームの和を重視して行動する'] },
      { key:'val_wlb', label:'ワークライフバランス重視', items:['プライベートの時間をしっかり確保したい','残業はできるだけ避けたい'] },
    ],
  },
  {
    key:'manners', label:'ビジネスマナー診断', sub:'社会人基礎力やマナーを確認',
    icon:'bag', color:'#3ab0a0', minutes:3, type:'mc',
    questions:[
      { q:'タクシーに4人で乗るとき、最も上座（上位者が座る席）はどこか。', choices:['助手席','運転席の後ろの席','助手席の後ろの席','後部座席の中央'], correct:1 },
      { q:'ビジネスで電話を終える際のマナーとして最も適切なのはどれか。', choices:['かけた側が先に切る','受けた側が先に切る','お客様・目上が切ってから静かに切る','同時に切る'], correct:2 },
      { q:'弔電（お悔やみの電報）の宛先は誰にするのが正しいか。', choices:['故人','喪主','葬儀社','参列者代表'], correct:1 },
      { q:'社外の目上の相手に「わかりました」と伝える最も適切な表現はどれか。', choices:['了解しました','承知いたしました','大丈夫です','把握しました'], correct:1 },
      { q:'会食の席で、料理を取り分けたり飲み物を注いだりする気配りは主に誰が行うべきか。', choices:['最も目上の人','最も目下（若手）の人','幹事だけ','店のスタッフに任せる'], correct:1 },
      { q:'取引先へのお礼状・お礼メールを送る望ましいタイミングはどれか。', choices:['当日〜翌日中','1週間後','相手から連絡が来てから','月末にまとめて'], correct:0 },
      { q:'「取り急ぎお礼まで」という表現の適切な使い方はどれか。', choices:['正式なお礼状の結び','まず簡単にお礼を伝える略式の結び','目上に必ず使うべき定型','お詫びの際の結び'], correct:1 },
      { q:'名刺交換で自分が目下の立場のとき、最も適切な渡し方はどれか。', choices:['相手より高い位置で渡す','相手より低い位置で両手で渡す','片手で素早く渡す','相手が出すまで待つ'], correct:1 },
    ],
  },
  {
    key:'selfreflect', label:'キャリア自己分析', sub:'本当にやりたいことを言葉にする',
    icon:'bulb', color:'#e0607a', minutes:7, type:'freetext',
    questions:[
      { q:'これまでで一番「夢中になった」「時間を忘れた」経験は何ですか？ その何が楽しかったですか？', ph:'仕事・部活・趣味など何でもOK' },
      { q:'人から「ありがとう」と言われて一番うれしかったのは、どんな時ですか？', ph:'' },
      { q:'もしお金の心配がいらないとしたら、どんな仕事や活動をしてみたいですか？', ph:'' },
      { q:'逆に「これだけは絶対にやりたくない」働き方・仕事は何ですか？', ph:'' },
      { q:'尊敬する人・憧れる人は誰ですか？ その人のどこに惹かれますか？', ph:'' },
      { q:'仕事で一番大事にしたいことを、あなた自身の言葉で教えてください。', ph:'お金/成長/人間関係/自由/社会貢献 など' },
    ],
  },
];

const BY_KEY = Object.fromEntries(TESTS.map(t=>[t.key,t]));

// 一覧（カード表示用メタのみ）
function testMeta() {
  return TESTS.map(t=>({ key:t.key, label:t.label, sub:t.sub, icon:t.icon, color:t.color, minutes:t.minutes, type:t.type }));
}
// クライアントへ渡す設問（正解除去）
function testForClient(key) {
  const t = BY_KEY[key]; if (!t) return null;
  const base = { key:t.key, label:t.label, sub:t.sub, type:t.type };
  if (t.type==='mc') base.questions = t.questions.map(q=>({ q:q.q, choices:q.choices }));
  else if (t.type==='likert') { base.dim=t.dim; base.items=t.items; }
  else if (t.type==='likert-multi') base.dims = t.dims.map(d=>({ key:d.key, label:d.label, items:d.items }));
  else if (t.type==='freetext') base.questions = t.questions.map(q=>({ q:q.q, ph:q.ph||'' }));
  return base;
}
// 採点。戻り値 { score:0-100, detail:{...} , values?:{val_*:0-5} }
function scoreTest(key, answers) {
  const t = BY_KEY[key]; if (!t) return null;
  if (t.type==='mc') {
    let correct=0;
    t.questions.forEach((q,i)=>{ if (Number(answers[i])===q.correct) correct++; });
    const score = Math.round(correct/t.questions.length*100);
    return { score, detail:{ correct, total:t.questions.length } };
  }
  if (t.type==='likert') {
    const n=t.items.length; let sum=0;
    for (let i=0;i<n;i++){ let v=Number(answers[i]); if(!(v>=1&&v<=5)) v=3; sum+=v; }
    const score=Math.round(((sum-n)/(n*4))*100);
    return { score, detail:{ dim:t.dim } };
  }
  if (t.type==='likert-multi') {
    const dimScores={}; const values={}; let total=0;
    t.dims.forEach(d=>{
      const a=(answers && answers[d.key])||[]; const n=d.items.length; let sum=0;
      for(let i=0;i<n;i++){ let v=Number(a[i]); if(!(v>=1&&v<=5)) v=3; sum+=v; }
      const s=Math.round(((sum-n)/(n*4))*100);
      dimScores[d.label]=s; values[d.key]=Math.round(s/20); total+=s;
    });
    const top=Object.entries(dimScores).sort((a,b)=>b[1]-a[1])[0];
    return { score:Math.round(total/t.dims.length), detail:{ dims:dimScores, top:top?top[0]:null }, values };
  }
  if (t.type==='freetext') {
    const qa=t.questions.map((q,i)=>({ q:q.q, a:String((answers&&answers[i])||'').trim() }));
    const answered=qa.filter(x=>x.a).length;
    return { score:null, detail:{ qa, answered, total:t.questions.length } };
  }
  return null;
}

module.exports = { testMeta, testForClient, scoreTest, TEST_KEYS: TESTS.map(t=>t.key) };
