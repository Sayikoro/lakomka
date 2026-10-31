# Деплой-архив: как собрать lakomka-deploy-static.zip из частей

GitHub не принимает файлы больше 100 МБ, поэтому архив
`lakomka-deploy-static.zip` (116939641 байт) лежит в репозитории двумя частями:

| Файл | Размер |
| --- | --- |
| `lakomka-deploy-static.zip.part-00` | 94371840 байт |
| `lakomka-deploy-static.zip.part-01` | 22567801 байт |

## Склейка

Скачайте обе части в одну папку и выполните:

**Windows (cmd):**

```
copy /b lakomka-deploy-static.zip.part-00+lakomka-deploy-static.zip.part-01 lakomka-deploy-static.zip
```

**Linux / macOS:**

```
cat lakomka-deploy-static.zip.part-00 lakomka-deploy-static.zip.part-01 > lakomka-deploy-static.zip
```

## Проверка целостности

sha256 собранного файла должен совпадать:

```
9909900743731333f3be65aff402904e6a8b85e6cc41fbd67de41bdfbcaf6259
```

sha256 актуальной версии (2026.10.31-1213):

```
9909900743731333f3be65aff402904e6a8b85e6cc41fbd67de41bdfbcaf6259
```
