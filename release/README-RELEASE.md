# Деплой-архив: как собрать lakomka-deploy-static.zip из частей

GitHub не принимает файлы больше 100 МБ, поэтому архив
`lakomka-deploy-static.zip` (116 241 183 байт) лежит в репозитории двумя частями:

| Файл | Размер |
| --- | --- |
| `lakomka-deploy-static.zip.part-aa` | 94 371 840 байт |
| `lakomka-deploy-static.zip.part-ab` | 21 869 343 байт |

## Склейка

Скачайте обе части в одну папку и выполните:

**Windows (cmd):**

```
copy /b lakomka-deploy-static.zip.part-aa+lakomka-deploy-static.zip.part-ab lakomka-deploy-static.zip
```

**Linux / macOS:**

```
cat lakomka-deploy-static.zip.part-aa lakomka-deploy-static.zip.part-ab > lakomka-deploy-static.zip
```

## Проверка целостности

sha256 собранного файла должен совпадать:

```
6c4eaa7008a118221e35543e663e6445823f69679c0a2b9ede538af7708633f9
```

- Windows PowerShell: `Get-FileHash lakomka-deploy-static.zip -Algorithm SHA256`
- Linux / macOS: `sha256sum lakomka-deploy-static.zip`

## Что дальше

1. Распаковать архив в корень сайта (Apache + PHP 8.2+, Node не нужен).
2. Следовать инструкции `README-DEPLOY.md` внутри архива (исходник — `scripts/deploy/README-DEPLOY.md` в репозитории).

Это первый полный деплой-пакет: статическая витрина + ВСЕ медиа + backend
(PHP + SQLite: каталог, настройки, SMTP) + `.htaccess` + страница обновления `/update`.

Последующие обновления функционала — архивы `lakomka-update-<версия>.zip`
(без медиа и без БД: собираются командой `MODE=update bash scripts/build-static.sh`,
в git не складываются, загружаются через Настройки → «Обновление» или `/update`).

## Обновления через GitHub (основной канал с версии 2026.10.30-0411)

Архивы обновлений больше не пересылаются вручную. Каждый релиз:

1. Собирается `MODE=update bash scripts/build-static.sh`.
2. Публикуется командой `bash scripts/gh-release.sh download/lakomka-update-<версия>.zip [notes.md]` —
   ZIP коммитится в тег `v<версия>` (`updates/lakomka-update-<версия>.zip`),
   к тегу создаётся релиз с заметками.
3. Ставится на сайт кнопкой **«Проверить обновления (ГИТ)»** на странице
   `/update` (или в админке песочницы): сайт сам находит последний релиз,
   скачивает архив (`github.com/…/raw/<тег>/updates/…`, резерв — tar.gz тега
   через codeload.github.com), проверяет манифест и sha256 и применяет.
   Медиа и база данных не затрагиваются.

Разовый переход: один раз примените `lakomka-update-2026.10.30-0411.zip`
(или новее) вручную — после этого кнопка проверки работает на сайте.
