# Chinese translations

Missing Chinese meanings and examples translated offline with NLLB-200 distilled 600M (CTranslate2 conversion JustFrederik/nllb-200-distilled-600M-ct2-int8 at 302d78f00e6fdb50a1064059df7c392b735e9d05), normalized with OpenCC. Existing bilingual sources retained; some frequent errors manually corrected. Unpublished rows retain earlier OPUS-MT translations. Automatic output is not fully human reviewed. Model: https://huggingface.co/facebook/nllb-200-distilled-600M (CC BY-NC 4.0); weights are local build assets and are not shipped with the website.

{
  "baseExamplesFilled": 4892,
  "synonymMeaningsFilled": 7115,
  "synonymExamplesFilled": 7648
}

Final checks: every built-in sense has Chinese, all 27,828 base examples and all 9,982 displayed synonym examples have Traditional Chinese text. Unknown-token outputs were repaired using a secondary translation cache or checked corrections; 2,096 row instances were corrected or replaced. This is a coverage check, not a claim that every automatic translation has been human reviewed. Explicit corrections are recorded in CHINESE-CORRECTIONS.json.
