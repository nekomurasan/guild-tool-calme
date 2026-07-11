# BrownDust Ⅱ Calme Guild Tool

ギルド運営に役立つツールをまとめたポータルです。現在は装備管理ツール「Elite Gear Database」を収録しています。

## ファイル構成

```
/index.html              … ポータル(トップページ)。ツール一覧を表示
/equipment/index.html    … 装備管理ツール「Elite Gear Database」の画面構造
/equipment/style.css     … 装備管理ツールの見た目
/equipment/app.js        … 装備管理ツールの動作(Firebase連携など)
```

GitHub Pagesにアップロードする際は、このフォルダ構成のまま(`equipment`フォルダを作って中に3ファイル、直下にトップの`index.html`)アップロードしてください。

**今後ツールを追加する場合**は、`/damage-calc/` のように新しいフォルダを作り、トップの `index.html` にあるツール一覧(`.tools` の中)にカードを1つ追加するだけで済むようにしてあります。

## 使っている外部サービス(Elite Gear Database)

- **Firebase Firestore**: データの保存場所(データベース)
- **Firebase Authentication**: ログイン機能(メール/パスワード方式。実際のメールではなく `ID@calmeguild.local` という形式のダミーアドレスを使っています)

設定情報は `equipment/app.js` の先頭付近、`firebaseConfig` に書かれています。

## Firestoreのデータ構造

| コレクション | ドキュメントID | 内容 |
|---|---|---|
| `members` | メンバー名 | そのメンバーが登録した専用装備(`exclusive`配列)・汎用装備(`generic`配列) |
| `roster` | `members` | ギルドメンバーの名前一覧(`names`配列) |
| `roster` | `characters` | 属性ごとのキャラクター一覧と攻撃タイプ(💧水/🔥火/🍃風/🌟光/🟣闇 それぞれに `{name, atkType}` の配列) |
| `logs` | 自動採番 | 誰が・いつ・何をしたかの操作ログ |
| `userLinks` | ログインID(内部形式) | ログインアカウントとメンバー名の紐付け |
| `admins` | ログインID(内部形式) | 管理者として登録されているアカウント |

### members の中身の例

```json
{
  "name": "つき",
  "exclusive": [
    {
      "character": "シェラザード",
      "ability2": "HP実数",
      "subOptions": ["HP実数", "HP実数", "HP実数"],
      "grade": "24",
      "charGrade": "71"
    }
  ],
  "generic": [
    {
      "slot": "武器",
      "itemName": "魔王の禁書",
      "subOptions": ["攻撃力%", "攻撃力実数", "攻撃力実数"],
      "grade": "24"
    }
  ],
  "updatedAt": "2026-07-11T12:00:00.000Z"
}
```

## セキュリティ(Firestoreルール)

現在のルールは、ログインしていれば `members` / `roster` / `logs` は誰でも読み書き可能、`admins` / `userLinks` は管理者だけが書き込み可能、という設定です。Firebaseコンソールの「Firestore Database」→「ルール」で確認・変更できます。

## 運用でやっておくと良いこと

- **バックアップ**: 「名簿管理」タブの「データバックアップ」から、定期的に全データをJSONでダウンロードしておくと、誤操作でデータが消えても復元の手がかりになります(自動復元機能ではなく、あくまで控えです)
- **管理者の追加**: 信頼できる人を増やしたい場合、「名簿管理」→「管理者アカウント」から追加できます(自分が管理者としてログインしている状態でのみ操作可能)

## 今後の機能追加について

新しい機能(ダメージ計算、理想パーティ提案など)を既存のElite Gear Databaseに追加する際は、上記のFirestore構造を踏まえた上で、`equipment/app.js` に新しいタブ・関数を追加していく形になります。データの持たせ方に迷ったら、既存の `members` / `roster` の形を参考にすると一貫性が保てます。新しい独立したツールを追加する場合は、新しいフォルダを作ってポータルの `index.html` にリンクを追加してください。
