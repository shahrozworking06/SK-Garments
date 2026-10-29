CREATE TABLE sk_request_limits (
 key TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL
);
