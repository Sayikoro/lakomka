# Деплой-архив: как собрать lakomka-deploy-static.zip из частей

GitHub не принимает файлы больше 100 МБ, поэтому архив
`lakomka-deploy-static.zip` (117244855 байт) лежит в репозитории двумя частями:

| Файл | Размер |
| --- | --- |
| `lakomka-deploy-static.zip.part-00` | 94371840 байт |
| `lakomka-deploy-static.zip.part-01` | 22873015 байт |

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
e591a90c3a71ba5a477002008742530161b019d586c961d8581d9054ac7e2a2c
```

sha256 актуальной версии (2026.11.01-0110):

```
e591a90c3a71ba5a477002008742530161b019d586c961d8581d9054ac7e2a2c
```
