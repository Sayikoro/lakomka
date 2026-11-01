# Деплой-архив: как собрать lakomka-deploy-static.zip из частей

GitHub не принимает файлы больше 100 МБ, поэтому архив
`lakomka-deploy-static.zip` (117434564 байт) лежит в репозитории двумя частями:

| Файл | Размер |
| --- | --- |
| `lakomka-deploy-static.zip.part-00` | 94371840 байт |
| `lakomka-deploy-static.zip.part-01` | 23062724 байт |

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
6ce56e362981198a8588ce319ed285ce8907423537899006b9b521aeebe16ff3
```

sha256 актуальной версии (2026.11.01-0250):

```
6ce56e362981198a8588ce319ed285ce8907423537899006b9b521aeebe16ff3
```
