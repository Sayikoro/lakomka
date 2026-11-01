# Деплой-архив: как собрать lakomka-deploy-static.zip из частей

GitHub не принимает файлы больше 100 МБ, поэтому архив
`lakomka-deploy-static.zip` (117429596 байт) лежит в репозитории двумя частями:

| Файл | Размер |
| --- | --- |
| `lakomka-deploy-static.zip.part-00` | 94371840 байт |
| `lakomka-deploy-static.zip.part-01` | 23057756 байт |

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
685d475d0490a42f569a89f5298d0ebf5e7a55f4e4197b0fe9c2ea627ec80bc9
```

sha256 актуальной версии (2026.11.01-0150):

```
685d475d0490a42f569a89f5298d0ebf5e7a55f4e4197b0fe9c2ea627ec80bc9
```
