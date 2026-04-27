-- One-shot backfill: encode agent_kind from Supabase cloud_connections into
-- D1 api_keys.name as `[<kind>] <label>`. Run AFTER 0001 and BEFORE the
-- Supabase DROP TABLE so the kind data isn't lost on the 29 active keys.
-- Idempotent: WHERE name NOT LIKE '[%] %' guards against double-encoding.

UPDATE api_keys SET name = '[other] Root key (pre-registration)'         WHERE key_id = 'k_dachein_1'        AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_4426b84377773a94' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[cursor] Cursor'                             WHERE key_id = 'k_eacf48397e553121' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[desktop] Claude Desktop'                    WHERE key_id = 'k_f466e7d162e1a09b' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_bad4e88fc509a4ac' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_00926d1b1761704e' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_2b07a7caad2133af' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Device · liushinan1998@hotmail.com'  WHERE key_id = 'k_f76b3a174a94bf6b' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Installed via Agent'                 WHERE key_id = 'k_6b0acbdf7d0b57ef' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[cursor] Cursor 2#'                          WHERE key_id = 'k_edf55247088cea1a' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[claude-code] Claude Code 2#'                WHERE key_id = 'k_5973e486a0cbb60a' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Installed via Agent'                 WHERE key_id = 'k_3f24d933964b4ade' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Installed via Agent'                 WHERE key_id = 'k_a35feab42f9228a4' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[cursor] Cursor Agent'                       WHERE key_id = 'k_9e70d4d7ee55e682' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_1a607da1dc5845a9' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_f56fef2370bbd3db' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_69d4de6e7db4887f' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_161c028ea0dce6b4' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_b8e474c5ffbe5e40' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_88ad9ad57e2156f7' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_02cf0f049d9c0931' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_39c9ef25833205e6' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_8286db822565e98d' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_3a5137f8c4abeabf' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Ai-vy'                               WHERE key_id = 'k_8a6ae396940522ee' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Browser session'                     WHERE key_id = 'k_d5f6010cd22baab2' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Ai-vy'                               WHERE key_id = 'k_107e3940b0e0765e' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Ai-vy'                               WHERE key_id = 'k_efc972dde77905b5' AND name NOT LIKE '[%] %';
UPDATE api_keys SET name = '[other] Ai-vy'                               WHERE key_id = 'k_49f74fe942adb579' AND name NOT LIKE '[%] %';
