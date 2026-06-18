-- init.sql
-- Runs automatically on first Postgres container start (docker-entrypoint-initdb.d).
-- Creates one database per service so each service truly owns its own data.
-- WHY separate databases: even though it's one Postgres instance, separate DBs
-- make it impossible for one service to accidentally query another's tables.

CREATE DATABASE menu_db;
CREATE DATABASE order_db;
CREATE DATABASE kitchen_db;
CREATE DATABASE notification_db;

-- Grant the shared quickbite user access to all databases
GRANT ALL PRIVILEGES ON DATABASE menu_db TO quickbite;
GRANT ALL PRIVILEGES ON DATABASE order_db TO quickbite;
GRANT ALL PRIVILEGES ON DATABASE kitchen_db TO quickbite;
GRANT ALL PRIVILEGES ON DATABASE notification_db TO quickbite;
