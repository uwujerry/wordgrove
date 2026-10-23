# 多益常考分類來源與授權

取得日期：2026-10-23。

## 詞目與排序

來源：TOEIC Service List (TSL) 1.2，Browne, C. & Culligan, B.，New General Service List Project。

- 官方來源頁：https://www.newgeneralservicelist.com/toeic-service-list
- 原始下載：https://www.newgeneralservicelist.com/s/TSL_12_stats.csv
- 授權：Creative Commons Attribution-ShareAlike 4.0 International，https://creativecommons.org/licenses/by-sa/4.0/
- 原始檔：TOEIC-TSL-1.2.csv（來源為 Windows-1252 編碼）。SHA-256：2259df25a1077b04067ef0c0e9e4c98b46c91e4d539741dfaceba88651ff486d
- 作者依 TOEIC 備考材料語料建立此表；它不是 ETS 官方必考單字清單。本網站沒有另行統計真實考卷出題頻率，也不把作者搭配 NGSL 的覆蓋率當成本分類單獨的覆蓋率。

原始 1,250 個詞目全部建立對應，共形成 1,242 個學習詞條。保留原始 TSL Rank，拼寫／詞形合併時取最前排名。既有字庫共用 832 個詞條，新增 410 個詞條。所有來源詞目的映射保存在 TOEIC-TSL.json 的 mapping 欄位。

主要合併包括既有官方變體詞條，以及 résumé → resume、congratulation → congratulation(s)、headquarter → headquarters、salespeople → salesperson。這是詞形／拼寫對應，不以近義詞互換詞目。來源 headquarter 的詞形歸入既有 headquarters 總部義項，原詞形仍保留於 mapping。

## 中文釋義與例句

- 原有 832 個詞條沿用原始字義、例句與 ID，不改變學習進度鍵。
- 新增內容取自已取得的 Open Dictionary v2.0 / Wiktionary（CC BY-SA 4.0），來源 https://github.com/ahpxex/open-dictionary/releases/tag/v2.0 。完整既有授權另見 CONTENT-SOURCES.md、OPEN-DICTIONARY-LICENSE-DATA.md。
- TOEIC-DICTIONARY-SOURCE.json 保存本次使用的來源子集；只選有中英例句的 core/common 義項，排除部分過時、非標準用法及五個缺乏可用填空例句的義項，並合併重複義項。
- 中文經 OpenCC s2twp 轉繁體；來源內容包含自動整理，未逐條人工校對全部新義項，不保證列出每個單字所有可能意思。
- 原字庫未涵蓋、來源子集也缺少的 46 個詞條由 Lilivm 補寫釋義與各兩組中英例句；另補寫 unlimited、internationally 的第二例句。補寫內容見 TOEIC-SUPPLEMENT.txt，依 CC BY-SA 4.0 提供。
- 新增 1,013 個義項、1,452 組中英例句；每個新詞條至少兩組例句，每個收錄義項至少一組，且至少有一題可用於填空。並非每個義項都有兩組例句。
- 沿用的例句不全是商務情境，也不是 ETS 官方試題；網站不收錄或重製官方完整題目。

## 檔案與使用

- toeic.js / TOEIC-TSL.json：獨立的多益分類與補充字庫。
- tools/import_toeic.py：重建腳本，需要 OpenCC（opencc-python-reimplemented）。
- 原官方 6000 字資料檔不修改；同一個單字跨分類共用 ID、進度與筆記。
- 若原本已有同字的個人詞條，優先保留個人詞條及其進度，標上多益分類，不重複新增顯示。
- 未強制更換原本預設學測分類；可在首頁或分類選單選擇「多益常考」。
