-- Task 134: бот-детект v2 — отпечаток браузера и человеческий ввод.
-- ИИ-агенты (DeepSeek и подобные) ходят с обычным Chrome-UA и без флуда,
-- поэтому детект по UA/поведению их пропускал. Теперь сессия хранит
-- отпечаток (webdriver, window.chrome, плагины, языки, тач) и счётчики
-- человеческого ввода (мышь, касания, клавиатура) — по ним считается
-- bot_score (0…100); ≥60 — бот (reason «fp:…»), 30…59 — «Подозрение».
-- Колонки добавляются к visit_sessions (создана в 006, применяется раньше
-- по алфавиту); файл выполняется один раз (schema_migrations).

ALTER TABLE visit_sessions ADD COLUMN bot_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visit_sessions ADD COLUMN webdriver INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visit_sessions ADD COLUMN mouse_moves INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visit_sessions ADD COLUMN touches INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visit_sessions ADD COLUMN key_downs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visit_sessions ADD COLUMN no_input INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visit_sessions ADD COLUMN accept_lang INTEGER NOT NULL DEFAULT 1;
ALTER TABLE visit_sessions ADD COLUMN fp TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_vs_bot_score ON visit_sessions (bot_score);
