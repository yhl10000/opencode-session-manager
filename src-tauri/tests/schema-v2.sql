CREATE TABLE session_v2 (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, directory TEXT NOT NULL,
 time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, model TEXT,
 tokens_input INTEGER DEFAULT 0, tokens_output INTEGER DEFAULT 0, tokens_reasoning INTEGER DEFAULT 0,
 tokens_cache_read INTEGER DEFAULT 0, tokens_cache_write INTEGER DEFAULT 0, parent_id TEXT
);
CREATE TABLE session_message (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, seq INTEGER NOT NULL,
 time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL,
 UNIQUE(session_id,seq)
);
CREATE TABLE session_part (
 message_id TEXT NOT NULL, session_id TEXT NOT NULL, ordinal INTEGER NOT NULL, type TEXT NOT NULL,
 time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(message_id,ordinal)
);
INSERT INTO session_v2 VALUES ('ses_v2','global',NULL,'Q:/current',1,100,NULL,2,3,4,5,6,NULL);
INSERT INTO session_message VALUES
 ('msg_user','ses_v2','user',1,90,90,'{"text":"question","files":[{"text":"secret"}]}'),
 ('msg_old','ses_v2','assistant',2,80,80,'{"model":{"id":"old","providerID":"old"}}'),
 ('msg_new','ses_v2','assistant',3,70,70,'{"model":{"id":"new-model","providerID":"new-provider"}}');
INSERT INTO session_part VALUES
 ('msg_new','ses_v2',2,'text',1,1,'{"text":"second"}'),
 ('msg_new','ses_v2',1,'text',2,2,'{"text":"first"}'),
 ('msg_new','ses_v2',3,'tool',3,3,'{"type":"text","text":"secret"}'),
 ('msg_new','ses_v2',4,'reasoning',4,4,'{"text":"secret"}'),
 ('msg_new','ses_v2',5,'text',5,5,'invalid json');
